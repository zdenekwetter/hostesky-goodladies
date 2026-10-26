'use client';

import { useState } from 'react';
import type { PublicHostess } from '@/lib/catalog';
import { LANG, LEVEL, ROLE } from '@/lib/labels';

// Karta profilu. Pořadí bloků drží slib z landing page: fotka → jazyky → odpracované akce → parametry.
// Bez badge, bez kódu profilu, bez věku a měr (rozhodnutí 8. 9.).

export type EventLite = { key: string; name: string };

export default function ProfileCard({
  h, events = [], actions,
}: {
  h: PublicHostess;
  events?: EventLite[];
  actions?: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  const photo = h.photos[active] ?? h.photos[0];
  const evNames = h.events.map((k) => events.find((e) => e.key === k)?.name).filter(Boolean) as string[];
  const bio = h.bio?.cs;

  return (
    <article className="card">
      <div className="card-gallery">
        {photo
          ? <img className="main" src={photo.url_1600 || photo.url_800} alt={photo.alt || `${h.first_name} ${h.last_initial}`} />
          : <div className="ph" aria-hidden>{h.first_name[0]}</div>}
        {h.photos.length > 1 && (
          <div className="thumbs">
            {h.photos.map((p, i) => (
              <button key={i} className={i === active ? 'on' : ''} onClick={() => setActive(i)} aria-label={`Fotka ${i + 1}`}>
                <img src={p.url_400} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card-body">
        <div>
          <h2>{h.first_name} {h.last_initial}</h2>
          <div className="card-meta">
            {[h.city, h.experience_label].filter(Boolean).join(' · ')}
          </div>
        </div>

        {h.languages.length > 0 && (
          <section className="block">
            <h3>Jazyky</h3>
            <div className="lang-list">
              {h.languages.map((l) => (
                <div className="lang-row" key={l.lang + (l.label ?? '')}>
                  <b>{l.lang === 'other' ? (l.label || 'Jiný') : LANG[l.lang] ?? l.lang}</b>
                  <span>{LEVEL[l.level] ?? l.level}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {(h.work_history.length > 0 || h.roles.length > 0) && (
          <section className="block">
            <h3>Zkušenosti</h3>
            {h.work_history.length > 0 && (
              <ul className="exp-list">
                {h.work_history.map((w, i) => (
                  <li key={i}><b>{w.event_name}</b>{(w.year || w.role) && <span>{[w.year, w.role].filter(Boolean).join(' · ')}</span>}</li>
                ))}
              </ul>
            )}
            {h.roles.length > 0 && (
              <div className="tags" style={{ marginTop: h.work_history.length ? 10 : 0 }}>
                {h.roles.map((r) => <span className="tag" key={r}>{ROLE[r] ?? r}</span>)}
              </div>
            )}
          </section>
        )}

        {bio && (
          <section className="block">
            <h3>O mně</h3>
            <p className="bio">{bio}</p>
          </section>
        )}

        <section className="block">
          <h3>Parametry</h3>
          <div className="params">
            <div className="params-nums">
              {h.height_cm && <div><b>{h.height_cm}</b><span>výška cm</span></div>}
              {h.dress_size && <div><b>{h.dress_size}</b><span>konfekce</span></div>}
              {h.shoe_size && <div><b>{h.shoe_size}</b><span>boty</span></div>}
            </div>
            <ul className="ticks">
              <Tick on={h.driving_licence}>Řidičský průkaz</Tick>
              <Tick on={h.health_card}>Zdravotní průkaz</Tick>
              <Tick on={h.travel.multiday}>Vícedenní akce</Tick>
              <Tick on={h.travel.abroad}>Akce v zahraničí</Tick>
            </ul>
          </div>
        </section>

        {(evNames.length > 0 || h.availability_note) && (
          <section className="block">
            <h3>Přihlášená na akce</h3>
            <div className="tags">
              {evNames.map((n) => <span className="tag ev" key={n}>{n}</span>)}
            </div>
            {h.availability_note && <p className="bio" style={{ marginTop: 8, fontSize: 14 }}>{h.availability_note}</p>}
          </section>
        )}

        {h.skills.length > 0 && (
          <section className="block">
            <h3>Dovednosti</h3>
            <div className="tags">{h.skills.map((s) => <span className="tag" key={s}>{s}</span>)}</div>
          </section>
        )}

        {actions && <div className="card-cta">{actions}</div>}
      </div>
    </article>
  );
}

function Tick({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <li className={on ? 'yes' : 'no'}><i>{on ? '✓' : '–'}</i>{children}</li>;
}
