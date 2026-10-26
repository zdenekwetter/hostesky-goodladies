import { requireAdmin } from '@/lib/auth';
import { listForAdmin, createManual } from '@/lib/admin';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get('status') || undefined;
  return json(await listForAdmin(status));
});

export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  const b = (await req.json()) as { first_name?: string; last_name?: string; note?: string };
  if (!b.first_name?.trim()) return json({ error: 'Doplňte jméno' }, 400);
  const id = await createManual(a, b.first_name, b.last_name ?? '', b.note ?? '');
  return json({ ok: true, id });
});
