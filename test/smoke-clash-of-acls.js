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
let currentUser = ME; // umschaltbar für Phase-6-PvP-Test (zweiter simulierter Spieler)
const coinIdent = () => ({ id: currentUser.id, name: currentUser.name });

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
  assert.equal(sell.json.vehicleCodex.abschleppwagen, 1, 'Kompendium-Zähler bleibt nach Verkauf erhalten (Lebenszeit-Stückzahl)');

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

  // ══ Phase 4: Kampfsystem (Werkschutz + Überfälle) ══════════
  const noCenterTrain = await post('/api/clash-of-acls/train', { unit_key: 'wachmann' });
  assert.equal(noCenterTrain.status, 400, 'Ausbildung ohne Sicherheitszentrale abgelehnt');
  // Zentrale direkt in die DB legen (Bauzeit überspringen), Level 4 → Tier 2, Kapazität 12
  db.prepare("INSERT INTO coa_buildings (discord_id, building_key, x, y, level) VALUES (?,?,9,0,4)").run(ME.id, 'sicherheitszentrale');
  db.prepare('UPDATE coa_state SET money=999999, steel=9999, parts=9999, electronics=9999, fuel=9999 WHERE discord_id=?').run(ME.id);

  const badTier = await post('/api/clash-of-acls/train', { unit_key: 'sicherheitstruck' });
  assert.equal(badTier.status, 400, 'Tier-3-Einheit mit Zentrale-Level 4 abgelehnt');
  const t1 = await post('/api/clash-of-acls/train', { unit_key: 'wachmann' });
  assert.equal(t1.status, 200, 'Ausbildung gestartet: ' + JSON.stringify(t1.json.error || ''));
  assert.ok(t1.json.activeTraining && t1.json.activeTraining.remaining_sec > 0, 'Ausbildung liefert Restzeit');
  const t2 = await post('/api/clash-of-acls/train', { unit_key: 'wachmann' });
  assert.equal(t2.status, 400, 'Nur eine Ausbildung gleichzeitig');
  db.prepare("UPDATE coa_unit_queue SET finish_at = datetime('now','-1 minute')").run();
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.units.length, 1, 'Einheit nach Ausbildung im Trupp');
  assert.equal(st.security.unitCap, 12, 'Zentrale Level 4 = 12 Kapazität');
  assert.equal(st.security.unlockedUnitTier, 2, 'Zentrale Level 4 = Tier 2');

  // Zwei weitere Einheiten für den Überfall ausbilden
  for (const k of ['wachhund', 'drohne']) {
    const t = await post('/api/clash-of-acls/train', { unit_key: k });
    assert.equal(t.status, 200, `Ausbildung ${k} ok`);
    db.prepare("UPDATE coa_unit_queue SET finish_at = datetime('now','-1 minute')").run();
    await get('/api/clash-of-acls/state');
  }
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.units.length, 3, '3 Einheiten im Trupp');

  const noUnits = await post('/api/clash-of-acls/raid', { raid_key: 'schrottdiebe', unit_ids: [] });
  assert.equal(noUnits.status, 400, 'Überfall ohne Einheiten abgelehnt');
  const foreign = await post('/api/clash-of-acls/raid', { raid_key: 'schrottdiebe', unit_ids: [999999] });
  assert.equal(foreign.status, 400, 'Überfall mit fremder/unbekannter Einheit abgelehnt');
  const ids = st.units.map(u => u.id);
  const r1 = await post('/api/clash-of-acls/raid', { raid_key: 'schrottdiebe', unit_ids: ids });
  assert.equal(r1.status, 200, 'Überfall gestartet: ' + JSON.stringify(r1.json.error || ''));
  assert.ok(r1.json.activeRaid && r1.json.activeRaid.remaining_sec > 0, 'Überfall liefert Restzeit');
  assert.ok(r1.json.units.every(u => u.raid_id), 'Einheiten als gebunden markiert');
  const r2 = await post('/api/clash-of-acls/raid', { raid_key: 'schrottdiebe', unit_ids: ids });
  assert.equal(r2.status, 400, 'Nur ein Überfall gleichzeitig (und Einheiten gebunden)');

  // Auflösen: 51 atk vs. 30 power → 95 % Siegchance (praktisch sicher, aber RNG-tolerant prüfen)
  db.prepare("UPDATE coa_raids SET finish_at = datetime('now','-1 minute') WHERE resolved_at IS NULL").run();
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.activeRaid, null, 'Überfall aufgelöst');
  assert.equal(st.raidReports.length, 1, 'Kampfbericht abgelegt');
  const rep = st.raidReports[0];
  assert.ok(typeof rep.won === 'boolean' && rep.atk === 51 && rep.power === 30, 'Kampfbericht enthält Stärken: ' + JSON.stringify(rep));
  assert.ok(rep.chance === 95, 'Siegchance korrekt berechnet (95 %)');
  assert.equal(st.stats.raids_done, 1, 'Überfall-Zähler erhöht');
  if (rep.won) {
    assert.ok(rep.loot.money > 0, 'Beute im Bericht');
    assert.equal(st.stats.raids_won, 1, 'Sieg-Zähler erhöht');
    assert.ok(st.achievements.find(a => a.key === 'kampf1')?.unlocked, 'Erfolg „Erster Schlag" freigeschaltet');
  }
  assert.ok(st.units.every(u => !u.raid_id), 'Überlebende Einheiten wieder frei');
  assert.ok(notifs.some(n => n.type === 'coa_raid_done'), 'Überfall-Benachrichtigung erzeugt');

  // ══ Phase 5: Kampagne / Questline ══════════════════════════
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.campaign.total, 24, '24 Kampagnenschritte im View');
  assert.equal(st.campaign.chapters.length, 6, '6 Kapitel im View');
  // c1_1 (upgrade), c1_3 (vehicle), c1_4 (sell) sind durch frühere Testschritte längst erfüllt
  const c1_1 = st.campaign.chapters[0].steps.find(s => s.key === 'c1_1');
  assert.ok(c1_1.claimable, 'c1_1 (erstes Upgrade) claimable, da Testlauf schon Gebäude ausgebaut hat');
  const c1_2 = st.campaign.chapters[0].steps.find(s => s.key === 'c1_2');
  assert.ok(c1_2.claimable, 'c1_2 (Mitarbeiter) claimable — Testlauf hat aktive Mitarbeiter eingestellt');

  const c6_4 = st.campaign.chapters[5].steps.find(s => s.key === 'c6_4');
  assert.equal(c6_4.claimable, false, 'c6_4 (Level 20) noch nicht erreichbar');
  const noCond = await post('/api/clash-of-acls/campaign-claim', { step_key: 'c6_4' });
  assert.equal(noCond.status, 400, 'Claim ohne erfüllte Bedingung abgelehnt');
  const unknown = await post('/api/clash-of-acls/campaign-claim', { step_key: 'nope' });
  assert.equal(unknown.status, 400, 'Claim mit unbekanntem Schritt abgelehnt');

  const moneyBeforeCamp = st.resources.money;
  const claim1 = await post('/api/clash-of-acls/campaign-claim', { step_key: 'c1_1' });
  assert.equal(claim1.status, 200, 'Kampagnenschritt-Claim ok: ' + JSON.stringify(claim1.json.error || ''));
  assert.ok(claim1.json.resources.money > moneyBeforeCamp, 'Belohnung gutgeschrieben');
  assert.equal(claim1.json.campaign.claimedCount, 1, 'claimedCount = 1 nach erstem Claim');
  const campClaimTwice = await post('/api/clash-of-acls/campaign-claim', { step_key: 'c1_1' });
  assert.equal(campClaimTwice.status, 400, 'Doppelter Kampagnen-Claim abgelehnt');

  // Nachholen außer der Reihe: Level gezielt auf 5 setzen → c3_4 (Kapitel 3) sofort
  // claimable, OBWOHL c2_1/c2_2 (Kapitel 2, unabhängige Stats) noch offen sind.
  db.prepare('UPDATE coa_state SET xp = ?, level = 5 WHERE discord_id=?').run(CFG2.LEVEL.xpFor(5), ME.id);
  st = await get('/api/clash-of-acls/state');
  assert.ok(st.progression.level >= 5, 'Level gezielt auf >=5 gesetzt: ' + st.progression.level);
  const c2_1 = st.campaign.chapters[1].steps.find(s => s.key === 'c2_1');
  assert.equal(c2_1.claimed, false, 'c2_1 (Kapitel 2) bewusst noch offen gelassen');
  const c3_4 = st.campaign.chapters[2].steps.find(s => s.key === 'c3_4');
  assert.ok(c3_4.claimable, 'c3_4 (Level 5, Kapitel 3) claimable trotz offenem Kapitel 2 — Reihenfolge-unabhängig');
  const claimSkip = await post('/api/clash-of-acls/campaign-claim', { step_key: 'c3_4' });
  assert.equal(claimSkip.status, 200, 'Nachhol-Claim eines späteren Kapitels ok: ' + JSON.stringify(claimSkip.json.error || ''));

  // ══ Phase 6: PvP-Angriffe (zweiter simulierter Spieler) ═══
  const THEM = { id: 'TESTER2', name: 'Rivale' };
  currentUser = THEM;
  const stThem = await get('/api/clash-of-acls/state');
  assert.equal(stThem.buildings.length, 5, 'Zweiter Spieler startet mit Startkit');
  db.prepare('UPDATE coa_state SET level = 5, xp = ? WHERE discord_id=?').run(CFG2.LEVEL.xpFor(5), THEM.id);
  db.prepare("INSERT INTO coa_buildings (discord_id, building_key, x, y, level) VALUES (?, 'sicherheitszentrale', 9, 0, 4)").run(THEM.id);
  db.prepare("INSERT INTO coa_units (discord_id, unit_key) VALUES (?, 'wachmann')").run(THEM.id);
  currentUser = ME;

  // ME braucht garantiert verfügbare Einheiten (unabhängig vom RNG-Ausgang der Phase-4-Überfälle)
  db.prepare("INSERT INTO coa_units (discord_id, unit_key) VALUES (?, 'sicherheitstruck'), (?, 'sicherheitstruck')").run(ME.id, ME.id);

  const noSelfAttack = await post('/api/clash-of-acls/pvp-attack', { defender_id: ME.id, unit_ids: [] });
  assert.equal(noSelfAttack.status, 400, 'Selbstangriff abgelehnt');

  const targets = await get('/api/clash-of-acls/pvp/targets');
  assert.ok(Array.isArray(targets), 'Ziel-Liste ist ein Array');
  assert.ok(targets.some(t => t.discord_id === THEM.id), 'Zweiter Spieler erscheint als PvP-Ziel: ' + JSON.stringify(targets));

  st = await get('/api/clash-of-acls/state');
  const myAvailUnits = st.units.filter(u => !u.raid_id);
  assert.ok(myAvailUnits.length >= 2, 'Mindestens 2 verfügbare Einheiten für den Angriffstest: ' + myAvailUnits.length);
  const atkIds = myAvailUnits.map(u => u.id);
  // Erwartete Trupp-Stärke dynamisch berechnen — die genaue Zusammensetzung hängt vom
  // RNG-Ausgang des früheren Phase-4-Überfalltests ab (welche Einheiten dort überlebt haben).
  const expectedAtk = myAvailUnits.reduce((s, u) => s + (CFG2.UNITS[u.unit_key]?.atk || 0), 0);

  const noUnitsAtk = await post('/api/clash-of-acls/pvp-attack', { defender_id: THEM.id, unit_ids: [] });
  assert.equal(noUnitsAtk.status, 400, 'Angriff ohne Einheiten abgelehnt');

  const atk1 = await post('/api/clash-of-acls/pvp-attack', { defender_id: THEM.id, unit_ids: atkIds });
  assert.equal(atk1.status, 200, 'PvP-Angriff ok: ' + JSON.stringify(atk1.json.error || ''));
  assert.ok(typeof atk1.json.won === 'boolean' && atk1.json.atkPower === expectedAtk && atk1.json.defPower === 14,
    'Angriffsergebnis plausibel: ' + JSON.stringify({ won: atk1.json.won, atk: atk1.json.atkPower, expectedAtk, def: atk1.json.defPower }));
  assert.equal(atk1.json.pvp.attacksToday, 1, 'Tageszähler erhöht');

  const cdAtk = await post('/api/clash-of-acls/pvp-attack', { defender_id: THEM.id, unit_ids: atkIds });
  assert.equal(cdAtk.status, 400, 'Cooldown auf dasselbe Ziel greift sofort danach');

  currentUser = THEM;
  const stThemAfter = await get('/api/clash-of-acls/state');
  assert.ok(stThemAfter.pvp.shieldRemainingSec > 0, 'Verteidiger hat nach dem Angriff ein Schild: ' + stThemAfter.pvp.shieldRemainingSec);
  assert.equal(stThemAfter.pvp.attacksReceived.length, 1, 'Angriff im „Gegen mich"-Bericht des Verteidigers');
  currentUser = ME;

  if (atk1.json.won) {
    assert.ok(Object.values(atk1.json.loot).some((v) => v > 0), 'Beute bei Sieg > 0');
    assert.equal(atk1.json.pvp.wins, 1, 'Sieg-Zähler erhöht');
  } else {
    assert.equal(atk1.json.pvp.losses, 1, 'Niederlagen-Zähler erhöht');
    assert.deepEqual(atk1.json.loot, {}, 'Keine Beute bei Niederlage');
  }

  // Einsteigerschutz: frischer Spieler (Level 1) ist nie angreifbar
  const NEWBIE = { id: 'TESTER3', name: 'Neuling' };
  currentUser = NEWBIE;
  await get('/api/clash-of-acls/state');
  currentUser = ME;
  const newbieAtk = await post('/api/clash-of-acls/pvp-attack', { defender_id: NEWBIE.id, unit_ids: atkIds });
  assert.equal(newbieAtk.status, 400, 'Einsteigerschutz greift (Level < 3)');
  const newbieTargets = await get('/api/clash-of-acls/pvp/targets');
  assert.ok(!newbieTargets.some((t) => t.discord_id === NEWBIE.id), 'Neuling taucht nicht in der Zielliste auf');

  // ══ Phase 7: Gilden (auf dem Club-System) + Events ═════════
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.clan, null, 'Ohne Club-Mitgliedschaft ist clan=null');

  // Club direkt in der DB anlegen (routes/clubs.js ist im Test-Harness nicht gemountet)
  const clubIns = db.prepare("INSERT INTO clubs (name, tag, logo_emoji, founder_did) VALUES ('Testrennstall', 'TRS', '🏎️', ?)").run(ME.id);
  const clubId = clubIns.lastInsertRowid;
  db.prepare("INSERT INTO club_members (club_id, discord_id, username, role) VALUES (?,?,?,'president')").run(clubId, ME.id, ME.name);

  const noDonate = await post('/api/clash-of-acls/clan/donate', { resource: 'money', amount: 0 });
  assert.equal(noDonate.status, 400, 'Spende mit Menge 0 abgelehnt');
  db.prepare('UPDATE coa_state SET money = 999999 WHERE discord_id=?').run(ME.id);
  const donate1 = await post('/api/clash-of-acls/clan/donate', { resource: 'money', amount: 1000 });
  assert.equal(donate1.status, 200, 'Spende ok: ' + JSON.stringify(donate1.json.error || ''));
  assert.equal(donate1.json.points, 1000, 'Geld hat Gewichtung 1 → 1000 Punkte');
  assert.ok(donate1.json.clan.points >= 1000, 'Gildenpunkte im View gestiegen');
  const lvlAfter1000 = donate1.json.clan.level;
  const prodPctBefore = donate1.json.mods.prodPct;

  const donate2 = await post('/api/clash-of-acls/clan/donate', { resource: 'steel', amount: 500 });
  assert.equal(donate2.status, 200, 'Zweite Spende (Stahl, Gewichtung 2) ok');
  assert.equal(donate2.json.clan.points, 1000 + 1000, 'Stahl-Spende bringt 500×2=1000 Punkte, macht 2000 gesamt');
  assert.ok(donate2.json.clan.level >= lvlAfter1000, 'Gildenlevel steigt mit mehr Punkten nicht rückwärts');
  assert.equal(donate2.json.clan.level, 1, 'Gildenlevel 1 exakt bei 2000 Punkten (pointsFor(1)=2000)');
  assert.ok(donate2.json.mods.prodPct === prodPctBefore + CFG2.CLAN.bonusPct(1),
    `Gildenbonus (+${CFG2.CLAN.bonusPct(1)}%) korrekt in mods.prodPct eingerechnet: ${prodPctBefore} → ${donate2.json.mods.prodPct}`);

  const insufficient = await post('/api/clash-of-acls/clan/donate', { resource: 'fuel', amount: 999999 });
  assert.equal(insufficient.status, 400, 'Spende ohne genug Ressourcen abgelehnt');

  // Gildenkrieg: frische Einheit + frischer Überfall NACH Club-Beitritt, um den
  // Punktezuwachs eindeutig zuordnen zu können
  db.prepare("INSERT INTO coa_units (discord_id, unit_key) VALUES (?, 'sicherheitstruck'), (?, 'sicherheitstruck'), (?, 'sicherheitstruck')").run(ME.id, ME.id, ME.id);
  const warScoreBefore = (await get('/api/clash-of-acls/state')).clan.war.score;
  const preRaid = await get('/api/clash-of-acls/state');
  const freshUnits = preRaid.units.filter(u => !u.raid_id).map(u => u.id);
  const clanRaid = await post('/api/clash-of-acls/raid', { raid_key: 'schrottdiebe', unit_ids: freshUnits });
  assert.equal(clanRaid.status, 200, 'Überfall für Gildenkriegs-Test gestartet');
  const myRaidId = clanRaid.json.activeRaid.id;
  db.prepare("UPDATE coa_raids SET finish_at = datetime('now','-1 minute') WHERE resolved_at IS NULL").run();
  st = await get('/api/clash-of-acls/state');
  // Über die Raid-ID direkt in der DB nachschlagen statt raidReports[0] zu vertrauen —
  // bei mehreren im selben Sekundenfenster aufgelösten Überfällen (SQLite datetime('now')
  // hat nur Sekundenauflösung) ist die ORDER-BY-resolved_at-Reihenfolge sonst mehrdeutig.
  const myRaidRow = db.prepare('SELECT result FROM coa_raids WHERE id = ?').get(myRaidId);
  const raidWon = JSON.parse(myRaidRow.result).won;
  const expectedScoreDelta = raidWon ? CFG2.CLAN_WAR.raidWinPoints : 0;
  assert.equal(st.clan.war.score, warScoreBefore + expectedScoreDelta,
    `Gildenkriegs-Score korrekt aktualisiert (Überfall ${raidWon ? 'gewonnen' : 'verloren'}): ${warScoreBefore} → ${st.clan.war.score}`);

  // Vergangene Gildenkriegs-Woche simulieren und abholen
  db.prepare("INSERT INTO coa_clan_war (club_id, period_key, score) VALUES (?, '2020-W01', 200)").run(clubId);
  st = await get('/api/clash-of-acls/state');
  assert.ok(st.clan.lastWeek && st.clan.lastWeek.claimable, 'Vergangene Woche mit Silber-Stufe ist claimable: ' + JSON.stringify(st.clan.lastWeek));
  assert.equal(st.clan.lastWeek.tier, 'Silber', 'Score 200 entspricht Silber-Stufe');
  const warClaim = await post('/api/clash-of-acls/clan/war-claim');
  assert.equal(warClaim.status, 200, 'Gildenkriegs-Claim ok: ' + JSON.stringify(warClaim.json.error || ''));
  assert.equal(warClaim.json.tier, 'Silber', 'Abgeholte Stufe ist Silber');
  const warClaimTwice = await post('/api/clash-of-acls/clan/war-claim');
  assert.equal(warClaimTwice.status, 400, 'Doppelter Gildenkriegs-Claim abgelehnt');

  // ── Events ──
  st = await get('/api/clash-of-acls/state');
  assert.ok(st.event, 'Sommer-Event ist aktiv (Systemzeit liegt im Fenster): ' + JSON.stringify(st.event));
  assert.equal(st.event.key, 'sommer2026', 'Richtiges Event aktiv');
  assert.ok(st.event.balance > 0, 'Event-Marken bereits durch frühere Aktionen (Bau/Einsätze/Überfälle) verdient: ' + st.event.balance);

  const badItem = await post('/api/clash-of-acls/event-buy', { item_key: 'nope' });
  assert.equal(badItem.status, 400, 'Unbekanntes Event-Item abgelehnt');
  const cheapest = st.event.shop.reduce((a, b) => (a.cost <= b.cost ? a : b));
  db.prepare('UPDATE coa_event_currency SET amount = ? WHERE discord_id=? AND event_key=?').run(9999, ME.id, st.event.key);
  const buy1 = await post('/api/clash-of-acls/event-buy', { item_key: cheapest.key });
  assert.equal(buy1.status, 200, 'Event-Kauf ok: ' + JSON.stringify(buy1.json.error || ''));
  assert.equal(buy1.json.event.balance, 9999 - cheapest.cost, 'Marken korrekt abgezogen');

  db.prepare('UPDATE coa_event_currency SET amount = 0 WHERE discord_id=? AND event_key=?').run(ME.id, st.event.key);
  const poorBuy = await post('/api/clash-of-acls/event-buy', { item_key: cheapest.key });
  assert.equal(poorBuy.status, 400, 'Kauf ohne genug Marken abgelehnt');

  // ══ Phase 8: Liga/Saison (wöchentlicher Auf-/Abstieg) ══════
  st = await get('/api/clash-of-acls/state');
  assert.ok(st.league && typeof st.league.tier === 'number', 'Liga-Objekt im View: ' + JSON.stringify(st.league));
  assert.equal(st.league.tier, 0, 'Startet in Liga-Stufe 0 (Holz)');
  assert.ok(st.league.points > 0, 'Liga-Punkte bereits durch frühere XP-Aktionen gesammelt: ' + st.league.points);

  // Wochenwechsel simulieren (alte Periode + genug Punkten für Aufstieg nach Bronze)
  const moneyBeforePromo = st.resources.money;
  db.prepare("UPDATE coa_state SET league_period = '2020-W01', league_points = 500 WHERE discord_id=?").run(ME.id);
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.league.tier, 1, 'Aufstieg nach Rollover mit genug Punkten (Bronze): ' + JSON.stringify(st.league));
  assert.equal(st.league.points, 0, 'Punkte nach Rollover für neue Woche zurückgesetzt');
  assert.ok(st.resources.money > moneyBeforePromo, 'Aufstiegs-Belohnung gutgeschrieben');
  assert.ok(notifs.some(n => n.type === 'coa_league_promo'), 'Liga-Aufstiegs-Benachrichtigung erzeugt');
  assert.equal(st.league.peakTier, 1, 'league_peak_tier auf 1 aktualisiert');

  // Abstieg simulieren: alte Periode + zu wenige Punkte für die aktuelle (Bronze-)Stufe
  db.prepare("UPDATE coa_state SET league_period = '2020-W02', league_points = 10 WHERE discord_id=?").run(ME.id);
  st = await get('/api/clash-of-acls/state');
  assert.equal(st.league.tier, 0, 'Abstieg nach Rollover mit zu wenig Punkten (zurück zu Holz)');
  assert.equal(st.league.peakTier, 1, 'league_peak_tier bleibt trotz Abstieg bei 1 (bestbewertete Stufe)');

  const lgLb = await get('/api/clash-of-acls/league/leaderboard');
  assert.ok(Array.isArray(lgLb.list), 'Liga-Rangliste ist ein Array');
  assert.ok(lgLb.myRank === null || lgLb.myRank >= 1, 'Eigener Liga-Rang plausibel (0 Punkte diese Woche können außerhalb der Top 25 liegen)');

  // ══ Phase 8: Prestige (Werkstatt-Reset gegen dauerhafte Boni) ══
  const noConfirm = await post('/api/clash-of-acls/prestige', {});
  assert.equal(noConfirm.status, 400, 'Prestige ohne Bestätigung abgelehnt');
  const noOffice = await post('/api/clash-of-acls/prestige', { confirm: true });
  assert.equal(noOffice.status, 400, 'Prestige mit zu niedrigem Büro-Level abgelehnt (Büro ist noch Level 1)');

  // Büro direkt auf Level 8 heben (Bauzeit im Test überspringen, wie an anderer Stelle üblich)
  const officeRow = db.prepare("SELECT id FROM coa_buildings WHERE discord_id=? AND building_key='office'").get(ME.id);
  db.prepare('UPDATE coa_buildings SET level = 8 WHERE id = ?').run(officeRow.id);

  // Delta seit letztem Prestige künstlich auf 0 setzen → "noch nicht genug verdient"
  const s0 = db.prepare('SELECT total_earned FROM coa_state WHERE discord_id=?').get(ME.id);
  db.prepare('UPDATE coa_state SET total_earned_at_last_prestige = ? WHERE discord_id=?').run(s0.total_earned, ME.id);
  const tooSoon = await post('/api/clash-of-acls/prestige', { confirm: true });
  assert.equal(tooSoon.status, 400, 'Prestige ohne genug frisch verdientes Geld abgelehnt');

  // Reichlich frisch verdientes Geld seit dem letzten Prestige simulieren
  db.prepare('UPDATE coa_state SET total_earned = 999999999, total_earned_at_last_prestige = 0 WHERE discord_id=?').run(ME.id);
  st = await get('/api/clash-of-acls/state');
  assert.ok(st.prestige.eligible, 'Prestige jetzt möglich (Büro Level 8): ' + JSON.stringify(st.prestige));
  assert.ok(st.prestige.potentialPoints > 0, 'Punktepotential > 0: ' + st.prestige.potentialPoints);

  const vehiclesBeforePrestige = st.stats.vehicles_built; // Lifetime-Statistik — darf sich NICHT zurücksetzen
  const levelBeforePrestige = st.progression.level;
  const achBeforePrestige = st.achievements.filter(a => a.unlocked).length;

  const doPr = await post('/api/clash-of-acls/prestige', { confirm: true });
  assert.equal(doPr.status, 200, 'Prestige ok: ' + JSON.stringify(doPr.json.error || ''));
  assert.ok(doPr.json.gainedPoints > 0, 'Prestige-Punkte gewonnen: ' + doPr.json.gainedPoints);
  assert.equal(doPr.json.buildings.length, 5, 'Nach Prestige wieder Startkit (5 Gebäude)');
  assert.ok(doPr.json.buildings.every(b => b.level === 1), 'Startkit-Gebäude nach Prestige auf Level 1');
  assert.equal(doPr.json.vehicles.length, 0, 'Fuhrpark nach Prestige geleert');
  assert.equal(Object.keys(doPr.json.researchLevels).length, 0, 'Forschung nach Prestige zurückgesetzt');
  assert.equal(doPr.json.units.length, 0, 'Werkschutz nach Prestige zurückgesetzt');
  assert.equal(doPr.json.progression.level, levelBeforePrestige, 'Spieler-Level bleibt nach Prestige erhalten (kein Reset)');
  assert.equal(doPr.json.stats.vehicles_built, vehiclesBeforePrestige, 'Lifetime-Statistik (Fahrzeuge gefertigt) bleibt erhalten');
  assert.equal(doPr.json.achievements.filter(a => a.unlocked).length, achBeforePrestige, 'Erfolge bleiben nach Prestige erhalten');
  assert.ok(notifs.some(n => n.type === 'coa_prestige'), 'Prestige-Benachrichtigung erzeugt');

  const prAfter = doPr.json.prestige;
  assert.equal(prAfter.resets, 1, 'Reset-Zähler = 1');
  assert.equal(prAfter.points, doPr.json.gainedPoints, 'Prestige-Punkte im View korrekt');

  // Prestige-Upgrades kaufen
  const unknownUp = await post('/api/clash-of-acls/prestige-upgrade', { upgrade_key: 'nope' });
  assert.equal(unknownUp.status, 400, 'Unbekanntes Prestige-Upgrade abgelehnt');

  const prodPctBeforeUp = doPr.json.mods.prodPct;
  const upBuy1 = await post('/api/clash-of-acls/prestige-upgrade', { upgrade_key: 'produktivitaet' });
  assert.equal(upBuy1.status, 200, 'Prestige-Upgrade-Kauf ok: ' + JSON.stringify(upBuy1.json.error || ''));
  assert.equal(upBuy1.json.prestige.upgrades.produktivitaet, 1, 'Upgrade-Level 1 eingetragen');
  assert.equal(upBuy1.json.mods.prodPct, prodPctBeforeUp + 2, 'Prestige-Produktionsbonus fließt in mods.prodPct ein');
  assert.ok(upBuy1.json.prestige.points < prAfter.points, 'Prestige-Punkte nach Kauf verringert');

  // Ohne genug Punkte abgelehnt
  db.prepare('UPDATE coa_prestige SET points = 0 WHERE discord_id=?').run(ME.id);
  const poorUp = await post('/api/clash-of-acls/prestige-upgrade', { upgrade_key: 'markenname' });
  assert.equal(poorUp.status, 400, 'Prestige-Upgrade ohne genug Punkte abgelehnt');

  // ── Cutover: Willkommensbonus aus Auto Empire / Werkstatt-Tycoon ────────────
  const MIGRANT = { id: 'TESTER4', name: 'Alt-Spieler' };
  currentUser = MIGRANT;
  db.prepare('INSERT INTO ae_state (discord_id, total_produced) VALUES (?,?)').run(MIGRANT.id, 40000);
  db.prepare('INSERT INTO users (discord_id, username) VALUES (?,?)').run(MIGRANT.id, MIGRANT.name);
  const migrantUserId = db.prepare('SELECT id FROM users WHERE discord_id=?').get(MIGRANT.id).id;
  db.prepare('INSERT INTO idle_saves (user_id, total_earned) VALUES (?,?)').run(migrantUserId, 10000);

  const firstVisit = await get('/api/clash-of-acls/state');
  assert.deepEqual(firstVisit.retroBonus, { money: 1500, fromEmpire: true, fromTycoon: true },
    'Willkommensbonus aus beiden Altsystemen korrekt berechnet (√40000·5 + √10000·5 = 1000 + 500)');
  assert.equal(firstVisit.resources.money, 1000 + 1500, 'Bonus wurde dem Startguthaben gutgeschrieben');

  const secondVisit = await get('/api/clash-of-acls/state');
  assert.equal(secondVisit.retroBonus, null, 'Bonus wird beim zweiten Aufruf nicht erneut gewährt (retro_migrated)');
  assert.equal(secondVisit.resources.money, firstVisit.resources.money, 'Kein doppelter Bonus im Kontostand');

  // ── Endgame-Inhalte: Tier-4-Freischaltung & generische Direktion-Produktion ──
  const CFG3 = require('../public/js/clash-of-acls-config.js');
  assert.equal(CFG3.BUILDINGS.garage.effect.unlockedTier(12), 3, 'Garage Lv12 schaltet noch nur Tier 3 frei');
  assert.equal(CFG3.BUILDINGS.garage.effect.unlockedTier(13), 4, 'Garage-Maximallevel (13) schaltet Tier 4 (Hypercar) frei');
  assert.equal(CFG3.BUILDINGS.sicherheitszentrale.effect.unlockedUnitTier(9), 3, 'Zentrale Lv9 schaltet noch nur Tier 3 frei');
  assert.equal(CFG3.BUILDINGS.sicherheitszentrale.effect.unlockedUnitTier(10), 4, 'Zentrale-Maximallevel (10) schaltet Tier 4 (Elite-Kommando) frei');
  assert.equal(CFG3.VEHICLES.hypercar.tier, 4, 'Hypercar ist Tier 4');
  assert.equal(CFG3.UNITS.elitekommando.tier, 4, 'Elite-Kommando ist Tier 4');

  // Direktion nutzt denselben globalProdPct-Effekt wie Generator — computeRatesPerHour
  // muss das generisch aufgreifen, nicht nur für building_key 'generator'.
  const baselineRates = await get('/api/clash-of-acls/state');
  assert.equal(baselineRates.ratesPerHour.money, 40, 'Startkit ohne Direktion: nur Abschlepphof Lv1 produziert Geld (40/h)');
  db.prepare("INSERT INTO coa_buildings (discord_id, building_key, x, y, level) VALUES (?,?,?,?,?)").run(MIGRANT.id, 'direktion', 6, 0, 2);
  const withDirektion = await get('/api/clash-of-acls/state');
  assert.ok(Math.abs(withDirektion.ratesPerHour.money - 42.4) < 0.01,
    `Direktion Lv2 (+6% globale Produktion) wirkt generisch: erwartet 42.4, erhalten ${withDirektion.ratesPerHour.money}`);
  currentUser = ME;

  console.log('✓ Alle Smoke-Tests bestanden (Clash of ACLS: Kernschleife, Einsätze, Forschung, Progression, Kampfsystem, Kampagne, PvP, Gilden, Events, Liga, Prestige, Cutover-Migration, Endgame-Inhalte)');
  finish(0);
})().catch(e => { console.error('✗ Test fehlgeschlagen:', e.message); finish(1); });

function finish(code) {
  process.exitCode = code;
  server.close(() => { try { db.close(); } catch {} });
}
