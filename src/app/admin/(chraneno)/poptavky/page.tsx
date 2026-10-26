'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useApi, ToastView } from '@/components/admin/useApi';
import { INQUIRY_STATUS } from '@/lib/labels';

type Inq = {
  id: string; created_at: string; source: string; status: string; jmeno: string; firma: string | null;
  email: string; telefon: string | null; payload: Record<string, string>; forwarded_at: string | null;
  forward_error: string | null; internal_note: string | null;
  hostesses: { id: string; booking_id: string; name: string; status: string }[];
};

export default function Inquiries() {
  const { call, toast, show } = useApi();
  const [data, setData] = useState<{ inquiries: Inq[]; top: { booking_id: string; name: string; n: number }[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => call<typeof data>('/api/admin/inquiries').then((d) => d && setData(d)), [call]);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, json: Record<string, unknown>, ok: string) {
    if (await call(`/api/admin/inquiries/${id}`, { json })) { show(ok); load(); }
  }

  return (
    <>
      <h1>Poptávky</h1>
      <p className="lead">Poptávky z katalogu. Každá je uložená tady a zároveň předaná do Make (tabulka, e-mail, SmartEmailing) – stejně jako z landing page.</p>
      {data && data.top.length > 0 && (
        <div className="cnt-cards">
          {data.top.slice(0, 5).map((t) => <div key={t.booking_id}><b>{t.n}×</b>{t.name}</div>)}
          <div style={{ alignSelf: 'center', border: 0, background: 'none' }}>nejžádanější profily</div>
        </div>
      )}
      <div className="panel">
        {!data ? <div className="panel-b">Načítám…</div> : data.inquiries.length === 0 ? <div className="panel-b" style={{ color: 'var(--ink-3)' }}>Zatím žádná poptávka.</div> : (
          <table className="t">
            <thead><tr><th>Přišla</th><th>Kdo</th><th>Akce</th><th>Vybrané hostesky</th><th>Make</th><th>Stav</th></tr></thead>
            <tbody>
              {data.inquiries.map((q) => (
                <Fragment key={q.id}>
                  <tr className="click" onClick={() => setOpen(open === q.id ? null : q.id)}>
                    <td style={{ fontSize: 13 }}>{new Date(q.created_at).toLocaleString('cs-CZ')}</td>
                    <td><b>{q.firma || q.jmeno}</b><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{q.firma ? q.jmeno : ''}</div></td>
                    <td style={{ fontSize: 13 }}>{[q.payload.veletrh || q.payload.typ_akce, q.payload.termin].filter(Boolean).join(' · ')}</td>
                    <td style={{ fontSize: 13 }}>{q.hostesses.length ? q.hostesses.map((h) => h.name).join(', ') : <span style={{ color: 'var(--ink-3)' }}>bez výběru</span>}</td>
                    <td>{q.forwarded_at ? <span className="ok-badge">předáno</span> : <span className="miss"><span className="hard">nepředáno</span></span>}</td>
                    <td><span className={`pill ${q.status === 'vyrizena' ? 'published' : q.status === 'nova' ? 'review' : ''}`}>{INQUIRY_STATUS[q.status]}</span></td>
                  </tr>
                  {open === q.id && (
                    <tr><td colSpan={6} style={{ background: '#fcf9f9' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, fontSize: 14 }}>
                        <div>
                          <div><b>E-mail:</b> <a href={`mailto:${q.email}`}>{q.email}</a></div>
                          {q.telefon && <div><b>Telefon:</b> <a href={`tel:${q.telefon}`}>{q.telefon}</a></div>}
                          <div><b>Místo:</b> {q.payload.misto}</div>
                          <div><b>Počet hostesek / dní:</b> {q.payload.pocet_hostesek} / {q.payload.pocet_dni}</div>
                          <div><b>Jazyky:</b> {q.payload.jazyky || 'čeština'}</div>
                          {q.payload.poznamka && <div><b>Poznámka:</b> {q.payload.poznamka}</div>}
                          <div style={{ marginTop: 8 }}>{q.hostesses.map((h) => (
                            <Link key={h.id} href={`/admin/profil/${h.id}`} className="tag" style={{ marginRight: 6, textDecoration: 'none' }}>{h.name} · {h.booking_id}</Link>
                          ))}</div>
                          {q.forward_error && <div className="msg-err">Make: {q.forward_error}</div>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {Object.entries(INQUIRY_STATUS).map(([k, v]) => (
                              <button key={k} className={`btn btn-sm ${q.status === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => act(q.id, { action: 'status', status: k }, `Stav: ${v}`)}>{v}</button>
                            ))}
                            {!q.forwarded_at && <button className="btn btn-ghost btn-sm" onClick={() => act(q.id, { action: 'resend' }, 'Předáno do Make')}>Poslat znovu do Make</button>}
                          </div>
                          <textarea defaultValue={q.internal_note ?? ''} placeholder="Interní poznámka (co se domluvilo)…" rows={3}
                            onBlur={(e) => e.target.value !== (q.internal_note ?? '') && act(q.id, { action: 'note', note: e.target.value }, 'Poznámka uložena')}
                            style={{ padding: 10, border: '1px solid var(--line)', borderRadius: 8 }} />
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ToastView toast={toast} />
    </>
  );
}
