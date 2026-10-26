import type pg from 'pg';
import { appDb, tx } from './db';
import { parseCzDate } from './mapper';

// Dotazník dostupnosti → přihlášky na akce.
// Mapuje podle klíčových slov v hlavičce a podle NÁZVŮ AKCÍ v odpovědích – nezáleží na tom,
// jestli je dotazník udělaný jako zaškrtávací seznam akcí, mřížka (akce × dny) nebo volný text.

export type AvailabilityReport = { matched: number; unmatched: number; skipped: number };

const norm = (s: unknown) => String(s ?? '').trim();

function normPhone(s: string) {
  const d = s.replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : '';
}

export async function ingestAvailability(rows: Record<string, string>[]): Promise<AvailabilityReport> {
  const rep: AvailabilityReport = { matched: 0, unmatched: 0, skipped: 0 };
  const events = (await appDb().query('SELECT id, name, key FROM event')).rows as { id: number; name: string; key: string }[];

  for (const row of rows) {
    const entries = Object.entries(row).map(([h, v]) => [h, norm(v)] as const);
    const find = (...keys: string[]) => entries.find(([h]) => keys.some((k) => h.toLowerCase().includes(k)))?.[1] ?? '';
    const ts = find('časová značka', 'timestamp');
    const email = find('e-mail', 'email').toLowerCase();
    const phone = find('telefon');
    const name = find('jméno');
    if (!email && !phone) { rep.skipped++; continue; }
    const responseId = `${parseCzDate(ts) ?? ts}|${email || normPhone(phone)}`;

    // akce: hledá název akce v hlavičce (mřížka „[Caravaning]“) i v hodnotách (zaškrtávací seznam)
    const found = new Set<number>();
    const rawParts: string[] = [];
    for (const [h, v] of entries) {
      if (!v) continue;
      for (const e of events) {
        const n = e.name.toLowerCase();
        const inHeader = h.toLowerCase().includes(n);
        const inValue = v.toLowerCase().includes(n);
        const negative = /^(ne|nemohu|nemůžu|ne\s*-|0)$/i.test(v);
        if ((inHeader && !negative) || inValue) {
          found.add(e.id);
          rawParts.push(inHeader ? `${e.name}: ${v}` : v);
        }
      }
    }
    const noteParts = entries
      .filter(([h, v]) => v && /(dn[ yí]|jazyk|poznámk|cestov|ubytov)/i.test(h) && !events.some((e) => h.toLowerCase().includes(e.name.toLowerCase())))
      .map(([h, v]) => `${h.replace(/\s*\[.*\]\s*/, '')}: ${v}`);

    const res = await tx(async (c) => {
      const ex = await c.query('SELECT 1 FROM availability_response WHERE response_id = $1', [responseId]);
      if (ex.rowCount) return 'skip' as const;
      const hostessId = await matchHostess(c, email, phone);
      await c.query(
        `INSERT INTO availability_response (response_id, submitted_at, email, phone, name, event_ids, events_raw, note, payload, hostess_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [responseId, parseCzDate(ts), email || null, phone || null, name || null, [...found],
          [...new Set(rawParts)].join(' · ') || null, noteParts.join(' · ') || null, JSON.stringify(row),
          hostessId, hostessId ? 'matched' : 'unmatched']);
      if (hostessId) await applySignups(c, hostessId, [...found], noteParts.join(' · '), 'dotaznik_dostupnosti');
      return hostessId ? 'matched' as const : 'unmatched' as const;
    });
    if (res === 'skip') rep.skipped++; else rep[res]++;
  }
  return rep;
}

async function matchHostess(c: pg.PoolClient, email: string, phone: string): Promise<string | null> {
  if (email) {
    const r = await c.query(`SELECT id FROM hostess WHERE lower(email) = $1 AND status NOT IN ('rejected_age')
                             ORDER BY created_at DESC LIMIT 1`, [email]);
    if (r.rowCount) return r.rows[0].id;
  }
  const p = normPhone(phone);
  if (p) {
    const r = await c.query(`SELECT id FROM hostess WHERE right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 9) = $1
                             AND status NOT IN ('rejected_age') ORDER BY created_at DESC LIMIT 1`, [p]);
    if (r.rowCount) return r.rows[0].id;
  }
  return null;
}

export async function applySignups(c: pg.PoolClient, hostessId: string, eventIds: number[], note: string, source: string) {
  for (const e of eventIds) {
    await c.query(
      `INSERT INTO hostess_event_signup (hostess_id, event_id, source, note) VALUES ($1,$2,$3,$4)
       ON CONFLICT (hostess_id, event_id) DO UPDATE SET note = coalesce(EXCLUDED.note, hostess_event_signup.note), source = EXCLUDED.source`,
      [hostessId, e, source, note || null]);
  }
  await c.query('UPDATE hostess SET last_activity_at = now() WHERE id = $1', [hostessId]);
  await c.query(`INSERT INTO audit_log (hostess_id, action, note) VALUES ($1, 'availability', $2)`,
    [hostessId, `Dotazník dostupnosti: přihlášena na ${eventIds.length} ${eventIds.length === 1 ? 'akci' : 'akce'}`]);
}

/** Ruční přiřazení nespárované odpovědi k profilu (z administrace). */
export async function assignAvailability(responseId: string, hostessId: string | null) {
  return tx(async (c) => {
    const r = (await c.query('SELECT * FROM availability_response WHERE id = $1 FOR UPDATE', [responseId])).rows[0];
    if (!r) throw Object.assign(new Error('Odpověď neexistuje'), { code: 'P0001' });
    if (!hostessId) {
      await c.query(`UPDATE availability_response SET status = 'ignored' WHERE id = $1`, [responseId]);
      return;
    }
    await c.query(`UPDATE availability_response SET status = 'matched', hostess_id = $2 WHERE id = $1`, [responseId, hostessId]);
    await applySignups(c, hostessId, r.event_ids, r.note ?? '', 'dotaznik_dostupnosti');
  });
}
