# Nasazení katalogu hostesek

Katalog potřebuje jen **Vercel** a **databázi Neon** – stejně jako katalog virtuálních asistentek.
Google Cloud ani žádné klíče se nezakládají: fotky a přihlášky si katalog bere z Google přes Apps Script,
který vloží Zuzana do tabulky odpovědí. Tajné klíče si aplikace vygeneruje sama.

```
Radek   1. Neon: nová databáze             ~5 min
Radek   2. Vercel: import repozitáře        ~10 min
Radek   3. Doména katalog.goodladies.cz     ~5 min
Zuzana  4. První účet do administrace       ~2 min
Zuzana  5. Apps Script v tabulce odpovědí   ~10 min
Zuzana  6. Make: pole booking_ids           ~10 min
```

---

## Radek

### 1. Databáze Neon

V účtu Neonu, kde běží katalog asistentek → **New Project**:

- název `katalog-hostesek`, region **Europe (Frankfurt)**
- po vytvoření → **Connect** → zkopírovat connection string (ten s `-pooler` v adrese)

Nový **projekt**, ne nová databáze v projektu asistentek – katalogy si nepřekážejí a role se nepletou.

> Kratší cesta: ve Vercelu u projektu katalogu **Storage → Create Database → Neon**. Vercel databázi založí
> a `DATABASE_URL` vloží sám – krok 2.2 pak odpadá.

### 2. Vercel

1. **Add New → Project → Import Git Repository** → `zdenekwetter/hostesky-goodladies`. Framework se pozná sám (Next.js).
2. **Environment Variables** → jediná proměnná:

   | Název | Hodnota |
   |---|---|
   | `DATABASE_URL` | connection string z Neonu (krok 1) |

3. **Deploy.** Při sestavení se v databázi automaticky vytvoří tabulky, role a tajné klíče (v logu sestavení řádky `→ 001_schema.sql … ok`).

Další úpravy katalogu se nasazují samy po každé změně v repozitáři – Vercel do budoucna potřeba nebude.

### 3. Doména

1. Projekt → **Settings → Domains → Add** → `katalog.goodladies.cz`.
2. U správce DNS `goodladies.cz` přidat záznam, který Vercel ukáže, typicky:

   ```
   katalog   CNAME   cname.vercel-dns.com.
   ```

HTTPS certifikát si Vercel vystaví sám.

**Cron:** `vercel.json` jednou denně (5:00 UTC) dožene přihlášky, které by Apps Script nepředal. Nic se nenastavuje.

---

## Zuzana

### 4. První účet

Hned po nasazení otevřít `https://katalog.goodladies.cz/admin` → objeví se **Založit účet** →
e-mail `zuzana.pribylova@goodladies.cz`, jméno, heslo. Účet má roli schvalovatelky.
(První účet jde založit jen s tímto e-mailem a jen dokud žádný účet neexistuje.)

Kolegyně pak přidáš v záložce **Tým**.

### 5. Apps Script

Postup krok za krokem: [`google-apps-script/NAVOD.md`](google-apps-script/NAVOD.md). Tajný klíč, který skript potřebuje,
najdeš v administraci v záložce **Nastavení**; tam se po nasazení skriptu vloží i jeho adresa a tlačítkem **Ověřit spojení** se zkontroluje.

Pak v záložce **Import přihlášek**: **Načíst nové přihlášky** → **Stáhnout chybějící fotky**. Tím se naplní všechny dosavadní přihlášky.

### 6. Make

Scénář **Hostesky – LP poptávky firmy** zůstává, katalog posílá na stejný webhook stejná pole jako landing page plus:

| Pole | Příklad |
|---|---|
| `booking_ids` | `GL-1004,GL-1017` |
| `vybrane_hostesky` | `Kateřina H. (GL-1004), Tereza N. (GL-1017)` |
| `zdroj` | `katalog` |

1. Ve webhook modulu → **Redetermine data structure** → v katalogu odeslat testovací poptávku s vybranou hosteskou.
2. Google Sheets: sloupce *Vybrané hostesky* a *Zdroj* → namapovat `vybrane_hostesky` a `zdroj`.
3. Gmail: do těla zprávy řádek s `vybrane_hostesky`.

Poptávky se navíc ukládají v administraci (**Poptávky**). Když Make neodpoví, nic se neztratí – tlačítko *Poslat znovu do Make* a denní cron.

---

## Kontrola po nasazení

- [ ] `katalog.goodladies.cz` se načte (prázdný – nic není publikované)
- [ ] první účet založen, **Nastavení → Ověřit spojení** hlásí „Spojení funguje“
- [ ] testovací přihláška přes Google Form → do minuty v adminu v *Ke zpracování* i s fotkou
- [ ] schválit fotku → Poslat ke schválení → Publikovat → profil je v katalogu
- [ ] testovací poptávka → e-mail z Make, řádek v tabulce, poptávka v adminu
- [ ] testovací profil archivovat, poptávku označit jako vyřízenou

## Když něco nejde

| Příznak | Příčina |
|---|---|
| Sestavení na Vercelu spadne na migraci | špatný `DATABASE_URL`, nebo uživatel z Neonu nemá právo zakládat role (použít vlastníka `neondb_owner`) |
| Web hlásí „Něco se pokazilo“ | Vercel → projekt → **Logs** |
| Ověřit spojení: „neodpověděl JSONem“ | Apps Script není nasazený jako webová aplikace s přístupem *Kdokoli* |
| Ověřit spojení: „neplatný podpis“ | v Apps Scriptu je jiný klíč než v Nastavení – spustit znovu `nastavit` |
| Fotka „nestaženo“ | odkaz z formuláře nevede na obrázek (PDF, smazaný soubor); jde nahrát ručně |
| Poptávka „nepředáno“ | Make webhook vypnutý nebo jiná adresa v Nastavení |

## Pro vývojáře

Volitelné proměnné (jinak výchozí hodnoty / nastavení v administraci): `SITE_URL`, `MAKE_WEBHOOK_URL`, `GOOGLE_BRIDGE_URL`,
`PRICE_TEXT`, `SESSION_SECRET`, `INGEST_SECRET`, `CRON_SECRET`, `ADMIN_BOOTSTRAP_EMAIL`, `CONTACT_PHONE`, `CONTACT_EMAIL`.
Proměnná prostředí má přednost před nastavením v administraci. Viz `.env.example`.
