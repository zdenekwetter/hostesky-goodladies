import crypto from 'node:crypto';
import pg from 'pg';

// Připojení k databázi. Na Vercelu stačí JEDNA proměnná DATABASE_URL (vložená integrací Neonu
// nebo ručně). Z ní a z tajného klíče uloženého v databázi si aplikace odvodí dvě omezené role (V1):
//  - publicDb(): role hostesky_public – vidí jen schéma public_api (veřejné pohledy bez osobních údajů)
//  - appDb():    role hostesky_app    – poptávky a administrace
// Veřejné stránky používají VÝHRADNĚ publicDb – chyba v kódu pak nemůže vynést interní data.
// Role a jejich hesla zakládá migrace (scripts/migrate.mjs), která běží při každém nasazení.

type Queryable = Pick<pg.Pool, 'query' | 'connect'>;

type G = typeof globalThis & { __glDb?: { pools?: Promise<{ app: pg.Pool; pub: pg.Pool }> } };
const g = globalThis as G;
g.__glDb ??= {};

function ownerUrl(): string {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error('Chybí DATABASE_URL – připojení k databázi Neon (viz README-nasazeni.md)');
  return u;
}

function makePool(url: string): pg.Pool {
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: true }, max: 5, idleTimeoutMillis: 10_000 });
}

function withUser(url: string, user: string, password: string): string {
  const u = new URL(url);
  u.username = user;
  u.password = password;
  return u.toString();
}

async function init() {
  // ruční nastavení má přednost (kdyby někdo chtěl vlastní role)
  if (process.env.DATABASE_URL_APP && process.env.DATABASE_URL_PUBLIC) {
    return { app: makePool(process.env.DATABASE_URL_APP), pub: makePool(process.env.DATABASE_URL_PUBLIC) };
  }
  const base = ownerUrl();
  const owner = new pg.Client({ connectionString: base, ssl: /localhost|127\.0\.0\.1/.test(base) ? false : { rejectUnauthorized: true } });
  await owner.connect();
  try {
    const r = await owner.query(`SELECT value FROM app_setting WHERE key = 'app_secret'`);
    const secret = r.rows[0]?.value as string | undefined;
    if (!secret) throw new Error('Databáze není připravená – neproběhla migrace (npm run migrate)');
    const pw = (role: string) => crypto.createHmac('sha256', secret).update(`db-role:${role}`).digest('hex');
    return {
      app: makePool(withUser(base, 'hostesky_app', pw('hostesky_app'))),
      pub: makePool(withUser(base, 'hostesky_public', pw('hostesky_public'))),
    };
  } finally {
    await owner.end();
  }
}

function pools() {
  g.__glDb!.pools ??= init().catch((e) => { g.__glDb!.pools = undefined; throw e; });
  return g.__glDb!.pools;
}

function lazy(which: 'app' | 'pub'): pg.Pool {
  const q: Queryable = {
    query: (async (...args: unknown[]) => {
      const p = (await pools())[which];
      return (p.query as (...a: unknown[]) => unknown)(...args);
    }) as pg.Pool['query'],
    connect: (async () => (await pools())[which].connect()) as pg.Pool['connect'],
  };
  return q as pg.Pool;
}

const appLazy = lazy('app');
const pubLazy = lazy('pub');

export function appDb(): pg.Pool { return appLazy; }
export function publicDb(): pg.Pool { return pubLazy; }

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await appDb().connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
