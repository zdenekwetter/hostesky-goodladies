# Katalog hostesek GoodLadies

Veřejný katalog hostesek na `katalog.goodladies.cz` s poptávkou a administrací.

- **Klient** si vybere akci, profiltruje hostesky (jazyk, kraj, výška, doklady), vybere konkrétní tváře a pošle poptávku.
- **Hosteska** vyplní přihlášku (Google Form) → profil vznikne hned jako koncept; dotazníkem dostupnosti se hlásí na akce.
- **Tým** v administraci profily upravuje, schvaluje fotky a publikuje; vidí poptávky a které hostesky jsou nejžádanější.

Nasazení krok za krokem: **[README-nasazeni.md](README-nasazeni.md)**.

## Jak to funguje

```
Google Form (přihláška) ──Apps Script──► /api/ingest/form ──► profil „Ke zpracování“ + fotky
Google Form (dostupnost) ─Apps Script──►        〃         ──► přihlášky na akce (párování podle e-mailu)
           └── pojistka: cron 1× denně si přes Apps Script přečte obě tabulky

Fotky: Disk ──Apps Script (webová aplikace, podepsané požadavky)──► vodoznak, 3 velikosti, bez EXIF ──► databáze
       originály zůstávají na Disku GoodLadies; veřejně jen schválené fotky publikovaných profilů

Administrace ── schválení fotky → publikace (databáze ji nepustí bez souhlasů, fotky, kraje a města)

Katalog ──► /api/poptavka ──► uloží poptávku ──► tentýž Make webhook jako landing page (+ booking_ids)
```

Žádný Google Cloud ani servisní účet: k Googlu se katalog dostává přes Apps Script běžící pod účtem,
kterému formulář patří (`google-apps-script/katalog-most.gs`).

## Pravidla, která hlídá databáze

- Publikovat nejde bez souhlasu 18+, souhlasu se zveřejněním, schválené fotky, jména, kraje a města.
- Veřejný web čte jen schéma `public_api` rolí `hostesky_public` – osobní údaje (telefon, e-mail, Instagram, odměna, povaha) v něm nejsou. Role a jejich hesla vznikají při migraci, aplikaci stačí jedna `DATABASE_URL`.
- Data se skrývají, nemažou. Souhlasy a audit log smazat nejde; odvolání souhlasu profil okamžitě archivuje a skryje fotky.
- Každá akce v administraci se zapisuje do historie s povinnou poznámkou.
- Nezletilá (nepotvrzené 18+) se nezaloží; uloží se jen značka, aby se odpověď nezpracovávala znovu.

## Role v administraci

| Role | Smí |
|---|---|
| Editorka | zakládat a upravovat profily, nahrávat a odmítat fotky, posílat ke schválení, vyřizovat poptávky |
| Schvalovatelka | navíc schvalovat fotky, publikovat a stahovat profily, evidovat doložený souhlas, spravovat účty (Tým) a nastavení (Nastavení) |

## Vývoj

```bash
npm install
cp .env.example .env.local          # vyplnit DATABASE_URL (lokální Postgres nebo Neon branch)
npm run migrate
DATABASE_URL=… npm run seed -- --demo                # 8 smyšlených profilů pro náhled (ne do ostré databáze)
npm run dev                                          # první účet: /admin/login
```

## Struktura

```
db/migrations/          SQL schéma, pravidla, veřejné pohledy, akce, úložiště fotek, nastavení
scripts/                migrace (běží při každém buildu), demo data, účet z příkazové řádky
google-apps-script/     most do Googlu + návod a doporučené otázky dotazníku
src/lib/bridge.ts       volání Apps Scriptu (tabulky, fotky)
src/lib/settings.ts     nastavení měnitelné v administraci, odvozené klíče
src/lib/mapper.ts       převod odpovědi z formuláře na profil (podle textu otázek, ne pořadí sloupců)
src/lib/availability.ts dotazník dostupnosti → přihlášky na akce
src/lib/photos.ts       vodoznak, velikosti, uložení do databáze, stažení z Disku
src/app/                katalog (/), profil (/hosteska/…), administrace (/admin), API
```

## Druhá etapa (není součástí)

CV parser, jazykové verze katalogu (DE/EN/CN – datový model je připravený, `bio` má varianty), retenční lhůty 12/24 měsíců (pole `last_activity_at` už se plní).
