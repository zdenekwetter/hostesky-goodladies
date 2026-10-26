'use client';

import { useState } from 'react';
import { useApi, ToastView } from '@/components/admin/useApi';

type Rep = { rows: number; created: string[]; skipped: number; rejected: { name: string; reasons: string[] }[];
  warnings: { booking_id: string; warnings: string[] }[] };

export default function Import() {
  const { call, toast } = useApi();
  const [rep, setRep] = useState<Rep | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoState, setPhotoState] = useState('');

  async function fromCsv(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const r = await call<Rep>('/api/admin/import', { method: 'POST', body: new FormData(e.currentTarget) });
    setBusy(false);
    if (r) setRep(r);
  }
  async function fromSheet() {
    setBusy(true);
    const r = await call<Rep>('/api/admin/import', { json: { source: 'sheet' } });
    setBusy(false);
    if (r) setRep(r);
  }
  // fotky se stahují po dávkách, aby žádný požadavek netrval moc dlouho
  async function photos() {
    setBusy(true);
    let total = 0;
    const errs: string[] = [];
    for (let i = 0; i < 40; i++) {
      const r = await call<{ done: number; remaining: number; errors: string[] }>('/api/admin/import', { json: { source: 'photos' } });
      if (!r) break;
      total += r.done; errs.push(...r.errors);
      setPhotoState(`Staženo ${total}, zbývá ${r.remaining}…`);
      if (!r.remaining || (!r.done && r.errors.length)) break;
    }
    setPhotoState(`Hotovo: staženo ${total} fotek.${errs.length ? ` Nepodařilo se ${errs.length} – u profilu jde zkusit znovu.` : ''}`);
    setBusy(false);
  }

  return (
    <>
      <h1>Import přihlášek</h1>
      <p className="lead">Nové přihlášky se zakládají samy hned po odeslání formuláře. Tady je ruční cesta – pro první naplnění katalogu nebo když automatika ještě není zapnutá. Opakovaný import nevytvoří duplicity.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <section className="panel">
          <div className="panel-h"><h3>Z tabulky odpovědí</h3></div>
          <div className="panel-b">
            <p style={{ marginTop: 0, fontSize: 14 }}>Načte tabulku přihlášek i dotazníku dostupnosti přes Apps Script (most do Googlu). Fotky se pak stáhnou druhým tlačítkem.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={busy} onClick={fromSheet}>Načíst nové přihlášky</button>
              <button className="btn btn-ghost" disabled={busy} onClick={photos}>Stáhnout chybějící fotky</button>
            </div>
            {photoState && <p style={{ fontSize: 14, marginBottom: 0 }}>{photoState}</p>}
          </div>
        </section>
        <form className="panel" onSubmit={fromCsv}>
          <div className="panel-h"><h3>Ze souboru CSV</h3></div>
          <div className="panel-b">
            <p style={{ marginTop: 0, fontSize: 14 }}>V tabulce odpovědí: <i>Soubor → Stáhnout → Hodnoty oddělené čárkami (.csv)</i>.</p>
            <input type="file" name="file" accept=".csv,text/csv" required style={{ marginBottom: 12 }} />
            <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Importuji…' : 'Importovat'}</button></div>
          </div>
        </form>
      </div>

      {rep && (
        <section className="panel" style={{ marginTop: 20 }}>
          <div className="panel-h"><h3>Výsledek</h3></div>
          <div className="panel-b" style={{ fontSize: 14 }}>
            <div className="cnt-cards">
              <div><b>{rep.rows}</b>řádků</div>
              <div><b>{rep.created.length}</b>nových profilů</div>
              <div><b>{rep.skipped}</b>už v katalogu</div>
              <div><b>{rep.rejected.length}</b>odloženo</div>
            </div>
            {rep.rejected.length > 0 && (<><b>Odloženo</b><ul>{rep.rejected.map((r, i) => <li key={i}>{r.name} – {r.reasons.join(', ')}</li>)}</ul></>)}
            {rep.warnings.length > 0 && (<><b>Založeno, ale něco chybí</b><ul>{rep.warnings.map((w) => <li key={w.booking_id}>{w.booking_id}: {w.warnings.join(', ')}</li>)}</ul></>)}
            {rep.created.length > 0 && <p>Nové profily najdete v záložce <a href="/admin">Profily → Ke zpracování</a>.</p>}
          </div>
        </section>
      )}
      <ToastView toast={toast} />
    </>
  );
}
