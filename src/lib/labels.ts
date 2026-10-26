// Popisky pro rozhraní (CZ). Jazykové verze katalogu = druhá etapa; texty jsou proto na jednom místě.

export const LANG: Record<string, string> = {
  cs: 'Čeština', en: 'Angličtina', de: 'Němčina', es: 'Španělština',
  fr: 'Francouzština', it: 'Italština', ru: 'Ruština', other: 'Jiný',
};
export const LANG_SHORT: Record<string, string> = {
  cs: 'CZ', en: 'EN', de: 'DE', es: 'ES', fr: 'FR', it: 'IT', ru: 'RU', other: '+',
};
export const LEVEL: Record<string, string> = {
  native: 'rodilá', C1: 'pokročilá', B1: 'středně pokročilá', A1: 'základy',
};
export const LEVEL_OPTIONS = [
  ['native', 'Rodilý mluvčí'], ['C1', 'Pokročilá (C1–C2)'], ['B1', 'Středně pokročilá (B1–B2)'], ['A1', 'Základní (A1–A2)'],
] as const;

export const ROLE: Record<string, string> = {
  hosteska: 'Hosteska', promoterka: 'Promotérka', veletrh: 'Veletržní stánek',
  tlumoceni: 'Tlumočení', modeling: 'Modeling', ochutnavky: 'Ochutnávky',
  moderovani: 'Moderování', tanec: 'Tanec',
};

export const STATUS: Record<string, string> = {
  new: 'Nová', draft: 'Ke zpracování', review: 'Ke schválení', published: 'V katalogu',
  paused: 'Pozastavená', archived: 'Archiv', rejected_age: 'Odmítnutá (18+)',
};

export const INQUIRY_STATUS: Record<string, string> = {
  nova: 'Nová', v_reseni: 'V řešení', vyrizena: 'Vyřízená',
};

// Volby jako ve formuláři #glf na goodladies.cz/hostesky/ (landing-pages-prehled.md kap. 8)
export const FORM = {
  typ_akce: ['Veletrh', 'Konference', 'Firemní akce', 'Roadshow', 'Jiné'],
  pocet_hostesek: ['1', '2', '3', '4', '5–8', '9 a více', 'Nevím, poraďte mi'],
  pocet_dni: ['1', '2', '3', '4', '5 a více'],
  jazyky: ['Stačí čeština', 'Angličtina', 'Němčina', 'Angličtina i němčina', 'Jiný (upřesním v poznámce)'],
};

export function formatDateRange(from: string | null, to: string | null): string {
  if (!from) return '';
  const f = new Date(from + 'T12:00:00');
  const t = to ? new Date(to + 'T12:00:00') : f;
  const d = (x: Date) => x.getDate();
  const m = (x: Date) => x.getMonth() + 1;
  if (f.getMonth() === t.getMonth()) return `${d(f)}.–${d(t)}. ${m(t)}.`;
  return `${d(f)}. ${m(f)}. – ${d(t)}. ${m(t)}.`;
}

export function countLabel(n: number, one: string, few: string, many: string) {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}
