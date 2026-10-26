-- Dotazník dostupnosti (Freelo 4.1): hostesky se hlásí na konkrétní akce měsíčně / čtvrtletně.
-- Odpověď se spáruje s profilem podle e-mailu (případně telefonu) a promítne do hostess_event_signup.
-- Nespárované odpovědi zůstávají tady a v administraci se přiřadí ručně.

CREATE TABLE availability_response (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id   text NOT NULL UNIQUE,          -- idempotence (časová značka + e-mail)
  submitted_at  timestamptz,
  email         text,
  phone         text,
  name          text,
  event_ids     int[] NOT NULL DEFAULT '{}',   -- rozpoznané akce
  events_raw    text,                          -- co hosteska zaškrtla / napsala
  note          text,                          -- dny, jazyky, poznámka
  payload       jsonb NOT NULL,
  hostess_id    uuid REFERENCES hostess(id),
  status        text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('matched', 'unmatched', 'ignored')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX availability_status_idx ON availability_response (status, created_at DESC);
CREATE INDEX hostess_email_idx ON hostess (lower(email));
