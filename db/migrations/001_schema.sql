-- Katalog hostesek GoodLadies — schéma databáze
-- Podle claude/katalog-datovy-model.md (v0.4) a pravidel z V1 (role, views, audit, „skrývat, nemazat“).
-- Spouští se jako vlastník databáze (gl_owner / výchozí role Neonu): npm run migrate

BEGIN;

-- ---------------------------------------------------------------------------
-- Číselníky
-- ---------------------------------------------------------------------------
CREATE TYPE hostess_status AS ENUM
  ('new', 'draft', 'review', 'published', 'paused', 'archived', 'rejected_age');

CREATE TYPE photo_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE consent_kind AS ENUM ('age_18', 'publication', 'contact_sharing');

CREATE TYPE inquiry_status AS ENUM ('nova', 'v_reseni', 'vyrizena');

CREATE TYPE admin_role AS ENUM ('editor', 'approver');

-- ---------------------------------------------------------------------------
-- Jádro profilu
-- ---------------------------------------------------------------------------
CREATE SEQUENCE booking_seq START 1001;

CREATE TABLE hostess (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         text NOT NULL UNIQUE DEFAULT ('GL-' || nextval('booking_seq')),
  slug               text NOT NULL UNIQUE,
  status             hostess_status NOT NULL DEFAULT 'new',

  -- veřejné
  first_name         text NOT NULL,
  region             text,
  city               text,
  height_cm          int CHECK (height_cm IS NULL OR height_cm BETWEEN 140 AND 210),
  dress_size         text,
  shoe_size          text,
  bio                jsonb NOT NULL DEFAULT '{"cs":null,"de":null,"en":null,"zh":null}',
  experience_years   int NOT NULL DEFAULT 0,
  experience_label   text,
  skills             text[] NOT NULL DEFAULT '{}',
  driving_licence    boolean NOT NULL DEFAULT false,
  health_card        boolean NOT NULL DEFAULT false,
  travel_multiday    boolean NOT NULL DEFAULT false,
  travel_abroad      boolean NOT NULL DEFAULT false,
  travel_overnight   boolean NOT NULL DEFAULT false,
  availability_note  text,
  availability_until date,

  -- interní (nikdy do veřejných views)
  last_name          text,
  email              text,
  phone              text,
  social_url         text,
  personality        text,
  rate_expectation   text,
  internal_note      text,
  events_raw         text,
  skills_raw         text,
  roles_other        text[] NOT NULL DEFAULT '{}',

  -- ingest
  response_id        text UNIQUE,          -- klíč z formuláře, ingest je idempotentní
  submitted_at       timestamptz,
  raw_payload        jsonb,                -- co se nenamapovalo

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  published_at       timestamptz,
  last_activity_at   timestamptz NOT NULL DEFAULT now()   -- retenční lhůty 12/24 měsíců
);

CREATE INDEX hostess_status_idx ON hostess (status);
CREATE INDEX hostess_region_idx ON hostess (region);

CREATE TABLE hostess_language (
  hostess_id uuid NOT NULL REFERENCES hostess(id) ON DELETE CASCADE,
  lang       text NOT NULL,              -- cs, en, de, es, fr, it, ru, other
  label      text,                       -- název u „other“
  level      text NOT NULL CHECK (level IN ('native','C1','B1','A1')),
  PRIMARY KEY (hostess_id, lang, label)
);
-- label musí být neprázdný kvůli PK
ALTER TABLE hostess_language ALTER COLUMN label SET DEFAULT '';
ALTER TABLE hostess_language ALTER COLUMN label SET NOT NULL;

CREATE TABLE hostess_role (
  hostess_id uuid NOT NULL REFERENCES hostess(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN
    ('hosteska','promoterka','veletrh','tlumoceni','modeling','ochutnavky','moderovani','tanec')),
  PRIMARY KEY (hostess_id, role)
);

