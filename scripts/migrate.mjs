// Spustí migrace z db/migrations v abecedním pořadí, každou jen jednou.
// Pak založí databázové role podle V1:
//   hostesky_public  – jen čtení veřejných views (veřejný katalog)
//   hostesky_app          – běh aplikace (poptávky, administrace)
// Hesla rolí se odvodí z tajného klíče aplikace uloženého v databázi (app_setting.app_secret),
// takže se nikde nic nevyplňuje. Aplikace si je odvodí stejně (src/lib/db.ts).
//
// Spouští se samo při každém nasazení na Vercelu (npm run build). Ručně:
//   DATABASE_URL=postgres://… npm run migrate

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL_OWNER || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  if (process.argv.includes('--if-configured')) {
    console.log('Migrace přeskočena – DATABASE_URL není nastavená.');
    process.exit(0);
  }
  console.error('Chybí DATABASE_URL (připojení k databázi Neon).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: needsSsl(url) });
await client.connect();

await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

const dir = path.join(process.cwd(), 'db', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));

for (const f of files) {
  if (done.has(f)) continue;
  process.stdout.write(`→ ${f} … `);
  await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
  console.log('ok');
}

const secret = (await client.query(`SELECT value FROM app_setting WHERE key = 'app_secret'`)).rows[0]?.value;
const derive = (role) => crypto.createHmac('sha256', secret).update(`db-role:${role}`).digest('hex');

await ensureRole('hostesky_public', process.env.PUBLIC_DB_PASSWORD || derive('hostesky_public'), [
  'GRANT USAGE ON SCHEMA public_api TO hostesky_public',
  'GRANT SELECT ON ALL TABLES IN SCHEMA public_api TO hostesky_public',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public_api GRANT SELECT ON TABLES TO hostesky_public',
]);

await ensureRole('hostesky_app', process.env.APP_DB_PASSWORD || derive('hostesky_app'), [
  'GRANT USAGE ON SCHEMA public, public_api TO hostesky_app',
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hostesky_app',
  'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hostesky_app',
  'GRANT SELECT ON ALL TABLES IN SCHEMA public_api TO hostesky_app',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hostesky_app',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hostesky_app',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public_api GRANT SELECT ON TABLES TO hostesky_app',
]);

await client.end();
console.log('Hotovo.');

async function ensureRole(name, password, grants) {
  const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name])).rowCount;
  const pw = password.replace(/'/g, "''");
  await client.query(exists
    ? `ALTER ROLE ${name} WITH LOGIN PASSWORD '${pw}'`
    : `CREATE ROLE ${name} WITH LOGIN PASSWORD '${pw}'`);
  for (const g of grants) await client.query(g);
  console.log(`role ${name}: ${exists ? 'aktualizována' : 'založena'}`);
}

function needsSsl(u) {
  return /localhost|127\.0\.0\.1/.test(u) ? false : { rejectUnauthorized: true };
}
