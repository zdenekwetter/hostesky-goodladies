import { appDb } from './db';
import { settings } from './settings';

// Poptávka jde do TÉHOŽ Make webhooku jako formulář na landing page, se stejnými klíči
// + booking_ids a zdroj. Adresa webhooku zůstává na serveru.

export async function forwardInquiry(inquiryId: string): Promise<{ ok: boolean; error?: string }> {
  const db = appDb();
  const r = await db.query('SELECT payload FROM inquiry WHERE id = $1', [inquiryId]);
  if (!r.rowCount) return { ok: false, error: 'poptávka neexistuje' };

  const { makeWebhookUrl } = await settings();
  if (!makeWebhookUrl) {
    await db.query(
      `UPDATE inquiry SET forward_attempts = forward_attempts + 1, forward_error = $2 WHERE id = $1`,
      [inquiryId, 'Webhook Make není nastavený']);
    return { ok: false, error: 'Webhook Make není nastavený' };
  }

  try {
    const res = await fetch(makeWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r.rows[0].payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Make odpověděl ${res.status}`);
    await db.query(
      `UPDATE inquiry SET forwarded_at = now(), forward_attempts = forward_attempts + 1, forward_error = NULL
       WHERE id = $1`, [inquiryId]);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.query(
      `UPDATE inquiry SET forward_attempts = forward_attempts + 1, forward_error = $2 WHERE id = $1`,
      [inquiryId, msg]);
    return { ok: false, error: msg };
  }
}

/** Dožene poptávky, které se do Make nepodařilo poslat (volá cron). */
export async function retryPendingInquiries(): Promise<number> {
  const r = await appDb().query(
    `SELECT id FROM inquiry WHERE forwarded_at IS NULL AND forward_attempts < 10
     AND created_at > now() - interval '7 days' ORDER BY created_at LIMIT 20`);
  let ok = 0;
  for (const row of r.rows) if ((await forwardInquiry(row.id)).ok) ok++;
  return ok;
}