-- Odpracované akce (důkaz na kartě)
CREATE TABLE hostess_work_history (
  id         bigserial PRIMARY KEY,
  hostess_id uuid NOT NULL REFERENCES hostess(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  year       int,
  role       text,
  sort       int NOT NULL DEFAULT 0
);

-- Fotky: veřejné varianty s vodoznakem + privátní originál
CREATE TABLE hostess_photo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hostess_id     uuid NOT NULL REFERENCES hostess(id) ON DELETE CASCADE,
  status         photo_status NOT NULL DEFAULT 'pending',
  reject_reason  text,
  kind           text NOT NULL DEFAULT 'portrait' CHECK (kind IN ('portrait','full_body','event')),
  url_400        text,
  url_800        text,
  url_1600       text,
  original_path  text,                   -- privátní bucket, bez vodoznaku
  source_url     text,                   -- odkaz z formuláře (Disk)
  alt            text,
  sort           int NOT NULL DEFAULT 0,
  is_primary     boolean NOT NULL DEFAULT false,
  hidden         boolean NOT NULL DEFAULT false,   -- „skrývat, nemazat“
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'rejected' OR reject_reason IS NOT NULL)
);
CREATE INDEX hostess_photo_h_idx ON hostess_photo (hostess_id);

CREATE TABLE hostess_document (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hostess_id uuid NOT NULL REFERENCES hostess(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('cv','id_check')),
  path       text,                       -- privátní bucket
  source_url text,
  parsed_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consent (
  hostess_id uuid NOT NULL REFERENCES hostess(id) ON DELETE CASCADE,
  kind       consent_kind NOT NULL,
  granted    boolean NOT NULL,
  granted_at timestamptz,
  source     text NOT NULL DEFAULT 'google_form',
  evidence   text,                       -- znění souhlasu platné v tu chvíli
  revoked_at timestamptz,
  PRIMARY KEY (hostess_id, kind)
);

-- ---------------------------------------------------------------------------
-- Akce a přihlášky na ně (porada 15. 10.: klient vidí jen hostesky přihlášené na jeho akci)
-- ---------------------------------------------------------------------------
CREATE TABLE event (
  id         serial PRIMARY KEY,
  key        text NOT NULL UNIQUE,
  name       text NOT NULL,
  place      text,
  country    text NOT NULL DEFAULT 'CZ',
  date_from  date,
  date_to    date,
  is_active  boolean NOT NULL DEFAULT true,
  sort       int NOT NULL DEFAULT 0
);

CREATE TABLE hostess_event_signup (
  hostess_id uuid NOT NULL REFERENCES hostess(id) ON DELETE CASCADE,
  event_id   int  NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  source     text NOT NULL DEFAULT 'admin',   -- admin / google_form / dotaznik_dostupnosti
  note       text,                            -- např. „jen 2 dny“
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hostess_id, event_id)
);

-- ---------------------------------------------------------------------------
-- Poptávky
-- ---------------------------------------------------------------------------
CREATE TABLE inquiry (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'katalog',   -- katalog / lp
  status            inquiry_status NOT NULL DEFAULT 'nova',
  payload           jsonb NOT NULL,                    -- přesně to, co šlo do Make
  booking_ids       text[] NOT NULL DEFAULT '{}',
  jmeno             text,
  firma             text,
  email             text,
  telefon           text,
  forwarded_at      timestamptz,
  forward_attempts  int NOT NULL DEFAULT 0,
  forward_error     text,
  internal_note     text
);
CREATE INDEX inquiry_created_idx ON inquiry (created_at DESC);

CREATE TABLE inquiry_hostess (
  inquiry_id uuid NOT NULL REFERENCES inquiry(id) ON DELETE CASCADE,
  hostess_id uuid NOT NULL REFERENCES hostess(id),
  PRIMARY KEY (inquiry_id, hostess_id)
);

-- ---------------------------------------------------------------------------
-- Administrace
-- ---------------------------------------------------------------------------
CREATE TABLE admin_user (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          admin_role NOT NULL DEFAULT 'editor',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Audit log s povinnou poznámkou (V1)
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  user_id     int REFERENCES admin_user(id),
  hostess_id  uuid REFERENCES hostess(id),
  inquiry_id  uuid REFERENCES inquiry(id),
  action      text NOT NULL,
  note        text NOT NULL CHECK (length(trim(note)) > 0),
  diff        jsonb
);
CREATE INDEX audit_log_h_idx ON audit_log (hostess_id, at DESC);

-- ---------------------------------------------------------------------------
-- Pravidla, která hlídá databáze, ne dobrá vůle
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hostess_guard() RETURNS trigger AS $$
DECLARE
  missing text[] := '{}';
