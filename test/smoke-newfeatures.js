// Smoke-Test für die neuen Features: Clubs+Treasury, AutoMarkt, Auto Empire, Anti-Cheat.
// Treibt die echten Route-Handler mit gestubbten Deps (Auth/Coins) gegen eine Wegwerf-DB.
// Lauf: node test/smoke-newfeatures.js   (kein Framework, nur assert)
const assert = require('assert');
const os = require('os'), path = require('path'), fs = require('fs');
const express = require('express');
const { initDb } = require('../database');

// initDb() liest DB_PATH aus der Umgebung → vor dem Aufruf auf eine Wegwerf-DB setzen
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acls-')), 'test.db');
const db = initDb();

const ME = { id: 'TESTER1', name: 'Tester' };
let identId = ME.id;
const coinIdent = () => ({ id: identId, name: identId === ME.id ? 'Tester' : 'Other' });

// minimaler echter addCoins gegen coin_balances
function addCoins(did, name, amt, reason) {
  const cur = db.prepare('SELECT balance FROM coin_balances WHERE discord_id=?').get(did)?.balance ?? 0;
  if (amt < 0 && cur + amt < 0) return null;
  db.prepare(`INSERT INTO coin_balances (discord_id, username, balance) VALUES (?,?,?)
    ON CONFLICT(discord_id) DO UPDATE SET balance = balance + excluded.balance`).run(did, name, amt);
  return db.prepare('SELECT balance FROM coin_balances WHERE discord_id=?').get(did).balance;
}
// stub addSeasonXp → schreibt in xp_log mit Anomalie-Flag (wie das Original)
function addSeasonXp(did, name, amt, src) {
  const hour = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM xp_log WHERE discord_id=? AND created_at > datetime('now','-1 hour')").get(did).s;
  const flagged = (hour + amt) > 5000 ? 1 : 0;
  db.prepare('INSERT INTO xp_log (discord_id, username, amount, source, flagged) VALUES (?,?,?,?,?)').run(did, name, amt, src || 'spiel', flagged);
}
const pass = (req, res, next) => next();
const deps = { db, requireLogin: pass, requireAuth: pass, requireAdmin: pass,
  coinIdent, addCoins, addSeasonXp, rateLimit: () => false, createNotif: () => {} };

const app = express();
app.use(express.json());
app.use(require('../routes/anticheat')(deps));
app.use(require('../routes/clubs')(deps));
app.use(require('../routes/automarkt')(deps));
app.use(require('../routes/auto-empire')(deps));

const server = app.listen(4011);
const B = 'http://localhost:4011';
const get = async (p) => (await fetch(B + p)).json();
const post = async (p, body) => { const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };

