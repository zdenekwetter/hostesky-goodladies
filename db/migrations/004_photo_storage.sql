-- Fotky s vodoznakem se ukládají přímo v databázi (bez Google Cloud Storage).
-- Originály zůstávají na Google Disku GoodLadies (hostess_photo.source_url).
-- ~100–200 kB na fotku ve třech velikostech; stovky profilů se vejdou i do bezplatného Neonu.

CREATE TABLE photo_file (
  photo_id  uuid NOT NULL REFERENCES hostess_photo(id) ON DELETE CASCADE,
  size      int  NOT NULL CHECK (size IN (400, 800, 1600)),
  mime      text NOT NULL DEFAULT 'image/webp',
  bytes     bytea NOT NULL,
  PRIMARY KEY (photo_id, size)
);

-- Odkud fotka přišla: 'drive:<id>' (z formuláře) nebo 'upload' (nahraná v adminu)
ALTER TABLE hostess_photo ADD COLUMN drive_file_id text;
CREATE INDEX hostess_photo_drive_idx ON hostess_photo (drive_file_id);
