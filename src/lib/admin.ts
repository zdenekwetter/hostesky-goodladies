import type pg from 'pg';
import { appDb, tx } from './db';
import type { Admin } from './auth';

// Datová vrstva administrace (katalog-admin-vrstva.md). Každá změna jde do audit logu s poznámkou.

export async function audit(c: pg.PoolClient | pg.Pool, a: Admin | null, action: string, note: string,
  ids: { hostess_id?: string; inquiry_id?: string } = {}, diff?: unknown) {
  await c.query(
    'INSERT INTO audit_log (user_id, hostess_id, inquiry_id, action, note, diff) VALUES ($1,$2,$3,$4,$5,$6)',
    [a?.id ?? null, ids.hostess_id ?? null, ids.inquiry_id ?? null, action, note,
      diff === undefined ? null : JSON.stringify(diff)]);
}

/** Co profilu chybí do publikace – stejná pravidla jako trigger v databázi. */
const MISSING_SQL = `
  array_remove(ARRAY[
    CASE WHEN NOT EXISTS (SELECT 1 FROM consent c WHERE c.hostess_id = h.id AND c.kind = 'publication'
         AND c.granted AND c.revoked_at IS NULL) THEN 'souhlas se zveřejněním' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM hostess_photo p WHERE p.hostess_id = h.id AND p.status = 'approved'
         AND NOT p.hidden AND p.url_800 IS NOT NULL) THEN
      CASE WHEN EXISTS (SELECT 1 FROM hostess_photo p WHERE p.hostess_id = h.id AND NOT p.hidden)
           THEN 'schválit fotku' ELSE 'fotka' END END,
    CASE WHEN coalesce(trim(h.region),'') = '' THEN 'kraj' END,
    CASE WHEN coalesce(trim(h.city),'') = '' THEN 'město' END
  ], NULL)`;

const SOFT_SQL = `
  array_remove(ARRAY[
    CASE WHEN h.height_cm IS NULL THEN 'výška' END,
    CASE WHEN coalesce(h.bio->>'cs','') = '' THEN 'představení' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM hostess_language l WHERE l.hostess_id = h.id) THEN 'jazyky' END
  ], NULL)`;

export async function listForAdmin(status?: string) {
  const r = await appDb().query(`
    SELECT h.id, h.booking_id, h.slug, h.status, h.first_name, h.last_name, h.city, h.region,
           h.submitted_at, h.updated_at, h.published_at,
           (SELECT p.url_400 FROM hostess_photo p WHERE p.hostess_id = h.id AND NOT p.hidden AND p.url_400 IS NOT NULL
             ORDER BY p.is_primary DESC, p.sort LIMIT 1) AS thumb,
           (SELECT count(*)::int FROM hostess_photo p WHERE p.hostess_id = h.id AND NOT p.hidden) AS photo_count,
           coalesce((SELECT string_agg(l.lang, ' ' ORDER BY l.lang) FROM hostess_language l
             WHERE l.hostess_id = h.id AND l.lang <> 'cs'), '') AS langs,
           ${MISSING_SQL} AS missing,
           ${SOFT_SQL} AS soft_missing
    FROM hostess h
    WHERE h.status <> 'rejected_age' AND ($1::text IS NULL OR h.status::text = $1)
    ORDER BY h.submitted_at DESC NULLS LAST, h.created_at DESC`, [status ?? null]);
  const counts = await appDb().query(
    `SELECT status::text, count(*)::int FROM hostess WHERE status <> 'rejected_age' GROUP BY status`);
  return {
    rows: r.rows,
    counts: Object.fromEntries(counts.rows.map((x) => [x.status, x.count])) as Record<string, number>,
  };
}

