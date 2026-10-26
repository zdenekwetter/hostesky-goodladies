'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi, ToastView } from '@/components/admin/useApi';
import { formatDateRange } from '@/lib/labels';

type Ev = { id: number; key: string; name: string; place: string | null; country: string; date_from: string | null;
  date_to: string | null; is_active: boolean; signups: number; published: number };
type Av = { id: string; submitted_at: string | null; email: string | null; phone: string | null; name: string | null;
  events: string | null; events_raw: string | null; note: string | null };

export default function Events() {
  const { call, toast, show } = useApi();
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [av, setAv] = useState<{ rows: Av[]; stats: Record<string, number> } | null>(null);
  const [edit, setEdit] = useState<Partial<Ev> | null>(null);

  const load = useCallback(async () => {
    const [e, a] = await Promise.all([call<{ events: Ev[] }>('/api/admin/events'), call<{ rows: Av[]; stats: Record<string, number> }>('/api/admin/availability')]);
    if (e) setEvents(e.events);
    if (a) setAv(a);
  }, [call]);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await call('/api/admin/events', { json: edit })) { show('Akce uložena'); setEdit(null); load(); }
  }
  async function assign(row: Av, ignore: boolean) {
    const booking_id = ignore ? undefined : window.prompt(`Ke kterému profilu patří odpověď ${row.name ?? row.email}? Zadejte kód (např. GL-1012):`);
    if (!ignore && !booking_id) return;
    if (await call('/api/admin/availability', { json: { id: row.id, booking_id, ignore } })) { show(ignore ? 'Označeno' : 'Přiřazeno'); load(); }
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
        <div><h1>Akce</h1><p className="lead">Akce, na které se hostesky hlásí. Klient, který si v katalogu vybere akci, vidí jen přihlášené hostesky.</p></div>
        <button className="btn btn-primary btn-sm" style={{ marginBottom: 18 }} onClick={() => setEdit({ name: '', country: 'CZ', is_active: true })}>+ Nová akce</button>
      </div>

      <div className="panel">
        {!events ? <div className="panel-b">Načítám…</div> : (
          <table className="t">
            <thead><tr><th>Akce</th><th>Termín</th><th>Místo</th><th>Přihlášené</th><th>Z toho v katalogu</th><th></th></tr></thead>
            <tbody>
              {events.map((e) => {
                const past = e.date_to && e.date_to < today;
                return (
                  <tr key={e.id} style={past || !e.is_active ? { opacity: .5 } : undefined}>
                    <td><b>{e.name}</b>{past && <span className="pill" style={{ marginLeft: 6 }}>proběhla</span>}{!e.is_active && <span className="pill" style={{ marginLeft: 6 }}>skrytá</span>}</td>
                    <td>{formatDateRange(e.date_from, e.date_to)} {e.date_from?.slice(0, 4)}</td>
                    <td>{e.place} {e.country !== 'CZ' && <span className="pill">{e.country}</span>}</td>
                    <td>{e.signups}</td>
                    <td>{e.published}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEdit(e)}>Upravit</button>{' '}
                      <a className="btn btn-ghost btn-sm" href={`/?akce=${e.key}`} target="_blank" rel="noopener" title="Tenhle odkaz můžete poslat klientovi">Odkaz pro klienta ↗</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <h2 style={{ fontSize: 20, margin: '30px 0 4px' }}>Dotazník dostupnosti</h2>
      <p className="lead">
        Odpovědi se automaticky spárují s profilem podle e-mailu (nebo telefonu) a hosteska se přihlásí na zaškrtnuté akce.
        {av && ` Spárováno ${av.stats.matched ?? 0}, k ručnímu přiřazení ${av.stats.unmatched ?? 0}.`}
      </p>
      <div className="panel">
        {!av ? <div className="panel-b">Načítám…</div> : av.rows.length === 0 ? <div className="panel-b" style={{ color: 'var(--ink-3)' }}>Všechny odpovědi jsou spárované.</div> : (
          <table className="t">
            <thead><tr><th>Kdo</th><th>Akce</th><th>Poznámka</th><th></th></tr></thead>
            <tbody>
              {av.rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name ?? '—'}</b><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.email} {r.phone}</div></td>
                  <td style={{ fontSize: 13 }}>{r.events || <span style={{ color: 'var(--warn)' }}>nerozpoznáno: {r.events_raw ?? '—'}</span>}</td>
                  <td style={{ fontSize: 13 }}>{r.note}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => assign(r, false)}>Přiřadit k profilu</button>{' '}
                    <button className="btn btn-ghost btn-sm" onClick={() => assign(r, true)}>Nepotřebné</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Nespárovaná bývá odpověď, když hosteska v dotazníku vyplní jiný e-mail než v přihlášce, nebo ještě přihlášku neposlala – jakmile ji pošle, spáruje se sama.</p>

      {edit && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <form className="dialog" onSubmit={save}>
            <h3>{edit.id ? 'Upravit akci' : 'Nová akce'}</h3>
            <div className="field"><label>Název (jak ho hostesky uvidí v dotazníku)</label><input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></div>
            <div className="field"><label>Místo</label><input value={edit.place ?? ''} onChange={(e) => setEdit({ ...edit, place: e.target.value })} /></div>
            <div className="form-grid">
              <div className="field"><label>Od</label><input type="date" value={edit.date_from ?? ''} onChange={(e) => setEdit({ ...edit, date_from: e.target.value })} /></div>
              <div className="field"><label>Do</label><input type="date" value={edit.date_to ?? ''} onChange={(e) => setEdit({ ...edit, date_to: e.target.value })} /></div>
              <div className="field"><label>Země</label><input value={edit.country ?? 'CZ'} maxLength={2} onChange={(e) => setEdit({ ...edit, country: e.target.value })} /></div>
              <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={edit.is_active ?? true} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />Zobrazit v katalogu</label>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>Párování dotazníku hledá v odpovědích přesně tento název – v dotazníku ho používejte ve stejném znění.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Zrušit</button>
              <button className="btn btn-primary">Uložit</button>
            </div>
          </form>
        </div>
      )}
      <ToastView toast={toast} />
    </>
  );
}
