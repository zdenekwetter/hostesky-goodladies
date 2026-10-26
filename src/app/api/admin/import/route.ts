import { requireAdmin } from '@/lib/auth';
import { ingestRows } from '@/lib/ingest';
import { ingestAvailability } from '@/lib/availability';
import { parseCsv } from '@/lib/csv';
import { bridgeRows, hasBridge } from '@/lib/bridge';
import { importDrivePhotos } from '@/lib/photos';
import { audit } from '@/lib/admin';
import { appDb } from '@/lib/db';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Ruční import:
//  - CSV soubor (Tabulka → Soubor → Stáhnout → CSV) – funguje vždy
//  - { source: 'sheet' }  – načte tabulku přihlášek i dotazníku přes Apps Script
//  - { source: 'photos' } – stáhne další dávku chybějících fotek z Disku
// Opakovaný import nevytvoří duplicity.
export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  const ct = req.headers.get('content-type') ?? '';

  if (ct.includes('multipart/form-data')) {
    const f = (await req.formData()).get('file');
    if (!(f instanceof File)) return json({ error: 'Vyberte CSV soubor' }, 400);
    const rows = parseCsv(await f.text());
    const report = await ingestRows(rows, 'csv_import');
    await audit(appDb(), a, 'import', `Import CSV: ${report.created.length} nových, ${report.skipped} už bylo`);
    return json({ ok: true, rows: rows.length, ...report });
  }

  const { source } = (await req.json().catch(() => ({}))) as { source?: string };
  if (!(await hasBridge())) return json({ error: 'Most do Googlu není nastavený (Nastavení) – zatím použijte import z CSV' }, 400);

  if (source === 'photos') {
    return json({ ok: true, ...(await importDrivePhotos(undefined, 5)) });
  }
  const rows = await bridgeRows('prihlaska');
  const report = await ingestRows(rows, 'google_form');
  const availability = await ingestAvailability(await bridgeRows('dostupnost'));
  await audit(appDb(), a, 'import', `Import z tabulky: ${report.created.length} nových, ${report.skipped} už bylo`);
  return json({ ok: true, rows: rows.length, ...report, availability });
});
