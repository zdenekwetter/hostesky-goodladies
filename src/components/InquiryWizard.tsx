'use client';

import { useMemo, useRef, useState } from 'react';
import type { PublicHostess } from '@/lib/catalog';
import { FORM } from '@/lib/labels';

// Tříkroková poptávka: výběr → akce → kontakt. Pole a volby jsou stejné jako formulář na LP.
// Odesílá se na /api/poptavka (ne přímo do Make) – aplikace poptávku uloží a sama ji předá.

type Props = {
  selected: PublicHostess[];
  onRemove: (bid: string) => void;
  onClose: () => void;
  onSent: () => void;
  eventName?: string;
  privacyUrl: string;
  contactPhone: string;
};

type V = Record<string, string>;

export default function InquiryWizard({ selected, onRemove, onClose, onSent, eventName, privacyUrl, contactPhone }: Props) {
  const startedAt = useRef(Date.now());
  const [step, setStep] = useState(selected.length ? 0 : 1);
  const [v, setV] = useState<V>(() => ({
    typ_akce: eventName ? 'Veletrh' : '',
    veletrh: eventName ?? '',
    termin: '', misto: '',
    pocet_hostesek: selected.length ? (selected.length <= 4 ? String(selected.length) : '5–8') : '',
    pocet_dni: '', jazyky: '',
    jmeno: '', firma: '', email: '', telefon: '', poznamka: '', website: '',
  }));
  const [consent, setConsent] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [fail, setFail] = useState('');
  const [done, setDone] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));

  const required = useMemo(() => [
    ['typ_akce', 'termin', 'misto', 'pocet_hostesek', 'pocet_dni'],
    ['jmeno', 'email'],
  ], []);

  function check(stepIdx: number) {
    const req = required[stepIdx - 1] ?? [];
    const bad = req.filter((k) => !v[k]?.trim());
    if (stepIdx === 2 && v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) bad.push('email');
    if (stepIdx === 2 && !consent) bad.push('souhlas');
    setErrs(bad);
    return bad.length === 0;
  }

  async function send() {
    if (!check(2)) return;
    setSending(true); setFail('');
    try {
      const res = await fetch('/api/poptavka', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...v, souhlas: true, lang: 'cz', started_at: startedAt.current,
          page_url: window.location.href,
          booking_ids: selected.map((h) => h.booking_id),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Odeslání se nepodařilo.');
      setDone(true);
      onSent();
    } catch (e) {
      setFail(`${e instanceof Error ? e.message : 'Odeslání se nepodařilo.'} Můžete nám také zavolat na ${contactPhone}.`);
    } finally {
      setSending(false);
    }
  }

  const f = (k: string, label: string, el: React.ReactNode, full = false, req = false) => (
    <div className={`field${full ? ' full' : ''}${errs.includes(k) ? ' err' : ''}`}>
      <label htmlFor={`q-${k}`}>{label}{req && <em> *</em>}</label>
      {el}
    </div>
  );
  const sel = (k: string, opts: string[], placeholder = 'Vyberte…') => (
    <select id={`q-${k}`} value={v[k]} onChange={set(k)}>
      <option value="">{placeholder}</option>
      {opts.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
  const inp = (k: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input id={`q-${k}`} value={v[k]} onChange={set(k)} {...props} />
  );

  if (done) {
    return (
      <div className="done">
        <h2>Děkujeme, poptávku máme</h2>
        <p style={{ color: 'var(--ink-2)', maxWidth: 460, margin: '0 auto 22px' }}>
          Projdeme termín a výběr{selected.length ? ' hostesek' : ''} a ozveme se vám s nabídkou.
          Kdybyste chtěli cokoli doplnit, volejte <a href={`tel:${contactPhone.replace(/\s/g, '')}`}>{contactPhone}</a>.
        </p>
        <button className="btn btn-primary" onClick={onClose}>Zpět do katalogu</button>
      </div>
    );
  }

  return (
    <div className="wizard">
      <h2>{['Vybrané hostesky', 'Vaše akce', 'Kontakt'][step]}</h2>
      <div className="steps" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <div className="picked">
          {selected.length === 0 && <p>Zatím nemáte nikoho vybraného – nevadí, hostesky vám doporučíme.</p>}
          {selected.map((h) => (
            <div className="picked-row" key={h.booking_id}>
              <div className="av" style={h.photos[0] ? { backgroundImage: `url(${h.photos[0].url_400})` } : undefined}>
                {!h.photos[0] && h.first_name[0]}
              </div>
              <div>
                <b>{h.first_name} {h.last_initial}</b>
                <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{h.city}</div>
              </div>
              <button className="x" onClick={() => onRemove(h.booking_id)} aria-label={`Odebrat ${h.first_name}`}>×</button>
            </div>
          ))}
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '6px 0 0' }}>
            Ke každé hostesce vám nabídneme i náhradnici pro případ nemoci.
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="form-grid">
          {f('typ_akce', 'Typ akce', sel('typ_akce', FORM.typ_akce), false, true)}
          {f('veletrh', 'Název akce / veletrhu', inp('veletrh', { placeholder: 'např. Caravaning Brno' }))}
          {f('termin', 'Termín', inp('termin', { placeholder: 'např. 5.–8. 11. 2026' }), false, true)}
          {f('misto', 'Místo', inp('misto', { placeholder: 'např. Brno, výstaviště BVV' }), false, true)}
          {f('pocet_hostesek', 'Počet hostesek', sel('pocet_hostesek', FORM.pocet_hostesek), false, true)}
          {f('pocet_dni', 'Počet dní', sel('pocet_dni', FORM.pocet_dni), false, true)}
          {f('jazyky', 'Jazyky', sel('jazyky', FORM.jazyky, 'Stačí čeština'), true)}
        </div>
      )}

      {step === 2 && (
        <>
          <div className="form-grid">
            {f('jmeno', 'Jméno a příjmení', inp('jmeno', { autoComplete: 'name' }), false, true)}
            {f('firma', 'Firma', inp('firma', { autoComplete: 'organization' }))}
            {f('email', 'E-mail', inp('email', { type: 'email', autoComplete: 'email' }), false, true)}
            {f('telefon', 'Telefon', inp('telefon', { type: 'tel', autoComplete: 'tel' }))}
            {f('poznamka', 'Poznámka', (
              <textarea id="q-poznamka" rows={3} value={v.poznamka} onChange={set('poznamka')}
                placeholder="Velikost stánku, dress code, náplň práce…" />
            ), true)}
          </div>
          <div className="hp" aria-hidden>
            <label>Nevyplňujte<input tabIndex={-1} autoComplete="off" value={v.website} onChange={set('website')} /></label>
          </div>
          <label className="consent" style={errs.includes('souhlas') ? { color: 'var(--red)' } : undefined}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Souhlasím se zpracováním osobních údajů za účelem vyřízení této poptávky.
              Podrobnosti v <a href={privacyUrl} target="_blank" rel="noopener">zásadách zpracování osobních údajů</a>.</span>
          </label>
        </>
      )}

      {errs.length > 0 && <div className="msg-err">Doplňte prosím zvýrazněná pole.</div>}
      {fail && <div className="msg-err">{fail}</div>}

      <div className="wiz-foot">
        <button className="btn btn-ghost" onClick={() => (step === 0 || (step === 1 && !selected.length) ? onClose() : (setErrs([]), setStep(step - 1)))}>
          {step === 0 || (step === 1 && !selected.length) ? 'Zavřít' : 'Zpět'}
        </button>
        {step < 2
          ? <button className="btn btn-primary" onClick={() => { if (step === 0 || check(step)) { setErrs([]); setStep(step + 1); } }}>Pokračovat</button>
          : <button className="btn btn-primary" disabled={sending} onClick={send}>{sending ? 'Odesílám…' : 'Odeslat poptávku'}</button>}
      </div>
    </div>
  );
}
