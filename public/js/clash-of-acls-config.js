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
      label: 'Büro', icon: '🏢', singleton: true, maxLevel: 15,
      desc: 'Verwaltungszentrale — schaltet neue Bauplätze frei und hebt das Level-Limit aller anderen Gebäude an.',
      cost: lvl => ({ money: round(500 * Math.pow(1.85, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(28800, round(90 * Math.pow(1.55, lvl - 1))),
      effect: { unlockedCells: lvl => Math.min(144, 24 + (lvl - 1) * 8), otherMaxLevel: lvl => lvl + 2 },
    },
    storage: {
      label: 'Lager', icon: '🏬', maxLevel: 10,
      desc: 'Erweitert die Lagerkapazität für alle Ressourcen.',
      cost: lvl => ({ money: round(250 * Math.pow(1.5, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(14400, round(45 * Math.pow(1.4, lvl - 1))),
      effect: { capBonus: lvl => ({ money: 400 * lvl, steel: 150 * lvl, parts: 150 * lvl, electronics: 100 * lvl, fuel: 120 * lvl }) },
    },
    towyard: {
      label: 'Abschlepphof', icon: '🚨', maxLevel: 12,
      desc: 'Abschleppaufträge bringen laufend Geld ein.',
      cost: lvl => ({ money: round(400 * Math.pow(1.6, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(60 * Math.pow(1.45, lvl - 1))),
      effect: { perHour: lvl => ({ money: 40 * lvl }) },
    },
    garage: {
      label: lvl => (lvl < 5 ? 'Kleine Garage' : 'Große Garage'), icon: '🔧', maxLevel: 10,
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
      label: 'Tanklager', icon: '⛽', maxLevel: 10,
      desc: 'Lagert und produziert Treibstoff.',
      cost: lvl => ({ money: round(350 * Math.pow(1.55, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(18000, round(50 * Math.pow(1.42, lvl - 1))),
      effect: { perHour: lvl => ({ fuel: 15 * lvl }), capBonus: lvl => ({ fuel: 200 * lvl }) },
    },
    motorenwerkstatt: {
      label: 'Motorenwerkstatt', icon: '⚙️', maxLevel: 12,
      desc: 'Zerlegt und fertigt Ersatzteile.',
      cost: lvl => ({ money: round(450 * Math.pow(1.6, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(70 * Math.pow(1.45, lvl - 1))),
      effect: { perHour: lvl => ({ parts: 12 * lvl }) },
    },
    elektronikwerkstatt: {
      label: 'Elektronikwerkstatt', icon: '💡', maxLevel: 12,
      desc: 'Stellt Elektronikbauteile her.',
      cost: lvl => ({ money: round(500 * Math.pow(1.6, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(75 * Math.pow(1.45, lvl - 1))),
      effect: { perHour: lvl => ({ electronics: 10 * lvl }) },
    },
    reifenlager: {
      label: 'Reifenlager', icon: '🛞', maxLevel: 10,
      desc: 'Lagert Reifen als zusätzliche Ersatzteil-Quelle.',
      cost: lvl => ({ money: round(300 * Math.pow(1.55, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(14400, round(40 * Math.pow(1.4, lvl - 1))),
      effect: { perHour: lvl => ({ parts: 8 * lvl }) },
    },
    schrottplatz: {
      label: 'Schrottplatz', icon: '🗑️', maxLevel: 12,
      desc: 'Verwertet Schrott zu Stahl.',
      cost: lvl => ({ money: round(350 * Math.pow(1.55, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(18000, round(55 * Math.pow(1.42, lvl - 1))),
      effect: { perHour: lvl => ({ steel: 14 * lvl }) },
    },
    tuningzentrum: {
      label: 'Tuningzentrum', icon: '🏎️', maxLevel: 8,
      desc: 'Wertet produzierte Fahrzeuge auf — höherer Verkaufswert.',
      cost: lvl => ({ money: round(700 * Math.pow(1.7, lvl - 1)), electronics: round(20 * Math.pow(1.3, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(25200, round(100 * Math.pow(1.5, lvl - 1))),
      effect: { sellValuePct: lvl => lvl * 6 },
    },
    lackiererei: {
      label: 'Lackiererei', icon: '🎨', maxLevel: 8,
      desc: 'Bessere Lackierungen erhöhen den Wert frisch gefertigter Fahrzeuge.',
      cost: lvl => ({ money: round(650 * Math.pow(1.68, lvl - 1)), parts: round(15 * Math.pow(1.3, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(25200, round(95 * Math.pow(1.5, lvl - 1))),
      effect: { rarityBonusPct: lvl => lvl * 3 },
    },
    personalbuero: {
      label: 'Personalbüro', icon: '🗂️', maxLevel: 10,
      desc: 'Schaltet zusätzliche Mitarbeiter-Slots frei.',
      cost: lvl => ({ money: round(600 * Math.pow(1.6, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(80 * Math.pow(1.45, lvl - 1))),
      effect: { employeeSlots: lvl => 1 + lvl },
    },
    generator: {
      label: 'Generator', icon: '🔌', maxLevel: 8,
      desc: 'Versorgt das Gelände mit Strom — steigert alle Produktionsraten.',
      cost: lvl => ({ money: round(800 * Math.pow(1.75, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(28800, round(110 * Math.pow(1.5, lvl - 1))),
      effect: { globalProdPct: lvl => lvl * 4 },
    },
    parkplatz: {
      label: 'Parkplatz', icon: '🅿️', maxLevel: 10,
      desc: 'Stellplätze für fertige, aber noch unverkaufte Fahrzeuge.',
      cost: lvl => ({ money: round(280 * Math.pow(1.5, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(14400, round(35 * Math.pow(1.4, lvl - 1))),
      effect: { vehicleSlots: lvl => 3 + lvl * 2 },
    },
    fahrzeughandel: {
      label: 'Fahrzeughandel', icon: '🏷️', maxLevel: 10,
      desc: 'Bessere Verhandlungen beim Fahrzeugverkauf.',
      cost: lvl => ({ money: round(500 * Math.pow(1.6, lvl - 1)) }),
      buildTimeSec: lvl => Math.min(21600, round(65 * Math.pow(1.45, lvl - 1))),
      effect: { sellBonusPct: lvl => lvl * 5 },
    },
    dekoration: {
      label: 'Dekoration', icon: '🌳', maxLevel: 5, cosmetic: true,
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

  // Startkit exakt wie im Auftrag: Büro, Lager, Kleine Garage, Abschlepphof, Tanklager,
  // alle Level 1, in Zeile y=0 platziert (Index < 24 = initial freigeschaltet).
  const STARTER_KIT = [
    { key: 'office', x: 0, y: 0 },
    { key: 'storage', x: 1, y: 0 },
    { key: 'garage', x: 2, y: 0 },
    { key: 'towyard', x: 3, y: 0 },
    { key: 'tanklager', x: 4, y: 0 },
  ];

  const CONFIG = { GRID, cellIndex, isUnlocked, RESOURCES, BASE_CAP, BUILDINGS, EMPLOYEES, VEHICLES, STARTER_KIT, EMP_MAX_LEVEL, empHireCost, empLevelCost };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.CLASH_OF_ACLS_CONFIG = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
