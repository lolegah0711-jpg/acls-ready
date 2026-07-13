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
  assert.ok(Number.isInteger(place.json.activeBuild.remaining_sec) && place.json.activeBuild.remaining_sec > 0,
    'activeBuild liefert server-seitige Restzeit (remaining_sec): ' + place.json.activeBuild.remaining_sec);
  assert.ok(Number.isInteger(place.json.activeBuild.total_sec) && place.json.activeBuild.total_sec >= place.json.activeBuild.remaining_sec,
    'activeBuild liefert Gesamtdauer (total_sec)');
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
  assert.ok(st.offline && st.offline.sec >= 7000, 'Offline-Report nach >30 min Abwesenheit: ' + JSON.stringify(st.offline));
  assert.ok(st.offline.gains.money > 0, 'Offline-Report enthält Zugewinne');

  // ── Fertigung ohne genug Rohstoffe ─────────────────────────
  const garageId = st.buildings.find(b => b.building_key === 'garage').id;
  const manuFail = await post('/api/clash-of-acls/manufacture', { building_id: garageId, vehicle_key: 'abschleppwagen' });
  assert.equal(manuFail.status, 400, 'Fertigung ohne genug Rohstoffe abgelehnt');

  // ── Fertigung mit genug Rohstoffen ─────────────────────────
  db.prepare('UPDATE coa_state SET steel=500, parts=500, electronics=500, fuel=500 WHERE discord_id=?').run(ME.id);
  const manuOk = await post('/api/clash-of-acls/manufacture', { building_id: garageId, vehicle_key: 'abschleppwagen' });
  assert.equal(manuOk.status, 200, 'Fertigung gestartet: ' + JSON.stringify(manuOk.json));
  assert.equal(manuOk.json.activeManufacture.length, 1, 'Eine aktive Fertigung');
  assert.ok(Number.isInteger(manuOk.json.activeManufacture[0].remaining_sec) && manuOk.json.activeManufacture[0].remaining_sec > 0,
    'Fertigung liefert server-seitige Restzeit (remaining_sec)');

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

  // ── Rangliste (v2: Objekt mit list + myRank) ───────────────
  const lb = await get('/api/clash-of-acls/leaderboard');
  assert.ok(lb.list.some(r => r.username === ME.name), 'Spieler erscheint in der Rangliste');
  assert.ok(lb.myRank >= 1, 'Eigener Rang wird geliefert');
  assert.ok(lb.list[0].level >= 1, 'Rangliste enthält Spieler-Level');

  // ── Speedup (Stretch-Feature) ───────────────────────────────
  // reifenlager statt dekoration: Bauzeit >30s, sonst greift die "fast fertig"-Sperre sofort
  const place2 = await post('/api/clash-of-acls/place', { building_key: 'reifenlager', x: 6, y: 0 });
  assert.equal(place2.status, 200, 'Zweite Platzierung ok: ' + JSON.stringify(place2.json));
  addCoins(ME.id, ME.name, 1000);
  const speedup = await post('/api/clash-of-acls/speedup');
  assert.equal(speedup.status, 200, 'Speedup ok: ' + JSON.stringify(speedup.json));
  assert.equal(speedup.json.activeBuild, null, 'Bauauftrag nach Speedup abgeschlossen');

  // ══ Phase 2: Einsätze (PvE-Missionen) ══════════════════════
  // Fahrzeug für Einsätze fertigen (Tier 1)
  db.prepare('UPDATE coa_state SET steel=500, parts=500, electronics=500, fuel=500 WHERE discord_id=?').run(ME.id);
  await post('/api/clash-of-acls/manufacture', { building_id: garageId, vehicle_key: 'abschleppwagen' });
  backdateManufacture();
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.missionSlots, 1, 'Abschlepphof Level 1 = 1 Einsatz-Slot');
  const mVehicle = st.vehicles[0];

  const badMission = await post('/api/clash-of-acls/mission', { mission_key: 'vip', vehicle_id: mVehicle.id });
  assert.equal(badMission.status, 400, 'Tier-2-Einsatz mit Tier-1-Fahrzeug abgelehnt');
  const m1 = await post('/api/clash-of-acls/mission', { mission_key: 'abschlepp', vehicle_id: mVehicle.id });
  assert.equal(m1.status, 200, 'Einsatz gestartet: ' + JSON.stringify(m1.json));
  assert.equal(m1.json.activeMissions.length, 1, 'Ein aktiver Einsatz');
  assert.ok(m1.json.activeMissions[0].remaining_sec > 0, 'Einsatz liefert Restzeit');
  assert.equal(m1.json.vehicles[0].on_mission, 1, 'Fahrzeug als "im Einsatz" markiert');

  const sellBusy = await post('/api/clash-of-acls/sell/' + mVehicle.id);
  assert.equal(sellBusy.status, 400, 'Fahrzeug im Einsatz nicht verkaufbar');
  const m2 = await post('/api/clash-of-acls/mission', { mission_key: 'abschlepp', vehicle_id: mVehicle.id });
  assert.equal(m2.status, 400, 'Fahrzeug kann nicht zwei Einsätze gleichzeitig fahren');

  const moneyBeforeMission = m1.json.resources.money;
  db.prepare("UPDATE coa_missions SET finish_at = datetime('now','-1 minute')").run();
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.activeMissions.length, 0, 'Einsatz abgeschlossen');
  assert.equal(st.missionsDone, 1, 'Einsatz-Zähler erhöht');
  assert.ok(st.resources.money > moneyBeforeMission, 'Missions-Belohnung gutgeschrieben');
  assert.equal(st.vehicles[0].on_mission, 0, 'Fahrzeug nach Einsatz wieder frei');
  assert.ok(notifs.some(n => n.type === 'coa_mission_done'), 'Missions-Benachrichtigung erzeugt');

  // ══ Phase 2: Forschung ═════════════════════════════════════
  const noCenter = await post('/api/clash-of-acls/research', { tech_key: 'bauplanung' });
  assert.equal(noCenter.status, 400, 'Forschung ohne Forschungszentrum abgelehnt');
  // Forschungszentrum direkt in die DB legen (Bauzeit im Test überspringen)
  db.prepare("INSERT INTO coa_buildings (discord_id, building_key, x, y, level) VALUES (?,?,7,0,1)").run(ME.id, 'forschungszentrum');
  db.prepare('UPDATE coa_state SET money=99999, steel=999, parts=999, electronics=999, fuel=999 WHERE discord_id=?').run(ME.id);

  const gated = await post('/api/clash-of-acls/research', { tech_key: 'personalwesen' });
  assert.equal(gated.status, 200, 'Stufe 1 mit Zentrum-Level 1 erlaubt');
  const parallel = await post('/api/clash-of-acls/research', { tech_key: 'bauplanung' });
  assert.equal(parallel.status, 400, 'Nur eine Forschung gleichzeitig');
  assert.ok(gated.json.activeResearch && gated.json.activeResearch.remaining_sec > 0, 'Forschung liefert Restzeit');

  const slotsBefore = gated.json.employeeSlots;
  db.prepare("UPDATE coa_research_queue SET finish_at = datetime('now','-1 minute')").run();
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.activeResearch, null, 'Forschung abgeschlossen');
  assert.equal(st.researchLevels.personalwesen, 1, 'Forschungsstufe eingetragen');
  assert.equal(st.mods.extraEmployeeSlots, 1, 'Modifikator aktiv (extraEmployeeSlots)');
  assert.equal(st.employeeSlots, slotsBefore + 1, 'Mitarbeiter-Slots durch Forschung +1');
  assert.ok(notifs.some(n => n.type === 'coa_research_done'), 'Forschungs-Benachrichtigung erzeugt');

  // Stufe 2 braucht Zentrum-Level 2
  const gate2 = await post('/api/clash-of-acls/research', { tech_key: 'personalwesen' });
  assert.equal(gate2.status, 400, 'Stufe 2 ohne Zentrum-Level 2 abgelehnt');

  // Bauzeit-Forschung wirkt auf neue Bauaufträge
  db.prepare("INSERT INTO coa_research (discord_id, tech_key, level) VALUES (?,'bauplanung',5) ON CONFLICT(discord_id, tech_key) DO UPDATE SET level=5").run(ME.id);
  const place3 = await post('/api/clash-of-acls/place', { building_key: 'schrottplatz', x: 8, y: 0 });
  assert.equal(place3.status, 200, 'Platzierung mit Forschungsrabatt ok');
  const CFG2 = require('../public/js/clash-of-acls-config.js');
  const baseTime = CFG2.BUILDINGS.schrottplatz.buildTimeSec(1);
  assert.ok(place3.json.activeBuild.total_sec <= Math.round(baseTime * 0.8) + 1,
    `Bauzeit um 20 % reduziert (${place3.json.activeBuild.total_sec}s <= ${Math.round(baseTime * 0.8)}s)`);
  assert.equal(place3.json.mods.buildTimePct, 20, 'mods.buildTimePct = 20 im View');

  // ══ Phase 3: Progression (XP/Level, Erfolge, Statistiken) ══
  st = await get('/api/clash-of-acls/state');
  assert.ok(st.progression && st.progression.xp > 0, 'XP durch Aktionen gesammelt: ' + JSON.stringify(st.progression));
  assert.ok(st.progression.level >= 1 && st.progression.title, 'Level + Titel im View');
  assert.ok(Array.isArray(st.achievements) && st.achievements.length >= 30, 'Erfolgsliste im View');
  assert.ok(st.achievements.find(a => a.key === 'fzg1')?.unlocked, 'Erfolg „erstes Fahrzeug" freigeschaltet');
  assert.ok(st.achievements.find(a => a.key === 'verk1')?.unlocked, 'Erfolg „erster Verkauf" freigeschaltet');
  assert.ok(st.achievements.find(a => a.key === 'eins1')?.unlocked, 'Erfolg „erster Einsatz" freigeschaltet');
  assert.ok(notifs.some(n => n.type === 'coa_achievement'), 'Erfolgs-Benachrichtigung erzeugt');
  assert.equal(st.stats.vehicles_built, 2, 'Statistik: 2 Fahrzeuge gefertigt');
  assert.equal(st.stats.vehicles_sold, 1, 'Statistik: 1 Fahrzeug verkauft');
  assert.equal(st.stats.missions_done, 1, 'Statistik: 1 Einsatz abgeschlossen');

  // Level-Up: XP an die nächste Schwelle setzen, dann Bau-Abschluss löst grantXp aus
  const lvlBefore = st.progression.level;
  db.prepare('UPDATE coa_state SET xp = ? WHERE discord_id=?').run(CFG2.LEVEL.xpFor(lvlBefore + 1), ME.id);
  backdateBuild();
  coaRouter.finalizeDue();
  st = await get('/api/clash-of-acls/state');
  assert.ok(st.progression.level >= lvlBefore + 1, `Level-Aufstieg (${lvlBefore} → ${st.progression.level})`);
  assert.ok(notifs.some(n => n.type === 'coa_levelup'), 'Level-Up-Benachrichtigung erzeugt');

  // ══ Phase 3: Täglicher Login-Bonus ═════════════════════════
  assert.equal(st.daily.available, true, 'Daily-Bonus verfügbar');
  const d1 = await post('/api/clash-of-acls/daily');
  assert.equal(d1.status, 200, 'Daily-Claim ok: ' + JSON.stringify(d1.json.error || ''));
  assert.equal(d1.json.day, 1, 'Erster Claim = Tag 1');
  assert.equal(d1.json.streak, 1, 'Streak startet bei 1');
  assert.ok(d1.json.rewards.money > 0, 'Daily-Belohnung enthält Geld');
  assert.equal(d1.json.daily.available, false, 'Daily nach Claim nicht mehr verfügbar');
  const d2 = await post('/api/clash-of-acls/daily');
  assert.equal(d2.status, 400, 'Doppelter Daily-Claim abgelehnt');
  db.prepare('UPDATE coa_state SET daily_last = ? WHERE discord_id=?')
    .run(new Date(Date.now() - 86400000).toISOString().slice(0, 10), ME.id);
  const d3 = await post('/api/clash-of-acls/daily');
  assert.equal(d3.status, 200, 'Daily-Claim am Folgetag ok');
  assert.equal(d3.json.streak, 2, 'Streak zählt weiter');
  assert.equal(d3.json.day, 2, 'Tag 2 des Zyklus');

  // ══ Phase 3: Quests (täglich + wöchentlich) ════════════════
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.quests.daily.list.length, 3, '3 Tages-Quests gelost');
  assert.equal(st.quests.weekly.list.length, 3, '3 Wochen-Quests gelost');
  assert.ok(st.quests.daily.resetInSec > 0 && st.quests.daily.resetInSec <= 86400, 'Daily-Reset-Countdown plausibel');
  assert.ok(st.quests.weekly.resetInSec > 0 && st.quests.weekly.resetInSec <= 7 * 86400, 'Weekly-Reset-Countdown plausibel');
  const unfinished = st.quests.daily.list.find(q => !q.claimed && q.progress < q.target);
  if (unfinished) {
    const notDone = await post('/api/clash-of-acls/quest-claim', { period: 'daily', quest_key: unfinished.quest_key });
    assert.equal(notDone.status, 400, 'Unfertige Quest nicht abholbar');
  }
  const dq = unfinished || st.quests.daily.list.find(q => !q.claimed);
  assert.ok(dq, 'Mindestens eine unabgeholte Tages-Quest vorhanden');
  db.prepare('UPDATE coa_quests SET progress = ? WHERE discord_id=? AND period_key=? AND quest_key=?')
    .run(dq.target, ME.id, CFG2.periodKey('daily'), dq.quest_key);
  const xpBeforeClaim = st.progression.xp;
  const claim = await post('/api/clash-of-acls/quest-claim', { period: 'daily', quest_key: dq.quest_key });
  assert.equal(claim.status, 200, 'Quest-Claim ok: ' + JSON.stringify(claim.json.error || ''));
  assert.ok(claim.json.xp > 0, 'Quest gibt XP');
  assert.ok(claim.json.progression.xp > xpBeforeClaim, 'XP nach Quest-Claim gestiegen');
  assert.ok(claim.json.quests.daily.list.find(q => q.quest_key === dq.quest_key).claimed, 'Quest als abgeholt markiert');
  const claimTwice = await post('/api/clash-of-acls/quest-claim', { period: 'daily', quest_key: dq.quest_key });
  assert.equal(claimTwice.status, 400, 'Doppelter Quest-Claim abgelehnt');

  // ══ Phase 3: Bugfix Mitarbeiter-Slots inkl. Forschung ══════
  // personalwesen Stufe 1 (aus Phase-2-Test) → 2 Basis-Slots + 1 = 3
  db.prepare('UPDATE coa_state SET money=999999 WHERE discord_id=?').run(ME.id);
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.employeeSlots, 3, 'Slots = 2 Basis + 1 Forschung');
  for (let i = 0; i < 3; i++) {
    const h = await post('/api/clash-of-acls/hire', { emp_type: 'azubi' });
    assert.equal(h.status, 200, `Hire ${i + 1}/3 ok (Forschungs-Slot zählt): ` + JSON.stringify(h.json.error || ''));
  }
  const h4 = await post('/api/clash-of-acls/hire', { emp_type: 'azubi' });
  assert.equal(h4.status, 400, 'Vierter Hire ohne freien Slot abgelehnt');

  console.log('✓ Alle Smoke-Tests bestanden (Clash of ACLS, inkl. Einsätze + Forschung + Progression)');
  finish(0);
})().catch(e => { console.error('✗ Test fehlgeschlagen:', e.message); finish(1); });

function finish(code) {
  process.exitCode = code;
  server.close(() => { try { db.close(); } catch {} });
}
