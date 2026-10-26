import { requireAdmin } from '@/lib/auth';
import { revokeConsent, recordConsent, getForAdmin } from '@/lib/admin';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

// action = revoke   → odvolání souhlasu (profil se okamžitě skryje, nic se nemaže)
// action = record   → zaevidování DOLOŽENÉHO souhlasu (jen schvalovatel; nikdy „zaškrtnout za ni“)
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const id = (await ctx.params).id;
  const b = (await req.json()) as { action: string; kind: string; note: string; evidence?: string };
  if (!['age_18', 'publication', 'contact_sharing'].includes(b.kind)) return json({ error: 'Neznámý souhlas' }, 400);
  if (b.action === 'revoke') {
    const a = await requireAdmin();
    await revokeConsent(a, id, b.kind, b.note);
  } else if (b.action === 'record') {
    const a = await requireAdmin('approver');
    await recordConsent(a, id, b.kind, b.evidence ?? '', b.note);
  } else {
    return json({ error: 'Neznámá akce' }, 400);
  }
  return json({ ok: true, profile: await getForAdmin(id) });
});
