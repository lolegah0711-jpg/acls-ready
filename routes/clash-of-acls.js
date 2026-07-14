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

  // ── Forschung: abgeschlossene Stufen → Modifikator-Objekt (Formel in der Config) ──
  function getResearchLevels(discordId) {
    const levels = {};
    db.prepare('SELECT tech_key, level FROM coa_research WHERE discord_id = ?').all(discordId)
      .forEach((r) => { levels[r.tech_key] = r.level; });
    return levels;
  }
  const getMods = (discordId) => CFG.researchMods(getResearchLevels(discordId));
  const NO_MODS = CFG.researchMods({});

  function researchCenterLevel(buildings) {
    const c = buildings.find((b) => b.building_key === 'forschungszentrum');
    return c ? c.level : 0;
  }
  function securityLevel(buildings) {
    const c = buildings.find((b) => b.building_key === 'sicherheitszentrale');
    return c ? c.level : 0;
  }
  const getUnits = (discordId) => db.prepare('SELECT id, unit_key, raid_id FROM coa_units WHERE discord_id = ?').all(discordId);
  // Einsatz-Slots: bestes (höchstes) Abschlepphof-Level zählt, nicht die Summe.
  function missionSlots(buildings) {
    let best = 0;
    buildings.forEach((b) => { if (b.building_key === 'towyard' && b.level > best) best = b.level; });
    return best >= 1 ? CFG.BUILDINGS.towyard.effect.missionSlots(best) : 0;
  }
  const scaleCost = (cost, reductionPct) =>
    Object.fromEntries(Object.entries(cost).map(([r, v]) => [r, Math.round(v * (1 - reductionPct / 100))]));

  function computeCaps(buildings, mods = NO_MODS) {
    const caps = { ...CFG.BASE_CAP };
    buildings.forEach((b) => {
      if (b.level < 1) return;
      const bonus = CFG.BUILDINGS[b.building_key]?.effect?.capBonus?.(b.level);
      if (bonus) Object.keys(bonus).forEach((r) => { caps[r] = (caps[r] || 0) + bonus[r]; });
    });
    Object.keys(caps).forEach((r) => { caps[r] = Math.round(caps[r] * (1 + mods.capPct / 100)); });
    return caps;
  }

  // Generalisten (linkedBuilding=null) wirken auf jedes Produktionsgebäude, Spezialisten
  // nur auf ihr verknüpftes Gebäude — Bonus ist additiv auf die Basisrate.
  function computeRatesPerHour(buildings, employees, mods = NO_MODS) {
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
    const researchMult = 1 + mods.prodPct / 100;
    Object.keys(rates).forEach((r) => { rates[r] *= researchMult; });
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

  function employeeSlots(buildings, mods = NO_MODS) {
    let slots = BASE_EMPLOYEE_SLOTS + mods.extraEmployeeSlots;
    buildings.forEach((b) => { if (b.level >= 1 && b.building_key === 'personalbuero') slots += CFG.BUILDINGS.personalbuero.effect.employeeSlots(b.level); });
    return slots;
  }

  // Rechnet passive Produktion seit last_tick_at nach, gedeckelt durch Lagerkapazität.
  // Belohnungen (Quests/Daily/Level-Ups/Missionen) dürfen das Lager überfüllen —
  // deshalb kürzt der Sync nie unter den aktuellen Stand, er füllt nur bis zum Cap auf.
  function syncResources(discordId) {
    const s = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(discordId);
    const elapsedSec = Math.max(0, (Date.now() - asDate(s.last_tick_at).getTime()) / 1000);
    if (elapsedSec < 1) return s;
    const buildings = getBuildings(discordId);
    const employees = getEmployees(discordId);
    const mods = getMods(discordId);
    const rates = computeRatesPerHour(buildings, employees, mods);
    const caps = computeCaps(buildings, mods);
    const next = {};
    CFG.RESOURCES.forEach((r) => { next[r] = Math.max(s[r], Math.min(caps[r], s[r] + (rates[r] * elapsedSec) / 3600)); });
    const moneyGain = Math.max(0, Math.round(next.money) - s.money);
    db.prepare(`UPDATE coa_state SET money=?, steel=?, parts=?, electronics=?, fuel=?, total_earned = total_earned + ?, last_tick_at = datetime('now') WHERE discord_id = ?`)
      .run(Math.round(next.money), Math.round(next.steel), Math.round(next.parts), Math.round(next.electronics), Math.round(next.fuel), moneyGain, discordId);
    return db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(discordId);
  }

  // ── Phase 3: Progression (XP/Level, Quests, Erfolge, Daily-Bonus) ──────────

  // Ressourcen-Belohnung gutschreiben (darf das Lager überfüllen, s. syncResources)
  function grantResources(discordId, rewards) {
    const sets = [], vals = [];
    let moneyGain = 0;
    CFG.RESOURCES.forEach((r) => {
      const add = Math.round(rewards[r] || 0);
      if (add <= 0) return;
      sets.push(`${r} = ${r} + ?`); vals.push(add);
      if (r === 'money') moneyGain = add;
    });
    if (!sets.length) return;
    if (moneyGain) { sets.push('total_earned = total_earned + ?'); vals.push(moneyGain); }
    db.prepare(`UPDATE coa_state SET ${sets.join(', ')} WHERE discord_id = ?`).run(...vals, discordId);
  }

  // XP gutschreiben; bei Level-Aufstieg Belohnung + Benachrichtigung
  function grantXp(discordId, amount) {
    if (!amount || amount <= 0) return;
    const s = db.prepare('SELECT xp, level FROM coa_state WHERE discord_id = ?').get(discordId);
    if (!s) return;
    const xp = s.xp + Math.round(amount);
    let level = s.level;
    const rewards = {};
    while (level < CFG.LEVEL.maxLevel && xp >= CFG.LEVEL.xpFor(level + 1)) {
      level++;
      Object.entries(CFG.LEVEL.reward(level)).forEach(([r, v]) => { rewards[r] = (rewards[r] || 0) + v; });
    }
    db.prepare('UPDATE coa_state SET xp = ?, level = ? WHERE discord_id = ?').run(xp, level, discordId);
    if (level > s.level) {
      grantResources(discordId, rewards);
      createNotif(discordId, 'coa_levelup', { level, title: CFG.LEVEL.title(level) });
      queueNotification('coa_levelup', discordId, { level });
    }
  }

  // Sorgt dafür, dass für die aktuelle Periode 3 geloste Quests existieren
  function ensureQuests(discordId, period) {
    const key = CFG.periodKey(period);
    const have = db.prepare('SELECT COUNT(*) AS c FROM coa_quests WHERE discord_id = ? AND period_key = ?').get(discordId, key).c;
    if (!have) {
      const picks = CFG.pickQuests(CFG.QUESTS[period], `${discordId}:${period}:${key}`);
      const ins = db.prepare('INSERT OR IGNORE INTO coa_quests (discord_id, period, period_key, quest_key) VALUES (?,?,?,?)');
      picks.forEach((k) => ins.run(discordId, period, key, k));
    }
    return key;
  }

  // Quest-Fortschritt für eine Aktion erhöhen (beide Perioden, nur unabgeholte)
  function questInc(discordId, metric, amount = 1) {
    ['daily', 'weekly'].forEach((period) => {
      const key = ensureQuests(discordId, period);
      Object.entries(CFG.QUESTS[period]).forEach(([qk, q]) => {
        if (q.metric !== metric) return;
        db.prepare('UPDATE coa_quests SET progress = progress + ? WHERE discord_id = ? AND period_key = ? AND quest_key = ? AND claimed_at IS NULL')
          .run(Math.round(amount), discordId, key, qk);
      });
    });
  }

  // Statistik-Kontext für Erfolge, Kampagne & Spielerprofil
  function statsCtx(discordId) {
    const s = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(discordId);
    if (!s) return null;
    const buildings = getBuildings(discordId);
    // höchste gebaute Stufe je Gebäudetyp (nicht-Singletons können mehrfach vorkommen)
    const buildingLevels = {};
    buildings.forEach((b) => { buildingLevels[b.building_key] = Math.max(buildingLevels[b.building_key] || 0, b.level); });
    return {
      ...s,
      office_level: officeLevel(buildings),
      buildings_count: buildings.filter((b) => b.level >= 1).length,
      employees_count: db.prepare('SELECT COUNT(*) AS c FROM coa_employees WHERE discord_id = ?').get(discordId).c,
      vehicle_types: db.prepare('SELECT COUNT(DISTINCT vehicle_key) AS c FROM coa_vehicles WHERE discord_id = ?').get(discordId).c,
      research_total: db.prepare('SELECT COALESCE(SUM(level),0) AS s FROM coa_research WHERE discord_id = ?').get(discordId).s,
      units_count: db.prepare('SELECT COUNT(*) AS c FROM coa_units WHERE discord_id = ?').get(discordId).c,
      buildingLevels,
    };
  }

  // Ist ein Kampagnenschritt (unabhängig von der Reihenfolge) inhaltlich erreicht?
  function campaignStepMet(ctx, step) {
    if (step.building) return (ctx.buildingLevels[step.building] || 0) >= step.level;
    return (ctx[step.stat] || 0) >= step.value;
  }

  // Ansicht der Kampagne: pro Schritt Fortschritt/claimed/claimable, gruppiert nach Kapitel
  function campaignView(discordId, ctx) {
    const claimed = new Set(db.prepare('SELECT step_key FROM coa_campaign WHERE discord_id = ?').all(discordId).map((r) => r.step_key));
    const steps = CFG.CAMPAIGN.map((step) => {
      const met = campaignStepMet(ctx, step);
      const cur = step.building ? (ctx.buildingLevels[step.building] || 0) : (ctx[step.stat] || 0);
      const target = step.building ? step.level : step.value;
      return {
        key: step.key, chapter: step.chapter, title: step.title, icon: step.icon, desc: step.desc,
        xp: step.xp, reward: step.reward, final: !!step.final,
        progress: Math.min(cur, target), target,
        claimed: claimed.has(step.key), claimable: met && !claimed.has(step.key),
      };
    });
    return {
      chapters: CFG.CAMPAIGN_CHAPTERS.map((c) => ({ ...c, steps: steps.filter((s) => s.chapter === c.key) })),
      claimedCount: claimed.size, total: steps.length,
    };
  }

  // Alle noch gesperrten Erfolge gegen die aktuellen Zähler prüfen und freischalten
  function checkAchievements(discordId) {
    const unlocked = new Set(db.prepare('SELECT ach_key FROM coa_achievements WHERE discord_id = ?').all(discordId).map((r) => r.ach_key));
    const todo = Object.entries(CFG.ACHIEVEMENTS).filter(([k]) => !unlocked.has(k));
    if (!todo.length) return;
    const ctx = statsCtx(discordId);
    if (!ctx) return;
    todo.forEach(([key, a]) => {
      if ((ctx[a.stat] || 0) < a.value) return;
      const ins = db.prepare('INSERT OR IGNORE INTO coa_achievements (discord_id, ach_key) VALUES (?,?)').run(discordId, key);
      if (!ins.changes) return;
      if (a.money) grantResources(discordId, { money: a.money });
      if (a.xp) grantXp(discordId, a.xp);
      createNotif(discordId, 'coa_achievement', { ach: a.label, xp: a.xp || 0, money: a.money || 0 });
      queueNotification('coa_achievement', discordId, { ach: a.label });
    });
  }

  // Sekunden bis zum nächsten Quest-Reset (UTC-Mitternacht bzw. Montag 00:00 UTC)
  function secToReset(period) {
    const now = new Date();
    const addDays = period === 'weekly' ? 8 - (now.getUTCDay() || 7) : 1;
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + addDays));
    return Math.max(0, Math.round((next - now) / 1000));
  }

  function finalizeOneBuild(q) {
    db.transaction(() => {
      db.prepare('UPDATE coa_buildings SET level = ? WHERE id = ?').run(q.target_level, q.building_ref_id);
      db.prepare('UPDATE coa_state SET upgrades_done = upgrades_done + 1 WHERE discord_id = ?').run(q.discord_id);
      db.prepare('DELETE FROM coa_build_queue WHERE id = ?').run(q.id);
    })();
    const def = CFG.BUILDINGS[q.building_key];
    grantXp(q.discord_id, CFG.XP.build(def?.buildTimeSec ? def.buildTimeSec(q.target_level) : 60));
    questInc(q.discord_id, 'build');
    checkAchievements(q.discord_id);
    const label = typeof def?.label === 'function' ? def.label(q.target_level) : (def?.label || q.building_key);
    createNotif(q.discord_id, 'coa_build_done', { kind: 'building', building: label, level: q.target_level });
    queueNotification('coa_build_done', q.discord_id, { kind: 'building', building: label, level: q.target_level });
  }

  function finalizeOneManufacture(q, allBuildings, allEmployees, mods = NO_MODS) {
    const vdef = CFG.VEHICLES[q.vehicle_key];
    if (!vdef) { db.prepare('DELETE FROM coa_manufacture_queue WHERE id = ?').run(q.id); return; }
    const bonus = rarityBonusPct(allBuildings, allEmployees);
    const value = Math.round(vdef.baseValue * (1 + (bonus / 100) * Math.random()) * (1 + mods.vehicleValuePct / 100));
    db.transaction(() => {
      db.prepare('INSERT INTO coa_vehicles (discord_id, vehicle_key, rarity, value) VALUES (?,?,?,?)').run(q.discord_id, q.vehicle_key, vdef.rarity, value);
      db.prepare('UPDATE coa_state SET vehicles_built = vehicles_built + 1 WHERE discord_id = ?').run(q.discord_id);
      db.prepare('DELETE FROM coa_manufacture_queue WHERE id = ?').run(q.id);
    })();
    grantXp(q.discord_id, CFG.XP.vehicle(vdef.baseValue));
    questInc(q.discord_id, 'vehicle');
    checkAchievements(q.discord_id);
    createNotif(q.discord_id, 'coa_build_done', { kind: 'vehicle', vehicle: vdef.label });
    queueNotification('coa_build_done', q.discord_id, { kind: 'vehicle', vehicle: vdef.label });
  }

  // Forschung abgeschlossen: Stufe dauerhaft eintragen, Queue leeren.
  function finalizeOneResearch(q) {
    const tech = CFG.RESEARCH[q.tech_key];
    db.transaction(() => {
      db.prepare(`INSERT INTO coa_research (discord_id, tech_key, level) VALUES (?,?,?)
        ON CONFLICT(discord_id, tech_key) DO UPDATE SET level = MAX(level, excluded.level)`).run(q.discord_id, q.tech_key, q.target_level);
      db.prepare('UPDATE coa_state SET researches_done = researches_done + 1 WHERE discord_id = ?').run(q.discord_id);
      db.prepare('DELETE FROM coa_research_queue WHERE id = ?').run(q.id);
    })();
    if (tech) {
      grantXp(q.discord_id, CFG.XP.research(tech.timeSec(q.target_level)));
      questInc(q.discord_id, 'research');
      checkAchievements(q.discord_id);
      createNotif(q.discord_id, 'coa_research_done', { tech: tech.label, level: q.target_level });
      queueNotification('coa_research_done', q.discord_id, { tech: tech.label, level: q.target_level });
    }
  }

  // Einsatz abgeschlossen: Belohnung (× Einsatzleitung-Forschung) gutschreiben,
  // Fahrzeug freigeben, Zähler/XP/Quests erhöhen. Belohnung darf das Lager überfüllen.
  function finalizeOneMission(m) {
    const def = CFG.MISSIONS[m.mission_key];
    if (!def) { db.prepare('DELETE FROM coa_missions WHERE id = ?').run(m.id); return; }
    syncResources(m.discord_id);
    const mods = getMods(m.discord_id);
    const factor = 1 + mods.missionRewardPct / 100;
    const rewards = Object.fromEntries(Object.entries(def.rewards).map(([r, v]) => [r, Math.round(v * factor)]));
    db.transaction(() => {
      grantResources(m.discord_id, rewards);
      db.prepare('UPDATE coa_state SET missions_done = missions_done + 1 WHERE discord_id = ?').run(m.discord_id);
      db.prepare('DELETE FROM coa_missions WHERE id = ?').run(m.id);
    })();
    grantXp(m.discord_id, def.xp || 20);
    questInc(m.discord_id, 'mission');
    if (rewards.money) questInc(m.discord_id, 'earn', rewards.money);
    checkAchievements(m.discord_id);
    createNotif(m.discord_id, 'coa_mission_done', { mission: def.label, money: rewards.money || 0 });
    queueNotification('coa_mission_done', m.discord_id, { mission: def.label });
  }

  // Ausbildung abgeschlossen: Einheit in die Truppe übernehmen.
  function finalizeOneTraining(q) {
    const u = CFG.UNITS[q.unit_key];
    db.transaction(() => {
      db.prepare('INSERT INTO coa_units (discord_id, unit_key) VALUES (?,?)').run(q.discord_id, q.unit_key);
      db.prepare('DELETE FROM coa_unit_queue WHERE id = ?').run(q.id);
    })();
    if (u) {
      grantXp(q.discord_id, CFG.XP.unit(u.atk));
      checkAchievements(q.discord_id);
      createNotif(q.discord_id, 'coa_build_done', { kind: 'unit', unit: u.label });
      queueNotification('coa_build_done', q.discord_id, { kind: 'unit', unit: u.label });
    }
  }

  // Überfall auflösen: Sieg würfeln (Trupp-Stärke vs. Lager-Stärke), Verluste pro
  // Einheit würfeln, Beute/XP gutschreiben und den Kampfbericht dauerhaft ablegen.
  function finalizeOneRaid(r) {
    const def = CFG.RAIDS[r.raid_key];
    const units = db.prepare('SELECT * FROM coa_units WHERE raid_id = ?').all(r.id);
    if (!def) {
      db.transaction(() => {
        db.prepare('UPDATE coa_units SET raid_id = NULL WHERE raid_id = ?').run(r.id);
        db.prepare('DELETE FROM coa_raids WHERE id = ?').run(r.id);
      })();
      return;
    }
    const atk = units.reduce((s, u) => s + (CFG.UNITS[u.unit_key]?.atk || 0), 0);
    const winP = CFG.COMBAT.winChance(atk, def.power);
    const won = Math.random() < winP;
    const lossP = CFG.COMBAT.lossChance(won, winP);
    const lost = [], survivors = [];
    units.forEach((u) => (Math.random() < lossP ? lost : survivors).push(u));
    // Ein Sieg löscht nie den ganzen Trupp aus — eine Einheit humpelt immer zurück.
    if (won && !survivors.length && lost.length) survivors.push(lost.pop());
    const loot = won ? def.loot : {};
    const xpGain = won ? def.xp : Math.ceil(def.xp / 2);
    const result = {
      won, chance: Math.round(winP * 100), atk, power: def.power,
      loot, lost: lost.map((u) => u.unit_key), survivors: survivors.length, xp: xpGain,
    };
    db.transaction(() => {
      lost.forEach((u) => db.prepare('DELETE FROM coa_units WHERE id = ?').run(u.id));
      db.prepare('UPDATE coa_units SET raid_id = NULL WHERE raid_id = ?').run(r.id);
      if (won) grantResources(r.discord_id, loot);
      db.prepare(`UPDATE coa_state SET raids_done = raids_done + 1${won ? ', raids_won = raids_won + 1' : ''} WHERE discord_id = ?`).run(r.discord_id);
      db.prepare("UPDATE coa_raids SET resolved_at = datetime('now'), result = ? WHERE id = ?").run(JSON.stringify(result), r.id);
    })();
    grantXp(r.discord_id, xpGain);
    questInc(r.discord_id, 'raid');
    if (won && loot.money) questInc(r.discord_id, 'earn', loot.money);
    checkAchievements(r.discord_id);
    createNotif(r.discord_id, 'coa_raid_done', { raid: def.label, won, money: loot.money || 0, lost: lost.length });
    queueNotification('coa_raid_done', r.discord_id, { raid: def.label, won });
  }

  // Wird pro Request UND von einem minütlichen Cron-Sweep in server.js aufgerufen,
  // damit fällige Aufträge auch abgeschlossen werden, wenn der Spieler offline ist.
  function finalizeDueForAll() {
    // Forschung zuerst: dann gelten neue Modifikatoren schon für die folgenden Abschlüsse
    db.prepare("SELECT * FROM coa_research_queue WHERE finish_at <= datetime('now')").all().forEach(finalizeOneResearch);
    const dueBuilds = db.prepare("SELECT * FROM coa_build_queue WHERE finish_at <= datetime('now')").all();
    dueBuilds.forEach(finalizeOneBuild);
    const dueMakes = db.prepare("SELECT * FROM coa_manufacture_queue WHERE finish_at <= datetime('now')").all();
    const cache = new Map();
    dueMakes.forEach((q) => {
      if (!cache.has(q.discord_id)) cache.set(q.discord_id, { b: getBuildings(q.discord_id), e: getEmployees(q.discord_id), m: getMods(q.discord_id) });
      const { b, e, m } = cache.get(q.discord_id);
      finalizeOneManufacture(q, b, e, m);
    });
    db.prepare("SELECT * FROM coa_missions WHERE finish_at <= datetime('now')").all().forEach(finalizeOneMission);
    db.prepare("SELECT * FROM coa_unit_queue WHERE finish_at <= datetime('now')").all().forEach(finalizeOneTraining);
    db.prepare("SELECT * FROM coa_raids WHERE resolved_at IS NULL AND finish_at <= datetime('now')").all().forEach(finalizeOneRaid);
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
    // Offline-Report: war der Spieler >30 min weg, zeigen wir was sich angesammelt hat
    const before = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const awaySec = before ? Math.max(0, (Date.now() - asDate(before.last_tick_at).getTime()) / 1000) : 0;
    const state = syncResources(ident.id);
    const offline = awaySec > 1800
      ? { sec: Math.round(awaySec), gains: Object.fromEntries(CFG.RESOURCES.map((r) => [r, Math.max(0, state[r] - before[r])])) }
      : null;
    const buildings = getBuildings(ident.id);
    const employees = getEmployees(ident.id);
    const researchLevels = getResearchLevels(ident.id);
    const mods = CFG.researchMods(researchLevels);
    // on_mission markiert Fahrzeuge, die gerade einen Einsatz fahren (nicht verkaufbar)
    const vehicles = db.prepare(`
      SELECT v.*, CASE WHEN m.id IS NULL THEN 0 ELSE 1 END AS on_mission
      FROM coa_vehicles v LEFT JOIN coa_missions m ON m.vehicle_id = v.id
      WHERE v.discord_id = ? AND v.sold_at IS NULL ORDER BY v.created_at DESC
    `).all(ident.id);
    const offLvl = officeLevel(buildings);
    // remaining_sec/total_sec server-seitig mitliefern: der Client soll SQLite-Timestamps
    // nie selbst parsen ('YYYY-MM-DD HH:MM:SS' ist kein valides Date-Format in Safari/Firefox)
    // und ist so auch gegen falsch gehende Client-Uhren immun.
    const activeBuild = db.prepare(`
      SELECT *,
        CAST(strftime('%s', finish_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER)      AS remaining_sec,
        CAST(strftime('%s', finish_at) AS INTEGER) - CAST(strftime('%s', started_at) AS INTEGER) AS total_sec
      FROM coa_build_queue WHERE discord_id = ?
    `).get(ident.id) || null;
    const activeManufacture = db.prepare(`
      SELECT mq.*,
        CAST(strftime('%s', mq.finish_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER)         AS remaining_sec,
        CAST(strftime('%s', mq.finish_at) AS INTEGER) - CAST(strftime('%s', mq.started_at) AS INTEGER) AS total_sec
      FROM coa_manufacture_queue mq JOIN coa_buildings b ON b.id = mq.building_id WHERE b.discord_id = ?
    `).all(ident.id);
    const activeResearch = db.prepare(`
      SELECT *,
        CAST(strftime('%s', finish_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER)      AS remaining_sec,
        CAST(strftime('%s', finish_at) AS INTEGER) - CAST(strftime('%s', started_at) AS INTEGER) AS total_sec
      FROM coa_research_queue WHERE discord_id = ?
    `).get(ident.id) || null;
    const activeMissions = db.prepare(`
      SELECT m.*, v.vehicle_key,
        CAST(strftime('%s', m.finish_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER)        AS remaining_sec,
        CAST(strftime('%s', m.finish_at) AS INTEGER) - CAST(strftime('%s', m.started_at) AS INTEGER) AS total_sec
      FROM coa_missions m JOIN coa_vehicles v ON v.id = m.vehicle_id
      WHERE m.discord_id = ? ORDER BY m.finish_at ASC
    `).all(ident.id);
    // ── Phase 4: Werkschutz & Überfälle ──
    const secLvl = securityLevel(buildings);
    const units = getUnits(ident.id);
    const activeTraining = db.prepare(`
      SELECT *,
        CAST(strftime('%s', finish_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER)      AS remaining_sec,
        CAST(strftime('%s', finish_at) AS INTEGER) - CAST(strftime('%s', started_at) AS INTEGER) AS total_sec
      FROM coa_unit_queue WHERE discord_id = ?
    `).get(ident.id) || null;
    const activeRaid = db.prepare(`
      SELECT id, raid_key,
        CAST(strftime('%s', finish_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER)      AS remaining_sec,
        CAST(strftime('%s', finish_at) AS INTEGER) - CAST(strftime('%s', started_at) AS INTEGER) AS total_sec
      FROM coa_raids WHERE discord_id = ? AND resolved_at IS NULL
    `).get(ident.id) || null;
    const raidReports = db.prepare(`
      SELECT raid_key, result, resolved_at FROM coa_raids
      WHERE discord_id = ? AND resolved_at IS NOT NULL ORDER BY resolved_at DESC LIMIT 6
    `).all(ident.id).map((r) => { let res = {}; try { res = JSON.parse(r.result || '{}'); } catch {} return { raid_key: r.raid_key, ...res }; });
    // ── Phase 3: Progression, Daily-Bonus, Quests, Erfolge, Statistiken ──
    const level = state.level, xp = state.xp;
    const today = CFG.periodKey('daily');
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const nextStreak = state.daily_last === yesterday ? state.daily_streak + 1 : 1;
    const nextDay = ((nextStreak - 1) % CFG.DAILY_BONUS.cycleDays) + 1;
    const questView = (period) => {
      const key = ensureQuests(ident.id, period);
      const rows = db.prepare('SELECT quest_key, progress, claimed_at FROM coa_quests WHERE discord_id = ? AND period_key = ?').all(ident.id, key);
      return {
        resetInSec: secToReset(period),
        list: rows.map((r) => {
          const q = CFG.QUESTS[period][r.quest_key];
          if (!q) return null;
          return {
            quest_key: r.quest_key, label: q.label, icon: q.icon, desc: CFG.questDesc(q),
            target: q.target, progress: Math.min(r.progress, q.target), claimed: !!r.claimed_at,
            xp: q.xp, reward: q.reward(level),
          };
        }).filter(Boolean),
      };
    };
    const ctx = statsCtx(ident.id);
    const unlockedAch = new Set(db.prepare('SELECT ach_key FROM coa_achievements WHERE discord_id = ?').all(ident.id).map((r) => r.ach_key));
    return {
      resources: { money: state.money, steel: state.steel, parts: state.parts, electronics: state.electronics, fuel: state.fuel },
      caps: computeCaps(buildings, mods),
      ratesPerHour: computeRatesPerHour(buildings, employees, mods),
      totalEarned: state.total_earned,
      missionsDone: state.missions_done,
      unlockedCells: CFG.BUILDINGS.office.effect.unlockedCells(Math.max(1, offLvl)),
      officeLevel: offLvl,
      researchCenterLevel: researchCenterLevel(buildings),
      researchLevels,
      mods,
      buildings: buildings.map((b) => ({ id: b.id, building_key: b.building_key, x: b.x, y: b.y, level: b.level })),
      employees,
      employeeSlots: employeeSlots(buildings, mods),
      missionSlots: missionSlots(buildings),
      vehicles,
      activeBuild,
      activeManufacture,
      activeResearch,
      activeMissions,
      security: {
        level: secLvl,
        unitCap: secLvl >= 1 ? CFG.BUILDINGS.sicherheitszentrale.effect.unitCap(secLvl) : 0,
        unlockedUnitTier: secLvl >= 1 ? CFG.BUILDINGS.sicherheitszentrale.effect.unlockedUnitTier(secLvl) : 0,
      },
      units,
      activeTraining,
      activeRaid,
      raidReports,
      offline,
      progression: {
        xp, level,
        title: CFG.LEVEL.title(level),
        xpThis: CFG.LEVEL.xpFor(level),
        xpNext: level < CFG.LEVEL.maxLevel ? CFG.LEVEL.xpFor(level + 1) : null,
      },
      daily: {
        available: state.daily_last !== today,
        streak: state.daily_streak,
        nextDay,
        preview: CFG.DAILY_BONUS.rewards(nextDay, level),
        previewXp: CFG.DAILY_BONUS.xp(nextDay),
        cycle: CFG.DAILY_BONUS.days.map((_, i) => CFG.DAILY_BONUS.rewards(i + 1, level)),
      },
      quests: { daily: questView('daily'), weekly: questView('weekly') },
      campaign: campaignView(ident.id, ctx),
      achievements: Object.entries(CFG.ACHIEVEMENTS).map(([key, a]) => ({
        key, label: a.label, icon: a.icon, desc: a.desc, xp: a.xp, money: a.money,
        value: a.value, progress: Math.min(ctx[a.stat] || 0, a.value), unlocked: unlockedAch.has(key),
      })),
      stats: {
        upgrades_done: ctx.upgrades_done, vehicles_built: ctx.vehicles_built, vehicles_sold: ctx.vehicles_sold,
        missions_done: ctx.missions_done, researches_done: ctx.researches_done, total_earned: ctx.total_earned,
        buildings_count: ctx.buildings_count, employees_count: ctx.employees_count,
        vehicle_types: ctx.vehicle_types, research_total: ctx.research_total, daily_streak: ctx.daily_streak,
        raids_done: ctx.raids_done, raids_won: ctx.raids_won, units_count: ctx.units_count,
      },
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
    const mods = getMods(ident.id);
    const cost = scaleCost(def.cost(1), mods.buildCostPct);
    if (!canAfford(state, cost)) return res.status(400).json({ error: 'Nicht genug Ressourcen' });

    db.transaction(() => {
      deduct(ident.id, state, cost);
      const row = db.prepare('INSERT INTO coa_buildings (discord_id, building_key, x, y, level) VALUES (?,?,?,?,0)').run(ident.id, building_key, x, y);
      const finishAt = toSqliteUTC(Date.now() + Math.round(def.buildTimeSec(1) * (1 - mods.buildTimePct / 100)) * 1000);
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
    const mods = getMods(ident.id);
    const cost = scaleCost(def.cost(targetLevel), mods.buildCostPct);
    if (!canAfford(state, cost)) return res.status(400).json({ error: 'Nicht genug Ressourcen' });

    db.transaction(() => {
      deduct(ident.id, state, cost);
      const finishAt = toSqliteUTC(Date.now() + Math.round(def.buildTimeSec(targetLevel) * (1 - mods.buildTimePct / 100)) * 1000);
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
      const mods = getMods(ident.id);
      const finishAt = toSqliteUTC(Date.now() + Math.round(def.effect.manufactureTimeSec(building.level) * (1 - mods.manuTimePct / 100)) * 1000);
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
    // Wichtig: Mods mitgeben — die Forschung "Personalwesen" erhöht die Slots
    if (employees.length >= employeeSlots(buildings, getMods(ident.id))) return res.status(400).json({ error: 'Keine freien Mitarbeiter-Slots' });
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const cost = CFG.empHireCost(employees.length);
    if (state.money < cost) return res.status(400).json({ error: 'Nicht genug Geld' });
    db.transaction(() => {
      deduct(ident.id, state, { money: cost });
      db.prepare('INSERT INTO coa_employees (discord_id, emp_type, level) VALUES (?,?,1)').run(ident.id, emp_type);
    })();
    questInc(ident.id, 'employee');
    checkAchievements(ident.id);
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
    questInc(ident.id, 'employee');
    res.json({ ok: true, ...buildView(ident) });
  });

  // ── Fahrzeug verkaufen ──
  router.post('/api/clash-of-acls/sell/:id', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    finalizeDueForAll();
    const vehicle = db.prepare('SELECT * FROM coa_vehicles WHERE id = ? AND discord_id = ? AND sold_at IS NULL').get(req.params.id, ident.id);
    if (!vehicle) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    if (db.prepare('SELECT 1 FROM coa_missions WHERE vehicle_id = ?').get(vehicle.id)) {
      return res.status(400).json({ error: 'Fahrzeug ist gerade im Einsatz' });
    }
    const buildings = getBuildings(ident.id);
    const employees = getEmployees(ident.id);
    syncResources(ident.id);
    const price = Math.round(vehicle.value * (1 + sellBonusPct(buildings, employees) / 100));
    db.transaction(() => {
      db.prepare('UPDATE coa_vehicles SET sold_at = datetime(\'now\') WHERE id = ?').run(vehicle.id);
      grantResources(ident.id, { money: price });
      db.prepare('UPDATE coa_state SET vehicles_sold = vehicles_sold + 1 WHERE discord_id = ?').run(ident.id);
    })();
    grantXp(ident.id, CFG.XP.sell(price));
    questInc(ident.id, 'sell');
    questInc(ident.id, 'earn', price);
    checkAchievements(ident.id);
    res.json({ ok: true, credited: price, ...buildView(ident) });
  });

  // ── Einsatz starten: Fahrzeug (>= minTier) fährt die Mission, solange gesperrt ──
  router.post('/api/clash-of-acls/mission', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const { mission_key, vehicle_id } = req.body || {};
    const def = CFG.MISSIONS[mission_key];
    if (!def) return res.status(400).json({ error: 'Unbekannter Einsatz' });
    const buildings = getBuildings(ident.id);
    const slots = missionSlots(buildings);
    if (slots < 1) return res.status(400).json({ error: 'Du brauchst einen fertigen Abschlepphof für Einsätze' });
    const active = db.prepare('SELECT COUNT(*) AS c FROM coa_missions WHERE discord_id = ?').get(ident.id).c;
    if (active >= slots) return res.status(400).json({ error: `Alle ${slots} Einsatz-Slots belegt (Abschlepphof ausbauen)` });
    const vehicle = db.prepare('SELECT * FROM coa_vehicles WHERE id = ? AND discord_id = ? AND sold_at IS NULL').get(vehicle_id, ident.id);
    if (!vehicle) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    if (db.prepare('SELECT 1 FROM coa_missions WHERE vehicle_id = ?').get(vehicle.id)) {
      return res.status(400).json({ error: 'Dieses Fahrzeug ist bereits im Einsatz' });
    }
    const tier = CFG.VEHICLES[vehicle.vehicle_key]?.tier || 1;
    if (tier < def.minTier) return res.status(400).json({ error: `Dieser Einsatz benötigt ein Tier-${def.minTier}-Fahrzeug` });
    const finishAt = toSqliteUTC(Date.now() + def.durationSec * 1000);
    db.prepare('INSERT INTO coa_missions (discord_id, mission_key, vehicle_id, finish_at) VALUES (?,?,?,?)')
      .run(ident.id, mission_key, vehicle.id, finishAt);
    res.json({ ok: true, ...buildView(ident) });
  });

  // ── Forschung starten: Stufe N braucht Forschungszentrum-Level N, eine Queue ──
  router.post('/api/clash-of-acls/research', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const { tech_key } = req.body || {};
    const tech = CFG.RESEARCH[tech_key];
    if (!tech) return res.status(400).json({ error: 'Unbekannte Forschung' });
    const buildings = getBuildings(ident.id);
    const centerLvl = researchCenterLevel(buildings);
    if (centerLvl < 1) return res.status(400).json({ error: 'Du brauchst zuerst ein Forschungszentrum' });
    const current = getResearchLevels(ident.id)[tech_key] || 0;
    const target = current + 1;
    if (target > tech.maxLevel) return res.status(400).json({ error: 'Maximale Forschungsstufe erreicht' });
    if (centerLvl < target) return res.status(400).json({ error: `Stufe ${target} benötigt Forschungszentrum-Level ${target}` });
    if (db.prepare('SELECT 1 FROM coa_research_queue WHERE discord_id = ?').get(ident.id)) {
      return res.status(400).json({ error: 'Es läuft bereits eine Forschung' });
    }
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const cost = tech.cost(target);
    if (!canAfford(state, cost)) return res.status(400).json({ error: 'Nicht genug Ressourcen' });
    const speedPct = CFG.BUILDINGS.forschungszentrum.effect.researchSpeedPct(centerLvl);
    const durSec = Math.max(60, Math.round(tech.timeSec(target) * (1 - speedPct / 100)));
    db.transaction(() => {
      deduct(ident.id, state, cost);
      const finishAt = toSqliteUTC(Date.now() + durSec * 1000);
      db.prepare('INSERT INTO coa_research_queue (discord_id, tech_key, target_level, finish_at) VALUES (?,?,?,?)')
        .run(ident.id, tech_key, target, finishAt);
    })();
    res.json({ ok: true, ...buildView(ident) });
  });

  // ── Bau- oder Forschungszeit gegen ACLS-Coins verkürzen ──
  router.post('/api/clash-of-acls/speedup', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 10, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    const what = (req.body && req.body.what) === 'research' ? 'research' : 'build';
    const table = what === 'research' ? 'coa_research_queue' : 'coa_build_queue';
    const q = db.prepare(`SELECT * FROM ${table} WHERE discord_id = ?`).get(ident.id);
    if (!q) return res.status(400).json({ error: what === 'research' ? 'Keine aktive Forschung' : 'Kein aktiver Bauauftrag' });
    const remainingSec = Math.max(0, (asDate(q.finish_at).getTime() - Date.now()) / 1000);
    if (remainingSec < 30) return res.status(400).json({ error: 'Ist fast fertig — warte kurz' });
    const cost = Math.max(10, Math.ceil(remainingSec / 60) * 2);
    const newBalance = addCoins(ident.id, ident.name, -cost, 'coa_speedup', { what, key: q.building_key || q.tech_key });
    if (newBalance === null) return res.status(400).json({ error: `Nicht genug ACLS-Coins (${cost} nötig)` });
    db.prepare(`UPDATE ${table} SET finish_at = datetime('now') WHERE id = ?`).run(q.id);
    finalizeDueForAll();
    res.json({ ok: true, cost, ...buildView(ident) });
  });

  // ── Einheit ausbilden (Sicherheitszentrale, eine Ausbildung gleichzeitig) ──
  router.post('/api/clash-of-acls/train', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const { unit_key } = req.body || {};
    const u = CFG.UNITS[unit_key];
    if (!u) return res.status(400).json({ error: 'Unbekannte Einheit' });
    const buildings = getBuildings(ident.id);
    const secLvl = securityLevel(buildings);
    if (secLvl < 1) return res.status(400).json({ error: 'Du brauchst zuerst eine Sicherheitszentrale' });
    const def = CFG.BUILDINGS.sicherheitszentrale;
    if (u.tier > def.effect.unlockedUnitTier(secLvl)) {
      return res.status(400).json({ error: `Tier-${u.tier}-Einheiten brauchen Zentrale-Level ${u.tier * 3 - 2}` });
    }
    if (db.prepare('SELECT 1 FROM coa_unit_queue WHERE discord_id = ?').get(ident.id)) {
      return res.status(400).json({ error: 'Es wird bereits eine Einheit ausgebildet' });
    }
    const count = db.prepare('SELECT COUNT(*) AS c FROM coa_units WHERE discord_id = ?').get(ident.id).c;
    if (count >= def.effect.unitCap(secLvl)) {
      return res.status(400).json({ error: 'Trupp voll — Sicherheitszentrale ausbauen für mehr Kapazität' });
    }
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    if (!canAfford(state, u.cost)) return res.status(400).json({ error: 'Nicht genug Ressourcen' });
    db.transaction(() => {
      deduct(ident.id, state, u.cost);
      const finishAt = toSqliteUTC(Date.now() + u.trainTimeSec * 1000);
      db.prepare('INSERT INTO coa_unit_queue (discord_id, unit_key, finish_at) VALUES (?,?,?)').run(ident.id, unit_key, finishAt);
    })();
    res.json({ ok: true, ...buildView(ident) });
  });

  // ── Überfall starten: gewählte Einheiten sind für die Dauer gebunden ──
  router.post('/api/clash-of-acls/raid', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const { raid_key } = req.body || {};
    const unitIds = Array.isArray(req.body?.unit_ids) ? req.body.unit_ids.map(Number).filter(Number.isInteger) : [];
    const def = CFG.RAIDS[raid_key];
    if (!def) return res.status(400).json({ error: 'Unbekanntes Ziel' });
    if (securityLevel(getBuildings(ident.id)) < 1) {
      return res.status(400).json({ error: 'Du brauchst eine fertige Sicherheitszentrale für Überfälle' });
    }
    if (!unitIds.length || unitIds.length > 50) return res.status(400).json({ error: 'Wähle mindestens eine Einheit' });
    if (db.prepare('SELECT 1 FROM coa_raids WHERE discord_id = ? AND resolved_at IS NULL').get(ident.id)) {
      return res.status(400).json({ error: 'Ein Überfall läuft bereits' });
    }
    const ph = unitIds.map(() => '?').join(',');
    const units = db.prepare(`SELECT * FROM coa_units WHERE discord_id = ? AND raid_id IS NULL AND id IN (${ph})`).all(ident.id, ...unitIds);
    if (units.length !== new Set(unitIds).size) return res.status(400).json({ error: 'Einheit nicht verfügbar' });
    db.transaction(() => {
      const finishAt = toSqliteUTC(Date.now() + def.durationSec * 1000);
      const raid = db.prepare('INSERT INTO coa_raids (discord_id, raid_key, finish_at) VALUES (?,?,?)').run(ident.id, raid_key, finishAt);
      db.prepare(`UPDATE coa_units SET raid_id = ? WHERE id IN (${ph})`).run(raid.lastInsertRowid, ...unitIds);
    })();
    res.json({ ok: true, ...buildView(ident) });
  });

  // ── Kampagnenschritt abholen: Bedingung ist ordnungsunabhängig (monotone
  // Zähler), Nachholen mehrerer bereits erreichter Schritte in einer Sitzung
  // ist also erlaubt und beabsichtigt (kein Fortschritt geht verloren). ──
  router.post('/api/clash-of-acls/campaign-claim', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const { step_key } = req.body || {};
    const step = CFG.CAMPAIGN.find((s) => s.key === step_key);
    if (!step) return res.status(400).json({ error: 'Unbekannter Kampagnenschritt' });
    if (db.prepare('SELECT 1 FROM coa_campaign WHERE discord_id = ? AND step_key = ?').get(ident.id, step_key)) {
      return res.status(400).json({ error: 'Belohnung schon abgeholt' });
    }
    const ctx = statsCtx(ident.id);
    if (!campaignStepMet(ctx, step)) return res.status(400).json({ error: 'Bedingung noch nicht erfüllt' });
    db.transaction(() => {
      db.prepare('INSERT INTO coa_campaign (discord_id, step_key) VALUES (?,?)').run(ident.id, step_key);
      grantResources(ident.id, step.reward);
    })();
    if (step.xp) grantXp(ident.id, step.xp);
    createNotif(ident.id, 'coa_campaign_step', { title: step.title, final: !!step.final });
    queueNotification('coa_campaign_step', ident.id, { title: step.title, final: !!step.final });
    res.json({ ok: true, reward: step.reward, xp: step.xp, final: !!step.final, ...buildView(ident) });
  });

  // ── Täglicher Login-Bonus: 7-Tage-Zyklus, Streak bricht nach einem Fehltag ──
  router.post('/api/clash-of-acls/daily', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const s = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const today = CFG.periodKey('daily');
    if (s.daily_last === today) return res.status(400).json({ error: 'Heute schon abgeholt — morgen wieder!' });
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streak = s.daily_last === yesterday ? s.daily_streak + 1 : 1;
    const day = ((streak - 1) % CFG.DAILY_BONUS.cycleDays) + 1;
    const rewards = CFG.DAILY_BONUS.rewards(day, s.level);
    const xp = CFG.DAILY_BONUS.xp(day);
    db.transaction(() => {
      db.prepare('UPDATE coa_state SET daily_last = ?, daily_streak = ? WHERE discord_id = ?').run(today, streak, ident.id);
      grantResources(ident.id, rewards);
    })();
    grantXp(ident.id, xp);
    checkAchievements(ident.id);
    res.json({ ok: true, day, streak, rewards, xp, ...buildView(ident) });
  });

  // ── Quest-Belohnung abholen ──
  router.post('/api/clash-of-acls/quest-claim', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const { period, quest_key } = req.body || {};
    if (period !== 'daily' && period !== 'weekly') return res.status(400).json({ error: 'Ungültige Periode' });
    const q = CFG.QUESTS[period][quest_key];
    if (!q) return res.status(400).json({ error: 'Unbekannte Quest' });
    const key = ensureQuests(ident.id, period);
    const row = db.prepare('SELECT * FROM coa_quests WHERE discord_id = ? AND period_key = ? AND quest_key = ?').get(ident.id, key, quest_key);
    if (!row) return res.status(404).json({ error: 'Quest heute nicht aktiv' });
    if (row.claimed_at) return res.status(400).json({ error: 'Belohnung schon abgeholt' });
    if (row.progress < q.target) return res.status(400).json({ error: 'Quest noch nicht abgeschlossen' });
    const s = db.prepare('SELECT level FROM coa_state WHERE discord_id = ?').get(ident.id);
    const rewards = q.reward(s.level);
    db.transaction(() => {
      db.prepare("UPDATE coa_quests SET claimed_at = datetime('now') WHERE discord_id = ? AND period_key = ? AND quest_key = ?").run(ident.id, key, quest_key);
      grantResources(ident.id, rewards);
    })();
    grantXp(ident.id, q.xp);
    checkAchievements(ident.id);
    res.json({ ok: true, rewards, xp: q.xp, ...buildView(ident) });
  });

  // ── Rangliste: nach XP sortiert, mit Level und eigenem Rang ──
  router.get('/api/clash-of-acls/leaderboard', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    const rows = db.prepare(`SELECT discord_id, username, total_earned, level, missions_done FROM coa_state
      WHERE xp > 0 OR total_earned > 0 ORDER BY xp DESC, total_earned DESC LIMIT 25`).all();
    const all = db.prepare('SELECT discord_id FROM coa_state ORDER BY xp DESC, total_earned DESC').all();
    const myRank = all.findIndex((r) => r.discord_id === ident.id) + 1;
    res.json({
      myRank: myRank || null,
      list: rows.map((r, i) => ({
        rank: i + 1, username: r.username, total_earned: r.total_earned,
        level: r.level, missions_done: r.missions_done, me: r.discord_id === ident.id,
      })),
    });
  });

  router.finalizeDue = finalizeDueForAll;
  return router;
};
