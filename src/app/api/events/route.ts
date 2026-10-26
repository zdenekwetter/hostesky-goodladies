import { listEvents } from '@/lib/catalog';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => json({ events: await listEvents() }));
