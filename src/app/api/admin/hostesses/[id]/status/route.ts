import { requireAdmin } from '@/lib/auth';
import { changeStatus, getForAdmin } from '@/lib/admin';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const a = await requireAdmin();
  const id = (await ctx.params).id;
  const { status, note } = (await req.json()) as { status: string; note: string };
  await changeStatus(a, id, status, note);
  return json({ ok: true, profile: await getForAdmin(id) });
});
