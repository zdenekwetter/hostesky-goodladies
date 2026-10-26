'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi, ToastView } from '@/components/admin/useApi';
import { STATUS } from '@/lib/labels';

type Row = {
  id: string; booking_id: string; status: string; first_name: string; last_name: string | null;
  city: string | null; submitted_at: string | null; thumb: string | null; photo_count: number;
  langs: string; missing: string[]; soft_missing: string[];
};

const TABS = ['draft', 'review', 'published', 'paused', 'archived'] as const;

export default function Queue() {
  const { call, toast } = useApi();
  const router = useRouter();
  const [tab, setTab] = useState<string>('draft');
  const [data, setData] = useState<{ rows: Row[]; counts: Record<string, number> } | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setData(null);
    call<{ rows: Row[]; counts: Record<string, number> }>(`/api/admin/hostesses?status=${tab}`).then(setData);
  }, [tab, call]);

  const rows = (data?.rows ?? []).filter((r) => !q || `${r.first_name} ${r.last_name} ${r.city} ${r.booking_id}`.toLowerCase().includes(q.toLowerCase()));

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await call<{ id: string }>('/api/admin/hostesses', { json: {
      first_name: fd.get('first_name'), last_name: fd.get('last_name'), note: 'Ručně založený profil' } });
    if (r) router.push(`/admin/profil/${r.id}`);
  }

  const c = data?.counts ?? {};
  return (
    <>
      <h1>Profily</h1>
      <p className="lead">{c.draft ?? 0} ke zpracování · {c.review ?? 0} ke schválení · {c.published ?? 0} v katalogu</p>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="qtabs">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{STATUS[t]}<b>{c[t] ?? 0}</b></button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input placeholder="Hledat jméno, město, GL-…" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, minWidth: 220 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}>+ Nový profil</button>
        </div>
      </div>

      <div className="panel">
        {!data ? <div className="panel-b">Načítám…</div> : rows.length === 0 ? (
          <div className="panel-b" style={{ color: 'var(--ink-3)' }}>
            {tab === 'draft' ? 'Nic ke zpracování. Nové přihlášky naimportujete v záložce Import přihlášek.' : 'Tady zatím nic není.'}
          </div>
        ) : (
          <table className="t">
            <thead><tr><th></th><th>Jméno</th><th>Město</th><th>Jazyky</th><th>Přihláška</th><th>Co chybí do publikace</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="click" onClick={() => router.push(`/admin/profil/${r.id}`)}>
                  <td><div className="av-s" style={r.thumb ? { backgroundImage: `url(${r.thumb})` } : undefined}>{!r.thumb && r.first_name[0]}</div></td>
                  <td><b>{r.first_name} {r.last_name}</b><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.booking_id}</div></td>
                  <td>{r.city}</td>
                  <td style={{ textTransform: 'uppercase', fontSize: 12 }}>{r.langs || '—'}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink-3)' }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('cs-CZ') : 'ručně'}</td>
                  <td>
                    <div className="miss">
                      {r.missing.map((m) => <span key={m} className="hard">{m}</span>)}
                      {r.soft_missing.map((m) => <span key={m}>{m}</span>)}
                      {!r.missing.length && !r.soft_missing.length && <span className="ok-badge">připraveno</span>}
                    </div>
                  </td>
                  <td><span className={`pill ${r.status}`}>{STATUS[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Červené = blokuje publikaci. Žluté = profil půjde publikovat, ale bude slabší.</p>

      {creating && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setCreating(false)}>
          <form className="dialog" onSubmit={create}>
            <h3>Nový profil</h3>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>Přednostně zakládejte profily importem přihlášek – přenesou se souhlasy i fotky. Ručně založený profil nejde publikovat, dokud neeviduje doložený souhlas.</p>
            <div className="field"><label>Jméno</label><input name="first_name" required /></div>
            <div className="field"><label>Příjmení</label><input name="last_name" /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>Zrušit</button>
              <button className="btn btn-primary">Založit</button>
            </div>
          </form>
        </div>
      )}
      <ToastView toast={toast} />
    </>
  );
}
