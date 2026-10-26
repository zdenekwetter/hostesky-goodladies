import { requireAdmin } from '@/lib/auth';
import { tx } from '@/lib/db';
import { audit, getForAdmin } from '@/lib/admin';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; pid: string }> };

// approve – fotka smí ven (jen schvalovatel)
// reject  – odmítnutí s povinným důvodem; fotka se nemaže
// primary – hlavní fotka na kartě
// hide    – skrýt (z webu zmizí okamžitě, data zůstávají)
// move    – změna pořadí (dir: -1 / 1)
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id, pid } = await ctx.params;
  const b = (await req.json()) as { action: string; reason?: string; dir?: number; kind?: string };
  const a = await requireAdmin(b.action === 'approve' ? 'approver' : undefined);

  await tx(async (c) => {
    const p = (await c.query('SELECT * FROM hostess_photo WHERE id = $1 AND hostess_id = $2 FOR UPDATE', [pid, id])).rows[0];
    if (!p) throw Object.assign(new Error('Fotka neexistuje'), { code: 'P0001' });
    switch (b.action) {
      case 'approve':
        if (!p.url_800) throw Object.assign(new Error('Fotka ještě není zpracovaná'), { code: 'P0001' });
        await c.query(`UPDATE hostess_photo SET status = 'approved', reject_reason = NULL WHERE id = $1`, [pid]);
        await audit(c, a, 'photo_approve', 'Fotka schválena', { hostess_id: id }, { photo: pid });
        break;
      case 'reject':
        if (!b.reason?.trim()) throw Object.assign(new Error('Doplňte důvod odmítnutí'), { code: 'P0001' });
        await c.query(`UPDATE hostess_photo SET status = 'rejected', reject_reason = $2, is_primary = false WHERE id = $1`,
          [pid, b.reason.trim()]);
        await audit(c, a, 'photo_reject', b.reason.trim(), { hostess_id: id }, { photo: pid });
        break;
      case 'primary':
        await c.query('UPDATE hostess_photo SET is_primary = (id = $1) WHERE hostess_id = $2', [pid, id]);
        await audit(c, a, 'photo_primary', 'Změna hlavní fotky', { hostess_id: id }, { photo: pid });
        break;
      case 'kind':
        if (!['portrait', 'full_body', 'event'].includes(b.kind ?? '')) throw Object.assign(new Error('Neznámý typ'), { code: 'P0001' });
        await c.query('UPDATE hostess_photo SET kind = $2 WHERE id = $1', [pid, b.kind]);
        break;
      case 'hide':
        await c.query('UPDATE hostess_photo SET hidden = true, is_primary = false WHERE id = $1', [pid]);
        await audit(c, a, 'photo_hide', b.reason?.trim() || 'Fotka skryta', { hostess_id: id }, { photo: pid });
        break;
      case 'move': {
        const all = (await c.query('SELECT id FROM hostess_photo WHERE hostess_id = $1 AND NOT hidden ORDER BY sort, created_at', [id])).rows.map((r) => r.id);
        const i = all.indexOf(pid);
        const j = i + (b.dir === -1 ? -1 : 1);
        if (i >= 0 && j >= 0 && j < all.length) {
          [all[i], all[j]] = [all[j], all[i]];
          for (const [k, x] of all.entries()) await c.query('UPDATE hostess_photo SET sort = $2 WHERE id = $1', [x, k]);
        }
        break;
      }
      default:
        throw Object.assign(new Error('Neznámá akce'), { code: 'P0001' });
    }
  });
  return json({ ok: true, profile: await getForAdmin(id) });
});
