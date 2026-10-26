/**
 * Katalog hostesek GoodLadies – most mezi Google (formuláře, tabulky, Disk) a katalogem.
 *
 * Co dělá:
 *  1. Po odeslání PŘIHLÁŠKY nebo DOTAZNÍKU DOSTUPNOSTI pošle odpověď hned do katalogu.
 *  2. Jako „webová aplikace“ předává katalogu fotky z Disku a obsah tabulek odpovědí.
 *     Běží pod vaším účtem, takže katalog nepotřebuje Google Cloud ani žádný servisní účet.
 *     Fotky se na Disku nikomu nesdílejí – katalog si je jen vyžádá, vypálí vodoznak a uloží k sobě.
 *
 * Všechny požadavky jsou podepsané tajným klíčem (INGEST_SECRET). Bez něj skript nic nevydá.
 * Postup nastavení: NAVOD.md ve stejné složce.
 */

var VERZE = '2026-10-23';

// ---------------------------------------------------------------------------
// 1) Nastavení – spustit jednou funkci `nastavit` (tlačítko Spustit)
// ---------------------------------------------------------------------------
function nastavit() {
  var ui = SpreadsheetApp.getUi();
  var p = PropertiesService.getScriptProperties();

  var url = ui.prompt('Adresa katalogu', 'Např. https://katalog.goodladies.cz', ui.ButtonSet.OK_CANCEL);
  if (url.getSelectedButton() !== ui.Button.OK) return;
  var klic = ui.prompt('Tajný klíč', 'Hodnota INGEST_SECRET (stejná jako ve Vercelu)', ui.ButtonSet.OK_CANCEL);
  if (klic.getSelectedButton() !== ui.Button.OK) return;
  var dost = ui.prompt('Dotazník dostupnosti',
    'Odkaz na TABULKU odpovědí dotazníku dostupnosti (nebo nechte prázdné, pokud ještě není)', ui.ButtonSet.OK_CANCEL);
  if (dost.getSelectedButton() !== ui.Button.OK) return;

  p.setProperty('KATALOG_URL', url.getResponseText().trim().replace(/\/+$/, ''));
  p.setProperty('INGEST_SECRET', klic.getResponseText().trim());
  p.setProperty('PRIHLASKA_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  var dostId = idZOdkazu(dost.getResponseText());
  if (dostId) p.setProperty('DOSTUPNOST_ID', dostId); else p.deleteProperty('DOSTUPNOST_ID');

  // spouštěče „při odeslání formuláře“ – pro tuto tabulku i pro tabulku dotazníku
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'poOdeslani') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('poOdeslani').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onFormSubmit().create();
  if (dostId) ScriptApp.newTrigger('poOdeslani').forSpreadsheet(dostId).onFormSubmit().create();

  ui.alert('Hotovo',
    'Spouštěče jsou nastavené' + (dostId ? ' (přihláška i dotazník dostupnosti).' : ' (jen přihláška).') +
    '\n\nZbývá: Nasadit → Nová nasazení → Webová aplikace (Spustit jako: Já, Přístup: Kdokoli) ' +
    'a adresu končící /exec vložit do Vercelu jako GOOGLE_BRIDGE_URL.', ui.ButtonSet.OK);
}

function idZOdkazu(s) {
  var m = String(s || '').match(/\/d\/([\w-]{20,})/) || String(s || '').match(/^([\w-]{20,})$/);
  return m ? m[1] : '';
}

