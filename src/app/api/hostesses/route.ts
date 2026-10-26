import { listHostesses } from '@/lib/catalog';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const hostesses = await listHostesses();
  return json({ hostesses }, 200);
});
