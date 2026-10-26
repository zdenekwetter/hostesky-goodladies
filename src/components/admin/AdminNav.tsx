'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  ['/admin', 'Profily'],
  ['/admin/poptavky', 'Poptávky'],
  ['/admin/akce', 'Akce'],
  ['/admin/import', 'Import přihlášek'],
  ['/admin/tym', 'Tým'],
  ['/admin/nastaveni', 'Nastavení'],
] as const;

export default function AdminNav({ name, role }: { name: string; role: string }) {
  const path = usePathname();
  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }
  return (
    <header className="adm-top">
      <div className="adm-top-in">
        <Link href="/admin" className="logo" style={{ fontSize: 18 }}>GoodLadies</Link>
        <nav className="adm-tabs">
          {TABS.map(([href, label]) => (
            <Link key={href} href={href}
              className={(href === '/admin' ? path === '/admin' || path.startsWith('/admin/profil') : path.startsWith(href)) ? 'on' : ''}>
              {label}
            </Link>
          ))}
          <a href="/" target="_blank" rel="noopener">Katalog ↗</a>
        </nav>
        <div className="adm-user">
          {name} · {role === 'approver' ? 'schvalovatel' : 'editor'}
          <button className="btn btn-ghost btn-sm" onClick={logout}>Odhlásit</button>
        </div>
      </div>
    </header>
  );
}
