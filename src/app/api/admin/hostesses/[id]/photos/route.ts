import { requireAdmin } from '@/lib/auth';
import { appDb, tx } from '@/lib/db';
import { audit, getForAdmin } from '@/lib/admin';
import { storePhoto } from '@/lib/photos';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const MAX = 15 * 1024 * 1024;

// Nahrání fotky z počítače. Fotka se hned zpracuje (vodoznak, velikosti) a čeká na schválení.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const a = await requireAdmin();
  const id = (await ctx.params).id;
  const form = await req.formData();
  const files = form.getAll('file').filter((f): f is File => f instanceof File);
  if (!files.length) return json({ error: 'Vyberte fotku' }, 400);

  const exists = await appDb().query('SELECT 1 FROM hostess WHERE id = $1', [id]);
  if (!exists.rowCount) return json({ error: 'Profil neexistuje' }, 404);

  const errors: string[] = [];
  for (const f of files) {
    if (f.size > MAX) { errors.push(`${f.name}: větší než 15 MB`); continue; }
    try {
      const buf = Buffer.from(await f.arrayBuffer());
      await tx(async (c) => {
        const sort = (await c.query('SELECT coalesce(max(sort),-1)+1 AS s FROM hostess_photo WHERE hostess_id = $1', [id])).rows[0].s;
        const r = await c.query(
          `INSERT INTO hostess_photo (hostess_id, status, sort) VALUES ($1,'pending',$2) RETURNING id`, [id, sort]);
        await storePhoto(c, r.rows[0].id, buf);
        await audit(c, a, 'photo_upload', `Nahrána fotka ${f.name}`, { hostess_id: id });
      });
    } catch (e) {
      console.error(e);
      errors.push(`${f.name}: soubor se nepodařilo zpracovat (není to obrázek?)`);
    }
  }
  if (errors.length === files.length) return json({ error: errors.join('; ') }, 422);
  return json({ ok: errors.length === 0, errors, profile: await getForAdmin(id) });
});
