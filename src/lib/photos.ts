import fs from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import type pg from 'pg';
import { appDb } from './db';
import { bridgePhoto, hasBridge } from './bridge';
import { driveFileId } from './mapper';

// Zpracování fotky (katalog-datovy-model.md 3.5):
//  - tři velikosti 400 / 800 / 1600 px, WebP
//  - bez EXIF (GPS z telefonu) – sharp metadata nepřenáší, pokud se o to výslovně nepožádá
//  - vodoznak vypálený na serveru: logo vpravo dole (~45 %) + jemný diagonální nápis (~9 %)
// Ukládá se do databáze (tabulka photo_file), servíruje přes /media/p/<id>-<velikost>.webp.
// Originál bez vodoznaku zůstává na Google Disku GoodLadies – aplikace ho nekopíruje.

export const SIZES = [400, 800, 1600] as const;

const LOGO_SVG = (w: number) => {
  const fs_ = Math.round(w * 0.055);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(fs_ * 6.4)}" height="${Math.round(fs_ * 1.6)}">
      <text x="50%" y="70%" text-anchor="middle" font-family="Josefin Sans, Poppins, Arial, sans-serif"
        font-weight="700" font-size="${fs_}" fill="#ffffff" fill-opacity="0.45"
        stroke="#000000" stroke-opacity="0.12" stroke-width="${Math.max(1, fs_ / 30)}">GoodLadies</text>
    </svg>`);
};

const RASTER_SVG = (w: number, h: number) => {
  const fs_ = Math.round(w / 18);
  const stepX = Math.round(fs_ * 8.5);
  const stepY = Math.round(fs_ * 4.5);
  let t = '';
  let row = 0;
  for (let y = -h; y < h * 2; y += stepY, row++) {
    for (let x = -w + (row % 2) * (stepX / 2); x < w * 2; x += stepX) {
      t += `<text x="${Math.round(x)}" y="${y}" font-size="${fs_}">GoodLadies</text>`;
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <g transform="rotate(-30 ${w / 2} ${h / 2})" font-family="Josefin Sans, Poppins, Arial, sans-serif"
         font-weight="700" fill="#ffffff" fill-opacity="0.09">${t}</g>
    </svg>`);
};

// Když existuje public/brand/watermark-logo.png (bílé logo na průhledném pozadí), použije se místo textu.
let logoFile: Buffer | null | undefined;
async function brandLogo(width: number): Promise<Buffer | null> {
  if (logoFile === undefined) {
    logoFile = await fs.readFile(path.join(process.cwd(), 'public', 'brand', 'watermark-logo.png')).catch(() => null);
  }
  if (!logoFile) return null;
  const resized = await sharp(logoFile).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = resized.data;
  for (let i = 3; i < px.length; i += 4) px[i] = Math.round(px[i] * 0.45);
  return sharp(px, { raw: resized.info }).png().toBuffer();
}

async function watermarked(src: Buffer, width: number): Promise<Buffer> {
  const { data, info } = await sharp(src, { failOn: 'none' }).rotate()
    .resize({ width, withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const logo = (await brandLogo(Math.round(info.width * 0.18))) ?? LOGO_SVG(info.width);
  const logoMeta = await sharp(logo).metadata();
  const m = Math.round(info.width * 0.03);
  const layers: OverlayOptions[] = [
    { input: RASTER_SVG(info.width, info.height), top: 0, left: 0 },
    {
      input: logo,
      top: Math.max(0, info.height - (logoMeta.height ?? 0) - m),
      left: Math.max(0, info.width - (logoMeta.width ?? 0) - m),
    },
  ];
  return sharp(data).composite(layers).webp({ quality: 82 }).toBuffer();
}

export function photoUrl(photoId: string, size: number) {
  return `/media/p/${photoId}-${size}.webp`;
}

/** Zpracuje obrázek a uloží všechny tři velikosti k fotce. */
export async function storePhoto(c: pg.PoolClient | pg.Pool, photoId: string, src: Buffer) {
  await sharp(src, { failOn: 'error' }).metadata(); // ověří, že jde o obrázek
  const variants = await Promise.all(SIZES.map((w) => watermarked(src, w)));
  for (const [i, w] of SIZES.entries()) {
    await c.query(
      `INSERT INTO photo_file (photo_id, size, bytes) VALUES ($1,$2,$3)
       ON CONFLICT (photo_id, size) DO UPDATE SET bytes = EXCLUDED.bytes`, [photoId, w, variants[i]]);
  }
  await c.query(
    `UPDATE hostess_photo SET url_400 = $2, url_800 = $3, url_1600 = $4,
       reject_reason = CASE WHEN status = 'pending' THEN NULL ELSE reject_reason END WHERE id = $1`,
    [photoId, photoUrl(photoId, 400), photoUrl(photoId, 800), photoUrl(photoId, 1600)]);
}

/** Stáhne přes Apps Script fotky z Disku, které ještě nejsou zpracované. Vrací počet a chyby. */
export async function importDrivePhotos(hostessId?: string, limit = 6): Promise<{ done: number; errors: string[]; remaining: number }> {
  if (!(await hasBridge())) return { done: 0, errors: ['Most do Googlu není nastavený – administrace → Nastavení'], remaining: 0 };
  const db = appDb();
  const q = `FROM hostess_photo p JOIN hostess h ON h.id = p.hostess_id
             WHERE p.source_url IS NOT NULL AND p.url_800 IS NULL AND NOT p.hidden AND h.status <> 'rejected_age'
             ${hostessId ? 'AND p.hostess_id = $1' : "AND coalesce(p.reject_reason, '') NOT LIKE 'Stažení selhalo%'"}`;
  const args = hostessId ? [hostessId] : [];
  const rows = (await db.query(`SELECT p.id, p.source_url ${q} ORDER BY p.created_at LIMIT ${Number(limit)}`, args)).rows;
  const errors: string[] = [];
  let done = 0;
  for (const r of rows) {
    const fid = driveFileId(r.source_url);
    try {
      if (!fid) throw new Error('odkaz nevede na soubor na Disku');
      const buf = await bridgePhoto(fid);
      await storePhoto(db, r.id, buf);
      await db.query('UPDATE hostess_photo SET drive_file_id = $2 WHERE id = $1', [r.id, fid]);
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${fid ?? r.source_url}: ${msg}`);
      // ať se neopakuje donekonečna – fotka zůstane viditelná v adminu jako „nepodařilo se stáhnout“
      await db.query(`UPDATE hostess_photo SET reject_reason = $2 WHERE id = $1 AND status = 'pending'`, [r.id, `Stažení selhalo: ${msg}`.slice(0, 300)]);
    }
  }
  const remaining = (await db.query(`SELECT count(*)::int AS n ${q}`, args)).rows[0].n;
  return { done, errors, remaining };
}
