'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PublicEvent, PublicHostess } from '@/lib/catalog';
import { LANG, LANG_SHORT, ROLE, formatDateRange, countLabel } from '@/lib/labels';
import ProfileCard from './ProfileCard';
import InquiryWizard from './InquiryWizard';

type Props = {
  hostesses: PublicHostess[];
  events: PublicEvent[];
  initialEvent?: string;
  initialOpen?: string;
  priceText: string;
  privacyUrl: string;
  contactPhone: string;
};

type Filters = {
  event: string;
  regions: string[];
  langs: string[];
  roles: string[];
  minHeight: string;
  driving: boolean;
  health: boolean;
  abroad: boolean;
  multiday: boolean;
};

const EMPTY: Filters = { event: '', regions: [], langs: [], roles: [], minHeight: '', driving: false, health: false, abroad: false, multiday: false };
const STORE = 'gl-katalog-vyber';

export default function Catalog({ hostesses, events, initialEvent, initialOpen, priceText, privacyUrl, contactPhone }: Props) {
  const [f, setF] = useState<Filters>({ ...EMPTY, event: events.some((e) => e.key === initialEvent) ? initialEvent! : '' });
  const [sort, setSort] = useState<'exp' | 'name' | 'city'>('exp');
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  const [wizard, setWizard] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);

  // výběr si prohlížeč pamatuje (jen pro pohodlí, nic důležitého)
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(STORE) || '[]'); if (Array.isArray(s)) setPicked(s.filter((b) => hostesses.some((h) => h.booking_id === b))); } catch {}
  }, [hostesses]);
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(picked)); } catch {} }, [picked]);

  // adresa drží filtr akce a otevřený profil – odkaz jde poslat klientovi
  useEffect(() => {
    const u = new URL(window.location.href);
    if (f.event) u.searchParams.set('akce', f.event); else u.searchParams.delete('akce');
    const h = open ? hostesses.find((x) => x.booking_id === open || x.slug === open) : null;
    if (h) u.searchParams.set('h', h.slug); else u.searchParams.delete('h');
    window.history.replaceState(null, '', u.toString());
  }, [f.event, open, hostesses]);

  const toggle = useCallback((bid: string) => setPicked((p) => (p.includes(bid) ? p.filter((x) => x !== bid) : [...p, bid])), []);

  // akce: klient vidí jen hostesky přihlášené na jeho akci (porada 15. 10.)
  const base = useMemo(() => (f.event ? hostesses.filter((h) => h.events.includes(f.event)) : hostesses), [hostesses, f.event]);

  const filtered = useMemo(() => {
    const list = base.filter((h) =>
      (!f.regions.length || f.regions.includes(h.region ?? '')) &&
      (!f.langs.length || f.langs.every((l) => h.languages.some((x) => x.lang === l))) &&
      (!f.roles.length || f.roles.some((r) => h.roles.includes(r))) &&
      (!f.minHeight || (h.height_cm ?? 0) >= Number(f.minHeight)) &&
      (!f.driving || h.driving_licence) && (!f.health || h.health_card) &&
      (!f.abroad || h.travel.abroad) && (!f.multiday || h.travel.multiday));
    const cmp = {
      exp: (a: PublicHostess, b: PublicHostess) => b.experience_years - a.experience_years || a.first_name.localeCompare(b.first_name, 'cs'),
      name: (a: PublicHostess, b: PublicHostess) => a.first_name.localeCompare(b.first_name, 'cs'),
      city: (a: PublicHostess, b: PublicHostess) => (a.city ?? '').localeCompare(b.city ?? '', 'cs'),
    }[sort];
    return [...list].sort(cmp);
  }, [base, f, sort]);

  const count = <T extends string>(get: (h: PublicHostess) => T[]) => {
    const m = new Map<T, number>();
    base.forEach((h) => new Set(get(h)).forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)));
    return m;
  };
  const regionCounts = useMemo(() => count((h) => (h.region ? [h.region] : [])), [base]);
  const langCounts = useMemo(() => count((h) => h.languages.map((l) => l.lang).filter((l) => l !== 'cs' && l !== 'other')), [base]);
  const roleCounts = useMemo(() => count((h) => h.roles), [base]);

  const selected = picked.map((b) => hostesses.find((h) => h.booking_id === b)).filter(Boolean) as PublicHostess[];
  const opened = open ? hostesses.find((h) => h.booking_id === open || h.slug === open) : null;
  const ev = events.find((e) => e.key === f.event);
  const langTotal = new Set(hostesses.flatMap((h) => h.languages.map((l) => l.lang))).size;
  const activeFilters = f.regions.length + f.langs.length + f.roles.length + (f.minHeight ? 1 : 0) + [f.driving, f.health, f.abroad, f.multiday].filter(Boolean).length;

  const arr = (k: 'regions' | 'langs' | 'roles', val: string) =>
    setF((x) => ({ ...x, [k]: x[k].includes(val) ? x[k].filter((y) => y !== val) : [...x[k], val] }));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); setWizard(false); setMobileFilters(false); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  return (
    <>
      <section className="hero">
        <div className="hero-in">
          <div>
            <h1>Hostesky na vaši akci</h1>
            <p>U každé vidíte fotku, jazyky a akce, které má za sebou. Vyberte ty, které se k vašemu stánku hodí, a pošlete nám poptávku.</p>
            {priceText && <div className="hero-price">{priceText}</div>}
          </div>
          <div className="hero-stats">
            <div className="stat"><b>{hostesses.length}</b><span>{countLabel(hostesses.length, 'hosteska', 'hostesky', 'hostesek')} v katalogu</span></div>
            <div className="stat"><b>{langTotal}</b><span>{countLabel(langTotal, 'jazyk', 'jazyky', 'jazyků')}</span></div>
            <div className="stat"><b>{events.length}</b><span>{countLabel(events.length, 'akce', 'akce', 'akcí')} v nabídce</span></div>
          </div>
        </div>
      </section>

      {events.length > 0 && (
        <nav className="chips" aria-label="Akce">
          <div className="chips-in">
            <button className={`chip${!f.event ? ' on' : ''}`} onClick={() => setF((x) => ({ ...x, event: '' }))}>Všechny hostesky</button>
            {events.map((e) => (
              <button key={e.key} className={`chip${f.event === e.key ? ' on' : ''}`} onClick={() => setF((x) => ({ ...x, event: x.event === e.key ? '' : e.key }))}>
                {e.name} <small>{formatDateRange(e.date_from, e.date_to)}</small>
              </button>
            ))}
          </div>
        </nav>
      )}

      <div className="layout">
        <aside className={`filters${mobileFilters ? ' open' : ''}`} aria-label="Filtry">
          {events.length > 0 && (
            <div className="f-group event">
              <h4>Termín / veletrh</h4>
              <select value={f.event} onChange={(e) => setF((x) => ({ ...x, event: e.target.value }))}>
                <option value="">Všechny akce</option>
                {events.map((e) => <option key={e.key} value={e.key}>{e.name} · {formatDateRange(e.date_from, e.date_to)}</option>)}
              </select>
              {ev && <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: '8px 0 0' }}>Jen hostesky, které se na {ev.name} přihlásily{ev.place ? ` (${ev.place})` : ''}.</p>}
            </div>
          )}
          <div className="f-group">
            <h4>Jazyk</h4>
            {[...langCounts.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => (
              <label className="check" key={l}><input type="checkbox" checked={f.langs.includes(l)} onChange={() => arr('langs', l)} />{LANG[l] ?? l}<span className="n">{n}</span></label>
            ))}
          </div>
          <div className="f-group">
            <h4>Kraj</h4>
            {[...regionCounts.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => (
              <label className="check" key={r}><input type="checkbox" checked={f.regions.includes(r)} onChange={() => arr('regions', r)} />{r}<span className="n">{n}</span></label>
            ))}
          </div>
          <div className="f-group">
            <h4>Typ práce</h4>
            {[...roleCounts.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => (
              <label className="check" key={r}><input type="checkbox" checked={f.roles.includes(r)} onChange={() => arr('roles', r)} />{ROLE[r] ?? r}<span className="n">{n}</span></label>
            ))}
          </div>
          <div className="f-group">
            <h4>Výška od</h4>
            <select value={f.minHeight} onChange={(e) => setF((x) => ({ ...x, minHeight: e.target.value }))}>
              <option value="">Nezáleží</option>
              {[160, 165, 170, 175, 180].map((n) => <option key={n} value={n}>{n} cm</option>)}
            </select>
          </div>
          <div className="f-group">
            <h4>Doklady a dosah</h4>
            <label className="check"><input type="checkbox" checked={f.driving} onChange={(e) => setF((x) => ({ ...x, driving: e.target.checked }))} />Řidičský průkaz</label>
            <label className="check"><input type="checkbox" checked={f.health} onChange={(e) => setF((x) => ({ ...x, health: e.target.checked }))} />Zdravotní průkaz</label>
            <label className="check"><input type="checkbox" checked={f.multiday} onChange={(e) => setF((x) => ({ ...x, multiday: e.target.checked }))} />Vícedenní akce</label>
            <label className="check"><input type="checkbox" checked={f.abroad} onChange={(e) => setF((x) => ({ ...x, abroad: e.target.checked }))} />Akce v zahraničí</label>
          </div>
          {(activeFilters > 0 || f.event) && (
            <div className="f-group"><button className="f-reset" onClick={() => setF(EMPTY)}>Zrušit všechny filtry</button></div>
          )}
          {mobileFilters && <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={() => setMobileFilters(false)}>Zobrazit {filtered.length}</button>}
        </aside>

        <main>
          <div className="results-head">
            <div>
              <h2>{ev ? `Hostesky na ${ev.name}` : 'Hostesky'}</h2>
              <div className="sub">{filtered.length} {countLabel(filtered.length, 'profil', 'profily', 'profilů')}</div>
            </div>
            <label>
              <span className="sr-only">Řadit</span>
              <select className="sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="exp">Podle zkušeností</option>
                <option value="name">Podle jména</option>
                <option value="city">Podle města</option>
              </select>
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="empty">
              <p><b>Těmto filtrům teď nikdo neodpovídá.</b></p>
              <p>Zkuste filtry uvolnit – nebo nám pošlete poptávku a hostesky vám doporučíme.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={() => setF({ ...EMPTY, event: f.event })}>Zrušit filtry</button>
                <button className="btn btn-primary" onClick={() => setWizard(true)}>Chci poptat hostesku</button>
              </div>
            </div>
          ) : (
            <div className="grid">
              {filtered.map((h) => {
                const on = picked.includes(h.booking_id);
                const p = h.photos[0];
                return (
                  <article key={h.booking_id} className={`tile${on ? ' sel' : ''}`}>
                    <button className="tile-photo" onClick={() => setOpen(h.booking_id)} aria-label={`Profil ${h.first_name} ${h.last_initial}`}>
                      {p ? <img src={p.url_800} alt="" loading="lazy" /> : <span className="ph">{h.first_name[0]}</span>}
                    </button>
                    <div className="tile-body">
                      <div>
                        <div className="tile-name">{h.first_name} {h.last_initial}</div>
                        <div className="tile-city">{h.city}</div>
                      </div>
                      <div className="langs">
                        {h.languages.filter((l) => l.lang !== 'cs').slice(0, 4).map((l) => (
                          <span key={l.lang + (l.label ?? '')} className={`lang ${l.level}`} title={l.lang === 'other' ? l.label ?? '' : LANG[l.lang]}>
                            {l.lang === 'other' ? (l.label ?? '+').slice(0, 3).toUpperCase() : LANG_SHORT[l.lang]}
                          </span>
                        ))}
                        {!h.languages.some((l) => l.lang !== 'cs') && <span className="lang">CZ</span>}
                      </div>
                      <div className="tile-exp">
                        {h.work_history[0] ? `${h.work_history[0].event_name}${h.work_history.length > 1 ? ` +${h.work_history.length - 1}` : ''}` : h.experience_label}
                      </div>
                      <div className="tile-foot">
                        <span className="h">{h.height_cm ? `${h.height_cm} cm` : ''}</span>
                        <button className={`btn btn-sm ${on ? 'btn-added' : 'btn-ghost'}`} onClick={() => toggle(h.booking_id)} aria-pressed={on}>
                          {on ? '✓ Vybraná' : 'Vybrat'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <button className="btn btn-primary fab" onClick={() => setMobileFilters(true)}>
        Filtry{activeFilters ? ` (${activeFilters})` : ''}
      </button>

      {(selected.length > 0) && !wizard && !open && (
        <div className="selbar" role="region" aria-label="Výběr">
          <div className="faces">
            {selected.slice(0, 5).map((h) => (
              <span key={h.booking_id} style={h.photos[0] ? { backgroundImage: `url(${h.photos[0].url_400})` } : undefined}>{!h.photos[0] && h.first_name[0]}</span>
            ))}
          </div>
          <span>{selected.length} {countLabel(selected.length, 'vybraná', 'vybrané', 'vybraných')}</span>
          <button className="btn btn-primary btn-sm" onClick={() => setWizard(true)}>Poptat výběr</button>
        </div>
      )}

      {opened && !wizard && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={`${opened.first_name} ${opened.last_initial}`}>
            <button className="modal-close" onClick={() => setOpen(null)} aria-label="Zavřít">×</button>
            <ProfileCard h={opened} events={events} actions={(
              <>
                <button className={`btn ${picked.includes(opened.booking_id) ? 'btn-added' : 'btn-primary'}`} onClick={() => toggle(opened.booking_id)}>
                  {picked.includes(opened.booking_id) ? '✓ V poptávce' : 'Přidat do poptávky'}
                </button>
                {picked.length > 0 && <button className="btn btn-ghost" onClick={() => { setOpen(null); setWizard(true); }}>Poptat výběr ({picked.length})</button>}
              </>
            )} />
          </div>
        </div>
      )}

      {wizard && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setWizard(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Poptávka" style={{ width: 'min(680px, 100%)' }}>
            <button className="modal-close" onClick={() => setWizard(false)} aria-label="Zavřít">×</button>
            <InquiryWizard
              selected={selected}
              onRemove={(b) => setPicked((p) => p.filter((x) => x !== b))}
              onClose={() => setWizard(false)}
              onSent={() => setPicked([])}
              eventName={ev?.name}
              privacyUrl={privacyUrl}
              contactPhone={contactPhone}
            />
          </div>
        </div>
      )}
    </>
  );
}
