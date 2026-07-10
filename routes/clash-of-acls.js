const express = require('express');
const CFG = require('../public/js/clash-of-acls-config.js');

// Clash of ACLS — Grid-Aufbauspiel (Phase 1: Kernschleife).
// Server-authoritativ wie Auto Empire: der Client meldet nie einen Ressourcenstand,
// er löst nur Aktionen aus (place/upgrade/manufacture/hire/sell). Produktion wird bei
// jedem Request aus der verstrichenen Zeit seit `last_tick_at` nachgerechnet.
module.exports = function ({ db, requireLogin, coinIdent, addCoins, createNotif, queueNotification, rateLimit }) {
  const router = express.Router();

  const BASE_EMPLOYEE_SLOTS = 2;

  const toSqliteUTC = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const asDate = (sqliteStr) => new Date(sqliteStr + 'Z');

  function getOrCreateState(ident) {
    let s = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    if (!s) {
      db.transaction(() => {
        db.prepare('INSERT INTO coa_state (discord_id, username) VALUES (?, ?)').run(ident.id, ident.name);
        const insBuilding = db.prepare('INSERT INTO coa_buildings (discord_id, building_key, x, y, level) VALUES (?,?,?,?,1)');
        CFG.STARTER_KIT.forEach((b) => insBuilding.run(ident.id, b.key, b.x, b.y));
      })();
      s = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    }
    return s;
  }

  function getBuildings(discordId) {
    return db.prepare('SELECT * FROM coa_buildings WHERE discord_id = ?').all(discordId);
  }
  function getEmployees(discordId) {
    return db.prepare('SELECT * FROM coa_employees WHERE discord_id = ?').all(discordId);
  }
  function officeLevel(buildings) {
    const o = buildings.find((b) => b.building_key === 'office');
    return o ? o.level : 0;
  }

  function computeCaps(buildings) {
    const caps = { ...CFG.BASE_CAP };
    buildings.forEach((b) => {
      if (b.level < 1) return;
      const bonus = CFG.BUILDINGS[b.building_key]?.effect?.capBonus?.(b.level);
      if (bonus) Object.keys(bonus).forEach((r) => { caps[r] = (caps[r] || 0) + bonus[r]; });
    });
    return caps;
  }

  // Generalisten (linkedBuilding=null) wirken auf jedes Produktionsgebäude, Spezialisten
  // nur auf ihr verknüpftes Gebäude — Bonus ist additiv auf die Basisrate.
  function computeRatesPerHour(buildings, employees) {
    const rates = { money: 0, steel: 0, parts: 0, electronics: 0, fuel: 0 };
    let generatorPct = 0;
    buildings.forEach((b) => {
      if (b.level >= 1 && b.building_key === 'generator') {
        generatorPct += CFG.BUILDINGS.generator.effect.globalProdPct(b.level);
      }
    });
    buildings.forEach((b) => {
      if (b.level < 1) return;
      const def = CFG.BUILDINGS[b.building_key];
      const per = def?.effect?.perHour?.(b.level);
      if (!per) return;
      let bonusPct = 0;
      employees.forEach((e) => {
        const ed = CFG.EMPLOYEES[e.emp_type];
        if (!ed) return;
        if (ed.linkedBuilding === b.building_key || ed.linkedBuilding === null) bonusPct += ed.bonusPerLevel * e.level;
      });
      const mult = 1 + bonusPct + generatorPct / 100;
      Object.keys(per).forEach((r) => { rates[r] = (rates[r] || 0) + per[r] * mult; });
    });
    return rates;
  }

  function sellBonusPct(buildings, employees) {
    let pct = 0;
    buildings.forEach((b) => {
      if (b.level < 1) return;
      if (b.building_key === 'tuningzentrum') pct += CFG.BUILDINGS.tuningzentrum.effect.sellValuePct(b.level);
      if (b.building_key === 'fahrzeughandel') pct += CFG.BUILDINGS.fahrzeughandel.effect.sellBonusPct(b.level);
    });
    employees.forEach((e) => { if (e.emp_type === 'tuner') pct += CFG.EMPLOYEES.tuner.bonusPerLevel * e.level * 100; });
    return pct;
  }

  function rarityBonusPct(buildings, employees) {
    let pct = 0;
    buildings.forEach((b) => { if (b.level >= 1 && b.building_key === 'lackiererei') pct += CFG.BUILDINGS.lackiererei.effect.rarityBonusPct(b.level); });
    employees.forEach((e) => { if (e.emp_type === 'lackierer') pct += CFG.EMPLOYEES.lackierer.bonusPerLevel * e.level * 100; });
    return pct;
  }

  function employeeSlots(buildings) {
    let slots = BASE_EMPLOYEE_SLOTS;
    buildings.forEach((b) => { if (b.level >= 1 && b.building_key === 'personalbuero') slots += CFG.BUILDINGS.personalbuero.effect.employeeSlots(b.level); });
    return slots;
  }

  // Rechnet passive Produktion seit last_tick_at nach, gedeckelt durch Lagerkapazität.
  function syncResources(discordId) {
    const s = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(discordId);
    const elapsedSec = Math.max(0, (Date.now() - asDate(s.last_tick_at).getTime()) / 1000);
    if (elapsedSec < 1) return s;
    const buildings = getBuildings(discordId);
    const employees = getEmployees(discordId);
    const rates = computeRatesPerHour(buildings, employees);
    const caps = computeCaps(buildings);
    const next = {};
    CFG.RESOURCES.forEach((r) => { next[r] = Math.min(caps[r], s[r] + (rates[r] * elapsedSec) / 3600); });
    const moneyGain = Math.max(0, Math.round(next.money) - s.money);
    db.prepare(`UPDATE coa_state SET money=?, steel=?, parts=?, electronics=?, fuel=?, total_earned = total_earned + ?, last_tick_at = datetime('now') WHERE discord_id = ?`)
      .run(Math.round(next.money), Math.round(next.steel), Math.round(next.parts), Math.round(next.electronics), Math.round(next.fuel), moneyGain, discordId);
    return db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(discordId);
  }

  function finalizeOneBuild(q) {
    db.transaction(() => {
      db.prepare('UPDATE coa_buildings SET level = ? WHERE id = ?').run(q.target_level, q.building_ref_id);
      db.prepare('DELETE FROM coa_build_queue WHERE id = ?').run(q.id);
    })();
    const def = CFG.BUILDINGS[q.building_key];
    const label = typeof def?.label === 'function' ? def.label(q.target_level) : (def?.label || q.building_key);
    createNotif(q.discord_id, 'coa_build_done', { kind: 'building', building: label, level: q.target_level });
    queueNotification('coa_build_done', q.discord_id, { kind: 'building', building: label, level: q.target_level });
  }

  function finalizeOneManufacture(q, allBuildings, allEmployees) {
    const vdef = CFG.VEHICLES[q.vehicle_key];
    if (!vdef) { db.prepare('DELETE FROM coa_manufacture_queue WHERE id = ?').run(q.id); return; }
    const bonus = rarityBonusPct(allBuildings, allEmployees);
    const value = Math.round(vdef.baseValue * (1 + (bonus / 100) * Math.random()));
    db.transaction(() => {
      db.prepare('INSERT INTO coa_vehicles (discord_id, vehicle_key, rarity, value) VALUES (?,?,?,?)').run(q.discord_id, q.vehicle_key, vdef.rarity, value);
      db.prepare('DELETE FROM coa_manufacture_queue WHERE id = ?').run(q.id);
    })();
    createNotif(q.discord_id, 'coa_build_done', { kind: 'vehicle', vehicle: vdef.label });
    queueNotification('coa_build_done', q.discord_id, { kind: 'vehicle', vehicle: vdef.label });
  }

  // Wird pro Request UND von einem minütlichen Cron-Sweep in server.js aufgerufen,
  // damit fällige Aufträge auch abgeschlossen werden, wenn der Spieler offline ist.
  function finalizeDueForAll() {
    const dueBuilds = db.prepare("SELECT * FROM coa_build_queue WHERE finish_at <= datetime('now')").all();
    dueBuilds.forEach(finalizeOneBuild);
    const dueMakes = db.prepare("SELECT * FROM coa_manufacture_queue WHERE finish_at <= datetime('now')").all();
    const cache = new Map();
    dueMakes.forEach((q) => {
      if (!cache.has(q.discord_id)) cache.set(q.discord_id, { b: getBuildings(q.discord_id), e: getEmployees(q.discord_id) });
      const { b, e } = cache.get(q.discord_id);
      finalizeOneManufacture(q, b, e);
    });
  }

  function canAfford(state, cost) {
    return Object.entries(cost).every(([r, amt]) => (state[r] || 0) >= amt);
  }
  function deduct(discordId, state, cost) {
    const next = { ...state };
    Object.entries(cost).forEach(([r, amt]) => { next[r] -= amt; });
    db.prepare('UPDATE coa_state SET money=?, steel=?, parts=?, electronics=?, fuel=? WHERE discord_id=?')
      .run(next.money, next.steel, next.parts, next.electronics, next.fuel, discordId);
  }

  function buildView(ident) {
    finalizeDueForAll();
    const state = syncResources(ident.id);
    const buildings = getBuildings(ident.id);
    const employees = getEmployees(ident.id);
    const vehicles = db.prepare('SELECT * FROM coa_vehicles WHERE discord_id = ? AND sold_at IS NULL ORDER BY created_at DESC').all(ident.id);
    const offLvl = officeLevel(buildings);
    const activeBuild = db.prepare('SELECT * FROM coa_build_queue WHERE discord_id = ?').get(ident.id) || null;
    const activeManufacture = db.prepare(`
      SELECT mq.* FROM coa_manufacture_queue mq JOIN coa_buildings b ON b.id = mq.building_id WHERE b.discord_id = ?
    `).all(ident.id);
    return {
      resources: { money: state.money, steel: state.steel, parts: state.parts, electronics: state.electronics, fuel: state.fuel },
      caps: computeCaps(buildings),
      ratesPerHour: computeRatesPerHour(buildings, employees),
      totalEarned: state.total_earned,
      unlockedCells: CFG.BUILDINGS.office.effect.unlockedCells(Math.max(1, offLvl)),
      officeLevel: offLvl,
      buildings: buildings.map((b) => ({ id: b.id, building_key: b.building_key, x: b.x, y: b.y, level: b.level })),
      employees,
      employeeSlots: employeeSlots(buildings),
      vehicles,
      activeBuild,
      activeManufacture,
    };
  }

  // ── State ──
  router.get('/api/clash-of-acls/state', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    getOrCreateState(ident);
    res.json(buildView(ident));
  });

  // ── Gebäude platzieren ──
  router.post('/api/clash-of-acls/place', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const { building_key, x, y } = req.body || {};
    const def = CFG.BUILDINGS[building_key];
    if (!def) return res.status(400).json({ error: 'Unbekanntes Gebäude' });
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= CFG.GRID.W || y >= CFG.GRID.H) {
      return res.status(400).json({ error: 'Ungültige Koordinate' });
    }
    const buildings = getBuildings(ident.id);
    const offLvl = officeLevel(buildings);
    if (!CFG.isUnlocked(x, y, CFG.BUILDINGS.office.effect.unlockedCells(Math.max(1, offLvl)))) {
      return res.status(400).json({ error: 'Zelle noch nicht freigeschaltet' });
    }
    if (buildings.some((b) => b.x === x && b.y === y)) return res.status(400).json({ error: 'Zelle bereits belegt' });
    if (def.singleton && buildings.some((b) => b.building_key === building_key)) {
      return res.status(400).json({ error: 'Gebäude existiert bereits' });
    }
    if (db.prepare('SELECT 1 FROM coa_build_queue WHERE discord_id = ?').get(ident.id)) {
      return res.status(400).json({ error: 'Es läuft bereits ein Bauauftrag' });
    }
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const cost = def.cost(1);
    if (!canAfford(state, cost)) return res.status(400).json({ error: 'Nicht genug Ressourcen' });

    db.transaction(() => {
      deduct(ident.id, state, cost);
      const row = db.prepare('INSERT INTO coa_buildings (discord_id, building_key, x, y, level) VALUES (?,?,?,?,0)').run(ident.id, building_key, x, y);
      const finishAt = toSqliteUTC(Date.now() + def.buildTimeSec(1) * 1000);
      db.prepare('INSERT INTO coa_build_queue (discord_id, building_ref_id, building_key, x, y, target_level, finish_at) VALUES (?,?,?,?,?,1,?)')
        .run(ident.id, row.lastInsertRowid, building_key, x, y, finishAt);
    })();
    res.json({ ok: true, ...buildView(ident) });
  });

  // ── Gebäude leveln ──
  router.post('/api/clash-of-acls/upgrade', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    finalizeDueForAll();
    const { building_id } = req.body || {};
    const building = db.prepare('SELECT * FROM coa_buildings WHERE id = ? AND discord_id = ?').get(building_id, ident.id);
    if (!building) return res.status(404).json({ error: 'Gebäude nicht gefunden' });
    if (building.level < 1) return res.status(400).json({ error: 'Gebäude ist noch im Bau' });
    const def = CFG.BUILDINGS[building.building_key];
    const targetLevel = building.level + 1;
    if (targetLevel > def.maxLevel) return res.status(400).json({ error: 'Maximales Level erreicht' });
    if (building.building_key !== 'office') {
      const buildings = getBuildings(ident.id);
      const cap = CFG.BUILDINGS.office.effect.otherMaxLevel(Math.max(1, officeLevel(buildings)));
      if (targetLevel > cap) return res.status(400).json({ error: 'Büro-Level zu niedrig für dieses Upgrade' });
    }
    if (db.prepare('SELECT 1 FROM coa_build_queue WHERE discord_id = ?').get(ident.id)) {
      return res.status(400).json({ error: 'Es läuft bereits ein Bauauftrag' });
    }
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const cost = def.cost(targetLevel);
    if (!canAfford(state, cost)) return res.status(400).json({ error: 'Nicht genug Ressourcen' });

    db.transaction(() => {
      deduct(ident.id, state, cost);
      const finishAt = toSqliteUTC(Date.now() + def.buildTimeSec(targetLevel) * 1000);
      db.prepare('INSERT INTO coa_build_queue (discord_id, building_ref_id, building_key, x, y, target_level, finish_at) VALUES (?,?,?,?,?,?,?)')
        .run(ident.id, building.id, building.building_key, building.x, building.y, targetLevel, finishAt);
    })();
    res.json({ ok: true, ...buildView(ident) });
  });

  // ── Fahrzeug fertigen (Garage) ──
  router.post('/api/clash-of-acls/manufacture', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    finalizeDueForAll();
    const { building_id, vehicle_key } = req.body || {};
    const building = db.prepare("SELECT * FROM coa_buildings WHERE id = ? AND discord_id = ? AND building_key = 'garage'").get(building_id, ident.id);
    if (!building || building.level < 1) return res.status(404).json({ error: 'Garage nicht gefunden' });
    const vdef = CFG.VEHICLES[vehicle_key];
    if (!vdef) return res.status(400).json({ error: 'Unbekanntes Fahrzeug' });
    const def = CFG.BUILDINGS.garage;
    if (vdef.tier > def.effect.unlockedTier(building.level)) return res.status(400).json({ error: 'Fahrzeug noch nicht freigeschaltet' });
    if (db.prepare('SELECT 1 FROM coa_manufacture_queue WHERE building_id = ?').get(building.id)) {
      return res.status(400).json({ error: 'Diese Garage fertigt bereits ein Fahrzeug' });
    }
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    if (!canAfford(state, def.manufactureCost)) return res.status(400).json({ error: 'Nicht genug Rohstoffe' });

    db.transaction(() => {
      deduct(ident.id, state, def.manufactureCost);
      const finishAt = toSqliteUTC(Date.now() + def.effect.manufactureTimeSec(building.level) * 1000);
      db.prepare('INSERT INTO coa_manufacture_queue (discord_id, building_id, vehicle_key, finish_at) VALUES (?,?,?,?)')
        .run(ident.id, building.id, vehicle_key, finishAt);
    })();
    res.json({ ok: true, ...buildView(ident) });
  });

  // ── Mitarbeiter einstellen/entlassen/leveln ──
  router.post('/api/clash-of-acls/hire', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    finalizeDueForAll();
    const { emp_type } = req.body || {};
    if (!CFG.EMPLOYEES[emp_type]) return res.status(400).json({ error: 'Unbekannter Mitarbeitertyp' });
    const buildings = getBuildings(ident.id);
    const employees = getEmployees(ident.id);
    if (employees.length >= employeeSlots(buildings)) return res.status(400).json({ error: 'Keine freien Mitarbeiter-Slots' });
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const cost = CFG.empHireCost(employees.length);
    if (state.money < cost) return res.status(400).json({ error: 'Nicht genug Geld' });
    db.transaction(() => {
      deduct(ident.id, state, { money: cost });
      db.prepare('INSERT INTO coa_employees (discord_id, emp_type, level) VALUES (?,?,1)').run(ident.id, emp_type);
    })();
    res.json({ ok: true, ...buildView(ident) });
  });

  router.post('/api/clash-of-acls/fire/:id', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    const row = db.prepare('SELECT 1 FROM coa_employees WHERE id = ? AND discord_id = ?').get(req.params.id, ident.id);
    if (!row) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
    db.prepare('DELETE FROM coa_employees WHERE id = ?').run(req.params.id);
    res.json({ ok: true, ...buildView(ident) });
  });

  router.post('/api/clash-of-acls/employee/:id/levelup', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    const emp = db.prepare('SELECT * FROM coa_employees WHERE id = ? AND discord_id = ?').get(req.params.id, ident.id);
    if (!emp) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });
    if (emp.level >= CFG.EMP_MAX_LEVEL) return res.status(400).json({ error: 'Maximales Level erreicht' });
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const cost = CFG.empLevelCost(emp.level);
    if (state.money < cost) return res.status(400).json({ error: 'Nicht genug Geld' });
    db.transaction(() => {
      deduct(ident.id, state, { money: cost });
      db.prepare('UPDATE coa_employees SET level = level + 1 WHERE id = ?').run(emp.id);
    })();
    res.json({ ok: true, ...buildView(ident) });
  });

  // ── Fahrzeug verkaufen ──
  router.post('/api/clash-of-acls/sell/:id', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    finalizeDueForAll();
    const vehicle = db.prepare('SELECT * FROM coa_vehicles WHERE id = ? AND discord_id = ? AND sold_at IS NULL').get(req.params.id, ident.id);
    if (!vehicle) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    const buildings = getBuildings(ident.id);
    const employees = getEmployees(ident.id);
    const state = syncResources(ident.id);
    const caps = computeCaps(buildings);
    const price = Math.round(vehicle.value * (1 + sellBonusPct(buildings, employees) / 100));
    const credited = Math.max(0, Math.min(caps.money, state.money + price) - state.money);
    db.transaction(() => {
      db.prepare('UPDATE coa_vehicles SET sold_at = datetime(\'now\') WHERE id = ?').run(vehicle.id);
      db.prepare('UPDATE coa_state SET money = ?, total_earned = total_earned + ? WHERE discord_id = ?').run(state.money + credited, credited, ident.id);
    })();
    res.json({ ok: true, credited, ...buildView(ident) });
  });

  // ── Bauzeit gegen ACLS-Coins verkürzen (Stretch, kein Shop-Bezug) ──
  router.post('/api/clash-of-acls/speedup', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 10, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    const q = db.prepare('SELECT * FROM coa_build_queue WHERE discord_id = ?').get(ident.id);
    if (!q) return res.status(400).json({ error: 'Kein aktiver Bauauftrag' });
    const remainingSec = Math.max(0, (asDate(q.finish_at).getTime() - Date.now()) / 1000);
    if (remainingSec < 30) return res.status(400).json({ error: 'Bauauftrag ist fast fertig' });
    const cost = Math.max(10, Math.ceil(remainingSec / 60) * 2);
    const newBalance = addCoins(ident.id, ident.name, -cost, 'coa_speedup', { building_key: q.building_key });
    if (newBalance === null) return res.status(400).json({ error: `Nicht genug ACLS-Coins (${cost} nötig)` });
    db.prepare("UPDATE coa_build_queue SET finish_at = datetime('now') WHERE id = ?").run(q.id);
    finalizeDueForAll();
    res.json({ ok: true, cost, ...buildView(ident) });
  });

  // ── Rangliste ──
  router.get('/api/clash-of-acls/leaderboard', requireLogin, (req, res) => {
    res.json(db.prepare('SELECT username, total_earned FROM coa_state WHERE total_earned > 0 ORDER BY total_earned DESC LIMIT 15').all());
  });

  router.finalizeDue = finalizeDueForAll;
  return router;
};
