// Clash of ACLS: einzige Konfigurationsquelle für Gebäude/Mitarbeiter/Fahrzeuge.
// Wird per <script> im Browser UND per require() im Server geladen (UMD-Pattern),
// damit Kosten-/Bauzeit-/Effekt-Formeln nicht doppelt gepflegt werden müssen.
(function (root) {
  const round = Math.round;

  const GRID = { W: 12, H: 12 };
  const cellIndex = (x, y) => y * GRID.W + x;
  const isUnlocked = (x, y, unlockedCount) => cellIndex(x, y) < unlockedCount;

  const RESOURCES = ['money', 'steel', 'parts', 'electronics', 'fuel'];
  const BASE_CAP = { money: 2000, steel: 300, parts: 300, electronics: 200, fuel: 250 };

  const EMP_MAX_LEVEL = 20;
  const empHireCost = (totalHired) => round(300 * Math.pow(1.45, totalHired));
  const empLevelCost = (level) => round(200 * Math.pow(1.35, level));

  const BUILDINGS = {
    office: {
      label: 'Büro', icon: '🏢', singleton: true, cat: 'spezial', maxLevel: 15,
      desc: 'Verwaltungszentrale — schaltet neue Bauplätze frei und hebt das Level-Limit aller anderen Gebäude an.',
      cost: lvl => ({ money: round(500 * Math.pow(1.85, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(28800, round(90 * Math.pow(1.55, lvl - 1))),
      effect: { unlockedCells: lvl => Math.min(144, 24 + (lvl - 1) * 8), otherMaxLevel: lvl => lvl + 2 },
    },
    storage: {
      label: 'Lager', icon: '🏬', cat: 'lager', maxLevel: 10,
      desc: 'Erweitert die Lagerkapazität für alle Ressourcen.',
      cost: lvl => ({ money: round(250 * Math.pow(1.5, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(14400, round(45 * Math.pow(1.4, lvl - 1))),
      effect: { capBonus: lvl => ({ money: 400 * lvl, steel: 150 * lvl, parts: 150 * lvl, electronics: 100 * lvl, fuel: 120 * lvl }) },
    },
    towyard: {
      label: 'Abschlepphof', icon: '🚨', cat: 'produktion', maxLevel: 12,
      desc: 'Abschleppaufträge bringen laufend Geld ein — und höhere Level schalten zusätzliche Einsatz-Slots für Missionen frei.',
      cost: lvl => ({ money: round(400 * Math.pow(1.6, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(60 * Math.pow(1.45, lvl - 1))),
      effect: { perHour: lvl => ({ money: 40 * lvl }), missionSlots: lvl => 1 + Math.floor(lvl / 4) },
    },
    garage: {
      label: lvl => (lvl < 5 ? 'Kleine Garage' : 'Große Garage'), icon: '🔧', cat: 'spezial', maxLevel: 10,
      desc: 'Produziert Fahrzeuge aus Rohstoffen.',
      cost: lvl => ({ money: round(600 * Math.pow(1.65, lvl - 1)), parts: round(30 * Math.pow(1.3, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(120 * Math.pow(1.5, lvl - 1))),
      effect: {
        unlockedTier: lvl => Math.min(3, Math.ceil(lvl / 4)),
        manufactureTimeSec: lvl => Math.max(180, 1800 - lvl * 120),
      },
      manufactureCost: { steel: 100, parts: 60, electronics: 30, fuel: 40 },
    },
    tanklager: {
      label: 'Tanklager', icon: '⛽', cat: 'produktion', maxLevel: 10,
      desc: 'Lagert und produziert Treibstoff.',
      cost: lvl => ({ money: round(350 * Math.pow(1.55, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(18000, round(50 * Math.pow(1.42, lvl - 1))),
      effect: { perHour: lvl => ({ fuel: 15 * lvl }), capBonus: lvl => ({ fuel: 200 * lvl }) },
    },
    motorenwerkstatt: {
      label: 'Motorenwerkstatt', icon: '⚙️', cat: 'produktion', maxLevel: 12,
      desc: 'Zerlegt und fertigt Ersatzteile.',
      cost: lvl => ({ money: round(450 * Math.pow(1.6, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(70 * Math.pow(1.45, lvl - 1))),
      effect: { perHour: lvl => ({ parts: 12 * lvl }) },
    },
    elektronikwerkstatt: {
      label: 'Elektronikwerkstatt', icon: '💡', cat: 'produktion', maxLevel: 12,
      desc: 'Stellt Elektronikbauteile her.',
      cost: lvl => ({ money: round(500 * Math.pow(1.6, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(75 * Math.pow(1.45, lvl - 1))),
      effect: { perHour: lvl => ({ electronics: 10 * lvl }) },
    },
    reifenlager: {
      label: 'Reifenlager', icon: '🛞', cat: 'produktion', maxLevel: 10,
      desc: 'Lagert Reifen als zusätzliche Ersatzteil-Quelle.',
      cost: lvl => ({ money: round(300 * Math.pow(1.55, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(14400, round(40 * Math.pow(1.4, lvl - 1))),
      effect: { perHour: lvl => ({ parts: 8 * lvl }) },
    },
    schrottplatz: {
      label: 'Schrottplatz', icon: '🗑️', cat: 'produktion', maxLevel: 12,
      desc: 'Verwertet Schrott zu Stahl.',
      cost: lvl => ({ money: round(350 * Math.pow(1.55, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(18000, round(55 * Math.pow(1.42, lvl - 1))),
      effect: { perHour: lvl => ({ steel: 14 * lvl }) },
    },
    tuningzentrum: {
      label: 'Tuningzentrum', icon: '🏎️', cat: 'boni', maxLevel: 8,
      desc: 'Wertet produzierte Fahrzeuge auf — höherer Verkaufswert.',
      cost: lvl => ({ money: round(700 * Math.pow(1.7, lvl - 1)), electronics: round(20 * Math.pow(1.3, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(25200, round(100 * Math.pow(1.5, lvl - 1))),
      effect: { sellValuePct: lvl => lvl * 6 },
    },
    lackiererei: {
      label: 'Lackiererei', icon: '🎨', cat: 'boni', maxLevel: 8,
      desc: 'Bessere Lackierungen erhöhen den Wert frisch gefertigter Fahrzeuge.',
      cost: lvl => ({ money: round(650 * Math.pow(1.68, lvl - 1)), parts: round(15 * Math.pow(1.3, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(25200, round(95 * Math.pow(1.5, lvl - 1))),
      effect: { rarityBonusPct: lvl => lvl * 3 },
    },
    personalbuero: {
      label: 'Personalbüro', icon: '🗂️', cat: 'boni', maxLevel: 10,
      desc: 'Schaltet zusätzliche Mitarbeiter-Slots frei.',
      cost: lvl => ({ money: round(600 * Math.pow(1.6, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(80 * Math.pow(1.45, lvl - 1))),
      effect: { employeeSlots: lvl => 1 + lvl },
    },
    generator: {
      label: 'Generator', icon: '🔌', cat: 'boni', maxLevel: 8,
      desc: 'Versorgt das Gelände mit Strom — steigert alle Produktionsraten.',
      cost: lvl => ({ money: round(800 * Math.pow(1.75, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(28800, round(110 * Math.pow(1.5, lvl - 1))),
      effect: { globalProdPct: lvl => lvl * 4 },
    },
    parkplatz: {
      label: 'Parkplatz', icon: '🅿️', cat: 'lager', maxLevel: 10,
      desc: 'Stellplätze für fertige, aber noch unverkaufte Fahrzeuge.',
      cost: lvl => ({ money: round(280 * Math.pow(1.5, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(14400, round(35 * Math.pow(1.4, lvl - 1))),
      effect: { vehicleSlots: lvl => 3 + lvl * 2 },
    },
    fahrzeughandel: {
      label: 'Fahrzeughandel', icon: '🏷️', cat: 'boni', maxLevel: 10,
      desc: 'Bessere Verhandlungen beim Fahrzeugverkauf.',
      cost: lvl => ({ money: round(500 * Math.pow(1.6, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(65 * Math.pow(1.45, lvl - 1))),
      effect: { sellBonusPct: lvl => lvl * 5 },
    },
    forschungszentrum: {
      label: 'Forschungszentrum', icon: '🔬', singleton: true, cat: 'spezial', maxLevel: 10,
      desc: 'Schaltet den Forschungsbaum frei. Stufe N einer Forschung benötigt Zentrum-Level N — höhere Level forschen außerdem schneller.',
      cost: lvl => ({ money: round(900 * Math.pow(1.7, lvl - 1)), electronics: round(40 * Math.pow(1.35, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(28800, round(150 * Math.pow(1.5, lvl - 1))),
      effect: { researchSpeedPct: lvl => (lvl - 1) * 4 },
    },
    dekoration: {
      label: 'Dekoration', icon: '🌳', cat: 'deko', maxLevel: 5, cosmetic: true,
      desc: 'Rein kosmetisch — verschönert das Werkstattgelände.',
      cost: lvl => ({ money: round(150 * Math.pow(1.4, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(3600, round(20 * Math.pow(1.3, lvl - 1))),
      effect: {},
    },
  };

  const EMPLOYEES = {
    mechaniker: { label: 'Mechaniker', icon: '🔧', linkedBuilding: 'towyard', bonusPerLevel: 0.05, desc: 'Erhöht die Produktion des Abschlepphofs.' },
    azubi: { label: 'Azubi', icon: '👷', linkedBuilding: null, bonusPerLevel: 0.02, desc: 'Generalist — kleiner Bonus auf alle Produktionsgebäude.' },
    pruefer: { label: 'Prüfer', icon: '📋', linkedBuilding: null, bonusPerLevel: 0.03, desc: 'Generalist — eigenes Gebäude (Prüfhalle) folgt in einer späteren Phase.' },
    abschlepper: { label: 'Abschlepper', icon: '🚛', linkedBuilding: 'towyard', bonusPerLevel: 0.05, desc: 'Erhöht die Produktion des Abschlepphofs.' },
    lackierer: { label: 'Lackierer', icon: '🎨', linkedBuilding: 'lackiererei', bonusPerLevel: 0.05, desc: 'Erhöht den Wertbonus der Lackiererei.' },
    elektriker: { label: 'Elektriker', icon: '💡', linkedBuilding: 'elektronikwerkstatt', bonusPerLevel: 0.05, desc: 'Erhöht die Produktion der Elektronikwerkstatt.' },
    tuner: { label: 'Tuner', icon: '🏎️', linkedBuilding: 'tuningzentrum', bonusPerLevel: 0.05, desc: 'Erhöht den Verkaufswert-Bonus des Tuningzentrums.' },
  };

  const VEHICLES = {
    abschleppwagen: { label: 'Abschleppwagen', icon: '🚚', tier: 1, rarity: 'common', baseValue: 180 },
    servicewagen: { label: 'Servicewagen', icon: '🚐', tier: 1, rarity: 'common', baseValue: 150 },
    transporter: { label: 'Transporter', icon: '🚛', tier: 1, rarity: 'common', baseValue: 200 },
    motorrad: { label: 'Motorrad', icon: '🏍️', tier: 1, rarity: 'uncommon', baseValue: 220 },
    suv: { label: 'SUV', icon: '🚙', tier: 2, rarity: 'uncommon', baseValue: 380 },
    musclecar: { label: 'Muscle Car', icon: '🚗', tier: 2, rarity: 'rare', baseValue: 520 },
    sportwagen: { label: 'Sportwagen', icon: '🏎️', tier: 3, rarity: 'epic', baseValue: 900 },
  };

  // ── Forschungsbaum (Phase 2) ─────────────────────────────────────────────
  // Stufe n einer Forschung benötigt Forschungszentrum-Level >= n.
  // `mod` benennt den Eintrag im researchMods()-Objekt, `perLevel` die Wirkung pro Stufe.
  // Semantik der Prozente: buildTimePct/buildCostPct/manuTimePct = REDUKTION,
  // capPct/prodPct/vehicleValuePct/missionRewardPct = ERHÖHUNG.
  const RESEARCH = {
    bauplanung: {
      label: 'Bauplanung', icon: '📐', maxLevel: 5, mod: 'buildTimePct', perLevel: 4, unit: '% Bauzeit',
      desc: 'Optimierte Abläufe — der Bautrupp arbeitet schneller.',
      cost: lvl => ({ money: round(700 * Math.pow(1.8, lvl - 1)), parts: round(40 * Math.pow(1.4, lvl - 1)) }),
      timeSec: lvl => round(600 * Math.pow(1.8, lvl - 1)),
    },
    einkauf: {
      label: 'Einkaufsnetzwerk', icon: '🧾', maxLevel: 5, mod: 'buildCostPct', perLevel: 3, unit: '% Baukosten',
      desc: 'Bessere Lieferantenpreise — Bauen und Ausbauen wird günstiger.',
      cost: lvl => ({ money: round(800 * Math.pow(1.8, lvl - 1)) }),
      timeSec: lvl => round(720 * Math.pow(1.8, lvl - 1)),
    },
    logistik: {
      label: 'Lagerlogistik', icon: '📦', maxLevel: 5, mod: 'capPct', perLevel: 6, unit: '% Lagerplatz',
      desc: 'Cleverere Regalsysteme — alle Lagerkapazitäten steigen.',
      cost: lvl => ({ money: round(600 * Math.pow(1.8, lvl - 1)), steel: round(60 * Math.pow(1.4, lvl - 1)) }),
      timeSec: lvl => round(540 * Math.pow(1.8, lvl - 1)),
    },
    produktionstechnik: {
      label: 'Produktionstechnik', icon: '🏭', maxLevel: 5, mod: 'prodPct', perLevel: 4, unit: '% Produktion',
      desc: 'Modernere Maschinen — alle Gebäude produzieren mehr.',
      cost: lvl => ({ money: round(900 * Math.pow(1.85, lvl - 1)), electronics: round(30 * Math.pow(1.4, lvl - 1)) }),
      timeSec: lvl => round(900 * Math.pow(1.85, lvl - 1)),
    },
    fliessband: {
      label: 'Fließbandfertigung', icon: '🛠️', maxLevel: 5, mod: 'manuTimePct', perLevel: 6, unit: '% Fertigungszeit',
      desc: 'Die Garage fertigt Fahrzeuge deutlich schneller.',
      cost: lvl => ({ money: round(750 * Math.pow(1.8, lvl - 1)), parts: round(50 * Math.pow(1.4, lvl - 1)) }),
      timeSec: lvl => round(780 * Math.pow(1.8, lvl - 1)),
    },
    motorentechnik: {
      label: 'Motorentechnik', icon: '🔩', maxLevel: 5, mod: 'vehicleValuePct', perLevel: 4, unit: '% Fahrzeugwert',
      desc: 'Bessere Technik unter der Haube — neue Fahrzeuge sind mehr wert.',
      cost: lvl => ({ money: round(850 * Math.pow(1.85, lvl - 1)), electronics: round(40 * Math.pow(1.4, lvl - 1)) }),
      timeSec: lvl => round(840 * Math.pow(1.85, lvl - 1)),
    },
    personalwesen: {
      label: 'Personalwesen', icon: '🗃️', maxLevel: 3, mod: 'extraEmployeeSlots', perLevel: 1, unit: ' Mitarbeiter-Slot(s)',
      desc: 'Moderne Personalarbeit — dauerhaft zusätzliche Mitarbeiter-Slots.',
      cost: lvl => ({ money: round(1200 * Math.pow(2, lvl - 1)) }),
      timeSec: lvl => round(1200 * Math.pow(2, lvl - 1)),
    },
    einsatzleitung: {
      label: 'Einsatzleitung', icon: '🎧', maxLevel: 5, mod: 'missionRewardPct', perLevel: 5, unit: '% Missionsertrag',
      desc: 'Professionelle Koordination — Einsätze bringen mehr Belohnung.',
      cost: lvl => ({ money: round(650 * Math.pow(1.8, lvl - 1)), fuel: round(40 * Math.pow(1.4, lvl - 1)) }),
      timeSec: lvl => round(600 * Math.pow(1.8, lvl - 1)),
    },
  };

  // Aggregiert abgeschlossene Forschungsstufen zu einem Modifikator-Objekt —
  // wird identisch im Server (Formeln) und im Client (Anzeige) verwendet.
  const researchMods = (levels) => {
    const m = { buildTimePct: 0, buildCostPct: 0, capPct: 0, prodPct: 0, manuTimePct: 0, vehicleValuePct: 0, missionRewardPct: 0, extraEmployeeSlots: 0 };
    Object.entries(levels || {}).forEach(([key, lvl]) => {
      const t = RESEARCH[key];
      if (t && lvl > 0) m[t.mod] += t.perLevel * Math.min(lvl, t.maxLevel);
    });
    return m;
  };

  // ── Einsätze / PvE-Missionen (Phase 2) ───────────────────────────────────
  // Ein Fahrzeug (>= minTier) fährt den Einsatz und ist solange gesperrt.
  // Slots kommen vom Abschlepphof (effect.missionSlots), Erträge werden durch
  // die Forschung "Einsatzleitung" erhöht und sind durch die Lager gedeckelt.
  const MISSIONS = {
    abschlepp: {
      label: 'Abschleppauftrag', icon: '🚨', minTier: 1, durationSec: 600, xp: 15,
      desc: 'Ein Liegenbleiber an der Route 68 muss in die Werkstatt.',
      rewards: { money: 120, steel: 20 },
    },
    motorrep: {
      label: 'Motorreparatur vor Ort', icon: '⚙️', minTier: 1, durationSec: 1800, xp: 35,
      desc: 'Motorschaden auf dem Highway — mobiler Einsatz mit Werkzeugkoffer.',
      rewards: { money: 260, parts: 35 },
    },
    vip: {
      label: 'VIP-Fahrzeug überführen', icon: '⭐', minTier: 2, durationSec: 3600, xp: 70,
      desc: 'Ein Promi aus Vinewood braucht einen diskreten Transport.',
      rewards: { money: 550, electronics: 30 },
    },
    polizei: {
      label: 'Polizeiauftrag', icon: '🚓', minTier: 2, durationSec: 7200, xp: 120,
      desc: 'Das LSPD lässt beschlagnahmte Fahrzeuge zum Verwahrhof bringen.',
      rewards: { money: 900, steel: 80, parts: 50 },
    },
    lkw: {
      label: 'LKW-Bergung', icon: '🚛', minTier: 3, durationSec: 14400, xp: 220,
      desc: 'Ein Sattelzug liegt im Graben am Mount Chiliad — schweres Gerät nötig.',
      rewards: { money: 1800, steel: 160, fuel: 90 },
    },
    gross: {
      label: 'Großauftrag: Flotten-Wartung', icon: '🏭', minTier: 3, durationSec: 28800, xp: 400,
      desc: 'Eine Spedition lässt ihre komplette Flotte durchchecken.',
      rewards: { money: 3600, steel: 200, parts: 150, electronics: 80 },
    },
  };

  // ── Spieler-Level (Phase 3) ──────────────────────────────────────────────
  // xpFor(l) = Gesamt-XP, um Level l zu ERREICHEN. XP kommen aus abgeschlossenen
  // Aktionen (Bau, Fertigung, Verkauf, Einsatz, Forschung, Quests, Erfolge).
  const LEVEL = {
    maxLevel: 60,
    xpFor: (lvl) => round(100 * Math.pow(Math.max(0, lvl - 1), 1.75)),
    fromXp(xp) { let l = 1; while (l < this.maxLevel && xp >= this.xpFor(l + 1)) l++; return l; },
    reward: (lvl) => ({ money: 150 * lvl, steel: 20 * lvl, parts: 15 * lvl, electronics: 10 * lvl, fuel: 12 * lvl }),
    titles: [
      [1, 'Schrauber-Lehrling'], [3, 'Hobbyschrauber'], [5, 'Geselle'], [8, 'Mechaniker'],
      [12, 'Werkstattleiter'], [16, 'KFZ-Meister'], [20, 'Unternehmer'], [25, 'Flotten-Boss'],
      [30, 'Auto-Tycoon'], [40, 'Werkstatt-Legende'], [50, 'ACLS-Ikone'],
    ],
    title(lvl) { let t = this.titles[0][1]; this.titles.forEach(([l, name]) => { if (lvl >= l) t = name; }); return t; },
  };
  // XP-Formeln pro Aktionstyp (Basis: nominelle Dauer/Wert, unabhängig von Forschungsrabatten)
  const XP = {
    build: (sec) => 10 + round(sec / 30),
    vehicle: (baseValue) => round(baseValue / 8),
    sell: (price) => round(price / 25),
    research: (sec) => 20 + round(sec / 40),
  };

  // ── Täglicher Login-Bonus (Phase 3): 7-Tage-Zyklus, skaliert mit Spieler-Level ──
  const DAILY_BONUS = {
    cycleDays: 7,
    scale: (level) => 1 + 0.2 * (Math.max(1, level) - 1),
    days: [
      { money: 300 },
      { money: 400, steel: 40 },
      { money: 550, parts: 40 },
      { money: 700, electronics: 30 },
      { money: 900, fuel: 60 },
      { money: 1200, steel: 60, parts: 50 },
      { money: 2500, steel: 120, parts: 90, electronics: 60, fuel: 90 },
    ],
    xp: (day) => 15 * day,
    rewards(day, level) {
      const s = this.scale(level);
      const base = this.days[(day - 1) % this.cycleDays];
      return Object.fromEntries(Object.entries(base).map(([r, v]) => [r, round(v * s)]));
    },
  };

  // ── Quests (Phase 3): pro Tag/Woche werden 3 Aufgaben aus dem Pool gelost ──
  // metric = Zähler, den der Server bei der passenden Aktion erhöht.
  // reward(level) skaliert mit dem Spieler-Level, XP sind fix.
  const QUESTS = {
    daily: {
      bau: { label: 'Fleißiger Bauherr', icon: '🏗️', desc: 'Schließe {n} Bauaufträge ab', metric: 'build', target: 2, xp: 60, reward: (lvl) => ({ money: 250 + 60 * lvl }) },
      fertigung: { label: 'Fließbandarbeit', icon: '🚗', desc: 'Fertige {n} Fahrzeuge', metric: 'vehicle', target: 2, xp: 60, reward: (lvl) => ({ steel: 60 + 10 * lvl, parts: 40 + 8 * lvl }) },
      verkauf: { label: 'Verkaufstalent', icon: '🏷️', desc: 'Verkaufe {n} Fahrzeuge', metric: 'sell', target: 2, xp: 50, reward: (lvl) => ({ money: 300 + 70 * lvl }) },
      einsatz: { label: 'Immer im Einsatz', icon: '🚨', desc: 'Schließe {n} Einsätze ab', metric: 'mission', target: 3, xp: 70, reward: (lvl) => ({ fuel: 60 + 10 * lvl, money: 200 + 40 * lvl }) },
      forschung: { label: 'Neugierig bleiben', icon: '🔬', desc: 'Schließe {n} Forschung ab', metric: 'research', target: 1, xp: 80, reward: (lvl) => ({ electronics: 30 + 6 * lvl }) },
      personal: { label: 'Guter Chef', icon: '👷', desc: 'Stelle {n} Mitarbeiter ein oder befördere sie', metric: 'employee', target: 2, xp: 50, reward: (lvl) => ({ money: 250 + 50 * lvl }) },
      umsatz: { label: 'Die Kasse klingelt', icon: '💰', desc: 'Verdiene {n} Geld durch Verkäufe & Einsätze', metric: 'earn', target: 1500, xp: 70, reward: (lvl) => ({ money: 350 + 80 * lvl }) },
    },
    weekly: {
      bau: { label: 'Großbaustelle', icon: '🏗️', desc: 'Schließe {n} Bauaufträge ab', metric: 'build', target: 12, xp: 350, reward: (lvl) => ({ money: 1500 + 300 * lvl, steel: 150 + 25 * lvl }) },
      fertigung: { label: 'Serienproduktion', icon: '🚗', desc: 'Fertige {n} Fahrzeuge', metric: 'vehicle', target: 10, xp: 320, reward: (lvl) => ({ steel: 250 + 40 * lvl, parts: 180 + 30 * lvl }) },
      verkauf: { label: 'Umsatzmaschine', icon: '🏷️', desc: 'Verkaufe {n} Fahrzeuge', metric: 'sell', target: 8, xp: 300, reward: (lvl) => ({ money: 2000 + 400 * lvl }) },
      einsatz: { label: 'Einsatz-Marathon', icon: '🚨', desc: 'Schließe {n} Einsätze ab', metric: 'mission', target: 15, xp: 380, reward: (lvl) => ({ money: 1200 + 250 * lvl, fuel: 200 + 30 * lvl }) },
      forschung: { label: 'Wissensdurst', icon: '🔬', desc: 'Schließe {n} Forschungen ab', metric: 'research', target: 3, xp: 400, reward: (lvl) => ({ electronics: 150 + 25 * lvl, money: 1000 + 200 * lvl }) },
      umsatz: { label: 'Wochenbilanz', icon: '💰', desc: 'Verdiene {n} Geld durch Verkäufe & Einsätze', metric: 'earn', target: 20000, xp: 400, reward: (lvl) => ({ money: 2500 + 500 * lvl }) },
    },
  };
  const questDesc = (q) => q.desc.replace('{n}', q.target.toLocaleString('de-DE'));

  // Deterministische Quest-Auswahl: gleicher Spieler + gleiche Periode = gleiche 3 Quests
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const pickQuests = (pool, seedStr, n = 3) => {
    let x = hashStr(seedStr) || 1;
    const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    const keys = Object.keys(pool);
    for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
    return keys.slice(0, n);
  };
  // Perioden-Schlüssel (UTC): daily = 'YYYY-MM-DD', weekly = ISO-Woche 'YYYY-Www'
  const isoWeek = (d) => {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  };
  const periodKey = (period, now = new Date()) => (period === 'weekly' ? isoWeek(now) : now.toISOString().slice(0, 10));

  // ── Erfolge (Phase 3): stat = Zähler im Server-Kontext, value = Schwelle ──
  const ACHIEVEMENTS = {
    bau1: { label: 'Baumeister I', icon: '🏗️', stat: 'upgrades_done', value: 1, xp: 30, money: 150, desc: 'Schließe deinen ersten Bauauftrag ab' },
    bau2: { label: 'Baumeister II', icon: '🏗️', stat: 'upgrades_done', value: 10, xp: 80, money: 400, desc: 'Schließe 10 Bauaufträge ab' },
    bau3: { label: 'Baumeister III', icon: '🏗️', stat: 'upgrades_done', value: 25, xp: 150, money: 1000, desc: 'Schließe 25 Bauaufträge ab' },
    bau4: { label: 'Baumeister IV', icon: '🏗️', stat: 'upgrades_done', value: 50, xp: 300, money: 2500, desc: 'Schließe 50 Bauaufträge ab' },
    bau5: { label: 'Baumeister V', icon: '🏗️', stat: 'upgrades_done', value: 100, xp: 600, money: 6000, desc: 'Schließe 100 Bauaufträge ab' },
    fzg1: { label: 'Vom Band gerollt', icon: '🚗', stat: 'vehicles_built', value: 1, xp: 30, money: 150, desc: 'Fertige dein erstes Fahrzeug' },
    fzg2: { label: 'Fließband I', icon: '🚗', stat: 'vehicles_built', value: 10, xp: 80, money: 400, desc: 'Fertige 10 Fahrzeuge' },
    fzg3: { label: 'Fließband II', icon: '🚗', stat: 'vehicles_built', value: 25, xp: 150, money: 1000, desc: 'Fertige 25 Fahrzeuge' },
    fzg4: { label: 'Fließband III', icon: '🚗', stat: 'vehicles_built', value: 60, xp: 300, money: 2500, desc: 'Fertige 60 Fahrzeuge' },
    fzg5: { label: 'Fahrzeugwerk', icon: '🏭', stat: 'vehicles_built', value: 150, xp: 600, money: 6000, desc: 'Fertige 150 Fahrzeuge' },
    verk1: { label: 'Erster Deal', icon: '🏷️', stat: 'vehicles_sold', value: 1, xp: 30, money: 150, desc: 'Verkaufe dein erstes Fahrzeug' },
    verk2: { label: 'Autohändler I', icon: '🏷️', stat: 'vehicles_sold', value: 10, xp: 80, money: 400, desc: 'Verkaufe 10 Fahrzeuge' },
    verk3: { label: 'Autohändler II', icon: '🏷️', stat: 'vehicles_sold', value: 30, xp: 150, money: 1000, desc: 'Verkaufe 30 Fahrzeuge' },
    verk4: { label: 'Autohändler III', icon: '🏷️', stat: 'vehicles_sold', value: 75, xp: 300, money: 2500, desc: 'Verkaufe 75 Fahrzeuge' },
    verk5: { label: 'Verkaufslegende', icon: '👑', stat: 'vehicles_sold', value: 180, xp: 600, money: 6000, desc: 'Verkaufe 180 Fahrzeuge' },
    eins1: { label: 'Erster Einsatz', icon: '🚨', stat: 'missions_done', value: 1, xp: 30, money: 150, desc: 'Schließe deinen ersten Einsatz ab' },
    eins2: { label: 'Einsatzleiter I', icon: '🚨', stat: 'missions_done', value: 10, xp: 80, money: 400, desc: 'Schließe 10 Einsätze ab' },
    eins3: { label: 'Einsatzleiter II', icon: '🚨', stat: 'missions_done', value: 30, xp: 150, money: 1000, desc: 'Schließe 30 Einsätze ab' },
    eins4: { label: 'Einsatzleiter III', icon: '🚨', stat: 'missions_done', value: 75, xp: 300, money: 2500, desc: 'Schließe 75 Einsätze ab' },
    eins5: { label: 'Retter der Straße', icon: '🦸', stat: 'missions_done', value: 150, xp: 600, money: 6000, desc: 'Schließe 150 Einsätze ab' },
    forsch1: { label: 'Forscher I', icon: '🔬', stat: 'researches_done', value: 1, xp: 40, money: 200, desc: 'Schließe deine erste Forschung ab' },
    forsch2: { label: 'Forscher II', icon: '🔬', stat: 'researches_done', value: 8, xp: 150, money: 1000, desc: 'Schließe 8 Forschungen ab' },
    forsch3: { label: 'Denkfabrik', icon: '🧠', stat: 'researches_done', value: 20, xp: 400, money: 3000, desc: 'Schließe 20 Forschungen ab' },
    geld1: { label: 'Goldgrube I', icon: '💰', stat: 'total_earned', value: 5000, xp: 40, money: 0, desc: 'Verdiene insgesamt 5.000 Geld' },
    geld2: { label: 'Goldgrube II', icon: '💰', stat: 'total_earned', value: 25000, xp: 100, money: 0, desc: 'Verdiene insgesamt 25.000 Geld' },
    geld3: { label: 'Goldgrube III', icon: '💰', stat: 'total_earned', value: 100000, xp: 250, money: 0, desc: 'Verdiene insgesamt 100.000 Geld' },
    geld4: { label: 'Halbe Million', icon: '🤑', stat: 'total_earned', value: 500000, xp: 500, money: 0, desc: 'Verdiene insgesamt 500.000 Geld' },
    geld5: { label: 'Werkstatt-Millionär', icon: '💎', stat: 'total_earned', value: 2000000, xp: 1000, money: 0, desc: 'Verdiene insgesamt 2.000.000 Geld' },
    lvl1: { label: 'Aufsteiger', icon: '⭐', stat: 'level', value: 5, xp: 0, money: 500, desc: 'Erreiche Spieler-Level 5' },
    lvl2: { label: 'Etabliert', icon: '⭐', stat: 'level', value: 10, xp: 0, money: 1500, desc: 'Erreiche Spieler-Level 10' },
    lvl3: { label: 'Respektiert', icon: '🌟', stat: 'level', value: 20, xp: 0, money: 4000, desc: 'Erreiche Spieler-Level 20' },
    lvl4: { label: 'Berühmt-berüchtigt', icon: '🌟', stat: 'level', value: 35, xp: 0, money: 10000, desc: 'Erreiche Spieler-Level 35' },
    buero1: { label: 'Wachsende Zentrale', icon: '🏢', stat: 'office_level', value: 3, xp: 60, money: 300, desc: 'Baue das Büro auf Level 3 aus' },
    buero2: { label: 'Firmensitz', icon: '🏢', stat: 'office_level', value: 6, xp: 200, money: 1200, desc: 'Baue das Büro auf Level 6 aus' },
    buero3: { label: 'Konzernzentrale', icon: '🏙️', stat: 'office_level', value: 10, xp: 500, money: 4000, desc: 'Baue das Büro auf Level 10 aus' },
    team1: { label: 'Teamgeist I', icon: '👷', stat: 'employees_count', value: 3, xp: 50, money: 250, desc: 'Beschäftige 3 Mitarbeiter gleichzeitig' },
    team2: { label: 'Teamgeist II', icon: '👷', stat: 'employees_count', value: 6, xp: 150, money: 800, desc: 'Beschäftige 6 Mitarbeiter gleichzeitig' },
    team3: { label: 'Großer Betrieb', icon: '🏭', stat: 'employees_count', value: 10, xp: 350, money: 2500, desc: 'Beschäftige 10 Mitarbeiter gleichzeitig' },
    streak1: { label: 'Stammgast', icon: '📅', stat: 'daily_streak', value: 7, xp: 120, money: 600, desc: 'Hole den Login-Bonus an 7 Tagen in Folge' },
    streak2: { label: 'Eiserne Routine', icon: '🔥', stat: 'daily_streak', value: 30, xp: 500, money: 3000, desc: 'Hole den Login-Bonus an 30 Tagen in Folge' },
    samml1: { label: 'Sammler I', icon: '🚙', stat: 'vehicle_types', value: 4, xp: 100, money: 500, desc: 'Fertige 4 verschiedene Fahrzeugtypen' },
    samml2: { label: 'Vollsortiment', icon: '🏎️', stat: 'vehicle_types', value: 7, xp: 300, money: 2000, desc: 'Fertige alle 7 Fahrzeugtypen' },
  };

  // Startkit exakt wie im Auftrag: Büro, Lager, Kleine Garage, Abschlepphof, Tanklager,
  // alle Level 1, in Zeile y=0 platziert (Index < 24 = initial freigeschaltet).
  const STARTER_KIT = [
    { key: 'office', x: 0, y: 0 },
    { key: 'storage', x: 1, y: 0 },
    { key: 'garage', x: 2, y: 0 },
    { key: 'towyard', x: 3, y: 0 },
    { key: 'tanklager', x: 4, y: 0 },
  ];

  const CONFIG = {
    GRID, cellIndex, isUnlocked, RESOURCES, BASE_CAP, BUILDINGS, EMPLOYEES, VEHICLES, RESEARCH, researchMods,
    MISSIONS, STARTER_KIT, EMP_MAX_LEVEL, empHireCost, empLevelCost,
    LEVEL, XP, DAILY_BONUS, QUESTS, questDesc, pickQuests, periodKey, ACHIEVEMENTS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.CLASH_OF_ACLS_CONFIG = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
