import crypto from 'node:crypto';
import { settings } from './settings';

// Most do Googlu přes Apps Script (google-apps-script/katalog-most.gs).
// Skript běží pod účtem, kterému patří formulář, tabulky a fotky na Disku – aplikace tedy
// nepotřebuje Google Cloud ani servisní účet. Každý požadavek je podepsaný INGEST_SECRET.

type BridgeAction =
  | { action: 'rows'; sheet: 'prihlaska' | 'dostupnost' }
  | { action: 'photo'; id: string };

export async function hasBridge(): Promise<boolean> {
  return Boolean((await settings()).bridgeUrl);
}

async function call<T>(a: BridgeAction | { action: 'ping' }): Promise<T> {
  const s = await settings();
  if (!s.bridgeUrl) throw new Error('Most do Googlu není nastavený – vložte adresu Apps Scriptu v administraci (Nastavení)');
  const data = JSON.stringify({ ...a, ts: Date.now() });
  const sig = crypto.createHmac('sha256', s.ingestSecret).update(data, 'utf8').digest('hex');
  const res = await fetch(s.bridgeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ data, sig }),
    redirect: 'follow',
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  let j: { ok?: boolean; error?: string } & T;
  try { j = JSON.parse(text); } catch {
    throw new Error(`Apps Script neodpověděl JSONem (${res.status}) – je nasazený jako webová aplikace s přístupem „Kdokoli“?`);
  }
  if (!j.ok) throw new Error(`Apps Script: ${j.error ?? 'neznámá chyba'}`);
  return j;
}

/** Tabulka odpovědí jako pole objektů hlavička → hodnota. */
export async function bridgeRows(sheet: 'prihlaska' | 'dostupnost'): Promise<Record<string, string>[]> {
  const r = await call<{ values: string[][] }>({ action: 'rows', sheet });
  const [head, ...rows] = r.values ?? [];
  if (!head) return [];
  return rows
    .filter((row) => row.some((v) => String(v).trim()))
    .map((row) => Object.fromEntries(head.map((h, i) => [h, String(row[i] ?? '')])));
}

/** Ověří spojení s Apps Scriptem (tlačítko v Nastavení). */
export async function bridgePing(): Promise<string> {
  const r = await call<{ verze: string }>({ action: 'ping' });
  return r.verze;
}

/** Fotka z Disku (zmenšená na max. 2000 px už v Googlu, aby se vešla do požadavku). */
export async function bridgePhoto(id: string): Promise<Buffer> {
  const r = await call<{ base64: string; mime: string }>({ action: 'photo', id });
  return Buffer.from(r.base64, 'base64');
}
