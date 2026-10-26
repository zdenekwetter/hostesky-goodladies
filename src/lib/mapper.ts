// Mapper odpovědi z Google Formu na profil.
// Port claude/prevod-odpovedi.py, ale mapuje podle KLÍČOVÝCH SLOV V HLAVIČCE, ne podle pozice
// sloupce – Google Forms pořadí sloupců přehazuje, jakmile se formulář upraví.
// Používá ho import z CSV (scripts/import-csv.mjs přes API) i automatický ingest ze Sheets API.

export const LEVEL: Record<string, 'native' | 'C1' | 'B1' | 'A1'> = {
  'rodilý mluvčí': 'native',
  'pokročilá (c1-c2)': 'C1',
  'středně pokročilá (b1-b2)': 'B1',
  'základní (ai-a2)': 'A1',
  'základní (a1-a2)': 'A1',
};

export const ROLE: Record<string, string> = {
  'hosteska': 'hosteska',
  'promotérka': 'promoterka',
  'veletržní stánek / welcome desk': 'veletrh',
  'tlumočení': 'tlumoceni',
  'modeling': 'modeling',
  'ochutnávky / sampling': 'ochutnavky',
  'moderování': 'moderovani',
  'tanec': 'tanec',
};

const YEARS: Record<string, [number, string]> = {
  'žádné / začínám': [0, 'začíná'],
  'do 1 roku': [1, 'do roka praxe'],
  '1-3 roky': [2, '1–3 roky praxe'],
  '3-5 let': [4, '3–5 let praxe'],
  'více než 5 let': [6, 'víc než 5 let praxe'],
};

const LANG_KEYS: [string, string][] = [
  ['[čeština]', 'cs'], ['[angličtina]', 'en'], ['[němčina]', 'de'], ['[španělština]', 'es'],
  ['[francouzština]', 'fr'], ['[italština]', 'it'], ['[ruština]', 'ru'], ['[jiný]', 'other'],
];

export type MappedProfile = {
  response_id: string;
  submitted_at: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  region: string | null;
  city: string | null;
  social_url: string | null;
  height_cm: number | null;
  dress_size: string | null;
  shoe_size: string | null;
  bio_cs: string | null;
  languages: { lang: string; label: string; level: string }[];
  roles: string[];
  roles_other: string[];
  experience_years: number;
  experience_label: string | null;
  events_raw: string | null;
  driving_licence: boolean;
  health_card: boolean;
  skills_raw: string | null;
  personality: string | null;
  rate_expectation: string | null;
  travel: { multiday: boolean; abroad: boolean; overnight: boolean };
  availability_raw: string | null;
  photo_urls: string[];
  cv_urls: string[];
  consents: { age_18: boolean; publication: boolean; contact_sharing: boolean };
  unmapped: Record<string, string>;
};

export type MapResult =
  | { ok: true; profile: MappedProfile; warnings: string[] }
  | { ok: false; reason: 'rejected_age' | 'invalid'; reasons: string[]; name: string };

const norm = (s: unknown) => String(s ?? '').trim();
const low = (s: unknown) => norm(s).toLowerCase();
const yes = (s: unknown) => ['ano', 'yes', 'true'].includes(low(s));

function num(v: unknown): number | null {
  const m = String(v ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function splitList(v: unknown): string[] {
  return norm(v).split(',').map((x) => x.trim()).filter(Boolean);
}

/** Najde hodnotu podle klíčového slova v hlavičce. Zaznamená, které sloupce byly použity. */
function picker(row: Record<string, string>) {
  const used = new Set<string>();
  const headers = Object.keys(row);
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const h = headers.find((h) => !used.has(h) && h.toLowerCase().includes(k));
      if (h) { used.add(h); return norm(row[h]); }
    }
    return '';
  };
  const unmapped = () => Object.fromEntries(
    headers.filter((h) => !used.has(h) && norm(row[h])).map((h) => [h, norm(row[h])]),
  );
  return { get, unmapped };
}

