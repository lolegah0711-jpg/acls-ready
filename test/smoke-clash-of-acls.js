// Smoke-Test für Clash of ACLS (Phase 1: Kernschleife).
// Treibt die echten Route-Handler mit gestubbten Deps gegen eine Wegwerf-DB.
// Lauf: node test/smoke-clash-of-acls.js   (kein Framework, nur assert)
const assert = require('assert');
const os = require('os'), path = require('path'), fs = require('fs');
const express = require('express');
const { initDb } = require('../database');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acls-')), 'test.db');
const db = initDb();

const ME = { id: 'TESTER1', name: 'Tester' };
const coinIdent = () => ({ id: ME.id, name: ME.name });

function addCoins(did, name, amt) {
  const cur = db.prepare('SELECT balance FROM coin_balances WHERE discord_id=?').get(did)?.balance ?? 0;
  if (amt < 0 && cur + amt < 0) return null;
  db.prepare(`INSERT INTO coin_balances (discord_id, username, balance) VALUES (?,?,?)
    ON CONFLICT(discord_id) DO UPDATE SET balance = balance + excluded.balance`).run(did, name, amt);
  return db.prepare('SELECT balance FROM coin_balances WHERE discord_id=?').get(did).balance;
}
const notifs = [];
const pass = (req, res, next) => next();
const deps = {
  db, requireLogin: pass, coinIdent, addCoins, rateLimit: () => false,
  createNotif: (discordId, type, data) => { notifs.push({ discordId, type, data }); db.prepare('INSERT INTO notifications (discord_id, type, data) VALUES (?,?,?)').run(discordId, type, JSON.stringify(data)); },
  queueNotification: () => {},
};

const app = express();
app.use(express.json());
const coaRouter = require('../routes/clash-of-acls')(deps);
app.use(coaRouter);

