'use client';

import { useEffect, useState } from 'react';
import { useApi, ToastView } from '@/components/admin/useApi';

type S = { bridgeUrl: string; makeWebhookUrl: string; priceText: string; ingestSecret: string; siteUrl: string;
  defaults: { price_text: string } };

export default function Settings() {
  const { call, toast, show } = useApi();
  const [s, setS] = useState<S | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [ping, setPing] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings').then(async (r) => {
      if (r.status === 403) { setForbidden(true); return; }
      setS(await r.json());
    });
  }, []);

  async function save(patch: Partial<S>) {
    if (await call('/api/admin/settings', { json: patch })) show('Uloženo');
  }
  async function test() {
    setPing('Ověřuji…');
    const r = await call<{ verze: string }>('/api/admin/settings', { json: { action: 'ping' } });
    setPing(r ? `Spojení funguje (verze skriptu ${r.verze}).` : 'Spojení nefunguje – viz chybová hláška.');
  }

  if (forbidden) return <p className="panel panel-b">Nastavení mění schvalovatelka.</p>;
  if (!s) return <p>Načítám…</p>;

  return (
    <>
      <h1>Nastavení</h1>
      <p className="lead">Tady se mění věci, které by jinak vyžadovaly zásah do Vercelu.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820 }}>
        <section className="panel">
          <div className="panel-h"><h3>Most do Googlu (Apps Script)</h3></div>
          <div className="panel-b" style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
            <p style={{ margin: 0 }}>Přes Apps Script v tabulce odpovědí si katalog bere přihlášky, dotazník dostupnosti a fotky z Disku. Postup: <code>google-apps-script/NAVOD.md</code> v repozitáři.</p>
            <div className="field">
              <label>1. Tajný klíč – vložte ho do Apps Scriptu při spuštění funkce <b>nastavit</b></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={showKey ? s.ingestSecret : '•'.repeat(24)} style={{ fontFamily: 'monospace', flex: 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => setShowKey(!showKey)}>{showKey ? 'Skrýt' : 'Zobrazit'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(s.ingestSecret); show('Zkopírováno'); }}>Kopírovat</button>
              </div>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Adresa katalogu pro Apps Script: <b>{s.siteUrl}</b></span>
            </div>
            <div className="field">
              <label>2. Adresa webové aplikace Apps Scriptu (končí /exec)</label>
              <input value={s.bridgeUrl} placeholder="https://script.google.com/macros/s/…/exec" onChange={(e) => setS({ ...s, bridgeUrl: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={() => save({ bridgeUrl: s.bridgeUrl })}>Uložit</button>
              <button className="btn btn-ghost btn-sm" onClick={test}>Ověřit spojení</button>
              <span>{ping}</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h"><h3>Cena v katalogu</h3></div>
          <div className="panel-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="field"><label>Text v hlavičce katalogu (prázdné = cenu nezobrazovat)</label>
              <textarea rows={2} value={s.priceText} onChange={(e) => setS({ ...s, priceText: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => save({ priceText: s.priceText })}>Uložit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setS({ ...s, priceText: s.defaults.price_text })}>Vrátit výchozí</button>
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Bez časových slibů („do 24 hodin“ apod.). Změna se v katalogu projeví do minuty.</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h"><h3>Make – poptávky</h3></div>
          <div className="panel-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="field"><label>Webhook (stejný jako formulář na goodladies.cz/hostesky/)</label>
              <input value={s.makeWebhookUrl} onChange={(e) => setS({ ...s, makeWebhookUrl: e.target.value })} /></div>
            <div><button className="btn btn-primary btn-sm" onClick={() => save({ makeWebhookUrl: s.makeWebhookUrl })}>Uložit</button></div>
          </div>
        </section>
      </div>
      <ToastView toast={toast} />
    </>
  );
}
