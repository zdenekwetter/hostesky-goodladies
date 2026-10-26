'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useApi, ToastView } from '@/components/admin/useApi';
import ProfileCard from '@/components/ProfileCard';
import type { PublicHostess } from '@/lib/catalog';
import { LANG, LEVEL_OPTIONS, ROLE, STATUS } from '@/lib/labels';

type Photo = { id: string; status: string; reject_reason: string | null; kind: string; url_400: string | null; url_800: string | null;
  url_1600: string | null; source_url: string | null; is_primary: boolean; hidden: boolean };
type Detail = {
  hostess: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  languages: { lang: string; label: string; level: string }[];
  roles: string[];
  work_history: { event_name: string; year: number | null; role: string | null }[];
  photos: Photo[];
  consents: { kind: string; granted: boolean; granted_at: string | null; source: string; evidence: string | null; revoked_at: string | null }[];
  documents: { id: string; kind: string; source_url: string | null }[];
  events: { id: number; key: string; name: string; signed: boolean }[];
  history: { at: string; action: string; note: string; user_name: string | null }[];
  inquiries: { id: string; created_at: string; firma: string | null; jmeno: string | null; status: string }[];
};

const NEXT: Record<string, [string, string][]> = {
  draft: [['review', 'Poslat ke schválení']],
  review: [['published', 'Publikovat'], ['draft', 'Vrátit k doplnění']],
  published: [['paused', 'Pozastavit'], ['review', 'Stáhnout ke kontrole']],
  paused: [['published', 'Znovu publikovat']],
  archived: [['draft', 'Obnovit jako koncept']],
  new: [['draft', 'Převzít ke zpracování']],
};
const CONSENT_LABEL: Record<string, string> = { age_18: '18+', publication: 'Zveřejnění profilu', contact_sharing: 'Předání kontaktu klientovi' };

