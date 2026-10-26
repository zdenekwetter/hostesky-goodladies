-- Nastavení aplikace v databázi, aby se dalo měnit v administraci bez přístupu do Vercelu.
-- app_secret vygeneruje migrace sama; z něj se odvozují klíče (přihlášení, podpis Apps Scriptu, hesla rolí).

CREATE TABLE app_setting (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by int REFERENCES admin_user(id)
);

INSERT INTO app_setting (key, value)
VALUES ('app_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (key) DO NOTHING;
