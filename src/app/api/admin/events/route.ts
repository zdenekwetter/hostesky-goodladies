import { requireAdmin } from '@/lib/auth';
import { appDb } from '@/lib/db';
import { audit } from '@/lib/admin';
import { slugify } from '@/lib/mapper';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  const r = await appDb().query(`
    SELECT e.*, e.date_from::text AS date_from, e.date_to::text AS date_to,
           (SELECT count(*)::int FROM hostess_event_signup s WHERE s.event_id = e.id) AS signups,
           (SELECT count(*)::int FROM hostess_event_signup s JOIN hostess h ON h.id = s.hostess_id
             WHERE s.event_id = e.id AND h.status = 'published') AS published
    FROM event e ORDER BY e.date_from DESC NULLS LAST, e.sort`);
  return json({ events: r.rows });
});

// Založení nebo úprava akce (na kterou se hostesky hlásí)
export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  const b = (await req.json()) as { id?: number; name: string; place?: string; country?: string;
    date_from?: string; date_to?: string; is_active?: boolean };
  if (!b.name?.trim()) return json({ error: 'Doplňte název akce' }, 400);
  const db = appDb();
  const vals = [b.name.trim(), b.place?.trim() || null, (b.country || 'CZ').toUpperCase().slice(0, 2),
    b.date_from || null, b.date_to || null, b.is_active ?? true];
  if (b.id) {
    await db.query(`UPDATE event SET name=$1, place=$2, country=$3, date_from=$4, date_to=$5, is_active=$6 WHERE id=$7`,
      [...vals, b.id]);
  } else {
    const key = `${slugify(b.name)}-${(b.date_from || '').slice(0, 4)}`.replace(/-$/, '').replace(/-/g, '_');
    await db.query(`INSERT INTO event (key, name, place, country, date_from, date_to, is_active) VALUES ($7,$1,$2,$3,$4,$5,$6)`,
      [...vals, key]);
  }
  await audit(db, a, b.id ? 'event_edit' : 'event_create', `Akce ${b.name.trim()}`);
  return json({ ok: true });
});
