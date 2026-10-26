'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi, ToastView } from '@/components/admin/useApi';

type U = { id: number; email: string; name: string; role: string; active: boolean; last_action: string | null };

export default function Team() {
  const { call, toast, show } = useApi();
  const [users, setUsers] = useState<U[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [pw, setPw] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/team');
    if (res.status === 403) { setForbidden(true); return; }
    const j = await res.json();
    setUsers(j.users ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email'));
    const r = await call<{ password: string }>('/api/admin/team', { json: { action: 'create', email, name: fd.get('name'), role: fd.get('role') } });
    if (r) { setPw({ email, password: r.password }); (e.target as HTMLFormElement).reset(); load(); }
  }
  async function act(u: U, action: string, role?: string) {
    const r = await call<{ password?: string }>('/api/admin/team', { json: { action, id: u.id, role } });
    if (r?.password) setPw({ email: u.email, password: r.password });
    else if (r) show('Uloženo');
    load();
  }
  async function changeOwn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const r = await call('/api/admin/password', { json: { current: fd.get('current'), next: fd.get('next') } });
    if (r) { show('Heslo změněno'); (e.target as HTMLFormElement).reset(); }
  }

  return (
    <>
      <h1>Tým</h1>
      <p className="lead">Kdo smí do administrace. Editorka upravuje profily, schvalovatelka je navíc publikuje a stahuje z katalogu a spravuje účty.</p>

      {!forbidden && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <div className="panel">
            {!users ? <div className="panel-b">Načítám…</div> : (
              <table className="t">
                <thead><tr><th>Jméno</th><th>Role</th><th>Naposledy</th><th></th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={!u.active ? { opacity: .5 } : undefined}>
                      <td><b>{u.name}</b><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{u.email}</div></td>
                      <td>
                        <select value={u.role} disabled={!u.active} onChange={(e) => act(u, 'role', e.target.value)}
                          style={{ padding: 6, border: '1px solid var(--line)', borderRadius: 6 }}>
                          <option value="editor">Editorka</option>
                          <option value="approver">Schvalovatelka</option>
                        </select>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--ink-3)' }}>{u.last_action ? new Date(u.last_action).toLocaleDateString('cs-CZ') : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => act(u, 'reset')}>Nové heslo</button>{' '}
                        <button className="btn btn-ghost btn-sm" onClick={() => act(u, u.active ? 'deactivate' : 'activate')}>{u.active ? 'Zablokovat' : 'Povolit'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <form className="panel" onSubmit={create}>
            <div className="panel-h"><h3>Přidat kolegyni</h3></div>
            <div className="panel-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field"><label>Jméno</label><input name="name" required /></div>
              <div className="field"><label>E-mail (@goodladies.cz)</label><input name="email" type="email" required /></div>
              <div className="field"><label>Role</label>
                <select name="role" defaultValue="editor"><option value="editor">Editorka – upravuje</option><option value="approver">Schvalovatelka – upravuje i publikuje</option></select></div>
              <button className="btn btn-primary">Založit účet</button>
            </div>
          </form>
        </div>
      )}
      {forbidden && <p className="panel panel-b">Účty spravuje schvalovatelka. Níže si můžete změnit vlastní heslo.</p>}

      <form className="panel" onSubmit={changeOwn} style={{ marginTop: 20, maxWidth: 460 }}>
        <div className="panel-h"><h3>Moje heslo</h3></div>
        <div className="panel-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field"><label>Současné heslo</label><input name="current" type="password" autoComplete="current-password" required /></div>
          <div className="field"><label>Nové heslo (min. 10 znaků)</label><input name="next" type="password" autoComplete="new-password" minLength={10} required /></div>
          <button className="btn btn-ghost">Změnit heslo</button>
        </div>
      </form>

      {pw && (
        <div className="overlay">
          <div className="dialog">
            <h3>Přihlašovací údaje</h3>
            <p style={{ margin: 0, fontSize: 14 }}>Pošlete je kolegyni bezpečně (osobně nebo zvlášť e-mail a heslo). Heslo se už znovu nezobrazí – po přihlášení si ho změní v záložce Tým.</p>
            <div style={{ background: '#faf6f6', padding: 12, borderRadius: 8, fontSize: 14 }}>
              Adresa: <b>{typeof window !== 'undefined' ? `${window.location.origin}/admin` : '/admin'}</b><br />
              E-mail: <b>{pw.email}</b><br />Heslo: <b style={{ fontFamily: 'monospace', fontSize: 16 }}>{pw.password}</b>
            </div>
            <button className="btn btn-primary" onClick={() => setPw(null)}>Mám zapsáno</button>
          </div>
        </div>
      )}
      <ToastView toast={toast} />
    </>
  );
}
