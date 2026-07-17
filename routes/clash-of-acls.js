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
  // ── Phase 8: Prestige — abgeschlossene Upgrade-Stufen → Modifikator-Objekt ──
  function getPrestigeUpgradeLevels(discordId) {
    const levels = {};
    db.prepare('SELECT upgrade_key, level FROM coa_prestige_upgrades WHERE discord_id = ?').all(discordId)
      .forEach((r) => { levels[r.upgrade_key] = r.level; });
    return levels;
  }
  function getPrestige(discordId) {
    return db.prepare('SELECT points, resets FROM coa_prestige WHERE discord_id = ?').get(discordId) || { points: 0, resets: 0 };
  }

  // Gildenbonus + Prestige-Upgrades fließen direkt in den bestehenden Modifikator-
  // Aggregator ein (prodPct wird ohnehin schon von computeRatesPerHour verwendet)
  // — kein separater Pfad nötig, siehe Phase-7-Lehre in buildView() unten.
  const getMods = (discordId) => {
    const mods = CFG.researchMods(getResearchLevels(discordId));
    const clanLvl = getMyClanLevel(discordId);
    if (clanLvl > 0) mods.prodPct += CFG.CLAN.bonusPct(clanLvl);
    const pMods = CFG.PRESTIGE.upgradeMods(getPrestigeUpgradeLevels(discordId));
    mods.prodPct += pMods.prodPct;
    mods.buildCostPct += pMods.buildCostPct;
    mods.manuTimePct += pMods.manuTimePct;
    mods.vehicleValuePct += pMods.vehicleValuePct;
    return mods;
  };
  const NO_MODS = CFG.researchMods({});

  function researchCenterLevel(buildings) {
    const c = buildings.find((b) => b.building_key === 'forschungszentrum');
    return c ? c.level : 0;
  }
  function securityLevel(buildings) {
    const c = buildings.find((b) => b.building_key === 'sicherheitszentrale');
    return c ? c.level : 0;
  }

  // ── Phase 7: Gilden — nutzt das bestehende Portal-Club-System (Tabellen clubs/
  // club_members) als Mitgliedschaftsgrundlage. Beitreten/Gründen/Verlassen läuft
  // weiterhin ausschließlich über die Club-Seite im Portal. ──
  const getMyClub = (discordId) => db.prepare(
    'SELECT c.* FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE m.discord_id = ?'
  ).get(discordId);
  const getClanPoints = (clubId) => db.prepare('SELECT points FROM coa_clan WHERE club_id = ?').get(clubId)?.points || 0;
  function getMyClanLevel(discordId) {
    const club = getMyClub(discordId);
    return club ? CFG.CLAN.fromPoints(getClanPoints(club.id)) : 0;
  }
  // Gildenkriegspunkte fürs aktuelle Kalenderwoche-Fenster gutschreiben — wer in
  // keiner Gilde ist, trägt einfach nichts bei (kein Fehler, stiller No-Op).
  function clanWarInc(discordId, points) {
    const club = getMyClub(discordId);
    if (!club) return;
    const key = CFG.periodKey('weekly');
    db.prepare(`INSERT INTO coa_clan_war (club_id, period_key, score) VALUES (?,?,?)
      ON CONFLICT(club_id, period_key) DO UPDATE SET score = score + excluded.score`).run(club.id, key, points);
  }

  // ── Phase 7: zeitlich begrenzte Events — config-getrieben (CFG.EVENTS), eigene
  // Marken-Währung pro Event-Key, verdient über normale Spielaktionen im Zeitfenster. ──
  const activeEvent = () => CFG.activeEvent(new Date());
  function eventEarn(discordId, actionKey) {
    const ev = activeEvent();
    const amount = ev?.earn?.[actionKey];
    if (!ev || !amount) return;
    db.prepare(`INSERT INTO coa_event_currency (discord_id, event_key, amount) VALUES (?,?,?)
      ON CONFLICT(discord_id, event_key) DO UPDATE SET amount = amount + excluded.amount`).run(discordId, ev.key, amount);
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
    // Generisch statt auf 'generator' hartkodiert: JEDES Gebäude mit einem
    // globalProdPct-Effekt zählt (z. B. auch die Direktion).
    let generatorPct = 0;
    buildings.forEach((b) => {
      if (b.level < 1) return;
      const bonus = CFG.BUILDINGS[b.building_key]?.effect?.globalProdPct?.(b.level);
      if (bonus) generatorPct += bonus;
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

  // ── Cutover: Auto Empire + Werkstatt-Tycoon (game12) laufen zugunsten von Clash
  // of ACLS aus. Einmaliger Willkommensbonus aus dem alten Lebenszeit-Fortschritt,
  // damit investierte Zeit nicht ins Leere läuft — bewusst KEINE 1:1-Umrechnung
  // (ae_cash/idle-Gold/Clash-Ressourcen sind ökonomisch nicht vergleichbar),
  // sondern eine gedeckelte Wurzel-Skalierung wie beim Prestige-Punkte-Muster.
  // retro_migrated garantiert Idempotenz: läuft nur beim jeweils ersten buildView().
  const RETRO_CAP = 5000;
  const retroBonusFor = (v) => (v > 0 ? Math.round(Math.sqrt(v) * 5) : 0);
  function applyRetroMigration(discordId) {
    const s = db.prepare('SELECT retro_migrated FROM coa_state WHERE discord_id = ?').get(discordId);
    if (!s || s.retro_migrated) return null;
    db.prepare('UPDATE coa_state SET retro_migrated = 1 WHERE discord_id = ?').run(discordId);

    const ae     = db.prepare('SELECT total_produced FROM ae_state WHERE discord_id = ?').get(discordId);
    const user   = db.prepare('SELECT id FROM users WHERE discord_id = ?').get(discordId);
    const tycoon = user ? db.prepare('SELECT total_earned FROM idle_saves WHERE user_id = ?').get(user.id) : null;

    const fromEmpire = retroBonusFor(ae?.total_produced || 0);
    const fromTycoon = retroBonusFor(tycoon?.total_earned || 0);
    const money = Math.min(RETRO_CAP, fromEmpire + fromTycoon);
    if (money <= 0) return null;

    grantResources(discordId, { money });
    return { money, fromEmpire: fromEmpire > 0, fromTycoon: fromTycoon > 0 };
  }

  // ── Phase 8: Liga/Saison — Liga-Punkte kommen 1:1 aus jeder XP-Gutschrift (siehe
  // grantXp unten), damit JEDE bestehende Aktion automatisch auch zur Liga beiträgt,
  // ohne an jeder einzelnen Fundstelle einen eigenen Hook zu brauchen. Wöchentlicher
  // Rollover läuft lazy (wie ensureQuests/Daily-Bonus): beim ersten Touch NACH
  // Wochenwechsel wird anhand der bis dahin gesammelten Punkte auf-/abgestiegen,
  // danach beginnt die neue Woche bei 0 Punkten. addPoints=0 (aus buildView) hält
  // die Anzeige auch für inaktive Spieler aktuell, ohne selbst zu werten.
  function leagueTouch(discordId, addPoints = 0) {
    const s = db.prepare('SELECT league_tier, league_points, league_period FROM coa_state WHERE discord_id = ?').get(discordId);
    if (!s) return;
    const curWeek = CFG.periodKey('weekly');
    if (s.league_period === curWeek) {
      if (addPoints) db.prepare('UPDATE coa_state SET league_points = league_points + ? WHERE discord_id = ?').run(Math.round(addPoints), discordId);
      return;
    }
    if (!s.league_period) {
      // Brandneuer Spieler: still initialisieren, kein Auf-/Abstieg ohne Vorwoche
      db.prepare('UPDATE coa_state SET league_period = ?, league_points = ? WHERE discord_id = ?').run(curWeek, Math.round(addPoints), discordId);
      return;
    }
    const tiers = CFG.LEAGUE.TIERS;
    let tier = s.league_tier;
    const cur = tiers[tier];
    let promoted = false;
    if (cur.promote !== Infinity && s.league_points >= cur.promote && tier < tiers.length - 1) { tier++; promoted = true; }
    else if (s.league_points < cur.demote && tier > 0) { tier--; }
    db.prepare(`UPDATE coa_state SET league_tier = ?, league_points = ?, league_period = ?,
      league_peak_tier = MAX(league_peak_tier, ?) WHERE discord_id = ?`).run(tier, Math.round(addPoints), curWeek, tier, discordId);
    if (promoted) {
      const t = tiers[tier];
      grantResources(discordId, t.reward);
      createNotif(discordId, 'coa_league_promo', { tier: t.label, icon: t.icon });
      queueNotification('coa_league_promo', discordId, { tier: t.label });
    }
  }

  // XP gutschreiben; bei Level-Aufstieg Belohnung + Benachrichtigung
  function grantXp(discordId, amount) {
    if (!amount || amount <= 0) return;
    leagueTouch(discordId, amount);
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

  // ── Phase 6: PvP-Überfälle (Angriff/Verteidigung zwischen Spielern) ────────

  // Nur Einheiten, die gerade nicht auf einem NPC-Überfall unterwegs sind,
  // zählen zur Verteidigungsstärke bzw. sind für einen Angriff wählbar.
  const availableUnits = (discordId) => getUnits(discordId).filter((u) => !u.raid_id);
  const defensePower = (discordId) => availableUnits(discordId).reduce((s, u) => s + (CFG.UNITS[u.unit_key]?.def || 0), 0);

  function todayKey() { return CFG.periodKey('daily'); }
  function resetDailyAttackCount(state) {
    if (state.pvp_atk_date === todayKey()) return state.pvp_atk_count;
    db.prepare('UPDATE coa_state SET pvp_atk_date = ?, pvp_atk_count = 0 WHERE discord_id = ?').run(todayKey(), state.discord_id);
    return 0;
  }
  function shieldRemainingSec(state) {
    if (!state.shield_until) return 0;
    return Math.max(0, Math.round((asDate(state.shield_until).getTime() - Date.now()) / 1000));
  }

  // Löst einen Loot-Betrag pro Ressource: Prozentsatz des aktuellen Bestands,
  // gedeckelt durch lootCapFactor × Lagerkapazität — verhindert Kahlschlag bei Whales.
  function computeLoot(defenderState) {
    const loot = {};
    CFG.RESOURCES.forEach((r) => {
      const cap = Math.round((CFG.BASE_CAP[r] || 0) * CFG.PVP.lootCapFactor);
      loot[r] = Math.max(0, Math.min(cap, Math.round((defenderState[r] || 0) * CFG.PVP.lootPct)));
    });
    return loot;
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
    eventEarn(q.discord_id, 'buildUpgrade');
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
    eventEarn(m.discord_id, 'mission');
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
    if (won) { clanWarInc(r.discord_id, CFG.CLAN_WAR.raidWinPoints); eventEarn(r.discord_id, 'raid'); }
    checkAchievements(r.discord_id);
    createNotif(r.discord_id, 'coa_raid_done', { raid: def.label, won, money: loot.money || 0, lost: lost.length });
    queueNotification('coa_raid_done', r.discord_id, { raid: def.label, won });
  }

  // ── Auktionshaus: Abschluss einer abgelaufenen Auktion. Gebote sind bereits per
  // Eskrow abgebucht (siehe /auctions/:id/bid) — bei einem Gewinner wandert das
  // Fahrzeug zum Höchstbietenden, der Verkäufer bekommt den Erlös minus feePct
  // (reine Geld-Senke). Ohne Gebot bleibt das Fahrzeug einfach beim Verkäufer.
  function finalizeOneAuction(a) {
    db.prepare("UPDATE coa_auctions SET resolved_at = datetime('now') WHERE id = ?").run(a.id);
    if (!a.bidder_id) return;
    const vehicle = db.prepare('SELECT * FROM coa_vehicles WHERE id = ?').get(a.vehicle_id);
    const label = (CFG.VEHICLES[vehicle?.vehicle_key] || {}).label || vehicle?.vehicle_key || 'Fahrzeug';
    const payout = Math.round(a.current_bid * (1 - CFG.AUCTION.feePct / 100));
    db.transaction(() => {
      db.prepare('UPDATE coa_vehicles SET discord_id = ? WHERE id = ?').run(a.bidder_id, a.vehicle_id);
      grantResources(a.seller_id, { money: payout });
    })();
    createNotif(a.bidder_id, 'coa_auction_won', { vehicle: label, price: a.current_bid });
    queueNotification('coa_auction_won', a.bidder_id, { vehicle: label, price: a.current_bid });
    createNotif(a.seller_id, 'coa_auction_sold', { vehicle: label, price: payout });
    queueNotification('coa_auction_sold', a.seller_id, { vehicle: label, price: payout });
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
    db.prepare("SELECT * FROM coa_auctions WHERE resolved_at IS NULL AND ends_at <= datetime('now')").all().forEach(finalizeOneAuction);
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
    // Lazy Liga-Rollover (addPoints=0): hält Tier/Punkte auch für inaktive Spieler
    // aktuell. syncResources() unten liest coa_state danach neu ein, daher sind die
    // Liga-Felder in `state` bereits der Post-Rollover-Stand — kein Extra-Query nötig.
    leagueTouch(ident.id);
    // Cutover-Migration vor dem Offline-Snapshot anwenden, damit der Willkommensbonus
    // nicht fälschlich als Offline-Produktion in der Diff-Anzeige auftaucht.
    const retro = applyRetroMigration(ident.id);
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
    // getMods() statt CFG.researchMods() direkt — sonst fehlt der Gildenbonus in der
    // angezeigten Produktionsrate, obwohl syncResources() ihn intern schon einrechnet.
    const mods = getMods(ident.id);
    // on_mission markiert Fahrzeuge, die gerade einen Einsatz fahren (nicht verkaufbar)
    const vehicles = db.prepare(`
      SELECT v.*, CASE WHEN m.id IS NULL THEN 0 ELSE 1 END AS on_mission,
        CASE WHEN au.id IS NULL THEN 0 ELSE 1 END AS in_auction
      FROM coa_vehicles v LEFT JOIN coa_missions m ON m.vehicle_id = v.id
        LEFT JOIN coa_auctions au ON au.vehicle_id = v.id AND au.resolved_at IS NULL
      WHERE v.discord_id = ? AND v.sold_at IS NULL ORDER BY v.created_at DESC
    `).all(ident.id);
    // Kompendium: Lebenszeit-Stückzahl je Fahrzeugtyp (inkl. verkaufter — sold_at ist ein
    // Soft-Delete, die Zeile bleibt bestehen). Nur die Zähler gehen über die Leitung,
    // Label/Icon/Tier/Rarity liest der Client aus dem bereits geladenen CFG.VEHICLES.
    const vehicleCodex = {};
    db.prepare('SELECT vehicle_key, COUNT(*) AS n FROM coa_vehicles WHERE discord_id = ? GROUP BY vehicle_key')
      .all(ident.id).forEach((r) => { vehicleCodex[r.vehicle_key] = r.n; });
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
      vehicleCodex,
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
      retroBonus: retro,
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
        pvp_wins: ctx.pvp_wins, pvp_losses: ctx.pvp_losses, pvp_defends_won: ctx.pvp_defends_won,
      },
      pvp: {
        shieldRemainingSec: shieldRemainingSec(state),
        attacksToday: resetDailyAttackCount(state),
        attacksLimit: CFG.PVP.dailyAttackLimit,
        defensePower: defensePower(ident.id),
        wins: ctx.pvp_wins, losses: ctx.pvp_losses, defendsWon: ctx.pvp_defends_won,
        attacksMade: db.prepare('SELECT * FROM coa_pvp_log WHERE attacker_id = ? ORDER BY created_at DESC LIMIT 8').all(ident.id)
          .map((r) => ({ ...r, won: !!r.won, loot: JSON.parse(r.loot), atk_lost: JSON.parse(r.atk_lost), def_lost: JSON.parse(r.def_lost) })),
        attacksReceived: db.prepare('SELECT * FROM coa_pvp_log WHERE defender_id = ? ORDER BY created_at DESC LIMIT 8').all(ident.id)
          .map((r) => ({ ...r, won: !!r.won, loot: JSON.parse(r.loot), atk_lost: JSON.parse(r.atk_lost), def_lost: JSON.parse(r.def_lost) })),
      },
      clan: buildClanView(ident.id),
      event: buildEventView(ident.id),
      prestige: buildPrestigeView(ident.id, offLvl, state),
      league: buildLeagueView(state),
    };
  }

  // ── Phase 8: Prestige-Ansicht — Punktepotential aus Geld verdient SEIT dem
  // letzten Reset (nicht lifetime total_earned, sonst wäre mehrfaches Prestige
  // für dasselbe Geld möglich). ──
  function buildPrestigeView(discordId, offLvl, state) {
    const pr = getPrestige(discordId);
    const delta = Math.max(0, state.total_earned - (state.total_earned_at_last_prestige || 0));
    return {
      points: pr.points, resets: pr.resets,
      minOfficeLevel: CFG.PRESTIGE.minOfficeLevel, officeLevel: offLvl,
      eligible: offLvl >= CFG.PRESTIGE.minOfficeLevel,
      potentialPoints: CFG.PRESTIGE.pointsFor(delta),
      upgrades: getPrestigeUpgradeLevels(discordId),
    };
  }

  // ── Phase 8: Liga-Ansicht — `state` kommt bereits aus syncResources() NACH dem
  // leagueTouch()-Rollover in buildView(), enthält also die aktuellen Werte. ──
  function buildLeagueView(state) {
    const tiers = CFG.LEAGUE.TIERS;
    const t = tiers[state.league_tier];
    return {
      tier: state.league_tier, key: t.key, label: t.label, icon: t.icon,
      points: state.league_points, promoteAt: t.promote, demoteAt: t.demote,
      peakTier: state.league_peak_tier, resetInSec: secToReset('weekly'),
    };
  }

  // ── Phase 7: Gilden-Ansicht — null, wenn der Spieler in keinem Club ist ──
  function buildClanView(discordId) {
    const club = getMyClub(discordId);
    if (!club) return null;
    const points = getClanPoints(club.id);
    const level = CFG.CLAN.fromPoints(points);
    const curWeek = CFG.periodKey('weekly');
    const curScore = db.prepare('SELECT score FROM coa_clan_war WHERE club_id = ? AND period_key = ?').get(club.id, curWeek)?.score || 0;
    const lastRow = db.prepare('SELECT * FROM coa_clan_war WHERE club_id = ? AND period_key != ? ORDER BY period_key DESC LIMIT 1').get(club.id, curWeek);
    const lastTier = lastRow ? CFG.CLAN_WAR.bestTier(lastRow.score) : null;
    const claimedLast = lastRow ? !!db.prepare('SELECT 1 FROM coa_clan_war_claims WHERE discord_id = ? AND period_key = ?').get(discordId, lastRow.period_key) : false;
    const memberCount = db.prepare('SELECT COUNT(*) AS c FROM club_members WHERE club_id = ?').get(club.id).c;
    return {
      id: club.id, name: club.name, tag: club.tag, logo: club.logo_emoji, members: memberCount,
      points, level, pointsThis: CFG.CLAN.pointsFor(level), pointsNext: level < CFG.CLAN.maxLevel ? CFG.CLAN.pointsFor(level + 1) : null,
      bonusPct: CFG.CLAN.bonusPct(level),
      war: {
        score: curScore, tier: CFG.CLAN_WAR.bestTier(curScore)?.label || null,
        nextTier: CFG.CLAN_WAR.nextTier(curScore), resetInSec: secToReset('weekly'),
      },
      lastWeek: lastRow ? {
        periodKey: lastRow.period_key, score: lastRow.score,
        tier: lastTier?.label || null, reward: lastTier?.reward || null,
        claimed: claimedLast, claimable: !!lastTier && !claimedLast,
      } : null,
      topDonors: db.prepare(`SELECT discord_id, username, SUM(points) AS total FROM coa_clan_donations
        WHERE club_id = ? GROUP BY discord_id ORDER BY total DESC LIMIT 5`).all(club.id),
    };
  }

  // ── Phase 7: Event-Ansicht — null, wenn gerade kein Event läuft ──
  function buildEventView(discordId) {
    const ev = activeEvent();
    if (!ev) return null;
    const balance = db.prepare('SELECT amount FROM coa_event_currency WHERE discord_id = ? AND event_key = ?').get(discordId, ev.key)?.amount || 0;
    return {
      key: ev.key, label: ev.label, icon: ev.icon, desc: ev.desc,
      currency: ev.currency, currencyIcon: ev.currencyIcon, balance,
      endInSec: Math.max(0, Math.round((new Date(ev.endAt.replace(' ', 'T') + 'Z').getTime() - Date.now()) / 1000)),
      shop: ev.shop.map((it) => ({ key: it.key, label: it.label, icon: it.icon, cost: it.cost, reward: it.reward, xp: it.xp || 0 })),
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
    if (db.prepare('SELECT 1 FROM coa_auctions WHERE vehicle_id = ? AND resolved_at IS NULL').get(vehicle.id)) {
      return res.status(400).json({ error: 'Fahrzeug wird gerade im Auktionshaus versteigert' });
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

  // ── Auktionshaus (Phase 9): Fahrzeuge per Gebot statt Fixpreis handeln ──
  function buildAuctionsList(viewerId) {
    const rows = db.prepare(`
      SELECT a.*, v.vehicle_key, v.rarity, v.value,
        CAST(strftime('%s', a.ends_at) AS INTEGER) - CAST(strftime('%s', 'now') AS INTEGER)      AS remaining_sec,
        CAST(strftime('%s', a.ends_at) AS INTEGER) - CAST(strftime('%s', a.created_at) AS INTEGER) AS total_sec
      FROM coa_auctions a JOIN coa_vehicles v ON v.id = a.vehicle_id
      WHERE a.resolved_at IS NULL ORDER BY a.ends_at ASC
    `).all();
    return rows.map((a) => ({
      id: a.id, vehicle_key: a.vehicle_key, rarity: a.rarity, value: a.value,
      seller_name: a.seller_name, bidder_name: a.bidder_name,
      start_price: a.start_price, current_bid: a.current_bid,
      priceNow: a.current_bid || a.start_price,
      minNextBid: CFG.AUCTION.minNextBid(a.current_bid, a.start_price),
      remaining_sec: a.remaining_sec, total_sec: a.total_sec,
      isMine: a.seller_id === viewerId, isMyBid: a.bidder_id === viewerId,
    }));
  }

  router.get('/api/clash-of-acls/auctions', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    finalizeDueForAll();
    res.json({ list: buildAuctionsList(ident.id) });
  });

  router.post('/api/clash-of-acls/auctions', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const { vehicle_id, start_price, duration_key } = req.body || {};
    const dur = CFG.AUCTION.durations.find((d) => d.key === duration_key);
    if (!dur) return res.status(400).json({ error: 'Unbekannte Laufzeit' });
    const price = Math.round(Number(start_price));
    if (!Number.isFinite(price) || price < CFG.AUCTION.minStartPrice || price > CFG.AUCTION.maxStartPrice) {
      return res.status(400).json({ error: `Startpreis muss zwischen ${CFG.AUCTION.minStartPrice} und ${CFG.AUCTION.maxStartPrice} liegen` });
    }
    const vehicle = db.prepare('SELECT * FROM coa_vehicles WHERE id = ? AND discord_id = ? AND sold_at IS NULL').get(vehicle_id, ident.id);
    if (!vehicle) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    if (db.prepare('SELECT 1 FROM coa_missions WHERE vehicle_id = ?').get(vehicle.id)) {
      return res.status(400).json({ error: 'Fahrzeug ist gerade im Einsatz' });
    }
    if (db.prepare('SELECT 1 FROM coa_auctions WHERE vehicle_id = ? AND resolved_at IS NULL').get(vehicle.id)) {
      return res.status(400).json({ error: 'Fahrzeug ist bereits im Auktionshaus eingestellt' });
    }
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const listingFee = Math.max(1, Math.round(price * CFG.AUCTION.listingFeePct / 100));
    if (!canAfford(state, { money: listingFee })) return res.status(400).json({ error: `Einstellgebühr (${listingFee} 🪙) kann nicht bezahlt werden` });
    const finishAt = toSqliteUTC(Date.now() + dur.sec * 1000);
    db.transaction(() => {
      deduct(ident.id, state, { money: listingFee });
      db.prepare('INSERT INTO coa_auctions (vehicle_id, seller_id, seller_name, start_price, ends_at) VALUES (?,?,?,?,?)')
        .run(vehicle.id, ident.id, ident.name, price, finishAt);
    })();
    res.json({ ok: true, list: buildAuctionsList(ident.id), ...buildView(ident) });
  });

  router.post('/api/clash-of-acls/auctions/:id/bid', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const auction = db.prepare('SELECT * FROM coa_auctions WHERE id = ? AND resolved_at IS NULL').get(req.params.id);
    if (!auction) return res.status(404).json({ error: 'Auktion nicht gefunden oder bereits beendet' });
    if (auction.seller_id === ident.id) return res.status(400).json({ error: 'Du kannst nicht auf dein eigenes Angebot bieten' });
    const minNext = CFG.AUCTION.minNextBid(auction.current_bid, auction.start_price);
    const amount = Math.round(Number((req.body || {}).amount));
    if (!Number.isFinite(amount) || amount < minNext) {
      return res.status(400).json({ error: `Mindestgebot: ${minNext} 🪙` });
    }
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    if (!canAfford(state, { money: amount })) return res.status(400).json({ error: 'Nicht genug Geld für dieses Gebot' });
    db.transaction(() => {
      deduct(ident.id, state, { money: amount });
      if (auction.bidder_id) grantResources(auction.bidder_id, { money: auction.current_bid });
      db.prepare('UPDATE coa_auctions SET current_bid = ?, bidder_id = ?, bidder_name = ? WHERE id = ?')
        .run(amount, ident.id, ident.name, auction.id);
    })();
    if (auction.bidder_id) {
      const v = db.prepare('SELECT vehicle_key FROM coa_vehicles WHERE id = ?').get(auction.vehicle_id);
      const label = (CFG.VEHICLES[v?.vehicle_key] || {}).label || v?.vehicle_key || 'Fahrzeug';
      createNotif(auction.bidder_id, 'coa_auction_outbid', { vehicle: label, newBid: amount });
      queueNotification('coa_auction_outbid', auction.bidder_id, { vehicle: label, newBid: amount });
    }
    res.json({ ok: true, list: buildAuctionsList(ident.id), ...buildView(ident) });
  });

  router.post('/api/clash-of-acls/auctions/:id/cancel', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    finalizeDueForAll();
    const auction = db.prepare('SELECT * FROM coa_auctions WHERE id = ? AND seller_id = ? AND resolved_at IS NULL').get(req.params.id, ident.id);
    if (!auction) return res.status(404).json({ error: 'Auktion nicht gefunden' });
    if (auction.bidder_id) return res.status(400).json({ error: 'Es liegt bereits ein Gebot vor — die Auktion kann nicht mehr zurückgezogen werden' });
    db.prepare("UPDATE coa_auctions SET resolved_at = datetime('now') WHERE id = ?").run(auction.id);
    res.json({ ok: true, list: buildAuctionsList(ident.id), ...buildView(ident) });
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
    if (db.prepare('SELECT 1 FROM coa_auctions WHERE vehicle_id = ? AND resolved_at IS NULL').get(vehicle.id)) {
      return res.status(400).json({ error: 'Fahrzeug wird gerade im Auktionshaus versteigert' });
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

  // ── PvP: mögliche Ziele finden (Level-Band, kein Schild, kein frischer Cooldown,
  // Einsteigerschutz unter minDefenderLevel). Zufällige Auswahl bei jedem Aufruf. ──
  router.get('/api/clash-of-acls/pvp/targets', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    getOrCreateState(ident);
    const me = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const rows = db.prepare(`
      SELECT s.discord_id, s.username, s.level FROM coa_state s
      WHERE s.discord_id != ?
        AND s.level >= ?
        AND s.level BETWEEN ? AND ?
        AND (s.shield_until IS NULL OR s.shield_until <= datetime('now'))
        AND NOT EXISTS (
          SELECT 1 FROM coa_pvp_log l
          WHERE l.attacker_id = ? AND l.defender_id = s.discord_id
            AND l.created_at > datetime('now', '-${CFG.PVP.cooldownMinutes} minutes')
        )
      ORDER BY RANDOM() LIMIT 5
    `).all(ident.id, CFG.PVP.minDefenderLevel, me.level - CFG.PVP.levelBandDown, me.level + CFG.PVP.levelBandUp, ident.id);
    res.json(rows.map((r) => ({ discord_id: r.discord_id, username: r.username, level: r.level, def_power: defensePower(r.discord_id) })));
  });

  // ── PvP: Angriff löst sofort auf (kein Anmarschweg) — Trupp-Stärke der gewählten
  // eigenen Einheiten gegen die Verteidigungsstärke der NICHT-verreisten Einheiten
  // des Ziels. Sieg: Loot wird dem Verteidiger real abgezogen (Zero-Sum). Verluste
  // auf beiden Seiten werden unabhängig gewürfelt, Verteidiger bekommt danach ein
  // Schild — unabhängig vom Ausgang, damit niemand sofort nachgetreten wird. ──
  router.post('/api/clash-of-acls/pvp-attack', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const { defender_id } = req.body || {};
    const unitIds = Array.isArray(req.body?.unit_ids) ? req.body.unit_ids.map(Number).filter(Number.isInteger) : [];
    if (defender_id === ident.id) return res.status(400).json({ error: 'Du kannst dich nicht selbst angreifen' });
    if (securityLevel(getBuildings(ident.id)) < 1) return res.status(400).json({ error: 'Du brauchst eine fertige Sicherheitszentrale für Angriffe' });
    if (!unitIds.length) return res.status(400).json({ error: 'Wähle mindestens eine Einheit' });

    const attackerState = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    if (!db.prepare('SELECT 1 FROM coa_state WHERE discord_id = ?').get(defender_id)) return res.status(404).json({ error: 'Ziel nicht gefunden' });
    // Ressourcen des Ziels erst auf den aktuellen Stand bringen (Offline-Produktion
    // nachrechnen) — sonst würde die Beute auf veralteten Werten basieren.
    const defenderState = syncResources(defender_id);
    if (defenderState.level < CFG.PVP.minDefenderLevel) return res.status(400).json({ error: 'Dieser Spieler steht unter Einsteigerschutz' });
    if (defenderState.level < attackerState.level - CFG.PVP.levelBandDown || defenderState.level > attackerState.level + CFG.PVP.levelBandUp) {
      return res.status(400).json({ error: 'Levelunterschied zu groß' });
    }
    if (shieldRemainingSec(defenderState) > 0) return res.status(400).json({ error: 'Dieses Ziel steht gerade unter Schutz' });
    const onCooldown = db.prepare(`SELECT 1 FROM coa_pvp_log WHERE attacker_id = ? AND defender_id = ? AND created_at > datetime('now', '-${CFG.PVP.cooldownMinutes} minutes')`).get(ident.id, defender_id);
    if (onCooldown) return res.status(400).json({ error: 'Dieses Ziel hast du erst kürzlich angegriffen' });
    const attacksToday = resetDailyAttackCount(attackerState);
    if (attacksToday >= CFG.PVP.dailyAttackLimit) return res.status(400).json({ error: `Tageslimit von ${CFG.PVP.dailyAttackLimit} Angriffen erreicht` });

    const ph = unitIds.map(() => '?').join(',');
    const attackUnits = db.prepare(`SELECT * FROM coa_units WHERE discord_id = ? AND raid_id IS NULL AND id IN (${ph})`).all(ident.id, ...unitIds);
    if (attackUnits.length !== new Set(unitIds).size) return res.status(400).json({ error: 'Einheit nicht verfügbar' });
    const defendUnits = availableUnits(defender_id);

    const atkPower = attackUnits.reduce((s, u) => s + (CFG.UNITS[u.unit_key]?.atk || 0), 0);
    const defPower = defendUnits.reduce((s, u) => s + (CFG.UNITS[u.unit_key]?.def || 0), 0);
    const winP = CFG.COMBAT.winChance(atkPower, defPower);
    const won = Math.random() < winP;
    const atkLossP = CFG.COMBAT.lossChance(won, winP);
    const defLossP = CFG.COMBAT.lossChance(!won, 1 - winP);
    const atkLost = attackUnits.filter(() => Math.random() < atkLossP);
    const defLost = defendUnits.filter(() => Math.random() < defLossP);
    const loot = won ? computeLoot(defenderState) : {};

    db.transaction(() => {
      atkLost.forEach((u) => db.prepare('DELETE FROM coa_units WHERE id = ?').run(u.id));
      defLost.forEach((u) => db.prepare('DELETE FROM coa_units WHERE id = ?').run(u.id));
      if (won) {
        grantResources(ident.id, loot);
        Object.entries(loot).forEach(([r, v]) => { if (v > 0) db.prepare(`UPDATE coa_state SET ${r} = MAX(0, ${r} - ?) WHERE discord_id = ?`).run(v, defender_id); });
      }
      const shieldAt = toSqliteUTC(Date.now() + CFG.PVP.shieldMinutes * 60000);
      db.prepare(`UPDATE coa_state SET pvp_atk_count = ?, pvp_wins = pvp_wins + ?, pvp_losses = pvp_losses + ? WHERE discord_id = ?`)
        .run(attacksToday + 1, won ? 1 : 0, won ? 0 : 1, ident.id);
      db.prepare(`UPDATE coa_state SET shield_until = ?, pvp_defends_won = pvp_defends_won + ? WHERE discord_id = ?`)
        .run(shieldAt, won ? 0 : 1, defender_id);
      db.prepare(`INSERT INTO coa_pvp_log (attacker_id, attacker_name, defender_id, defender_name, atk_power, def_power, chance, won, loot, atk_lost, def_lost)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        ident.id, ident.name, defender_id, defenderState.username,
        atkPower, defPower, Math.round(winP * 100), won ? 1 : 0,
        JSON.stringify(loot), JSON.stringify(atkLost.map((u) => u.unit_key)), JSON.stringify(defLost.map((u) => u.unit_key)),
      );
    })();

    grantXp(ident.id, won ? CFG.XP.pvpAttack(defPower) : Math.ceil(CFG.XP.pvpAttack(defPower) / 2));
    if (won) { clanWarInc(ident.id, CFG.CLAN_WAR.pvpWinPoints); eventEarn(ident.id, 'pvpWin'); }
    if (!won) { grantXp(defender_id, CFG.PVP.defenderWinXp); clanWarInc(defender_id, CFG.CLAN_WAR.pvpDefendPoints); }
    checkAchievements(ident.id);
    checkAchievements(defender_id);
    createNotif(defender_id, 'coa_pvp_attacked', { attacker: ident.name, won, loot });
    queueNotification('coa_pvp_attacked', defender_id, { attacker: ident.name, won });
    res.json({ ok: true, won, chance: Math.round(winP * 100), atkPower, defPower, loot, atkLost: atkLost.map((u) => u.unit_key), defLost: defLost.map((u) => u.unit_key), ...buildView(ident) });
  });

  // ── Gilde: Ressourcen spenden (Spendenpunkte → Gildenlevel → Produktionsbonus) ──
  router.post('/api/clash-of-acls/clan/donate', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const { resource, amount } = req.body || {};
    if (!CFG.RESOURCES.includes(resource)) return res.status(400).json({ error: 'Unbekannte Ressource' });
    const amt = Math.round(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Ungültige Menge' });
    const club = getMyClub(ident.id);
    if (!club) return res.status(400).json({ error: 'Du bist in keinem Club — tritt im Portal einem bei' });
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    if ((state[resource] || 0) < amt) return res.status(400).json({ error: 'Nicht genug Ressourcen' });
    const points = Math.round(amt * (CFG.CLAN.donateWeight[resource] || 1));
    db.transaction(() => {
      deduct(ident.id, state, { [resource]: amt });
      db.prepare(`INSERT INTO coa_clan (club_id, points, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(club_id) DO UPDATE SET points = points + excluded.points, updated_at = datetime('now')`).run(club.id, points);
      db.prepare('INSERT INTO coa_clan_donations (club_id, discord_id, username, points) VALUES (?,?,?,?)').run(club.id, ident.id, ident.name, points);
      db.prepare('UPDATE coa_state SET clan_donated = clan_donated + ? WHERE discord_id = ?').run(points, ident.id);
    })();
    grantXp(ident.id, Math.max(1, Math.round(points / 20)));
    checkAchievements(ident.id);
    res.json({ ok: true, points, ...buildView(ident) });
  });

  // ── Gilde: Belohnung der zuletzt abgeschlossenen Gildenkriegs-Woche abholen ──
  router.post('/api/clash-of-acls/clan/war-claim', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    const club = getMyClub(ident.id);
    if (!club) return res.status(400).json({ error: 'Du bist in keinem Club' });
    const curWeek = CFG.periodKey('weekly');
    const lastRow = db.prepare('SELECT * FROM coa_clan_war WHERE club_id = ? AND period_key != ? ORDER BY period_key DESC LIMIT 1').get(club.id, curWeek);
    if (!lastRow) return res.status(400).json({ error: 'Keine abgeschlossene Gildenkriegs-Woche gefunden' });
    const tier = CFG.CLAN_WAR.bestTier(lastRow.score);
    if (!tier) return res.status(400).json({ error: 'Eure Gilde hat letzte Woche keine Stufe erreicht' });
    if (db.prepare('SELECT 1 FROM coa_clan_war_claims WHERE discord_id = ? AND period_key = ?').get(ident.id, lastRow.period_key)) {
      return res.status(400).json({ error: 'Belohnung schon abgeholt' });
    }
    db.transaction(() => {
      db.prepare('INSERT INTO coa_clan_war_claims (discord_id, period_key) VALUES (?,?)').run(ident.id, lastRow.period_key);
      grantResources(ident.id, tier.reward);
    })();
    res.json({ ok: true, tier: tier.label, reward: tier.reward, ...buildView(ident) });
  });

  // ── Event: Marken im Event-Shop gegen Belohnungen eintauschen ──
  router.post('/api/clash-of-acls/event-buy', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    const ev = activeEvent();
    if (!ev) return res.status(400).json({ error: 'Gerade läuft kein Event' });
    const item = ev.shop.find((i) => i.key === (req.body || {}).item_key);
    if (!item) return res.status(400).json({ error: 'Unbekanntes Angebot' });
    const bal = db.prepare('SELECT amount FROM coa_event_currency WHERE discord_id = ? AND event_key = ?').get(ident.id, ev.key)?.amount || 0;
    if (bal < item.cost) return res.status(400).json({ error: `Nicht genug ${ev.currency} (${item.cost} nötig)` });
    db.transaction(() => {
      db.prepare('UPDATE coa_event_currency SET amount = amount - ? WHERE discord_id = ? AND event_key = ?').run(item.cost, ident.id, ev.key);
      grantResources(ident.id, item.reward || {});
    })();
    if (item.xp) grantXp(ident.id, item.xp);
    checkAchievements(ident.id);
    res.json({ ok: true, item: item.label, ...buildView(ident) });
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
    const rows = db.prepare(`SELECT discord_id, username, total_earned, level, missions_done, league_tier FROM coa_state
      WHERE xp > 0 OR total_earned > 0 ORDER BY xp DESC, total_earned DESC LIMIT 25`).all();
    const all = db.prepare('SELECT discord_id FROM coa_state ORDER BY xp DESC, total_earned DESC').all();
    const myRank = all.findIndex((r) => r.discord_id === ident.id) + 1;
    res.json({
      myRank: myRank || null,
      list: rows.map((r, i) => ({
        rank: i + 1, username: r.username, total_earned: r.total_earned,
        level: r.level, missions_done: r.missions_done, league_tier: r.league_tier, me: r.discord_id === ident.id,
      })),
    });
  });

  // ── Liga-Rangliste: eigene Sortierung nach Liga-Stufe + Punkten dieser Woche ──
  router.get('/api/clash-of-acls/league/leaderboard', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    getOrCreateState(ident);
    leagueTouch(ident.id);
    const rows = db.prepare(`SELECT discord_id, username, league_tier, league_points FROM coa_state
      WHERE league_tier > 0 OR league_points > 0 ORDER BY league_tier DESC, league_points DESC LIMIT 25`).all();
    const all = db.prepare('SELECT discord_id FROM coa_state ORDER BY league_tier DESC, league_points DESC').all();
    const myRank = all.findIndex((r) => r.discord_id === ident.id) + 1;
    res.json({
      myRank: myRank || null,
      list: rows.map((r, i) => ({
        rank: i + 1, username: r.username, tier: r.league_tier, points: r.league_points, me: r.discord_id === ident.id,
      })),
    });
  });

  // ── Prestige: Werkstatt zurücksetzen gegen dauerhafte Prestige-Punkte. Reset
  // betrifft nur Gebäude/Mitarbeiter/Fahrzeuge/Forschung/Einheiten/Ressourcen —
  // Level/XP, Erfolge, Kampagne, Quests, Gilde und PvP-Historie bleiben erhalten. ──
  router.post('/api/clash-of-acls/prestige', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 5, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    finalizeDueForAll();
    if (!(req.body || {}).confirm) return res.status(400).json({ error: 'Bestätigung erforderlich' });
    const buildings = getBuildings(ident.id);
    const offLvl = officeLevel(buildings);
    if (offLvl < CFG.PRESTIGE.minOfficeLevel) {
      return res.status(400).json({ error: `Büro muss mindestens Level ${CFG.PRESTIGE.minOfficeLevel} sein` });
    }
    const state = db.prepare('SELECT * FROM coa_state WHERE discord_id = ?').get(ident.id);
    const delta = Math.max(0, state.total_earned - (state.total_earned_at_last_prestige || 0));
    const gained = CFG.PRESTIGE.pointsFor(delta);
    if (gained < 1) return res.status(400).json({ error: 'Seit dem letzten Prestige noch nicht genug verdient' });

    const upLevels = getPrestigeUpgradeLevels(ident.id);
    const startBonus = (upLevels.startkapital || 0) * CFG.PRESTIGE.UPGRADES.startkapital.perLevel;

    db.transaction(() => {
      db.prepare('DELETE FROM coa_buildings WHERE discord_id = ?').run(ident.id);
      const insBuilding = db.prepare('INSERT INTO coa_buildings (discord_id, building_key, x, y, level) VALUES (?,?,?,?,1)');
      CFG.STARTER_KIT.forEach((b) => insBuilding.run(ident.id, b.key, b.x, b.y));
      db.prepare('DELETE FROM coa_build_queue WHERE discord_id = ?').run(ident.id);
      db.prepare('DELETE FROM coa_manufacture_queue WHERE discord_id = ?').run(ident.id);
      db.prepare('DELETE FROM coa_vehicles WHERE discord_id = ?').run(ident.id);
      db.prepare('DELETE FROM coa_missions WHERE discord_id = ?').run(ident.id);
      db.prepare('DELETE FROM coa_research WHERE discord_id = ?').run(ident.id);
      db.prepare('DELETE FROM coa_research_queue WHERE discord_id = ?').run(ident.id);
      db.prepare('DELETE FROM coa_units WHERE discord_id = ?').run(ident.id);
      db.prepare('DELETE FROM coa_unit_queue WHERE discord_id = ?').run(ident.id);
      db.prepare('DELETE FROM coa_raids WHERE discord_id = ? AND resolved_at IS NULL').run(ident.id);
      db.prepare(`UPDATE coa_state SET money=?, steel=100, parts=50, electronics=20, fuel=100,
        total_earned_at_last_prestige = total_earned WHERE discord_id=?`).run(1000 + startBonus, ident.id);
      db.prepare(`INSERT INTO coa_prestige (discord_id, points, resets, updated_at) VALUES (?, ?, 1, datetime('now'))
        ON CONFLICT(discord_id) DO UPDATE SET points = points + excluded.points, resets = resets + 1, updated_at = datetime('now')`)
        .run(ident.id, gained);
    })();
    createNotif(ident.id, 'coa_prestige', { points: gained });
    queueNotification('coa_prestige', ident.id, { points: gained });
    res.json({ ok: true, gainedPoints: gained, ...buildView(ident) });
  });

  // ── Prestige-Upgrade: dauerhafte Boni mit gesammelten Prestige-Punkten kaufen ──
  router.post('/api/clash-of-acls/prestige-upgrade', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`coa-act:${ident.id}`, 30, 10_000)) return res.status(429).json({ error: 'Zu schnell' });
    getOrCreateState(ident);
    const { upgrade_key } = req.body || {};
    const up = CFG.PRESTIGE.UPGRADES[upgrade_key];
    if (!up) return res.status(400).json({ error: 'Unbekanntes Prestige-Upgrade' });
    const cur = getPrestigeUpgradeLevels(ident.id)[upgrade_key] || 0;
    if (cur >= up.maxLevel) return res.status(400).json({ error: 'Maximales Level erreicht' });
    const cost = up.cost(cur + 1);
    const points = getPrestige(ident.id).points;
    if (points < cost) return res.status(400).json({ error: `Nicht genug Prestige-Punkte (${cost} nötig)` });
    db.transaction(() => {
      db.prepare('UPDATE coa_prestige SET points = points - ? WHERE discord_id = ?').run(cost, ident.id);
      db.prepare(`INSERT INTO coa_prestige_upgrades (discord_id, upgrade_key, level) VALUES (?,?,1)
        ON CONFLICT(discord_id, upgrade_key) DO UPDATE SET level = level + 1`).run(ident.id, upgrade_key);
    })();
    res.json({ ok: true, ...buildView(ident) });
  });

  router.finalizeDue = finalizeDueForAll;
  return router;
};
