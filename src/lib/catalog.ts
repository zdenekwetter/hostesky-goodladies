import { publicDb } from './db';

// Veřejná data katalogu. Čte VÝHRADNĚ ze schématu public_api (role hostesky_public).
// Tvar odpovídá GET /api/hostesses – stejný tvar jako dřívější hostesky.json, aby frontend nepoznal rozdíl.

export type PublicHostess = {
  booking_id: string;
  slug: string;
  first_name: string;
  last_initial: string;
  region: string | null;
  city: string | null;
  height_cm: number | null;
  dress_size: string | null;
  shoe_size: string | null;
  bio: { cs: string | null; de: string | null; en: string | null; zh: string | null };
  experience_years: number;
  experience_label: string | null;
  skills: string[];
  driving_licence: boolean;
  health_card: boolean;
  travel: { multiday: boolean; abroad: boolean; overnight: boolean };
  availability_note: string | null;
  languages: { lang: string; label: string | null; level: string }[];
  roles: string[];
  work_history: { event_name: string; year: number | null; role: string | null }[];
  photos: { url_400: string; url_800: string; url_1600: string; alt: string | null; kind: string }[];
  events: string[]; // klíče akcí, na které je přihlášená
};

export type PublicEvent = {
  key: string; name: string; place: string | null; country: string;
  date_from: string | null; date_to: string | null; count: number;
};

const SQL = `
SELECT h.booking_id, h.slug, h.first_name, h.last_initial, h.region, h.city, h.height_cm,
       h.dress_size, h.shoe_size, h.bio, h.experience_years, h.experience_label, h.skills,
       h.driving_licence, h.health_card,
       json_build_object('multiday', h.travel_multiday, 'abroad', h.travel_abroad, 'overnight', h.travel_overnight) AS travel,
       h.availability_note,
       coalesce((SELECT json_agg(json_build_object('lang', l.lang, 'label', l.label, 'level', l.level)
                 ORDER BY CASE l.level WHEN 'native' THEN 0 WHEN 'C1' THEN 1 WHEN 'B1' THEN 2 ELSE 3 END, l.lang)
                 FROM public_api.hostess_language l WHERE l.hostess_id = h.id), '[]') AS languages,
       coalesce((SELECT json_agg(r.role) FROM public_api.hostess_role r WHERE r.hostess_id = h.id), '[]') AS roles,
       coalesce((SELECT json_agg(json_build_object('event_name', w.event_name, 'year', w.year, 'role', w.role)
                 ORDER BY w.year DESC NULLS LAST, w.sort)
                 FROM public_api.hostess_work_history w WHERE w.hostess_id = h.id), '[]') AS work_history,
       coalesce((SELECT json_agg(json_build_object('url_400', p.url_400, 'url_800', p.url_800,
                   'url_1600', p.url_1600, 'alt', p.alt, 'kind', p.kind)
                 ORDER BY p.is_primary DESC, p.sort)
                 FROM public_api.hostess_photo p WHERE p.hostess_id = h.id), '[]') AS photos,
       coalesce((SELECT json_agg(e.key) FROM public_api.hostess_event_signup s
                 JOIN public_api.event e ON e.id = s.event_id WHERE s.hostess_id = h.id), '[]') AS events
FROM public_api.hostess h`;

export async function listHostesses(): Promise<PublicHostess[]> {
  const r = await publicDb().query(`${SQL} ORDER BY h.experience_years DESC, h.first_name`);
  return r.rows;
}

export async function getHostess(slugOrBooking: string): Promise<PublicHostess | null> {
  const r = await publicDb().query(`${SQL} WHERE h.slug = $1 OR lower(h.booking_id) = lower($1)`, [slugOrBooking]);
  return r.rows[0] ?? null;
}

export async function listEvents(): Promise<PublicEvent[]> {
  const r = await publicDb().query(`
    SELECT e.key, e.name, e.place, e.country, e.date_from::text, e.date_to::text,
           (SELECT count(*)::int FROM public_api.hostess_event_signup s WHERE s.event_id = e.id) AS count
    FROM public_api.event e ORDER BY e.date_from NULLS LAST, e.sort`);
  return r.rows;
}
