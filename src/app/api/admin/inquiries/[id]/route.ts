import { requireAdmin } from '@/lib/auth';
import { appDb } from '@/lib/db';
import { audit } from '@/lib/admin';
import { forwardInquiry } from '@/lib/make';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

// Stav poptávky (nova / v_reseni / vyrizena), interní poznámka, opakované odeslání do Make.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const a = await requireAdmin();
  const id = (await ctx.params).id;
  const b = (await req.json()) as { action: string; status?: string; note?: string };
  const db = appDb();
  if (b.action === 'status') {
    if (!['nova', 'v_reseni', 'vyrizena'].includes(b.status ?? '')) return json({ error: 'Neznámý stav' }, 400);
    await db.query('UPDATE inquiry SET status = $2 WHERE id = $1', [id, b.status]);
    await audit(db, a, `inquiry_status:${b.status}`, b.note?.trim() || 'Změna stavu poptávky', { inquiry_id: id });
  } else if (b.action === 'note') {
    await db.query('UPDATE inquiry SET internal_note = $2 WHERE id = $1', [id, b.note ?? '']);
  } else if (b.action === 'resend') {
    const r = await forwardInquiry(id);
    await audit(db, a, 'inquiry_resend', r.ok ? 'Znovu odesláno do Make' : `Odeslání selhalo: ${r.error}`, { inquiry_id: id });
    if (!r.ok) return json({ error: r.error }, 502);
  } else {
    return json({ error: 'Neznámá akce' }, 400);
  }
  return json({ ok: true });
});
