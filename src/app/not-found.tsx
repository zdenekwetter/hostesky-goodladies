import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: 32, marginBottom: 10 }}>Tenhle profil v katalogu není</h1>
        <p style={{ color: 'var(--ink-2)' }}>Mohl být mezitím stažený. Podívejte se na ostatní hostesky.</p>
        <Link className="btn btn-primary" href="/" style={{ marginTop: 12 }}>Do katalogu</Link>
      </div>
    </div>
  );
}