export async function getForAdmin(id: string) {
  const db = appDb();
  const h = (await db.query(`SELECT h.*, ${MISSING_SQL} AS missing FROM hostess h WHERE h.id = $1`, [id])).rows[0];
  if (!h) return null;
  const [langs, roles, history, photos, consents, docs, signups, log, inquiries] = await Promise.all([
    db.query('SELECT lang, label, level FROM hostess_language WHERE hostess_id = $1 ORDER BY lang', [id]),
    db.query('SELECT role FROM hostess_role WHERE hostess_id = $1', [id]),
    db.query('SELECT id, event_name, year, role FROM hostess_work_history WHERE hostess_id = $1 ORDER BY year DESC NULLS LAST, sort', [id]),
    db.query(`SELECT id, status, reject_reason, kind, url_400, url_800, url_1600, source_url, alt, sort, is_primary, hidden
              FROM hostess_photo WHERE hostess_id = $1 ORDER BY hidden, is_primary DESC, sort, created_at`, [id]),
    db.query('SELECT kind, granted, granted_at, source, evidence, revoked_at FROM consent WHERE hostess_id = $1 ORDER BY kind', [id]),
    db.query('SELECT id, kind, source_url, path, created_at FROM hostess_document WHERE hostess_id = $1', [id]),
    db.query(`SELECT e.id, e.key, e.name, (s.hostess_id IS NOT NULL) AS signed, s.note
              FROM event e LEFT JOIN hostess_event_signup s ON s.event_id = e.id AND s.hostess_id = $1
              WHERE e.is_active ORDER BY e.date_from NULLS LAST, e.sort`, [id]),
    db.query(`SELECT a.at, a.action, a.note, u.name AS user_name FROM audit_log a
              LEFT JOIN admin_user u ON u.id = a.user_id WHERE a.hostess_id = $1 ORDER BY a.at DESC LIMIT 100`, [id]),
    db.query(`SELECT i.id, i.created_at, i.firma, i.jmeno, i.status FROM inquiry_hostess ih
              JOIN inquiry i ON i.id = ih.inquiry_id WHERE ih.hostess_id = $1 ORDER BY i.created_at DESC`, [id]),
  ]);
  return {
    hostess: h,
    languages: langs.rows,
    roles: roles.rows.map((r) => r.role),
    work_history: history.rows,
    photos: photos.rows,
    consents: consents.rows,
    documents: docs.rows,
    events: signups.rows,
    history: log.rows,
    inquiries: inquiries.rows,
  };
}

const EDITABLE = ['first_name', 'last_name', 'region', 'city', 'height_cm', 'dress_size', 'shoe_size',
  'experience_years', 'experience_label', 'skills', 'driving_licence', 'health_card',
  'travel_multiday', 'travel_abroad', 'travel_overnight', 'availability_note', 'availability_until',
  'email', 'phone', 'social_url', 'personality', 'rate_expectation', 'internal_note'] as const;

export type ProfilePatch = Partial<Record<(typeof EDITABLE)[number], unknown>> & {
  bio?: { cs?: string | null; de?: string | null; en?: string | null; zh?: string | null };
  languages?: { lang: string; label?: string; level: string }[];
  roles?: string[];
  work_history?: { event_name: string; year?: number | null; role?: string | null }[];
  event_ids?: number[];
  note?: string;
};

