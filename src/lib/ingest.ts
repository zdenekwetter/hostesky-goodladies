import type pg from 'pg';
import { tx } from './db';
import { mapResponse, slugify, type MappedProfile } from './mapper';

export type IngestReport = {
  created: string[];          // booking_id
  skipped: number;            // už zpracované (response_id existuje)
  rejected: { name: string; reasons: string[] }[];
  warnings: { booking_id: string; warnings: string[] }[];
};

const CONSENT_TEXT: Record<string, string> = {
  age_18: 'Je mi 18 let a více.',
  publication: 'Souhlasím se zpracováním osobních údajů a se zveřejněním svého profilu ve veřejném katalogu GoodLadies.',
  contact_sharing: 'Souhlasím s předáním svého kontaktu klientovi v případě konkrétní poptávky.',
};

/** Zpracuje řádky tabulky odpovědí (objekty hlavička → hodnota). Idempotentní podle response_id. */
export async function ingestRows(rows: Record<string, string>[], source = 'google_form'): Promise<IngestReport> {
  const report: IngestReport = { created: [], skipped: 0, rejected: [], warnings: [] };

  for (const row of rows) {
    const res = mapResponse(row);
    if (!res.ok) {
      report.rejected.push({ name: res.name || '(bez jména)', reasons: res.reasons });
      if (res.reason === 'rejected_age') await storeRejectedAge(row);
      continue;
    }
    const p = res.profile;
    const created = await tx(async (c) => {
      // stejná odpověď může přijít okamžitě (Apps Script) i z pravidelné kontroly tabulky
      const exists = await c.query(
        `SELECT 1 FROM hostess WHERE response_id = $1
           OR ($2::text IS NOT NULL AND lower(email) = lower($2) AND $3::timestamptz IS NOT NULL
               AND abs(extract(epoch FROM submitted_at - $3::timestamptz)) < 180)`,
        [p.response_id, p.email, p.submitted_at]);
      if (exists.rowCount) return null;
      return insertProfile(c, p, source);
    });
    if (!created) { report.skipped++; continue; }
    report.created.push(created);
    if (res.warnings.length) report.warnings.push({ booking_id: created, warnings: res.warnings });
  }
  return report;
}

async function insertProfile(c: pg.PoolClient, p: MappedProfile, source: string): Promise<string> {
  const tmpSlug = `tmp-${crypto.randomUUID()}`;
  const ins = await c.query(
    `INSERT INTO hostess (slug, status, first_name, last_name, email, phone, region, city, social_url,
       height_cm, dress_size, shoe_size, bio, experience_years, experience_label, events_raw,
       driving_licence, health_card, skills_raw, personality, rate_expectation,
       travel_multiday, travel_abroad, travel_overnight, availability_note, roles_other,
       response_id, submitted_at, raw_payload)
     VALUES ($1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     RETURNING id, booking_id`,
    [tmpSlug, p.first_name, p.last_name, p.email, p.phone, p.region, p.city, p.social_url,
      p.height_cm && p.height_cm >= 140 && p.height_cm <= 210 ? p.height_cm : null,
      p.dress_size, p.shoe_size,
      JSON.stringify({ cs: p.bio_cs, de: null, en: null, zh: null }),
      p.experience_years, p.experience_label, p.events_raw,
      p.driving_licence, p.health_card, p.skills_raw, p.personality, p.rate_expectation,
      p.travel.multiday, p.travel.abroad, p.travel.overnight, null, p.roles_other,
      p.response_id, p.submitted_at,
      Object.keys(p.unmapped).length ? JSON.stringify(p.unmapped) : null],
  );
  const { id, booking_id } = ins.rows[0];
  const initial = p.last_name ? p.last_name[0] : '';
  await c.query('UPDATE hostess SET slug = $1 WHERE id = $2',
    [`${slugify(p.first_name)}-${slugify(initial)}-${booking_id.toLowerCase()}`.replace(/--+/g, '-'), id]);

  for (const l of p.languages) {
    await c.query(
      'INSERT INTO hostess_language (hostess_id, lang, label, level) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [id, l.lang, l.label, l.level]);
  }
  for (const r of p.roles) {
    await c.query('INSERT INTO hostess_role (hostess_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, r]);
  }
  for (const [kind, granted] of Object.entries(p.consents)) {
    await c.query(
      `INSERT INTO consent (hostess_id, kind, granted, granted_at, source, evidence)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, kind, granted, granted ? (p.submitted_at ?? new Date().toISOString()) : null, source, CONSENT_TEXT[kind]]);
  }
  for (const [i, url] of p.photo_urls.entries()) {
    await c.query(
      'INSERT INTO hostess_photo (hostess_id, status, source_url, sort, is_primary) VALUES ($1,$2,$3,$4,$5)',
      [id, 'pending', url, i, i === 0]);
  }
  for (const url of p.cv_urls) {
    await c.query('INSERT INTO hostess_document (hostess_id, kind, source_url) VALUES ($1,$2,$3)', [id, 'cv', url]);
  }
  // Přihlášky na akce z odpovědi „Dostupnost na podzimní veletrhy“ – podle názvu akce
  if (p.availability_raw) {
    const ev = await c.query('SELECT id, name FROM event');
    for (const e of ev.rows) {
      if (p.availability_raw.toLowerCase().includes(String(e.name).toLowerCase())) {
        await c.query(
          `INSERT INTO hostess_event_signup (hostess_id, event_id, source) VALUES ($1,$2,'google_form')
           ON CONFLICT DO NOTHING`, [id, e.id]);
      }
    }
  }
  await c.query(
    `INSERT INTO audit_log (hostess_id, action, note) VALUES ($1,'ingest',$2)`,
    [id, `Založeno z odpovědi formuláře (${source})`]);

  // Dotazník dostupnosti mohl přijít dřív než přihláška – dopárovat podle e-mailu
  if (p.email) {
    const pending = await c.query(
      `SELECT id, event_ids, note FROM availability_response WHERE status = 'unmatched' AND lower(email) = lower($1)`, [p.email]);
    for (const a of pending.rows) {
      await c.query(`UPDATE availability_response SET status = 'matched', hostess_id = $2 WHERE id = $1`, [a.id, id]);
      const { applySignups } = await import('./availability');
      await applySignups(c, id, a.event_ids, a.note ?? '', 'dotaznik_dostupnosti');
    }
  }
  return booking_id;
}

/** Nezletilá: neukládáme osobní údaje, jen značku, aby se odpověď nezpracovávala znovu. */
async function storeRejectedAge(row: Record<string, string>) {
  const ts = Object.entries(row).find(([h]) => /časová značka|timestamp/i.test(h))?.[1] ?? '';
  const em = Object.entries(row).find(([h]) => /e-mail/i.test(h))?.[1] ?? '';
  const { parseCzDate } = await import('./mapper');
  const rid = `${parseCzDate(ts.trim()) ?? ts.trim()}|${em.trim().toLowerCase()}`;
  await tx(async (c) => {
    await c.query(
      `INSERT INTO hostess (slug, status, first_name, response_id)
       VALUES ($1, 'rejected_age', '—', $2) ON CONFLICT (response_id) DO NOTHING`,
      [`rejected-${crypto.randomUUID()}`, rid]);
  });
}
