import crypto from 'node:crypto';
import { settings } from '@/lib/settings';
import { ingestRows } from '@/lib/ingest';
import { ingestAvailability } from '@/lib/availability';
import { importDrivePhotos } from '@/lib/photos';
import { appDb } from '@/lib/db';
import { handle, json } from '@/lib/http';

// Okamžitý příjem odpovědi z Google Formu (Apps Script „při odeslání formuláře“ → sem).
// Tělo: { type: "prihlaska" | "dostupnost", namedValues: { "Hlavička": ["hodnota"] } }
// Zabezpečení: hlavička X-GL-Signature = HMAC-SHA256(tělo, INGEST_SECRET) v hex.
// Bez platného podpisu nic nezaloží. Viz google-apps-script/ v repozitáři.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const { ingestSecret } = await settings();
  const raw = await req.text();
  const sig = req.headers.get('x-gl-signature') ?? '';
  const expected = crypto.createHmac('sha256', ingestSecret).update(raw, 'utf8').digest('hex');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return json({ error: 'Neplatný podpis' }, 401);
  }
  const body = JSON.parse(raw) as { type?: string; fotky?: boolean; namedValues?: Record<string, string[] | string> };
  const row = Object.fromEntries(Object.entries(body.namedValues ?? {})
    .map(([h, v]) => [h, Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v ?? '')]));
  if (!Object.keys(row).length) return json({ error: 'Prázdná odpověď' }, 400);

  if (body.type === 'dostupnost') {
    return json({ ok: true, ...(await ingestAvailability([row])) });
  }
  const rep = await ingestRows([row], 'google_form');
  // fotky z formuláře rovnou stáhnout (při hromadném odeslání až tlačítkem v administraci)
  let photos: unknown = null;
  if (body.fotky !== false && rep.created.length) {
    const h = await appDb().query('SELECT id FROM hostess WHERE booking_id = $1', [rep.created[0]]);
    if (h.rowCount) photos = await importDrivePhotos(h.rows[0].id, 6).catch((e) => ({ error: String(e) }));
  }
  return json({ ok: true, ...rep, photos });
});