export default function ProfileAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { call, toast, show } = useApi();
  const [d, setD] = useState<Detail | null>(null);
  const [form, setForm] = useState<Record<string, any>>({}); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [dirty, setDirty] = useState(false);
  const [dialog, setDialog] = useState<null | { title: string; label: string; run: (note: string, extra?: string) => Promise<void>; extra?: string }>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback((data: Detail) => {
    setD(data);
    const h = data.hostess;
    setForm({
      ...h,
      bio_cs: h.bio?.cs ?? '',
      skills_text: (h.skills ?? []).join(', '),
      availability_until: h.availability_until ? String(h.availability_until).slice(0, 10) : '',
      languages: data.languages,
      roles: data.roles,
      work_history: data.work_history,
      event_ids: data.events.filter((e) => e.signed).map((e) => e.id),
    });
    setDirty(false);
  }, []);

  useEffect(() => { call<Detail>(`/api/admin/hostesses/${id}`).then((x) => x && load(x)); }, [id, call, load]);

  const set = (k: string, v: unknown) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const inp = (k: string, type = 'text') => (
    <input type={type} value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
  );

  async function save() {
    setBusy(true);
    const body = {
      first_name: form.first_name, last_name: form.last_name, region: form.region, city: form.city,
      height_cm: form.height_cm, dress_size: form.dress_size, shoe_size: form.shoe_size,
      experience_years: form.experience_years, experience_label: form.experience_label,
      skills: String(form.skills_text ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
      driving_licence: !!form.driving_licence, health_card: !!form.health_card,
      travel_multiday: !!form.travel_multiday, travel_abroad: !!form.travel_abroad, travel_overnight: !!form.travel_overnight,
      availability_note: form.availability_note, availability_until: form.availability_until || null,
      email: form.email, phone: form.phone, social_url: form.social_url, personality: form.personality,
      rate_expectation: form.rate_expectation, internal_note: form.internal_note,
      bio: { cs: form.bio_cs || null },
      languages: form.languages, roles: form.roles, work_history: form.work_history, event_ids: form.event_ids,
    };
    const r = await call<{ profile: Detail; changed: string[] }>(`/api/admin/hostesses/${id}`, { method: 'PATCH', json: body });
    setBusy(false);
    if (r) { load(r.profile); show(r.changed.length ? 'Uloženo' : 'Beze změn'); }
  }

  async function act(url: string, json: unknown, okText: string) {
    setBusy(true);
    const r = await call<{ profile: Detail }>(url, { json });
    setBusy(false);
    if (r?.profile) { load(r.profile); show(okText); }
    return !!r;
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('file', f));
    setBusy(true);
    show('Zpracovávám fotky (vodoznak, velikosti)…');
    const r = await call<{ profile: Detail; errors: string[] }>(`/api/admin/hostesses/${id}/photos`, { method: 'POST', body: fd });
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
    if (r) { load(r.profile); show(r.errors.length ? r.errors.join('; ') : 'Fotky nahrány – čekají na schválení', r.errors.length > 0); }
  }

  // Živý náhled karty – přesně to, co uvidí klient (jen schválené fotky)
  const preview: PublicHostess | null = useMemo(() => {
    if (!d) return null;
    const ini = String(form.last_name ?? '').trim();
    return {
      booking_id: d.hostess.booking_id, slug: d.hostess.slug,
      first_name: form.first_name || '—', last_initial: ini ? `${ini[0].toUpperCase()}.` : '',
      region: form.region, city: form.city, height_cm: form.height_cm ? Number(form.height_cm) : null,
      dress_size: form.dress_size, shoe_size: form.shoe_size,
      bio: { cs: form.bio_cs || null, de: null, en: null, zh: null },
      experience_years: Number(form.experience_years ?? 0), experience_label: form.experience_label,
      skills: String(form.skills_text ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
      driving_licence: !!form.driving_licence, health_card: !!form.health_card,
      travel: { multiday: !!form.travel_multiday, abroad: !!form.travel_abroad, overnight: !!form.travel_overnight },
      availability_note: form.availability_note,
      languages: (form.languages ?? []).map((l: any) => ({ ...l, label: l.label || null })), // eslint-disable-line @typescript-eslint/no-explicit-any
      roles: form.roles ?? [], work_history: form.work_history ?? [],
      photos: d.photos.filter((p) => p.status === 'approved' && !p.hidden && p.url_800)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((p) => ({ url_400: p.url_400!, url_800: p.url_800!, url_1600: p.url_1600!, alt: null, kind: p.kind })),
      events: d.events.filter((e) => (form.event_ids ?? []).includes(e.id)).map((e) => e.key),
    };
  }, [d, form]);

  if (!d || !preview) return <p>Načítám…</p>;
  const h = d.hostess;
  const raw = h.raw_payload && Object.keys(h.raw_payload).length ? h.raw_payload : null;

  return (
    <>
      <p style={{ margin: '0 0 10px' }}><Link href="/admin">← Profily</Link></p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{h.first_name} {h.last_name}</h1>
        <span className={`pill ${h.status}`}>{STATUS[h.status]}</span>
        <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>{h.booking_id}</span>
        {h.status === 'published' && <a href={`/hosteska/${h.slug}`} target="_blank" rel="noopener" style={{ fontSize: 13 }}>Veřejný odkaz ↗</a>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {dirty && <span style={{ fontSize: 13, color: 'var(--warn)', alignSelf: 'center' }}>Neuložené změny</span>}
          <button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>Uložit</button>
        </div>
      </div>

      <div className="detail">
        <div className="ed">
          {/* FOTKY */}
          <section className="panel">
            <div className="panel-h">
              <h3>Fotky</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {d.photos.some((p) => p.source_url && !p.url_800 && !p.hidden) && (
                  <button className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => act(`/api/admin/hostesses/${id}/photos/import`, {}, 'Fotky staženy z Disku')}>Stáhnout z formuláře</button>
                )}
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>Nahrát fotku</button>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
              </div>
            </div>
            <div className="panel-b">
              {d.photos.filter((p) => !p.hidden).length === 0 && <p style={{ margin: 0, color: 'var(--ink-3)' }}>Zatím žádná fotka.</p>}
              <div className="photos">
                {d.photos.filter((p) => !p.hidden).map((p) => (
                  <div key={p.id} className={`ph-card ${p.status}`}>
                    {p.url_400 ? <img src={p.url_400} alt="" /> : <div className="noimg">{p.reject_reason ?? 'Na Disku – zatím nestaženo'}</div>}
                    <div className="meta">
                      <div>
                        {p.status === 'approved' ? <span className="ok-badge">schválená</span>
                          : p.status === 'rejected' ? <span className="pill">odmítnutá: {p.reject_reason}</span>
                            : p.reject_reason ? <span className="pill" title={p.reject_reason}>nestaženo – zkuste znovu</span> : <span className="pill review">čeká</span>}
                        {p.is_primary && <span className="pill" style={{ marginLeft: 4 }}>hlavní</span>}
                      </div>
                      <div className="acts">
                        {p.url_800 && p.status !== 'approved' && <button onClick={() => act(`/api/admin/hostesses/${id}/photos/${p.id}`, { action: 'approve' }, 'Fotka schválena')}>Schválit</button>}
                        {p.status !== 'rejected' && <button onClick={() => setDialog({ title: 'Odmítnout fotku', label: 'Důvod (např. selfie, rozmazaná, nevhodné pozadí)',
                          run: async (note) => { await act(`/api/admin/hostesses/${id}/photos/${p.id}`, { action: 'reject', reason: note }, 'Fotka odmítnuta'); } })}>Odmítnout</button>}
                        {!p.is_primary && p.status === 'approved' && <button onClick={() => act(`/api/admin/hostesses/${id}/photos/${p.id}`, { action: 'primary' }, 'Hlavní fotka změněna')}>Hlavní</button>}
                        <button title="Dřív" onClick={() => act(`/api/admin/hostesses/${id}/photos/${p.id}`, { action: 'move', dir: -1 }, 'Pořadí změněno')}>←</button>
                        <button title="Později" onClick={() => act(`/api/admin/hostesses/${id}/photos/${p.id}`, { action: 'move', dir: 1 }, 'Pořadí změněno')}>→</button>
                        <button onClick={() => setDialog({ title: 'Skrýt fotku', label: 'Proč (zůstane v archivu, z webu zmizí)',
                          run: async (note) => { await act(`/api/admin/hostesses/${id}/photos/${p.id}`, { action: 'hide', reason: note }, 'Fotka skryta'); } })}>Skrýt</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '10px 0 0' }}>Náhledy jsou s vodoznakem – přesně tak půjdou ven. Originály bez vodoznaku zůstávají na Disku GoodLadies.</p>
            </div>
          </section>

          {/* ZÁKLAD */}
          <section className="panel">
            <div className="panel-h"><h3>Základ</h3></div>
            <div className="panel-b form-grid">
              <div className="field"><label>Jméno</label>{inp('first_name')}</div>
              <div className="field"><label>Příjmení <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(v katalogu jen iniciála)</span></label>{inp('last_name')}</div>
              <div className="field"><label>Kraj</label>{inp('region')}</div>
              <div className="field"><label>Město</label>{inp('city')}</div>
            </div>
          </section>

          {/* JAZYKY */}
          <section className="panel">
            <div className="panel-h"><h3>Jazyky</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => set('languages', [...form.languages, { lang: 'en', label: '', level: 'B1' }])}>+ Jazyk</button></div>
            <div className="panel-b row-list">
              {form.languages.map((l: any, i: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <div className="r" key={i} style={l.lang === 'other' ? { gridTemplateColumns: '1fr 1fr 140px 32px' } : undefined}>
                  <select value={l.lang} onChange={(e) => set('languages', form.languages.map((x: any, j: number) => j === i ? { ...x, lang: e.target.value } : x))}>{/* eslint-disable-line @typescript-eslint/no-explicit-any */}
                    {Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {l.lang === 'other' && <input placeholder="Který jazyk" value={l.label} onChange={(e) => set('languages', form.languages.map((x: any, j: number) => j === i ? { ...x, label: e.target.value } : x))} />}{/* eslint-disable-line @typescript-eslint/no-explicit-any */}
                  <select value={l.level} onChange={(e) => set('languages', form.languages.map((x: any, j: number) => j === i ? { ...x, level: e.target.value } : x))}>{/* eslint-disable-line @typescript-eslint/no-explicit-any */}
                    {LEVEL_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button className="icon-btn" onClick={() => set('languages', form.languages.filter((_: unknown, j: number) => j !== i))} aria-label="Odebrat">×</button>
                </div>
              ))}
            </div>
          </section>

          {/* ZKUŠENOSTI */}
          <section className="panel">
            <div className="panel-h"><h3>Zkušenosti</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => set('work_history', [...form.work_history, { event_name: '', year: new Date().getFullYear(), role: '' }])}>+ Akce</button></div>
            <div className="panel-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-grid">
                <div className="field"><label>Praxe (roky)</label>{inp('experience_years', 'number')}</div>
                <div className="field"><label>Popis praxe na kartě</label>{inp('experience_label')}</div>
              </div>
              {h.events_raw && <div style={{ fontSize: 13, background: '#faf6f6', padding: 10, borderRadius: 8 }}><b>Z přihlášky:</b> {h.events_raw}</div>}
              <div className="row-list">
                {form.work_history.map((w: any, i: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                  <div className="r r3" key={i}>
                    <input placeholder="Akce (např. MSV Brno)" value={w.event_name} onChange={(e) => set('work_history', form.work_history.map((x: any, j: number) => j === i ? { ...x, event_name: e.target.value } : x))} />{/* eslint-disable-line @typescript-eslint/no-explicit-any */}
                    <input placeholder="Rok" type="number" value={w.year ?? ''} onChange={(e) => set('work_history', form.work_history.map((x: any, j: number) => j === i ? { ...x, year: e.target.value } : x))} />{/* eslint-disable-line @typescript-eslint/no-explicit-any */}
                    <input placeholder="Role (např. recepce stánku)" value={w.role ?? ''} onChange={(e) => set('work_history', form.work_history.map((x: any, j: number) => j === i ? { ...x, role: e.target.value } : x))} />{/* eslint-disable-line @typescript-eslint/no-explicit-any */}
                    <button className="icon-btn" onClick={() => set('work_history', form.work_history.filter((_: unknown, j: number) => j !== i))} aria-label="Odebrat">×</button>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Typ práce</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                  {Object.entries(ROLE).map(([k, v]) => (
                    <label className="check" key={k}><input type="checkbox" checked={form.roles.includes(k)}
                      onChange={(e) => set('roles', e.target.checked ? [...form.roles, k] : form.roles.filter((x: string) => x !== k))} />{v}</label>
                  ))}
                </div>
                {h.roles_other?.length > 0 && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Uvedla i: {h.roles_other.join(', ')}</div>}
              </div>
            </div>
          </section>

          {/* PŘEDSTAVENÍ */}
          <section className="panel">
            <div className="panel-h"><h3>Představení</h3><span style={{ fontSize: 12, color: (form.bio_cs?.length ?? 0) > 400 ? 'var(--warn)' : 'var(--ink-3)' }}>{form.bio_cs?.length ?? 0} znaků · doporučeno 2–3 věty</span></div>
            <div className="panel-b field"><textarea rows={4} value={form.bio_cs} onChange={(e) => set('bio_cs', e.target.value)} /></div>
          </section>

          {/* PARAMETRY */}
          <section className="panel">
            <div className="panel-h"><h3>Parametry a dosah</h3></div>
            <div className="panel-b">
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="field"><label>Výška (cm)</label>{inp('height_cm', 'number')}</div>
                <div className="field"><label>Konfekce</label>{inp('dress_size')}</div>
                <div className="field"><label>Boty</label>{inp('shoe_size')}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', marginTop: 10 }}>
                {([['driving_licence', 'Řidičský průkaz'], ['health_card', 'Zdravotní průkaz'], ['travel_multiday', 'Vícedenní akce'],
                  ['travel_abroad', 'Zahraničí'], ['travel_overnight', 'Ubytování mimo domov']] as const).map(([k, l]) => (
                  <label className="check" key={k}><input type="checkbox" checked={!!form[k]} onChange={(e) => set(k, e.target.checked)} />{l}</label>
                ))}
              </div>
              <div className="field" style={{ marginTop: 12 }}><label>Dovednosti (oddělené čárkou)</label>{inp('skills_text')}</div>
              {h.skills_raw && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Z přihlášky: {h.skills_raw}</div>}
            </div>
          </section>

          {/* AKCE */}
          <section className="panel">
            <div className="panel-h"><h3>Přihlášená na akce</h3></div>
            <div className="panel-b">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
                {d.events.map((e) => (
                  <label className="check" key={e.id}><input type="checkbox" checked={form.event_ids.includes(e.id)}
                    onChange={(x) => set('event_ids', x.target.checked ? [...form.event_ids, e.id] : form.event_ids.filter((y: number) => y !== e.id))} />{e.name}</label>
                ))}
              </div>
              <div className="form-grid" style={{ marginTop: 12 }}>
                <div className="field"><label>Poznámka k dostupnosti (veřejná)</label>{inp('availability_note')}</div>
                <div className="field"><label>Platí do</label>{inp('availability_until', 'date')}</div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '8px 0 0' }}>Když klient filtruje podle akce, vidí jen hostesky, které jsou na ni přihlášené.</p>
            </div>
          </section>

          {/* INTERNÍ */}
          <section className="panel internal">
            <div className="panel-h"><h3>Interní</h3></div>
            <div className="panel-b form-grid">
              <div className="field"><label>Telefon</label>{inp('phone')}</div>
              <div className="field"><label>E-mail</label>{inp('email')}</div>
              <div className="field"><label>Instagram / portfolio</label>{inp('social_url')}
                {form.social_url && /^https?:/.test(form.social_url) && <a href={form.social_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>otevřít ↗</a>}</div>
              <div className="field"><label>Povaha (extrovert 1–5 introvert)</label>{inp('personality')}</div>
              <div className="field"><label>Představa o odměně</label>{inp('rate_expectation')}</div>
              <div className="field"><label>Životopis</label>
                {d.documents.filter((x) => x.kind === 'cv').map((x) => x.source_url && <a key={x.id} href={x.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14 }}>CV na Disku ↗</a>)}
                {!d.documents.some((x) => x.kind === 'cv') && <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>nedodala</span>}
              </div>
              <div className="field full"><label>Poznámka týmu (spolehlivost, hodnocení z akcí)</label>
                <textarea rows={3} value={form.internal_note ?? ''} onChange={(e) => set('internal_note', e.target.value)} /></div>
            </div>
          </section>

          {raw && (
            <section className="panel">
              <div className="panel-h"><h3>Nezařazené odpovědi</h3></div>
              <div className="panel-b" style={{ fontSize: 13 }}>
                <p style={{ marginTop: 0, color: 'var(--warn)' }}>Přihláška obsahuje pole, která aplikace nezná – formulář se možná změnil. Dejte vědět, ať se doplní mapování.</p>
                {Object.entries(raw).map(([k, v]) => <div key={k}><b>{k}:</b> {String(v)}</div>)}
              </div>
            </section>
          )}
        </div>

        <div className="sticky">
          <section className="panel">
            <div className="panel-h"><h3>Publikace</h3></div>
            <div className="panel-b publish-box">
              {h.missing?.length > 0 && <div className="why">Nelze publikovat, chybí: {h.missing.join(', ')}</div>}
              {dirty && <div className="why" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>Nejdřív uložte změny.</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(NEXT[h.status] ?? []).map(([to, label]) => (
                  <button key={to} className={`btn btn-sm ${to === 'published' ? 'btn-primary' : 'btn-ghost'}`}
                    disabled={busy || dirty || (to === 'published' && h.missing?.length > 0)}
                    onClick={() => setDialog({ title: label, label: 'Poznámka do historie (povinná)',
                      run: async (note) => { await act(`/api/admin/hostesses/${id}/status`, { status: to, note }, `Stav: ${STATUS[to]}`); } })}>
                    {label}
                  </button>
                ))}
                {h.status !== 'archived' && (
                  <button className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => setDialog({ title: 'Archivovat profil', label: 'Proč (ukončená spolupráce apod.)',
                      run: async (note) => { await act(`/api/admin/hostesses/${id}/status`, { status: 'archived', note }, 'Archivováno'); } })}>Archivovat</button>
                )}
              </div>
            </div>
          </section>

          <section className="panel consents">
            <div className="panel-h"><h3>Souhlasy</h3></div>
            <div className="panel-b">
              <ul>
                {['age_18', 'publication', 'contact_sharing'].map((k) => {
                  const c = d.consents.find((x) => x.kind === k);
                  const ok = c?.granted && !c.revoked_at;
                  return (
                    <li key={k}>
                      <span>{CONSENT_LABEL[k]}</span>
                      <span style={{ textAlign: 'right' }}>
                        <span className={ok ? 'y' : 'n'}>{ok ? 'ano' : c?.revoked_at ? 'odvolán' : 'ne'}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>
                          {c?.revoked_at ? new Date(c.revoked_at).toLocaleDateString('cs-CZ') : c?.granted_at ? `${new Date(c.granted_at).toLocaleDateString('cs-CZ')} · ${c.source}` : ''}
                        </span>
                        {ok && <button className="f-reset" style={{ fontSize: 11 }} onClick={() => setDialog({ title: `Odvolat souhlas: ${CONSENT_LABEL[k]}`,
                          label: 'Kdy a jak souhlas odvolala (e-mail, telefon…)',
                          run: async (note) => { await act(`/api/admin/hostesses/${id}/consent`, { action: 'revoke', kind: k, note }, 'Souhlas odvolán'); } })}>odvolat</button>}
                        {!ok && <button className="f-reset" style={{ fontSize: 11 }} onClick={() => setDialog({ title: `Doložený souhlas: ${CONSENT_LABEL[k]}`,
                          label: 'Poznámka', extra: 'Odkud souhlas je (podepsaný dokument, e-mail ze dne…) a v jakém znění',
                          run: async (note, ev) => { await act(`/api/admin/hostesses/${id}/consent`, { action: 'record', kind: k, note, evidence: ev }, 'Souhlas zaevidován'); } })}>zaevidovat doložený</button>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '8px 0 0' }}>Souhlas se za uchazečku nezaškrtává – jen se eviduje doložený. Odvolání profil okamžitě stáhne z katalogu.</p>
            </div>
          </section>

          <section>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 6px' }}>Náhled karty pro klienta</div>
            <div className="preview"><ProfileCard h={preview} events={d.events} /></div>
          </section>

          {d.inquiries.length > 0 && (
            <section className="panel">
              <div className="panel-h"><h3>V poptávkách ({d.inquiries.length})</h3></div>
              <div className="panel-b"><ul className="log">
                {d.inquiries.map((q) => <li key={q.id}>{q.firma || q.jmeno}<span>{new Date(q.created_at).toLocaleDateString('cs-CZ')}</span></li>)}
              </ul></div>
            </section>
          )}

          <section className="panel">
            <div className="panel-h"><h3>Historie změn</h3></div>
            <div className="panel-b"><ul className="log">
              {d.history.map((x, i) => <li key={i}><b>{x.note}</b><span>{new Date(x.at).toLocaleString('cs-CZ')} · {x.user_name ?? 'systém'} · {x.action}</span></li>)}
            </ul></div>
          </section>
        </div>
      </div>

      {dialog && <NoteDialog {...dialog} onClose={() => setDialog(null)} />}
      <ToastView toast={toast} />
    </>
  );
}

function NoteDialog({ title, label, extra, run, onClose }: { title: string; label: string; extra?: string;
  run: (note: string, extra?: string) => Promise<void>; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [ev, setEv] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await run(note, ev); setBusy(false); onClose(); }}>
        <h3>{title}</h3>
        {extra && <><label style={{ fontSize: 13, fontWeight: 600 }}>{extra}</label><textarea value={ev} onChange={(e) => setEv(e.target.value)} required /></>}
        <label style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} required autoFocus />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn btn-primary" disabled={busy || !note.trim()}>Potvrdit</button>
        </div>
      </form>
    </div>
  );
}
