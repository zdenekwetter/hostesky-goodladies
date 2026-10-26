import { requireAdmin } from '@/lib/auth';
import { getForAdmin, updateProfile, type ProfilePatch } from '@/lib/admin';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const d = await getForAdmin((await ctx.params).id);
  return d ? json(d) : json({ error: 'Profil neexistuje' }, 404);
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const a = await requireAdmin();
  const id = (await ctx.params).id;
  const changed = await updateProfile(a, id, (await req.json()) as ProfilePatch);
  return json({ ok: true, changed, profile: await getForAdmin(id) });
});
