import { requireAdmin } from '@/lib/auth';
import { appDb } from '@/lib/db';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  const r = await appDb().query(`
    SELECT i.id, i.created_at, i.source, i.status, i.jmeno, i.firma, i.email, i.telefon, i.payload,
           i.forwarded_at, i.forward_error, i.internal_note,
           coalesce((SELECT json_agg(json_build_object('id', h.id, 'booking_id', h.booking_id,
                     'name', h.first_name || ' ' || left(coalesce(h.last_name,''),1) || '.', 'status', h.status))
                     FROM inquiry_hostess ih JOIN hostess h ON h.id = ih.hostess_id WHERE ih.inquiry_id = i.id), '[]') AS hostesses
    FROM inquiry i ORDER BY i.created_at DESC LIMIT 300`);
  // nejžádanější profily – kvůli tomu se katalog staví
  const top = await appDb().query(`
    SELECT h.booking_id, h.first_name || ' ' || left(coalesce(h.last_name,''),1) || '.' AS name, count(*)::int AS n
    FROM inquiry_hostess ih JOIN hostess h ON h.id = ih.hostess_id
    GROUP BY h.id ORDER BY n DESC LIMIT 10`);
  return json({ inquiries: r.rows, top: top.rows });
});
