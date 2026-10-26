'use client';

import { useEffect, useState } from 'react';

export default function Login() {
  const [setup, setSetup] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/setup').then((r) => r.json()).then((j) => setSetup(!!j.needsSetup)).catch(() => setSetup(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await fetch(setup ? '/api/admin/setup' : '/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setup ? { email, name, password } : { email, password }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || 'Přihlášení se nepovedlo'); return; }
    window.location.href = setup ? '/admin/nastaveni' : '/admin';
  }

  if (setup === null) return <div className="login" />;

  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="logo">GoodLadies<small>Administrace katalogu</small></div>
        {setup && <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>Katalog je nově nasazený. Založte první účet – bude mít roli schvalovatelky a další kolegyně pak přidáte v záložce Tým.</p>}
        {setup && <div className="field"><label htmlFor="n">Jméno</label>
          <input id="n" value={name} onChange={(e) => setName(e.target.value)} required /></div>}
        <div className="field"><label htmlFor="e">E-mail</label>
          <input id="e" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="p">{setup ? 'Heslo (min. 10 znaků)' : 'Heslo'}</label>
          <input id="p" type="password" autoComplete={setup ? 'new-password' : 'current-password'} minLength={setup ? 10 : undefined}
            value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {err && <div className="msg-err" style={{ marginTop: 0 }}>{err}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Moment…' : setup ? 'Založit účet' : 'Přihlásit'}</button>
      </form>
    </div>
  );
}
