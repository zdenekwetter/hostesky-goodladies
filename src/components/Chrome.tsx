import Link from 'next/link';
import { config } from '@/lib/config';

export function Header() {
  return (
    <header className="top">
      <div className="top-in">
        <Link href="/" className="logo">GoodLadies<small>Katalog hostesek</small></Link>
        <nav className="top-nav">
          <a href={config.landingUrl} className="hide-m">Služby</a>
          <a href="https://goodladies.cz/kariera/hosteska/" className="hide-m">Staň se hosteskou</a>
          <a href={`tel:${config.contactPhone.replace(/\s/g, '')}`}>{config.contactPhone}</a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="foot-in">
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 4 }}>Poradíme s výběrem</div>
          <a className="foot-phone" href={`tel:${config.contactPhone.replace(/\s/g, '')}`}>{config.contactPhone}</a>
          <div><a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a href={config.landingUrl}>Hostesky na veletrhy a akce</a>
          <a href="https://goodladies.cz/kariera/hosteska/">Staň se hosteskou</a>
          <a href={config.privacyUrl}>Zásady zpracování osobních údajů</a>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>© {new Date().getFullYear()} GoodLadies s.r.o.</div>
      </div>
    </footer>
  );
}