(async () => {
  // Startkapital für Coin-basierte Features (Club gründen/spenden)
  addCoins(ME.id, ME.name, 5000, 'seed');

  // ── AutoMarkt Pro ──────────────────────────────────────────
  let am = await get('/api/automarkt');
  assert.equal(am.cash, 5000, 'AM Startguthaben 5000');
  assert.equal(am.offers.length, 3, 'AM 3 Tagesangebote');
  const buy = await post('/api/automarkt/buy/0');
  assert.equal(buy.status, 200, 'AM Kauf ok');
  am = await get('/api/automarkt');
  assert.equal(am.garage.length, 1, 'AM Fahrzeug in Garage');
  assert.ok(am.cash < 5000, 'AM Guthaben nach Kauf gesunken');
  const gid = am.garage[0].id;
  const restore = await post('/api/automarkt/restore/' + gid, { points: 100 });
  assert.equal(restore.status, 200, 'AM Restaurieren ok');
  am = await get('/api/automarkt');
  assert.equal(am.garage[0].condition, 100, 'AM Zustand auf 100% restauriert');
  const sell = await post('/api/automarkt/sell/' + gid);
  assert.equal(sell.status, 200, 'AM Verkauf ok');
  assert.ok(typeof sell.json.value === 'number', 'AM Verkaufswert geliefert');
  am = await get('/api/automarkt');
  assert.equal(am.garage.length, 0, 'AM Garage nach Verkauf leer');
  assert.equal(am.sold_count, 1, 'AM Verkaufszähler = 1');

  // ── Auto Empire ────────────────────────────────────────────
  let ae = await get('/api/empire');
  assert.equal(ae.cash, 1000, 'AE Startguthaben 1000');
  assert.equal(ae.workshops, 1, 'AE 1 Werkstatt');
  const hire = await post('/api/empire/hire');
  assert.equal(hire.status, 200, 'AE Mechaniker einstellen ok');
  assert.equal(hire.json.mechanics, 1, 'AE 1 Mechaniker');
  // Produktion: last_collect 4h zurückdatieren → pending > 0
  db.prepare("UPDATE ae_state SET last_collect = datetime('now','-4 hours') WHERE discord_id=?").run(ME.id);
  ae = await get('/api/empire');
  assert.ok(ae.pending > 0, 'AE Offline-Produktion akkumuliert');
  const collect = await post('/api/empire/collect');
  assert.equal(collect.status, 200, 'AE Einsammeln ok');
  assert.ok(collect.json.collected > 0, 'AE etwas eingesammelt');
  // Offline-Cap: 20h zurück darf nicht mehr als 8h Produktion geben
  db.prepare("UPDATE ae_state SET last_collect = datetime('now','-20 hours') WHERE discord_id=?").run(ME.id);
  ae = await get('/api/empire');
  assert.ok(ae.pending <= ae.rate_per_hour * 8 + 1, 'AE Offline-Cap auf 8h begrenzt');

  // ── Clubs + Treasury ───────────────────────────────────────
  const before = db.prepare('SELECT balance FROM coin_balances WHERE discord_id=?').get(ME.id).balance;
  const create = await post('/api/clubs/create', { name: 'Street Legends', tag: 'SL', description: 'Test', logo_emoji: '🏎️' });
  assert.equal(create.status, 200, 'Club gründen ok');
  const after = db.prepare('SELECT balance FROM coin_balances WHERE discord_id=?').get(ME.id).balance;
  assert.equal(before - after, 500, 'Club kostet 500 Coins');
  let mine = await get('/api/clubs/mine');
  assert.equal(mine.my_role, 'president', 'Gründer ist Präsident');
  const donate = await post('/api/clubs/donate', { amount: 1000 });
  assert.equal(donate.status, 200, 'Einzahlen ok');
  mine = await get('/api/clubs/mine');
  assert.equal(mine.treasury, 1000, 'Vereinskasse = 1000');
  assert.equal(mine.total_xp, 1000, 'Club-XP steigt mit Einzahlung');
  const wd = await post('/api/clubs/withdraw', { amount: 400 });
  assert.equal(wd.status, 200, 'Auszahlen (Präsident) ok');
  mine = await get('/api/clubs/mine');
  assert.equal(mine.treasury, 600, 'Kasse nach Auszahlung = 600');
  // Nicht-Präsident darf nicht auszahlen
  identId = 'OTHER2';
  const wd2 = await post('/api/clubs/withdraw', { amount: 100 });
  assert.equal(wd2.status, 400, 'Fremder ohne Club kann nicht auszahlen');
  identId = ME.id;
  // Überzug verhindern
  const wd3 = await post('/api/clubs/withdraw', { amount: 999999 });
  assert.equal(wd3.status, 400, 'Auszahlung über Kassenstand abgelehnt');

  // ── Anti-Cheat XP-Log ──────────────────────────────────────
  // normale Gewinne
  for (let i = 0; i < 3; i++) addSeasonXp(ME.id, ME.name, 100, 'minispiel');
  let userLog = await get('/api/admin/xp-log/' + ME.id);
  assert.ok(userLog.xp_last_hour >= 300, 'XP-Log summiert die letzte Stunde');
  assert.ok(userLog.by_source.length >= 1, 'XP-Log nach Quelle aufgeschlüsselt');
  // Anomalie auslösen: > 5000 XP/Std
  addSeasonXp(ME.id, ME.name, 6000, 'exploit');
  const flags = await get('/api/admin/xp-flags');
  assert.ok(flags.some(f => f.discord_id === ME.id), 'Anomalie wird geflaggt');
  const overview = await get('/api/admin/xp-overview');
  assert.ok(overview.some(o => o.discord_id === ME.id && o.xp_24h >= 6300), 'XP-Übersicht zeigt 24h-Summe');

  console.log('✓ Alle Smoke-Tests bestanden (AutoMarkt, Auto Empire, Clubs+Treasury, Anti-Cheat)');
  finish(0);
})().catch(e => { console.error('✗ Test fehlgeschlagen:', e.message); finish(1); });

// Sauber abbauen: erst Server schließen, dann DB, dann Loop natürlich auslaufen lassen
// (kein process.exit → verhindert libuv-Abort beim erzwungenen Teardown unter Windows)
function finish(code) {
  process.exitCode = code;
  server.close(() => { try { db.close(); } catch {} });
}