export async function updateProfile(a: Admin, id: string, p: ProfilePatch) {
  return tx(async (c) => {
    const before = (await c.query('SELECT * FROM hostess WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!before) throw Object.assign(new Error('Profil neexistuje'), { code: 'P0001' });
    const sets: string[] = [];
    const vals: unknown[] = [];
    const changed: Record<string, unknown> = {};
    for (const k of EDITABLE) {
      if (!(k in p)) continue;
      let v = p[k];
      if (v === '') v = null;
      if (k === 'height_cm' || k === 'experience_years') v = v === null ? null : Number(v);
      if (k === 'experience_years' && v === null) v = 0;
      if (k === 'skills') v = Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : [];
      if (JSON.stringify(before[k] instanceof Date ? before[k].toISOString().slice(0, 10) : before[k]) === JSON.stringify(v)) continue;
      vals.push(v);
      sets.push(`${k} = $${vals.length}`);
      changed[k] = k === 'rate_expectation' || k === 'phone' || k === 'email' ? '(změněno)' : v;
    }
    if (p.bio) {
      const bio = { ...before.bio, ...p.bio };
      vals.push(JSON.stringify(bio));
      sets.push(`bio = $${vals.length}`);
      if (JSON.stringify(bio) !== JSON.stringify(before.bio)) changed.bio = true;
    }
    if (sets.length) {
      vals.push(id);
      await c.query(`UPDATE hostess SET ${sets.join(', ')}, last_activity_at = now() WHERE id = $${vals.length}`, vals);
    }
    if (p.languages) {
      await c.query('DELETE FROM hostess_language WHERE hostess_id = $1', [id]);
      for (const l of p.languages) {
        if (!l.lang || !l.level) continue;
        await c.query('INSERT INTO hostess_language (hostess_id, lang, label, level) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [id, l.lang, l.lang === 'other' ? (l.label ?? '') : '', l.level]);
      }
      changed.languages = true;
    }
    if (p.roles) {
      await c.query('DELETE FROM hostess_role WHERE hostess_id = $1', [id]);
      for (const r of p.roles) {
        await c.query('INSERT INTO hostess_role (hostess_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, r]);
      }
      changed.roles = true;
    }
    if (p.work_history) {
      await c.query('DELETE FROM hostess_work_history WHERE hostess_id = $1', [id]);
      for (const [i, w] of p.work_history.entries()) {
        if (!w.event_name?.trim()) continue;
        await c.query('INSERT INTO hostess_work_history (hostess_id, event_name, year, role, sort) VALUES ($1,$2,$3,$4,$5)',
          [id, w.event_name.trim(), w.year ? Number(w.year) : null, w.role?.trim() || null, i]);
      }
      changed.work_history = true;
    }
    if (p.event_ids) {
      await c.query(`DELETE FROM hostess_event_signup WHERE hostess_id = $1 AND NOT (event_id = ANY($2))`, [id, p.event_ids]);
      for (const e of p.event_ids) {
        await c.query(`INSERT INTO hostess_event_signup (hostess_id, event_id, source) VALUES ($1,$2,'admin')
                       ON CONFLICT DO NOTHING`, [id, e]);
      }
      changed.events = p.event_ids;
    }
    if (Object.keys(changed).length) {
      await audit(c, a, 'edit', p.note?.trim() || 'Úprava profilu', { hostess_id: id }, changed);
    }
    return Object.keys(changed);
  });
}

const TRANSITIONS: Record<string, string[]> = {
  new: ['draft', 'archived'],
  draft: ['review', 'archived'],
  review: ['draft', 'published', 'archived'],
  published: ['paused', 'review', 'archived'],
  paused: ['published', 'review', 'archived'],
  archived: ['draft'],
};

export async function changeStatus(a: Admin, id: string, to: string, note: string) {
  if (!note?.trim()) throw Object.assign(new Error('Doplňte poznámku – proč se stav mění'), { code: 'P0001' });
  if ((to === 'published' || (to === 'paused')) && a.role !== 'approver') {
    throw Object.assign(new Error('Publikovat a stahovat profily smí jen schvalovatel'), { code: 'P0001' });
  }
  return tx(async (c) => {
    const cur = (await c.query('SELECT status FROM hostess WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw Object.assign(new Error('Profil neexistuje'), { code: 'P0001' });
    if (!TRANSITIONS[cur.status]?.includes(to)) {
      throw Object.assign(new Error(`Ze stavu „${cur.status}“ nejde přejít do „${to}“`), { code: 'P0001' });
    }
    if (cur.status === 'published' && a.role !== 'approver') {
      throw Object.assign(new Error('Stáhnout publikovaný profil smí jen schvalovatel'), { code: 'P0001' });
    }
    await c.query('UPDATE hostess SET status = $1, last_activity_at = now() WHERE id = $2', [to, id]);
    await audit(c, a, `status:${cur.status}→${to}`, note.trim(), { hostess_id: id });
  });
}

export async function revokeConsent(a: Admin, id: string, kind: string, note: string) {
  if (!note?.trim()) throw Object.assign(new Error('Doplňte poznámku – kdy a jak uchazečka souhlas odvolala'), { code: 'P0001' });
  return tx(async (c) => {
    const r = await c.query(
      'UPDATE consent SET revoked_at = now() WHERE hostess_id = $1 AND kind = $2 AND revoked_at IS NULL', [id, kind]);
    if (!r.rowCount) throw Object.assign(new Error('Souhlas není aktivní'), { code: 'P0001' });
    await audit(c, a, `consent_revoked:${kind}`, note.trim(), { hostess_id: id });
  });
}

export async function createManual(a: Admin, first_name: string, last_name: string, note: string) {
  return tx(async (c) => {
    const r = await c.query(
      `INSERT INTO hostess (slug, status, first_name, last_name) VALUES ($1, 'draft', $2, $3) RETURNING id, booking_id`,
      [`tmp-${crypto.randomUUID()}`, first_name.trim(), last_name.trim()]);
    const { id, booking_id } = r.rows[0];
    const { slugify } = await import('./mapper');
    await c.query('UPDATE hostess SET slug = $1 WHERE id = $2',
      [`${slugify(first_name)}-${slugify(last_name.slice(0, 1))}-${booking_id.toLowerCase()}`.replace(/--+/g, '-'), id]);
    await audit(c, a, 'create', note?.trim() || 'Ručně založený profil', { hostess_id: id });
    return id as string;
  });
}

export async function recordConsent(a: Admin, id: string, kind: string, evidence: string, note: string) {
  // Souhlas se nezaškrtává za uchazečku – lze jen zaevidovat doložený souhlas (např. podepsaný papír, e-mail).
  if (!evidence?.trim() || !note?.trim()) {
    throw Object.assign(new Error('Doložte, odkud souhlas je (znění + zdroj) a doplňte poznámku'), { code: 'P0001' });
  }
  return tx(async (c) => {
    await c.query(
      `INSERT INTO consent (hostess_id, kind, granted, granted_at, source, evidence)
       VALUES ($1,$2,true,now(),'doloženo_v_adminu',$3)
       ON CONFLICT (hostess_id, kind) DO UPDATE SET granted = true, granted_at = now(), revoked_at = NULL,
         source = 'doloženo_v_adminu', evidence = EXCLUDED.evidence`,
      [id, kind, evidence.trim()]);
    await audit(c, a, `consent_recorded:${kind}`, note.trim(), { hostess_id: id }, { evidence });
  });
}
