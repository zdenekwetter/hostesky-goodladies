import { requireAdmin } from '@/lib/auth';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => json({ admin: await requireAdmin() }));
