-- Akce, na které se hostesky hlásí. Seznam podle Freela (porada 15. 10. 2026)
-- a claude/kalendar-veletrhu-cz-zahranici.md. Další akce se přidávají v administraci.
-- Proběhlé akce zůstávají kvůli historii přihlášek, veřejný katalog je nezobrazuje.

INSERT INTO event (key, name, place, country, date_from, date_to, sort) VALUES
  ('for_arch',    'FOR ARCH',     'PVA EXPO Praha', 'CZ', '2026-09-16', '2026-09-19', 10),
  ('msv',         'MSV Brno',     'BVV Brno',       'CZ', '2026-10-06', '2026-10-09', 20),
  ('chillventa',  'Chillventa',   'Norimberk',      'DE', '2026-10-13', '2026-10-15', 30),
  ('caravaning',  'Caravaning',   'BVV Brno',       'CZ', '2026-11-05', '2026-11-08', 40),
  ('electronica', 'electronica',  'Mnichov',        'DE', '2026-11-10', '2026-11-13', 50),
  ('e_salon',     'e-SALON',      'PVA EXPO Praha', 'CZ', '2026-11-12', '2026-11-15', 60),
  ('medica',      'MEDICA',       'Düsseldorf',     'DE', '2026-11-16', '2026-11-19', 70),
  ('czech_bus',   'CZECH BUS',    'PVA EXPO Praha', 'CZ', '2026-11-24', '2026-11-26', 80),
  ('sps',         'SPS',          'Norimberk',      'DE', '2026-11-24', '2026-11-26', 90)
ON CONFLICT (key) DO NOTHING;
