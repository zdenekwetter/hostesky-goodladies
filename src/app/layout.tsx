import type { Metadata, Viewport } from 'next';
// Fonty vložené natvrdo (ne z Google CDN) – katalog-datovy-model.md kap. 5
import '@fontsource/josefin-sans/400.css';
import '@fontsource/josefin-sans/600.css';
import '@fontsource/josefin-sans/700.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Katalog hostesek | GoodLadies',
  description: 'Vyberte si konkrétní hostesky na veletrh, konferenci nebo firemní akci. U každé vidíte fotku, jazyky a akce, které má za sebou.',
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  openGraph: { type: 'website', locale: 'cs_CZ', siteName: 'GoodLadies' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: '#b83544', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