const server = app.listen(4012);
const B = 'http://localhost:4012';
const get = async (p) => (await fetch(B + p)).json();
const post = async (p, body) => { const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const backdateBuild = () => db.prepare("UPDATE coa_build_queue SET finish_at = datetime('now','-1 hour') WHERE discord_id=?").run(ME.id);
const backdateManufacture = () => db.prepare("UPDATE coa_manufacture_queue SET finish_at = datetime('now','-1 hour')").run();

(async () => {
  // ── Startkit ───────────────────────────────────────────────
  let st = await get('/api/clash-of-acls/state');
  assert.equal(st.buildings.length, 5, 'Startkit hat 5 Gebäude');
  const keys = st.buildings.map(b => b.building_key).sort();
  assert.deepEqual(keys, ['garage', 'office', 'storage', 'tanklager', 'towyard'], 'Startkit-Gebäude korrekt');
  assert.ok(st.buildings.every(b => b.level === 1), 'Startkit ist bereits fertig (Level 1)');
  assert.equal(st.resources.money, 1000, 'Startguthaben 1000');

  // ── Platzieren ─────────────────────────────────────────────
  const moneyBefore = st.resources.money;
  const place = await post('/api/clash-of-acls/place', { building_key: 'schrottplatz', x: 5, y: 0 });
  assert.equal(place.status, 200, 'Platzierung ok: ' + JSON.stringify(place.json));
  assert.ok(place.json.resources.money < moneyBefore, 'Kosten wurden abgebucht');
  assert.ok(place.json.activeBuild, 'Bauauftrag aktiv');
  const newBuildingId = place.json.buildings.find(b => b.building_key === 'schrottplatz').id;
  assert.equal(place.json.buildings.find(b => b.id === newBuildingId).level, 0, 'Neues Gebäude startet auf Level 0 (im Bau)');

  const placeWhileBusy = await post('/api/clash-of-acls/place', { building_key: 'reifenlager', x: 6, y: 0 });
  assert.equal(placeWhileBusy.status, 400, '1-Bautrupp-Regel: zweiter Bauauftrag abgelehnt');

  const placeLocked = await post('/api/clash-of-acls/place', { building_key: 'reifenlager', x: 0, y: 5 });
  assert.equal(placeLocked.status, 400, 'Platzierung auf gesperrter Zelle abgelehnt');

  const placeOccupied = await post('/api/clash-of-acls/place', { building_key: 'reifenlager', x: 0, y: 0 });
  assert.equal(placeOccupied.status, 400, 'Platzierung auf belegter Zelle abgelehnt');

  // ── Bauauftrag finalisieren (Cron-Sweep-Pfad simulieren) ───
  backdateBuild();
  coaRouter.finalizeDue();
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.buildings.find(b => b.id === newBuildingId).level, 1, 'Gebäude nach Fertigstellung auf Level 1');
  assert.equal(st.activeBuild, null, 'Kein aktiver Bauauftrag mehr');
  const notifRow = db.prepare("SELECT * FROM notifications WHERE discord_id=? AND type='coa_build_done'").get(ME.id);
  assert.ok(notifRow, 'Benachrichtigung bei Bauende erzeugt');

  // ── Ressourcen-Sync ─────────────────────────────────────────
  const moneyBeforeSync = st.resources.money;
  db.prepare("UPDATE coa_state SET last_tick_at = datetime('now','-2 hours') WHERE discord_id=?").run(ME.id);
  st = await get('/api/clash-of-acls/state');
  assert.ok(st.resources.money > moneyBeforeSync, 'Ressourcen wachsen mit verstrichener Zeit');
  assert.ok(st.resources.money <= st.caps.money, 'Ressourcen bleiben durch Lagerkapazität gedeckelt');

  // ── Fertigung ohne genug Rohstoffe ─────────────────────────
  const garageId = st.buildings.find(b => b.building_key === 'garage').id;
  const manuFail = await post('/api/clash-of-acls/manufacture', { building_id: garageId, vehicle_key: 'abschleppwagen' });
  assert.equal(manuFail.status, 400, 'Fertigung ohne genug Rohstoffe abgelehnt');

  // ── Fertigung mit genug Rohstoffen ─────────────────────────
  db.prepare('UPDATE coa_state SET steel=500, parts=500, electronics=500, fuel=500 WHERE discord_id=?').run(ME.id);
  const manuOk = await post('/api/clash-of-acls/manufacture', { building_id: garageId, vehicle_key: 'abschleppwagen' });
  assert.equal(manuOk.status, 200, 'Fertigung gestartet: ' + JSON.stringify(manuOk.json));
  assert.equal(manuOk.json.activeManufacture.length, 1, 'Eine aktive Fertigung');

  backdateManufacture();
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.vehicles.length, 1, 'Fahrzeug nach Fertigstellung im Fuhrpark');

  // ── Verkauf ─────────────────────────────────────────────────
  const vehicleId = st.vehicles[0].id;
  const moneyBeforeSell = st.resources.money;
  const sell = await post('/api/clash-of-acls/sell/' + vehicleId);
  assert.equal(sell.status, 200, 'Verkauf ok');
  assert.ok(sell.json.credited > 0, 'Verkaufserlös > 0');
  assert.ok(sell.json.resources.money > moneyBeforeSell, 'Guthaben nach Verkauf gestiegen');
  assert.equal(sell.json.vehicles.length, 0, 'Fuhrpark nach Verkauf leer');

  // ── Mitarbeiter ───────────────────────────────────────────
  const hire = await post('/api/clash-of-acls/hire', { emp_type: 'mechaniker' });
  assert.equal(hire.status, 200, 'Einstellen ok');
  assert.equal(hire.json.employees.length, 1, '1 Mitarbeiter eingestellt');
  const empId = hire.json.employees[0].id;
  const levelUp = await post(`/api/clash-of-acls/employee/${empId}/levelup`);
  assert.equal(levelUp.status, 200, 'Level-up ok');
  assert.equal(levelUp.json.employees[0].level, 2, 'Mitarbeiter auf Level 2');
  const fire = await post('/api/clash-of-acls/fire/' + empId);
  assert.equal(fire.status, 200, 'Entlassen ok');
  assert.equal(fire.json.employees.length, 0, 'Kein Mitarbeiter mehr');

  // ── Rangliste ─────────────────────────────────────────────
  const lb = await get('/api/clash-of-acls/leaderboard');
  assert.ok(lb.some(r => r.username === ME.name), 'Spieler erscheint in der Rangliste');

  // ── Speedup (Stretch-Feature) ───────────────────────────────
  // reifenlager statt dekoration: Bauzeit >30s, sonst greift die "fast fertig"-Sperre sofort
  const place2 = await post('/api/clash-of-acls/place', { building_key: 'reifenlager', x: 6, y: 0 });
  assert.equal(place2.status, 200, 'Zweite Platzierung ok: ' + JSON.stringify(place2.json));
  addCoins(ME.id, ME.name, 1000);
  const speedup = await post('/api/clash-of-acls/speedup');
  assert.equal(speedup.status, 200, 'Speedup ok: ' + JSON.stringify(speedup.json));
  assert.equal(speedup.json.activeBuild, null, 'Bauauftrag nach Speedup abgeschlossen');

  console.log('✓ Alle Smoke-Tests bestanden (Clash of ACLS)');
  finish(0);
})().catch(e => { console.error('✗ Test fehlgeschlagen:', e.message); finish(1); });

function finish(code) {
  process.exitCode = code;
  server.close(() => { try { db.close(); } catch {} });
}
