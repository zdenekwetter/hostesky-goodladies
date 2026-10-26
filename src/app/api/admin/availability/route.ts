import { requireAdmin } from '@/lib/auth';
import { appDb } from '@/lib/db';
import { assignAvailability } from '@/lib/availability';
import { audit } from '@/lib/admin';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Odpovědi z dotazníku dostupnosti, které se nepodařilo spárovat s profilem
export const GET = handle(async () => {
  await requireAdmin();
  const r = await appDb().query(`
    SELECT a.id, a.submitted_at, a.email, a.phone, a.name, a.events_raw, a.note, a.status,
           (SELECT string_agg(e.name, ', ') FROM event e WHERE e.id = ANY(a.event_ids)) AS events
    FROM availability_response a WHERE a.status = 'unmatched' ORDER BY a.created_at DESC LIMIT 200`);
  const stats = await appDb().query(`SELECT status, count(*)::int FROM availability_response GROUP BY status`);
  return json({ rows: r.rows, stats: Object.fromEntries(stats.rows.map((x) => [x.status, x.count])) });
});

export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  const { id, booking_id, ignore } = (await req.json()) as { id: string; booking_id?: string; ignore?: boolean };
  let hostessId: string | null = null;
  if (!ignore) {
    const h = await appDb().query('SELECT id FROM hostess WHERE upper(booking_id) = upper($1)', [String(booking_id ?? '').trim()]);
    if (!h.rowCount) return json({ error: 'Profil s tímto kódem neexistuje (např. GL-1012)' }, 404);
    hostessId = h.rows[0].id;
  }
  await assignAvailability(id, hostessId);
  await audit(appDb(), a, ignore ? 'availability_ignore' : 'availability_assign',
    ignore ? 'Odpověď z dotazníku dostupnosti označena jako nepotřebná' : `Dotazník dostupnosti přiřazen k ${booking_id}`,
    hostessId ? { hostess_id: hostessId } : {});
  return json({ ok: true });
});
