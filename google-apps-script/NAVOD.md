# Apps Script – most mezi Googlem a katalogem

Jeden skript, vložený do **tabulky odpovědí přihlášky**. Dělá dvě věci:

1. **Po odeslání formuláře** (přihlášky i dotazníku dostupnosti) pošle odpověď hned do katalogu.
   Z přihlášky vznikne profil *Ke zpracování* i s fotkami, z dotazníku se hosteska přihlásí na akce.
2. **Předává katalogu fotky z Disku a obsah tabulek**, když si o ně řekne (tlačítka v administraci, denní kontrola).

Běží pod účtem, kterému formulář a fotky patří. Nic se nesdílí veřejně a nic se nezveřejní samo –
profil jde do katalogu až po schválení fotky a publikaci v administraci.

## Nastavení (~10 minut, jednou)

Potřebuješ být přihlášená účtem, pod kterým je formulář (`zuzana.pribylova@goodladies.cz`).

1. Otevři **tabulku odpovědí přihlášky** (ne formulář) → **Rozšíření → Apps Script**.
2. Smaž ukázkový kód a vlož celý obsah souboru `katalog-most.gs` → **Uložit** (disketa).
3. Nahoře vyber funkci **`nastavit`** → **Spustit** → povol oprávnění (Google upozorní, že aplikace není ověřená:
   *Rozšířené → Přejít na …* – je to tvůj vlastní skript).
4. Vrať se do tabulky – objeví se tři okna:
   - adresa katalogu: `https://katalog.goodladies.cz`
   - tajný klíč: zkopíruj z administrace katalogu, záložka **Nastavení**
   - odkaz na tabulku odpovědí **dotazníku dostupnosti** (zatím může zůstat prázdné, pak spusť `nastavit` znovu)
5. **Nasadit → Nová nasazení** → ozubené kolečko → **Webová aplikace**:
   - Spustit jako: **Já**
   - Kdo má přístup: **Kdokoli**
   → **Nasadit** → zkopírovat **adresu webové aplikace** (končí `/exec`).
   *„Kdokoli“ je v pořádku – bez tajného klíče skript nic nevydá.*
6. V administraci katalogu → **Nastavení** → vložit adresu → **Uložit** → **Ověřit spojení**.
7. **Import přihlášek** → *Načíst nové přihlášky* → *Stáhnout chybějící fotky*. Tím se naplní dosavadní přihlášky.

Hotovo. Od teď se každá nová přihláška objeví v administraci do minuty.

**Když skript upravíš** (nová verze souboru): vlož nový kód → *Nasadit → Spravovat nasazení* → tužka → Verze: *Nová verze* → Nasadit. Adresa zůstává stejná.

## Dotazník dostupnosti – jak ho postavit, aby se dobře párovalo

Párování probíhá podle **e-mailu** (záložně telefonu) a **názvu akce**:

- **Zapni sběr e-mailů** (Nastavení formuláře → Odpovědi → Shromažďovat e-mailové adresy) – nebo povinná otázka *E-mail*.
  Hosteska by měla vyplnit stejný e-mail jako v přihlášce.
- **Názvy akcí piš přesně jako v administraci** (záložka *Akce*): `Caravaning`, `e-SALON`, `electronica`, `MEDICA`, `CZECH BUS`, `SPS`…
  Novou akci nejdřív založ v administraci, pak ji přidej do dotazníku.

Doporučené otázky:

1. **E-mail** (sběr e-mailů, povinné)
2. **Jméno a příjmení** (krátká odpověď) – jen pro kontrolu
3. **Na které akce se hlásíš?** (zaškrtávací políčka, jedna možnost = jedna akce, např. „Caravaning Brno 5.–8. 11.“)
4. **Kolik dní můžeš?** (výběr: všechny dny / jen některé – upřesním v poznámce)
5. **Poznámka** (odstavec – např. „v pondělí jen dopoledne“)

Otázky 4 a 5 se uloží k přihlášce na akci jako poznámka pro tým.
Mřížka (řádky = akce, sloupce Ano/Ne) funguje taky – akce se počítá, když odpověď není „Ne“.

Nespárované odpovědi (jiný e-mail, hosteska ještě neposlala přihlášku) čekají v administraci **Akce → Dotazník dostupnosti**.
Jakmile hosteska pošle přihlášku se stejným e-mailem, spáruje se sama.

## Jak poznat, že něco nejde

- Apps Script vlevo **Spuštění** – každé odeslání formuláře je tam jako řádek; chyba je červeně.
- Nevadí, když skript jednou selže: katalog si tabulky jednou denně projde sám a chybějící dožene.