BEGIN
  NEW.updated_at := now();

  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    IF NOT EXISTS (SELECT 1 FROM consent c WHERE c.hostess_id = NEW.id AND c.kind = 'age_18'
                   AND c.granted AND c.revoked_at IS NULL) THEN
      missing := array_append(missing, 'souhlas 18+');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM consent c WHERE c.hostess_id = NEW.id AND c.kind = 'publication'
                   AND c.granted AND c.revoked_at IS NULL) THEN
      missing := array_append(missing, 'souhlas se zveřejněním');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM hostess_photo p WHERE p.hostess_id = NEW.id
                   AND p.status = 'approved' AND NOT p.hidden AND p.url_800 IS NOT NULL) THEN
      missing := array_append(missing, 'schválená fotka');
    END IF;
    IF coalesce(trim(NEW.first_name), '') = '' THEN missing := array_append(missing, 'jméno'); END IF;
    IF coalesce(trim(NEW.region), '') = '' THEN missing := array_append(missing, 'kraj'); END IF;
    IF coalesce(trim(NEW.city), '') = '' THEN missing := array_append(missing, 'město'); END IF;

    IF array_length(missing, 1) > 0 THEN
      RAISE EXCEPTION 'Profil nelze publikovat, chybí: %', array_to_string(missing, ', ')
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER hostess_guard_trg BEFORE INSERT OR UPDATE ON hostess
  FOR EACH ROW EXECUTE FUNCTION hostess_guard();

-- Odvolaný souhlas se zveřejněním → profil okamžitě archivovat (skrýt, ne smazat)
CREATE OR REPLACE FUNCTION consent_revoke() RETURNS trigger AS $$
BEGIN
  IF NEW.kind IN ('publication', 'age_18') AND NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    UPDATE hostess SET status = 'archived' WHERE id = NEW.hostess_id;
    UPDATE hostess_photo SET hidden = true WHERE hostess_id = NEW.hostess_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER consent_revoke_trg AFTER UPDATE ON consent
  FOR EACH ROW EXECUTE FUNCTION consent_revoke();

-- Souhlas se nesmí smazat (jen odvolat)
CREATE OR REPLACE FUNCTION forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Mazání v tabulce % není povolené — data se skrývají, nemažou', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER consent_no_delete BEFORE DELETE ON consent FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER audit_no_delete   BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER audit_no_update   BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_delete();

-- ---------------------------------------------------------------------------
-- Veřejné views — jediné, na co sahá veřejný web. Osobní údaje v nich nejsou.
-- ---------------------------------------------------------------------------
CREATE SCHEMA public_api;

CREATE VIEW public_api.hostess AS
SELECT h.id, h.booking_id, h.slug,
       h.first_name,
       CASE WHEN coalesce(h.last_name, '') = '' THEN ''
            ELSE upper(left(trim(h.last_name), 1)) || '.' END AS last_initial,
       h.region, h.city, h.height_cm, h.dress_size, h.shoe_size,
       h.bio, h.experience_years, h.experience_label, h.skills,
       h.driving_licence, h.health_card,
       h.travel_multiday, h.travel_abroad, h.travel_overnight,
       CASE WHEN h.availability_until IS NULL OR h.availability_until >= current_date
            THEN h.availability_note END AS availability_note,
       h.published_at
FROM hostess h
WHERE h.status = 'published';

CREATE VIEW public_api.hostess_language AS
SELECT l.hostess_id, l.lang, nullif(l.label, '') AS label, l.level
FROM hostess_language l JOIN public_api.hostess h ON h.id = l.hostess_id;

CREATE VIEW public_api.hostess_role AS
SELECT r.hostess_id, r.role
FROM hostess_role r JOIN public_api.hostess h ON h.id = r.hostess_id;

CREATE VIEW public_api.hostess_work_history AS
SELECT w.hostess_id, w.event_name, w.year, w.role, w.sort
FROM hostess_work_history w JOIN public_api.hostess h ON h.id = w.hostess_id;

CREATE VIEW public_api.hostess_photo AS
SELECT p.id, p.hostess_id, p.kind, p.url_400, p.url_800, p.url_1600, p.alt, p.sort, p.is_primary
FROM hostess_photo p JOIN public_api.hostess h ON h.id = p.hostess_id
WHERE p.status = 'approved' AND NOT p.hidden AND p.url_800 IS NOT NULL;

CREATE VIEW public_api.event AS
SELECT e.id, e.key, e.name, e.place, e.country, e.date_from, e.date_to, e.sort
FROM event e
WHERE e.is_active AND (e.date_to IS NULL OR e.date_to >= current_date);

CREATE VIEW public_api.hostess_event_signup AS
SELECT s.hostess_id, s.event_id
FROM hostess_event_signup s
JOIN public_api.hostess h ON h.id = s.hostess_id
JOIN public_api.event e ON e.id = s.event_id;

COMMIT;
