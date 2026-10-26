import { settings } from '@/lib/settings';
import { bridgeRows, hasBridge } from '@/lib/bridge';
import { importDrivePhotos } from '@/lib/photos';
import { ingestAvailability } from '@/lib/availability';
import { ingestRows } from '@/lib/ingest';
import { retryPendingInquiries } from '@/lib/make';
import { handle, json } from '@/lib/http';

// Cron (Vercel, viz vercel.json): načte tabulku odpovědí a založí nové profily jako „draft“.
// Idempotentní – opakované spuštění nevytvoří duplicitu. Zároveň dožene neodeslané poptávky.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = handle(async (req: Request) => {
  // Vercel cron posílá Authorization: Bearer <CRON_SECRET>, pokud je proměnná nastavená;
  // jinak se pozná podle hlavičky user-agent. Endpoint je neškodný (jen dožene chybějící data).
  const { cronSecret } = await settings();
  const auth = req.headers.get('authorization');
  const ua = req.headers.get('user-agent') ?? '';
  if (auth !== `Bearer ${cronSecret}` && !ua.startsWith('vercel-cron/')) {
    return json({ error: 'Neautorizováno' }, 401);
  }
  const retried = await retryPendingInquiries();
  if (!(await hasBridge())) {
    return json({ ok: true, ingest: 'vypnuto – most do Googlu není nastavený', retried });
  }
  const rows = await bridgeRows('prihlaska');
  const report = await ingestRows(rows);
  // dotazník dostupnosti – po přihláškách, aby se nové profily rovnou spárovaly
  const availability = await ingestAvailability(await bridgeRows('dostupnost'));
  const photos = await importDrivePhotos(undefined, 10);
  return json({ ok: true, rows: rows.length, ...report, availability, photos, retried });
});
