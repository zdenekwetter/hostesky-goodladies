import { logout } from '@/lib/auth';
import { handle, json } from '@/lib/http';

export const POST = handle(async () => {
  await logout();
  return json({ ok: true });
});
