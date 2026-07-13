// Browser-Verifikation für Clash of ACLS (Phase 3) — nicht Teil von `npm test`,
// weil Playwright keine Projekt-Dependency ist (liegt im npx-Cache).
// Fährt die ECHTE Seite + ECHTE Route gegen eine Wegwerf-DB mit gestubbtem Login.
// Lauf: node test/browser-clash-of-acls.js [pfad-zu-playwright]
const os = require('os'), path = require('path'), fs = require('fs');
const express = require('express');
const { initDb } = require('../database');

const PLAYWRIGHT = process.argv[2] || 'playwright';
const { chromium } = require(PLAYWRIGHT);

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acls-b-')), 'test.db');
const db = initDb();

const ME = { id: 'BROWSER1', name: 'BrowserTester' };
const deps = {
  db,
  requireLogin: (req, res, next) => next(),
  coinIdent: () => ({ id: ME.id, name: ME.name }),
  addCoins: () => 100,
  rateLimit: () => false,
  createNotif: () => {},
  queueNotification: () => {},
};

const app = express();
app.use(express.json());
app.use(require('../routes/clash-of-acls')(deps));
app.use(express.static(path.join(__dirname, '..', 'public')));
const server = app.listen(4013);
const B = 'http://localhost:4013';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('coa-tutorial', '1')); // Tutorial überspringen
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const fail = (msg) => { console.error('✗ ' + msg); process.exitCode = 1; };
  const ok = (msg) => console.log('  ✓ ' + msg);

  await page.goto(B + '/clash-of-acls.html', { waitUntil: 'networkidle' });

  // 1) Karte gerendert
  await page.waitForSelector('.tile', { timeout: 5000 });
  const tiles = await page.locator('.tile').count();
  tiles === 144 ? ok('144 Kacheln gerendert') : fail('Kacheln: ' + tiles);

  // 2) HUD: Level-Chip + Ressourcen
  const chip = await page.locator('#lvlChip').innerText();
  chip.includes('1') ? ok('Level-Chip zeigt Level 1') : fail('Level-Chip: ' + chip);

  // 3) Daily-Sheet öffnet sich automatisch (verfügbar, kein Tutorial)
  await page.waitForSelector('#sheet.open', { timeout: 5000 });
  const title = await page.locator('#shTitle').innerText();
  title.includes('Bonus') ? ok('Daily-Bonus-Sheet öffnet automatisch') : fail('Sheet-Titel: ' + title);

  // 4) Daily abholen → Button deaktiviert, 🎁-HUD-Button verschwindet
  const moneyBefore = await page.evaluate(() => st.resources.money);
  await page.click('.claimBtn');
  await page.waitForFunction(() => st && st.daily && !st.daily.available, null, { timeout: 5000 });
  const moneyAfter = await page.evaluate(() => st.resources.money);
  moneyAfter > moneyBefore ? ok(`Daily-Claim: Geld ${moneyBefore} → ${moneyAfter}`) : fail('Daily-Claim ohne Geldzuwachs');
  (await page.locator('#dailyBtn').isVisible()) ? fail('🎁-Button noch sichtbar') : ok('🎁-Button nach Claim ausgeblendet');

  // 5) Quests-Sheet: 3 + 3 Quests
  await page.click('.sh-close');
  await page.click('#questBtn');
  await page.waitForSelector('.qrow', { timeout: 5000 });
  const qrows = await page.locator('.qrow').count();
  qrows === 6 ? ok('6 Quests (3 täglich + 3 wöchentlich) gerendert') : fail('Quest-Zeilen: ' + qrows);

  // 6) Profil: XP-Balken + Erfolgs-Galerie
  await page.click('.sh-close');
  await page.click('#lvlChip');
  await page.waitForSelector('.ach-grid', { timeout: 5000 });
  const achs = await page.locator('.ach').count();
  achs >= 30 ? ok(achs + ' Erfolge in der Galerie') : fail('Erfolge: ' + achs);
  const xpText = await page.locator('.xpbar-big').count();
  xpText === 1 ? ok('XP-Balken im Profil') : fail('XP-Balken fehlt');

  // 7) Gebäude anklicken → Info-Panel
  await page.click('.sh-close');
  await page.click('.tile[data-x="0"][data-y="0"]');
  await page.waitForSelector('#infoBar.show', { timeout: 5000 });
  const iName = await page.locator('#iName').innerText();
  iName.includes('Büro') ? ok('Info-Panel: ' + iName) : fail('Info-Panel: ' + iName);

  // 8) Werkschutz-Sheet (ohne Zentrale → Hinweis)
  await page.click('button[title="Werkschutz & Überfälle"]');
  await page.waitForSelector('#sheet.open', { timeout: 5000 });
  const armyBody = await page.locator('#shBody').innerText();
  armyBody.includes('Sicherheitszentrale') ? ok('Werkschutz-Sheet zeigt Freischalt-Hinweis') : fail('Werkschutz-Sheet: ' + armyBody.slice(0, 80));
  await page.click('.sh-close');

  // 9) Kompletter Kampf-Flow: Zentrale + Einheiten seeden, Trupp wählen, Angriff
  db.prepare("INSERT INTO coa_buildings (discord_id, building_key, x, y, level) VALUES (?, 'sicherheitszentrale', 9, 0, 3)").run(ME.id);
  db.prepare("INSERT INTO coa_units (discord_id, unit_key) VALUES (?, 'wachmann'), (?, 'wachmann'), (?, 'wachhund')").run(ME.id, ME.id, ME.id);
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('button[title="Werkschutz & Überfälle"]');
  await page.waitForSelector('#shBody input[type="checkbox"]', { timeout: 5000 });
  const boxes = await page.locator('#shBody input[type="checkbox"]').count();
  boxes === 3 ? ok('3 Einheiten wählbar') : fail('Checkboxen: ' + boxes);
  for (let i = 0; i < 3; i++) await page.locator('#shBody input[type="checkbox"]').nth(i).check();
  await page.waitForFunction(() => document.querySelector('#shBody').innerText.includes('⚔️ 35'), null, { timeout: 5000 });
  ok('Trupp-Stärke 35 (10+10+15) live angezeigt');
  const chanceTxt = await page.locator('#shBody').innerText();
  chanceTxt.includes('88 %') ? ok('Siegchance 88 % gegen Schrottdiebe angezeigt') : fail('Chance nicht gefunden');
  await page.locator('#shBody button:has-text("Angriff")').first().click();
  await page.waitForFunction(() => st && st.activeRaid, null, { timeout: 5000 });
  ok('Überfall gestartet (activeRaid gesetzt)');
  await page.click('.sh-close');
  (await page.locator('#jobs .jchip').count()) >= 1 ? ok('Überfall-Job-Chip sichtbar') : fail('Job-Chip fehlt');

  // 10) Himmel/Wolken vorhanden, keine JS-Fehler
  (await page.locator('.cloud').count()) === 3 ? ok('3 Wolken am Himmel') : fail('Wolken fehlen');
  await page.screenshot({ path: path.join(os.tmpdir(), 'coa-phase3.png') });
  console.log('  Screenshot: ' + path.join(os.tmpdir(), 'coa-phase3.png'));

  if (errors.length) fail('JS-Fehler auf der Seite:\n' + errors.join('\n'));
  else ok('Keine JS-Fehler in der Konsole');

  await browser.close();
  server.close(() => { try { db.close(); } catch {} });
  console.log(process.exitCode ? '✗ Browser-Test fehlgeschlagen' : '✓ Browser-Test bestanden');
})().catch((e) => {
  console.error('✗ Browser-Test abgebrochen:', e.message);
  process.exit(1);
});
