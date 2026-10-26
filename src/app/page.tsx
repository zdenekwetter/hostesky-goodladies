import { listEvents, listHostesses } from '@/lib/catalog';
import { config } from '@/lib/config';
import { settings } from '@/lib/settings';
import Catalog from '@/components/Catalog';
import { Header, Footer } from '@/components/Chrome';

// Katalog se renderuje na serveru z databáze a obnovuje se nejpozději po minutě,
// takže publikace v administraci se projeví bez nového nasazení.
export const revalidate = 60;

type SP = Promise<{ akce?: string; h?: string }>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [hostesses, events, s] = await Promise.all([listHostesses(), listEvents(), settings()]);
  return (
    <>
      <Header />
      <Catalog
        hostesses={hostesses}
        events={events}
        initialEvent={sp.akce}
        initialOpen={sp.h}
        priceText={s.priceText}
        privacyUrl={config.privacyUrl}
        contactPhone={config.contactPhone}
      />
      <Footer />
    </>
  );
}
