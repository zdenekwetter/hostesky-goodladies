import { appDb } from '@/lib/db';
import { currentAdmin } from '@/lib/auth';

// Fotky s vodoznakem z databáze: /media/p/<id fotky>-<400|800|1600>.webp
// Veřejně jen schválená, neskrytá fotka publikovaného profilu. Ostatní (čekající na schválení)
// vidí jen přihlášený tým v administraci.

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const m = (await ctx.params).file.match(/^([0-9a-f-]{36})-(400|800|1600)\.webp$/);
  if (!m) return new Response('Nenalezeno', { status: 404 });
  const [, id, size] = m;
  const r = await appDb().query(
    `SELECT f.bytes, f.mime,
            (p.status = 'approved' AND NOT p.hidden AND h.status = 'published') AS public
     FROM photo_file f JOIN hostess_photo p ON p.id = f.photo_id JOIN hostess h ON h.id = p.hostess_id
     WHERE f.photo_id = $1 AND f.size = $2`, [id, Number(size)]);
  const row = r.rows[0];
  if (!row) return new Response('Nenalezeno', { status: 404 });
  if (!row.public && !(await currentAdmin())) return new Response('Nenalezeno', { status: 404 });
  return new Response(new Uint8Array(row.bytes), {
    headers: {
      'Content-Type': row.mime,
      // veřejné fotky si drží CDN Vercelu; po skrytí zmizí z cache do hodiny
      'Cache-Control': row.public ? 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' : 'private, no-store',
      'X-Robots-Tag': 'noimageindex',
    },
  });
}
