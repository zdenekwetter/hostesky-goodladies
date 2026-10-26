// Jediné místo, kde se čte konfigurace z proměnných prostředí.
// Popis všech proměnných je v .env.example.

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export const config = {
  siteUrl: opt('SITE_URL') ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'),
  adminEmailDomain: opt('ADMIN_EMAIL_DOMAIN') ?? 'goodladies.cz',

  // Kontakty a odkazy (mění se výjimečně, proto v kódu / proměnných prostředí)
  contactPhone: opt('CONTACT_PHONE') ?? '+420 736 705 423',
  contactEmail: opt('CONTACT_EMAIL') ?? 'info@goodladies.cz',
  landingUrl: opt('LANDING_URL') ?? 'https://goodladies.cz/hostesky/',
  privacyUrl: opt('PRIVACY_URL') ?? 'https://goodladies.cz/zasady-zpracovani-osobnich-udaju/',
};
// Webhook Make, adresa Apps Scriptu, cena a tajné klíče jsou v src/lib/settings.ts (mění se v administraci).


export function requireConfig<K extends keyof typeof config>(key: K): NonNullable<(typeof config)[K]> {
  const v = config[key];
  if (v === undefined || v === null || v === '') {
    throw new Error(`Chybí nastavení ${String(key)} – viz .env.example`);
  }
  return v as NonNullable<(typeof config)[K]>;
}