export function mapResponse(row: Record<string, string>): MapResult {
  const { get, unmapped } = picker(row);

  const submitted = get('časová značka', 'timestamp');
  const email = get('e-mail');
  // pořadí je důležité: specifičtější klíče dřív
  const c18 = get('18 let');
  const cPub = get('zveřejněním');
  const cShare = get('předáním');
  const fullName = get('jméno a příjmení', 'jméno');
  const phone = get('telefon');
  const region = get('kraj');
  const city = get('město');
  const social = get('instagram');
  const height = get('výšk');
  const dress = get('konfekční');
  const shoe = get('velikost bot');
  const intro = get('představení');

  const languages: MappedProfile['languages'] = [];
  const otherName = (() => {
    const h = Object.keys(row).find((h) => h.toLowerCase().includes('další jazyk'));
    return h ? norm(row[h]) : '';
  })();
  for (const [key, code] of LANG_KEYS) {
    const v = get(key);
    const lvl = LEVEL[low(v)];
    if (!lvl) continue;
    languages.push({ lang: code, label: code === 'other' ? (otherName || 'jiný') : '', level: lvl });
  }
  get('další jazyk'); // označit jako použitý

  const roles: string[] = [];
  const rolesOther: string[] = [];
  for (const t of splitList(get('typ práce'))) {
    const r = ROLE[t.toLowerCase()];
    if (r) { if (!roles.includes(r)) roles.push(r); } else rolesOther.push(t);
  }

  const [yrs, yrsLabel] = YEARS[low(get('roky zkušeností'))] ?? [0, null];
  const eventsRaw = get('konkrétní akce');
  const driving = yes(get('řidičský'));
  const health = yes(get('potravinářský', 'zdravotní'));
  const skills = get('dovednosti');
  const personality = get('extrovert');
  const rate = get('odměně');
  const travelRaw = get('cestování');
  const availability = get('dostupnost');
  const photos = splitList(get('fotografie'));
  const cvs = splitList(get('životopis'));

  const parts = fullName.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  const last = parts.slice(1).join(' ');

  const consents = {
    age_18: yes(c18) || low(c18).includes('ano'),
    publication: low(cPub).includes('souhlas') || yes(cPub),
    contact_sharing: low(cShare).includes('souhlas') || yes(cShare),
  };

  if (!consents.age_18) {
    return { ok: false, reason: 'rejected_age', reasons: ['nepotvrdila 18+'], name: fullName };
  }
  const reasons: string[] = [];
  if (!first) reasons.push('chybí jméno');
  if (!consents.publication) reasons.push('chybí souhlas se zveřejněním');
  if (reasons.length) return { ok: false, reason: 'invalid', reasons, name: fullName };

  const warnings: string[] = [];
  if (!photos.length) warnings.push('chybí fotka');
  if (!region || !city) warnings.push('chybí kraj nebo město');
  if (!num(height)) warnings.push('chybí výška');

  const travel = {
    multiday: /vícedenní/i.test(travelRaw),
    abroad: /zahranič/i.test(travelRaw),
    overnight: /ubytování/i.test(travelRaw),
  };

  return {
    ok: true,
    warnings,
    profile: {
      response_id: `${parseCzDate(submitted) ?? submitted}|${email.toLowerCase()}`,
      submitted_at: parseCzDate(submitted),
      first_name: first,
      last_name: last,
      email: email || null,
      phone: phone || null,
      region: region || null,
      city: city || null,
      social_url: social || null,
      height_cm: num(height),
      dress_size: dress || null,
      shoe_size: shoe ? shoe.replace(/\.0$/, '') : null,
      bio_cs: intro || null,
      languages,
      roles,
      roles_other: rolesOther,
      experience_years: yrs,
      experience_label: yrsLabel,
      events_raw: eventsRaw || null,
      driving_licence: driving,
      health_card: health,
      skills_raw: skills || null,
      personality: personality || null,
      rate_expectation: rate || null,
      travel,
      availability_raw: availability || null,
      photo_urls: photos,
      cv_urls: cvs,
      consents,
      unmapped: unmapped(),
    },
  };
}

/** „9. 9. 2026 14:03:12“ nebo „9/9/2026 14:03:12“ → ISO. */
export function parseCzDate(s: string): string | null {
  const m = s.match(/(\d{1,2})[./]\s*(\d{1,2})[./]\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0', se = '0'] = m;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:${se.padStart(2, '0')}+02:00`;
  return isNaN(Date.parse(iso)) ? null : iso;
}

export function slugify(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** ID souboru z odkazu na Disk (open?id=…, /file/d/…/). */
export function driveFileId(url: string): string | null {
  const m = url.match(/[?&]id=([\w-]+)/) || url.match(/\/d\/([\w-]+)/);
  return m ? m[1] : null;
}
