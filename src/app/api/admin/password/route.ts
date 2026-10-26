import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/auth';
import { appDb } from '@/lib/db';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Změna vlastního hesla
export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  const { current, next } = (await req.json()) as { current?: string; next?: string };
  if (!next || next.length < 10) return json({ error: 'Nové heslo musí mít aspoň 10 znaků' }, 400);
  const r = await appDb().query('SELECT password_hash FROM admin_user WHERE id = $1', [a.id]);
  if (!r.rowCount || !(await bcrypt.compare(String(current ?? ''), r.rows[0].password_hash))) {
    return json({ error: 'Současné heslo nesedí' }, 400);
  }
  await appDb().query('UPDATE admin_user SET password_hash = $2 WHERE id = $1', [a.id, await bcrypt.hash(next, 12)]);
  return json({ ok: true });
});
