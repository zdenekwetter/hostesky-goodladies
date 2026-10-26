import { requireAdmin } from '@/lib/auth';
import { appDb } from '@/lib/db';
import { audit, getForAdmin } from '@/lib/admin';
import { importDrivePhotos } from '@/lib/photos';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

// Stáhne fotky z formuláře (Google Disk) přes Apps Script, vypálí vodoznak, čekají na schválení.
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const a = await requireAdmin();
  const id = (await ctx.params).id;
  const r = await importDrivePhotos(id, 8);
  if (r.done) await audit(appDb(), a, 'photo_import', `Staženo z Disku: ${r.done} fotek`, { hostess_id: id });
  if (!r.done && r.errors.length) return json({ error: r.errors.join('; ') }, 502);
  return json({ ok: r.errors.length === 0, ...r, profile: await getForAdmin(id) });
});
