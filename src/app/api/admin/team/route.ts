import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/auth';
import { appDb } from '@/lib/db';
import { audit } from '@/lib/admin';
import { config } from '@/lib/config';
import { handle, json } from '@/lib/http';

// Správa účtů administrace – jen schvalovatel.
// Nový účet dostane jednorázové heslo, které se ukáže JEDNOU; uživatelka si ho po přihlášení změní.

export const dynamic = 'force-dynamic';

function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(14), (b) => abc[b % abc.length]).join('');
}

export const GET = handle(async () => {
  await requireAdmin('approver');
  const r = await appDb().query(
    `SELECT id, email, name, role, active, created_at,
            (SELECT max(at) FROM audit_log a WHERE a.user_id = u.id) AS last_action
     FROM admin_user u ORDER BY active DESC, name`);
  return json({ users: r.rows });
});

export const POST = handle(async (req: Request) => {
  const a = await requireAdmin('approver');
  const b = (await req.json()) as { action: string; id?: number; email?: string; name?: string; role?: string };
  const db = appDb();
  const role = b.role === 'approver' ? 'approver' : 'editor';

  if (b.action === 'create') {
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!email.endsWith(`@${config.adminEmailDomain}`)) {
      return json({ error: `Účty jen pro e-maily @${config.adminEmailDomain}` }, 400);
    }
    if (!b.name?.trim()) return json({ error: 'Doplňte jméno' }, 400);
    const pw = tempPassword();
    const r = await db.query(
      `INSERT INTO admin_user (email, name, password_hash, role) VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO NOTHING RETURNING id`, [email, b.name.trim(), await bcrypt.hash(pw, 12), role]);
    if (!r.rowCount) return json({ error: 'Účet s tímto e-mailem už existuje' }, 409);
    await audit(db, a, 'user_create', `Založen účet ${email} (${role})`);
    return json({ ok: true, password: pw });
  }

  if (!b.id) return json({ error: 'Chybí účet' }, 400);
  if (b.id === a.id && b.action !== 'reset') return json({ error: 'Vlastní účet tady měnit nejde' }, 400);

  if (b.action === 'reset') {
    const pw = tempPassword();
    await db.query('UPDATE admin_user SET password_hash = $2 WHERE id = $1', [b.id, await bcrypt.hash(pw, 12)]);
    await audit(db, a, 'user_reset', `Nové heslo pro účet #${b.id}`);
    return json({ ok: true, password: pw });
  }
  if (b.action === 'role') {
    await db.query('UPDATE admin_user SET role = $2 WHERE id = $1', [b.id, role]);
    await audit(db, a, 'user_role', `Účet #${b.id} → ${role}`);
    return json({ ok: true });
  }
  if (b.action === 'deactivate' || b.action === 'activate') {
    await db.query('UPDATE admin_user SET active = $2 WHERE id = $1', [b.id, b.action === 'activate']);
    await audit(db, a, `user_${b.action}`, `Účet #${b.id}`);
    return json({ ok: true });
  }
  return json({ error: 'Neznámá akce' }, 400);
});
