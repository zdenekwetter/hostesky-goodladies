import crypto from 'node:crypto';
import { appDb } from './db';

// Nastavení, které se mění v administraci (záložka Nastavení) – bez přístupu do Vercelu.
// Proměnná prostředí se stejným významem má vždy přednost (kdyby ji někdo nastavil ve Vercelu).

export type Settings = {
  bridgeUrl: string | null;      // adresa Apps Scriptu (…/exec)
  makeWebhookUrl: string;        // tentýž webhook jako formulář na landing page
  priceText: string;             // cena v hlavičce katalogu
  sessionKey: Uint8Array;        // podpis přihlášení do administrace
  ingestSecret: string;          // klíč, kterým se podepisuje Apps Script
  cronSecret: string;
};

export const DEFAULTS = {
  make_webhook_url: 'https://hook.eu2.make.com/zlr2kgrcpun7xdr5rlsw8b8fr7ok1mir',
  price_text: 'Od 3 700 Kč za hostesku a den. Konečnou cenu spočítáme podle délky akce, počtu hostesek a místa.',
};

export const EDITABLE = ['bridge_url', 'make_webhook_url', 'price_text'] as const;

let cache: { at: number; s: Settings } | null = null;

export async function settings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.s;
  const rows = (await appDb().query('SELECT key, value FROM app_setting')).rows as { key: string; value: string }[];
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  const secret = v.app_secret;
  if (!secret) throw new Error('Chybí app_secret – neproběhla migrace');
  const derive = (what: string) => crypto.createHmac('sha256', secret).update(what).digest('hex');
  const env = (k: string) => process.env[k]?.trim() || undefined;
  const s: Settings = {
    bridgeUrl: env('GOOGLE_BRIDGE_URL') ?? v.bridge_url ?? null,
    makeWebhookUrl: env('MAKE_WEBHOOK_URL') ?? v.make_webhook_url ?? DEFAULTS.make_webhook_url,
    priceText: env('PRICE_TEXT') ?? v.price_text ?? DEFAULTS.price_text,
    sessionKey: new TextEncoder().encode(env('SESSION_SECRET') ?? derive('session')),
    ingestSecret: env('INGEST_SECRET') ?? derive('ingest').slice(0, 40),
    cronSecret: env('CRON_SECRET') ?? derive('cron'),
  };
  cache = { at: Date.now(), s };
  return s;
}

export function clearSettingsCache() { cache = null; }

export async function saveSetting(key: (typeof EDITABLE)[number], value: string, userId: number) {
  await appDb().query(
    `INSERT INTO app_setting (key, value, updated_by) VALUES ($1,$2,$3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, value, userId]);
  clearSettingsCache();
}
