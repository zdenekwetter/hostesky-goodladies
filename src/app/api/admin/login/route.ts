import { login } from '@/lib/auth';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

const attempts = new Map<string, number[]>();

export const POST = handle(async (req: Request) => {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'x';
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
  if (recent.length >= 10) return json({ error: 'Příliš mnoho pokusů, zkuste to za 15 minut.' }, 429);
  recent.push(now);
  attempts.set(ip, recent);

  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const a = await login(String(email ?? ''), String(password ?? ''));
  if (!a) return json({ error: 'Nesprávný e-mail nebo heslo' }, 401);
  return json({ ok: true, admin: a });
});
