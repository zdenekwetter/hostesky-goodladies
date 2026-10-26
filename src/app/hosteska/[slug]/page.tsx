import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getHostess, listEvents } from '@/lib/catalog';
import ProfileCard from '@/components/ProfileCard';
import { Header, Footer } from '@/components/Chrome';

// Samostatná stránka profilu – tenhle odkaz se posílá klientům (katalog.goodladies.cz/hosteska/…).

export const revalidate = 60;
type P = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const h = await getHostess((await params).slug);
  if (!h) return { title: 'Profil nenalezen | GoodLadies' };
  const langs = h.languages.length;
  return {
    title: `${h.first_name} ${h.last_initial} – hosteska ${h.city ?? ''} | GoodLadies`,
    description: `Hosteska z GoodLadies${h.city ? `, ${h.city}` : ''}. ${langs} ${langs === 1 ? 'jazyk' : langs < 5 ? 'jazyky' : 'jazyků'}${h.experience_label ? `, ${h.experience_label}` : ''}.`,
    openGraph: h.photos[0] ? { images: [{ url: h.photos[0].url_800 }] } : undefined,
  };
}

export default async function Profile({ params }: { params: P }) {
  const [h, events] = await Promise.all([getHostess((await params).slug), listEvents()]);
  if (!h) notFound();
  return (
    <>
      <Header />
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px' }}>
        <p style={{ margin: '0 0 14px' }}><Link href="/">← Zpět do katalogu</Link></p>
        <div className="modal" style={{ width: '100%', maxHeight: 'none', boxShadow: 'var(--shadow)' }}>
          <ProfileCard h={h} events={events} actions={(
            <Link className="btn btn-primary" href={`/?h=${h.slug}`}>Přidat do poptávky</Link>
          )} />
        </div>
      </div>
      <Footer />
    </>
  );
}
