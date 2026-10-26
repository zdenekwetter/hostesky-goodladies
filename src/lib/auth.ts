import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { appDb } from './db';
import { settings } from './settings';

// Přihlášení pro tým GoodLadies: e-mail + heslo, žádná registrace.
// První účet se zakládá v prohlížeči (/admin/login), další v záložce Tým. Role: editor / approver.

export type Admin = { id: number; email: string; name: string; role: 'editor' | 'approver' };

const COOKIE = 'gl_admin';
const MAX_AGE = 60 * 60 * 12; // 12 h

async function key() {
  return (await settings()).sessionKey;
}

export async function login(email: string, password: string): Promise<Admin | null> {
  const r = await appDb().query(
    'SELECT id, email, name, role, password_hash FROM admin_user WHERE lower(email) = lower($1) AND active',
    [email.trim()]);
  const u = r.rows[0];
  // porovnání proběhne vždy, aby odpověď netrvala jinak u neexistujícího účtu
  const ok = await bcrypt.compare(password, u?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
  if (!u || !ok) return null;
  const admin: Admin = { id: u.id, email: u.email, name: u.name, role: u.role };
  const token = await new SignJWT({ ...admin })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(await key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
  return admin;
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

export async function currentAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await key());
    return { id: payload.id as number, email: payload.email as string, name: payload.name as string,
      role: payload.role as Admin['role'] };
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

export async function requireAdmin(role?: 'approver'): Promise<Admin> {
  const a = await currentAdmin();
  if (!a) throw new AuthError(401, 'Nepřihlášeno');
  if (role === 'approver' && a.role !== 'approver') throw new AuthError(403, 'Tuhle akci smí jen schvalovatel');
  return a;
}
