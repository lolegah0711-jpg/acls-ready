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
      label: 'Abschleppauftrag', icon: '🚨', minTier: 1, durationSec: 600,
      desc: 'Ein Liegenbleiber an der Route 68 muss in die Werkstatt.',
      rewards: { money: 120, steel: 20 },
    },
    motorrep: {
      label: 'Motorreparatur vor Ort', icon: '⚙️', minTier: 1, durationSec: 1800,
      desc: 'Motorschaden auf dem Highway — mobiler Einsatz mit Werkzeugkoffer.',
      rewards: { money: 260, parts: 35 },
    },
    vip: {
      label: 'VIP-Fahrzeug überführen', icon: '⭐', minTier: 2, durationSec: 3600,
      desc: 'Ein Promi aus Vinewood braucht einen diskreten Transport.',
      rewards: { money: 550, electronics: 30 },
    },
    polizei: {
      label: 'Polizeiauftrag', icon: '🚓', minTier: 2, durationSec: 7200,
      desc: 'Das LSPD lässt beschlagnahmte Fahrzeuge zum Verwahrhof bringen.',
      rewards: { money: 900, steel: 80, parts: 50 },
    },
    lkw: {
      label: 'LKW-Bergung', icon: '🚛', minTier: 3, durationSec: 14400,
      desc: 'Ein Sattelzug liegt im Graben am Mount Chiliad — schweres Gerät nötig.',
      rewards: { money: 1800, steel: 160, fuel: 90 },
    },
    gross: {
      label: 'Großauftrag: Flotten-Wartung', icon: '🏭', minTier: 3, durationSec: 28800,
      desc: 'Eine Spedition lässt ihre komplette Flotte durchchecken.',
      rewards: { money: 3600, steel: 200, parts: 150, electronics: 80 },
    },
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

  const CONFIG = { GRID, cellIndex, isUnlocked, RESOURCES, BASE_CAP, BUILDINGS, EMPLOYEES, VEHICLES, RESEARCH, researchMods, MISSIONS, STARTER_KIT, EMP_MAX_LEVEL, empHireCost, empLevelCost };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.CLASH_OF_ACLS_CONFIG = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
