import { tx, publicDb } from '@/lib/db';
import { forwardInquiry } from '@/lib/make';
import { handle, json } from '@/lib/http';
import { config } from '@/lib/config';

// Poptávka z katalogu (katalog-plan-stavby.md kap. 4, varianta B):
// prohlížeč → /api/poptavka → uložit do databáze → tentýž JSON na tentýž Make webhook jako LP.
// Make dostane stejné klíče jako z landing page + booking_ids a zdroj.

export const dynamic = 'force-dynamic';

const FIELDS = ['typ_akce', 'veletrh', 'termin', 'misto', 'pocet_hostesek', 'pocet_dni', 'jazyky',
  'jmeno', 'firma', 'email', 'telefon', 'poznamka'] as const;

// jednoduché omezení na instanci serveru – proti zahlcení, ne náhrada za honeypot
const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5;
}

export const POST = handle(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'Neplatná data' }, 400);

  // honeypot a rychlost vyplnění: robotovi odpovíme „ok“, ale nic neuložíme
  const started = Number(body.started_at ?? 0);
  if (String(body.website ?? '').trim() || (started && Date.now() - started < 3000)) {
    return json({ ok: true });
  }
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'x';
  if (tooMany(ip)) return json({ error: 'Příliš mnoho odeslání. Zkuste to prosím za chvíli.' }, 429);

  const v: Record<string, string> = {};
  for (const f of FIELDS) v[f] = String(body[f] ?? '').trim().slice(0, f === 'poznamka' ? 3000 : 300);

  const errors: string[] = [];
  if (!v.jmeno) errors.push('jméno');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.push('e-mail');
  if (body.souhlas !== true && body.souhlas !== 'ano') errors.push('souhlas se zpracováním');
  if (errors.length) return json({ error: `Doplňte prosím: ${errors.join(', ')}` }, 400);

  // vybrané profily – jen ty, které jsou opravdu publikované
  const requested = Array.isArray(body.booking_ids)
    ? body.booking_ids.map(String)
    : String(body.booking_ids ?? '').split(',');
  const wanted = [...new Set(requested.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  const found = wanted.length
    ? (await publicDb().query(
      'SELECT id, booking_id, first_name, last_initial FROM public_api.hostess WHERE booking_id = ANY($1)', [wanted])).rows
    : [];
  const bookingIds = found.map((h) => h.booking_id as string);

  const payload = {
    ...v,
    souhlas: 'ano',
    page_url: String(body.page_url ?? `${config.siteUrl}/`).slice(0, 500),
    submitted_at: new Date().toISOString(),
    lang: String(body.lang ?? 'cz').slice(0, 5),
    booking_ids: bookingIds.join(','),
    vybrane_hostesky: found.map((h) => `${h.first_name} ${h.last_initial} (${h.booking_id})`.replace('  ', ' ')).join(', '),
    zdroj: 'katalog',
  };

  const id = await tx(async (c) => {
    const r = await c.query(
      `INSERT INTO inquiry (source, payload, booking_ids, jmeno, firma, email, telefon)
       VALUES ('katalog', $1, $2, $3, $4, $5, $6) RETURNING id`,
      [payload, bookingIds, v.jmeno, v.firma, v.email, v.telefon]);
    const inquiryId = r.rows[0].id as string;
    for (const h of found) {
      await c.query('INSERT INTO inquiry_hostess (inquiry_id, hostess_id) VALUES ($1, $2)', [inquiryId, h.id]);
    }
    return inquiryId;
  });

  // Make se volá až po uložení; když selže, poptávka zůstane v databázi a cron ji dožene.
  await forwardInquiry(id);
  return json({ ok: true });
});
