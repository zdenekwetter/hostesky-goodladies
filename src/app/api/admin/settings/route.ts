import { requireAdmin } from '@/lib/auth';
import { settings, saveSetting, DEFAULTS, clearSettingsCache } from '@/lib/settings';
import { bridgePing } from '@/lib/bridge';
import { config } from '@/lib/config';
import { audit } from '@/lib/admin';
import { appDb } from '@/lib/db';
import { handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin('approver');
  const s = await settings();
  return json({
    bridgeUrl: s.bridgeUrl ?? '',
    makeWebhookUrl: s.makeWebhookUrl,
    priceText: s.priceText,
    ingestSecret: s.ingestSecret,
    siteUrl: config.siteUrl,
    defaults: DEFAULTS,
  });
});

export const POST = handle(async (req: Request) => {
  const a = await requireAdmin('approver');
  const b = (await req.json()) as { action?: string; bridgeUrl?: string; makeWebhookUrl?: string; priceText?: string };
  if (b.action === 'ping') {
    clearSettingsCache();
    try {
      return json({ ok: true, verze: await bridgePing() });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  }
  if (b.bridgeUrl !== undefined) {
    const u = b.bridgeUrl.trim();
    if (u && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) {
      return json({ error: 'Adresa má vypadat jako https://script.google.com/macros/s/…/exec' }, 400);
    }
    await saveSetting('bridge_url', u, a.id);
  }
  if (b.makeWebhookUrl !== undefined) {
    if (!/^https:\/\/hook\.[\w.]+\.make\.com\/\w+$/.test(b.makeWebhookUrl.trim())) {
      return json({ error: 'Adresa webhooku má vypadat jako https://hook.eu2.make.com/…' }, 400);
    }
    await saveSetting('make_webhook_url', b.makeWebhookUrl.trim(), a.id);
  }
  if (b.priceText !== undefined) await saveSetting('price_text', b.priceText.trim(), a.id);
  await audit(appDb(), a, 'settings', 'Změna nastavení', {}, { bridgeUrl: b.bridgeUrl !== undefined, make: b.makeWebhookUrl !== undefined, price: b.priceText });
  return json({ ok: true });
});
