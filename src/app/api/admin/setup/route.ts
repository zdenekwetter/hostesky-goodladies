import bcrypt from 'bcryptjs';
import { appDb } from '@/lib/db';
import { login } from '@/lib/auth';
import { handle, json } from '@/lib/http';

// Založení PRVNÍHO účtu do administrace přímo v prohlížeči – funguje jen dokud žádný účet neexistuje
// a jen pro e-mail z ADMIN_BOOTSTRAP_EMAIL (výchozí Zuzana). Další účty se zakládají v záložce Tým.

export const dynamic = 'force-dynamic';

const BOOTSTRAP = (process.env.ADMIN_BOOTSTRAP_EMAIL || 'zuzana.pribylova@goodladies.cz').toLowerCase();

export const GET = handle(async () => {
  const n = (await appDb().query('SELECT count(*)::int AS n FROM admin_user')).rows[0].n;
  return json({ needsSetup: n === 0 });
});

export const POST = handle(async (req: Request) => {
  const { email, name, password } = (await req.json()) as { email?: string; name?: string; password?: string };
  const e = String(email ?? '').trim().toLowerCase();
  if (e !== BOOTSTRAP) return json({ error: 'První účet může založit jen správkyně projektu.' }, 403);
  if (!name?.trim()) return json({ error: 'Doplňte jméno' }, 400);
  if (!password || password.length < 10) return json({ error: 'Heslo musí mít aspoň 10 znaků' }, 400);
  const hash = await bcrypt.hash(password, 12);
  // vloží se jen tehdy, když tabulka účtů je pořád prázdná (žádné závody dvou lidí naráz)
  const r = await appDb().query(
    `INSERT INTO admin_user (email, name, password_hash, role)
     SELECT $1, $2, $3, 'approver' WHERE NOT EXISTS (SELECT 1 FROM admin_user) RETURNING id`,
    [e, name.trim(), hash]);
  if (!r.rowCount) return json({ error: 'Účet už existuje – přihlaste se.' }, 409);
  await login(e, password);
  return json({ ok: true });
});
