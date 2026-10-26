// Naplní databázi profily ze souboru ve tvaru hostesky.json (výstup claude/prevod-odpovedi.py).
// Profily se zakládají jako „draft“ – do katalogu jdou až po schválení v administraci.
//
//   DATABASE_URL=… npm run seed -- data/hostesky.json
//   DATABASE_URL=… npm run seed -- --demo      ← 8 smyšlených profilů s fotkou, publikované (jen pro náhled!)
//
// Pro reálná data je lepší import CSV v administraci (Přihlášky → Import), protože přenese
// i interní pole (telefon, e-mail) a odkazy na fotky z Disku. Tenhle skript slouží hlavně k vývoji.

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const arg = process.argv[2];
const url = process.env.DATABASE_URL_OWNER || process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true } });
await c.connect();

const data = arg === '--demo' ? demo() : JSON.parse(fs.readFileSync(path.resolve(arg ?? 'data/hostesky.json'), 'utf8'));
const publish = arg === '--demo';
const events = Object.fromEntries((await c.query('SELECT key, id FROM event')).rows.map((r) => [r.key, r.id]));

let n = 0;
for (const h of data.hostesses) {
  const ex = await c.query('SELECT 1 FROM hostess WHERE booking_id = $1', [h.booking_id]);
  if (ex.rowCount) continue;
  await c.query('BEGIN');
  const r = await c.query(
    `INSERT INTO hostess (booking_id, slug, status, first_name, last_name, region, city, height_cm, dress_size, shoe_size,
       bio, experience_years, experience_label, events_raw, driving_licence, health_card, skills_raw,
       travel_multiday, travel_abroad, travel_overnight, roles_other, response_id)
     VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
    [h.booking_id, h.slug, h.first_name, (h.last_initial || '').replace('.', ''), h.region, h.city, h.height_cm,
      h.dress_size, h.shoe_size, JSON.stringify(h.bio), h.experience_years, h.experience_label, h.events_raw ?? null,
      h.driving_licence, h.health_card, h.skills_raw ?? null, h.travel?.multiday ?? false, h.travel?.abroad ?? false,
      h.travel?.overnight ?? false, h.roles_other ?? [], `seed|${h.booking_id}`]);
  const id = r.rows[0].id;
  for (const l of h.languages ?? []) {
    await c.query('INSERT INTO hostess_language (hostess_id, lang, label, level) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [id, l.lang, l.lang === 'other' ? (l.label ?? '') : '', l.level]);
  }
  for (const role of h.roles ?? []) {
    await c.query('INSERT INTO hostess_role VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, role]);
  }
  for (const k of h.available_events ?? []) {
    if (events[k]) await c.query(`INSERT INTO hostess_event_signup (hostess_id, event_id, source) VALUES ($1,$2,'import') ON CONFLICT DO NOTHING`, [id, events[k]]);
  }
  for (const w of h.work_history ?? []) {
    await c.query('INSERT INTO hostess_work_history (hostess_id, event_name, year, role) VALUES ($1,$2,$3,$4)', [id, w.event_name, w.year, w.role]);
  }
  // prevod-odpovedi.py propouští jen profily se souhlasem 18+ a se zveřejněním
  for (const kind of ['age_18', 'publication', 'contact_sharing']) {
    await c.query(`INSERT INTO consent (hostess_id, kind, granted, granted_at, source, evidence) VALUES ($1,$2,true,now(),'import_xlsx',$3)`,
      [id, kind, 'Převzato z exportu odpovědí formuláře (prevod-odpovedi.py)']);
  }
  if (publish && h.demo_photo) {
    await c.query(`INSERT INTO hostess_photo (hostess_id, status, url_400, url_800, url_1600, is_primary)
                   VALUES ($1,'approved',$2,$2,$2,true)`, [id, h.demo_photo]);
    await c.query(`UPDATE hostess SET status = 'published' WHERE id = $1`, [id]);
  }
  await c.query(`INSERT INTO audit_log (hostess_id, action, note) VALUES ($1,'seed',$2)`,
    [id, publish ? 'Demo profil (smyšlený)' : 'Import ze souboru hostesky.json']);
  await c.query('COMMIT');
  n++;
}
if (!publish) await c.query(`SELECT setval('booking_seq', greatest((SELECT max(substring(booking_id from 4)::int) FROM hostess WHERE booking_id ~ '^GL-\\d+$' AND booking_id NOT LIKE 'GL-9%'), 1000))`);
await c.end();
console.log(`Založeno profilů: ${n}`);

function demo() {
  const people = [
    ['Tereza', 'N', 'Praha', 'Praha', 172, 'S', '38', 4, '3–5 let praxe', ['cs:native', 'en:C1', 'de:B1'], ['hosteska', 'veletrh'], ['caravaning', 'e_salon', 'czech_bus']],
    ['Kristýna', 'M', 'Jihomoravský', 'Brno', 176, 'M', '39', 2, '1–3 roky praxe', ['cs:native', 'en:B1'], ['promoterka', 'ochutnavky'], ['caravaning']],
    ['Anna', 'K', 'Praha', 'Praha', 168, 'S', '37', 6, 'víc než 5 let praxe', ['cs:native', 'en:C1', 'fr:B1'], ['hosteska', 'moderovani'], ['e_salon', 'medica']],
    ['Veronika', 'P', 'Středočeský', 'Kladno', 174, 'S', '39', 1, 'do roka praxe', ['cs:native', 'de:C1'], ['veletrh', 'tlumoceni'], ['electronica', 'sps']],
    ['Lucie', 'D', 'Olomoucký', 'Olomouc', 170, 'M', '38', 2, '1–3 roky praxe', ['cs:native', 'en:B1', 'ru:B1'], ['hosteska'], ['caravaning', 'czech_bus']],
    ['Natálie', 'S', 'Praha', 'Praha', 178, 'S', '40', 4, '3–5 let praxe', ['cs:native', 'en:C1', 'it:A1'], ['modeling', 'hosteska'], ['e_salon', 'czech_bus', 'medica']],
    ['Barbora', 'V', 'Jihomoravský', 'Brno', 169, 'XS', '37', 0, 'začíná', ['cs:native', 'en:B1'], ['promoterka'], ['caravaning']],
    ['Michaela', 'R', 'Plzeňský', 'Plzeň', 173, 'M', '39', 6, 'víc než 5 let praxe', ['cs:native', 'de:native', 'en:C1'], ['veletrh', 'tlumoceni', 'hosteska'], ['electronica', 'sps', 'medica']],
  ];
  return {
    hostesses: people.map(([first, ini, region, city, h, dress, shoe, yrs, label, langs, roles, ev], i) => ({
      booking_id: `GL-${9001 + i}`,
      slug: `${first.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()}-${ini.toLowerCase()}-gl-${9001 + i}`,
      first_name: first, last_initial: `${ini}.`, region, city, height_cm: h, dress_size: dress, shoe_size: shoe,
      bio: { cs: `Ukázkový profil pro náhled katalogu. Na veletrzích pracuje na recepci stánku a s návštěvníky mluví ${langs.length > 2 ? 'třemi jazyky' : 'dvěma jazyky'}.`, de: null, en: null, zh: null },
      experience_years: yrs, experience_label: label,
      languages: langs.map((s) => { const [lang, level] = s.split(':'); return { lang, level }; }),
      roles, available_events: ev,
      driving_licence: i % 2 === 0, health_card: i % 3 === 0,
      travel: { multiday: true, abroad: i % 2 === 1 || ev.some((e) => ['electronica', 'sps', 'medica'].includes(e)), overnight: true },
      work_history: yrs ? [{ event_name: 'MSV Brno', year: 2025, role: 'hosteska na stánku' }] : [],
      demo_photo: `/demo/portret-${(i % 4) + 1}.svg`,
    })),
  };
}