// ---------------------------------------------------------------------------
// 2) Po odeslání formuláře → hned do katalogu
// ---------------------------------------------------------------------------
function poOdeslani(e, hromadne) {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('KATALOG_URL'), klic = p.getProperty('INGEST_SECRET');
  if (!url || !klic) throw new Error('Skript není nastavený – spusťte funkci nastavit.');

  var zdroj = e && e.range ? e.range.getSheet().getParent().getId() : p.getProperty('PRIHLASKA_ID');
  var typ = zdroj === p.getProperty('DOSTUPNOST_ID') ? 'dostupnost' : 'prihlaska';

  // při hromadném odeslání se fotky nestahují hned (stáhnou se v administraci tlačítkem)
  var telo = JSON.stringify({ type: typ, namedValues: e.namedValues, fotky: !hromadne });
  var odpoved = UrlFetchApp.fetch(url + '/api/ingest/form', {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: telo,
    headers: { 'X-GL-Signature': hmac(telo, klic) },
    muteHttpExceptions: true,
  });
  if (odpoved.getResponseCode() >= 300) {
    // nic se neztratí – katalog si tabulku jednou denně projde sám
    console.error('Katalog odpověděl ' + odpoved.getResponseCode() + ': ' + odpoved.getContentText().slice(0, 300));
  }
}

// ---------------------------------------------------------------------------
// 3) Webová aplikace – katalog si říká o fotky a tabulky
// ---------------------------------------------------------------------------
function doPost(e) {
  try {
    var klic = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
    var obal = JSON.parse(e.postData.contents);
    if (!klic || hmac(obal.data, klic) !== obal.sig) return vystup({ ok: false, error: 'neplatný podpis' });
    var req = JSON.parse(obal.data);
    if (Math.abs(Date.now() - Number(req.ts)) > 5 * 60 * 1000) return vystup({ ok: false, error: 'prošlý požadavek' });

    if (req.action === 'rows') return vystup({ ok: true, values: radky(req.sheet) });
    if (req.action === 'photo') return vystup(fotka(req.id));
    if (req.action === 'ping') return vystup({ ok: true, verze: VERZE });
    return vystup({ ok: false, error: 'neznámá akce' });
  } catch (err) {
    return vystup({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return vystup({ ok: true, info: 'Most katalogu GoodLadies', verze: VERZE });
}

function radky(sheet) {
  var p = PropertiesService.getScriptProperties();
  var id = sheet === 'dostupnost' ? p.getProperty('DOSTUPNOST_ID') : p.getProperty('PRIHLASKA_ID');
  if (!id) return [];
  return SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getDisplayValues();
}

function fotka(id) {
  if (!/^[\w-]{20,}$/.test(String(id))) return { ok: false, error: 'neplatné ID souboru' };
  var soubor = DriveApp.getFileById(id);
  var mime = soubor.getMimeType();
  // vydá se jen obrázek – nic jiného z Disku přes most nejde
  if (mime.indexOf('image/') !== 0) return { ok: false, error: 'soubor není obrázek (' + mime + ')' };

  // Zmenšená verze z Googlu (max. 2000 px, JPEG – převede i HEIC z iPhonu)
  var nahled = UrlFetchApp.fetch('https://drive.google.com/thumbnail?sz=w2000&id=' + id, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
    followRedirects: true,
  });
  var blob;
  var typ = String(nahled.getHeaders()['Content-Type'] || '');
  if (nahled.getResponseCode() === 200 && typ.indexOf('image/') === 0) {
    blob = nahled.getBlob();
  } else {
    blob = soubor.getBlob();
    if (blob.getBytes().length > 15 * 1024 * 1024) return { ok: false, error: 'fotka je větší než 15 MB' };
  }
  return { ok: true, mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

// ---------------------------------------------------------------------------
// Pomocné
// ---------------------------------------------------------------------------
function hmac(text, klic) {
  return Utilities.computeHmacSha256Signature(text, klic, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function vystup(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Pošle do katalogu VŠECHNY dosavadní přihlášky (první naplnění). Duplicity katalog pozná sám. */
function poslatVsechnyPrihlasky() {
  var data = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getDataRange().getDisplayValues();
  var hlavicka = data[0];
  for (var r = 1; r < data.length; r++) {
    var nv = {};
    for (var i = 0; i < hlavicka.length; i++) nv[hlavicka[i]] = [data[r][i]];
    poOdeslani({ namedValues: nv }, true);
  }
  SpreadsheetApp.getUi().alert('Odesláno ' + (data.length - 1) + ' přihlášek. Najdete je v administraci v „Ke zpracování“. Fotky stáhnete v záložce Import přihlášek tlačítkem „Stáhnout chybějící fotky“.');
}
