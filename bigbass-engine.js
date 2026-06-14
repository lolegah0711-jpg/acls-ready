// ════════════════════════════════════════════════════════════════
//  ACLS Big Bass — "Money Collect"-Slot-Engine (server-autoritativ)
//  5×3-Raster, pay-anywhere (3+ gleiche, Wild substituiert).
//  Freispiele: Geldfische tragen Werte, Angler-Wild kassiert sie ein,
//  je 4 Angler → +10 Spins & Multiplikator-Stufe (×2 / ×3 / ×10).
//  Reine Mathematik – keine Coin-/DB-Logik. Über simulate() RTP-testbar.
// ════════════════════════════════════════════════════════════════

const COLS = 5, ROWS = 3, CELLS = COLS * ROWS;

// Symbol-IDs
const REGULARS = 6;          // 0..5  (niedrig → hoch)
const MONEY    = 6;          // Geldfisch (trägt Wert)
const WILD     = 7;          // Angler (kassiert im Freispiel)
const SCATTER  = 8;          // Köder (3+ → Freispiele)

// Zell-Gewichte – getrennt für Basis und Freispiel
const W_BASE = { reg: [16, 14, 12, 10, 8, 6], money: 4, wild: 2, scatter: 2 };
const W_FREE = { reg: [13, 11, 10, 8, 6, 5],  money: 8, wild: 3, scatter: 2 };

// Auszahlung Regulär (Vielfaches des Einsatzes), Stufen: [6–7, 8–9, 10+]
// (Mindestens 6 gleiche – seltenere, dafür größere Pays: auch Min-Einsätze
//  bleiben nach dem Floor fair, kein Sub-Coin-Verlust.)
const PAYS = [
  [1.1, 3.3, 10.5],   // 0
  [1.4, 4.2, 13.5],   // 1
  [1.8, 5.4, 17.5],   // 2
  [2.5, 7.5, 24.0],   // 3
  [3.9, 11.0, 36.0],  // 4
  [6.4, 19.5, 64.0],  // 5 (Premium)
];

const SCATTER_PAYS = { 3: 1, 4: 3, 5: 10 };
const FREE_SPINS_BASE = 10;
const FISHERMAN_STEP  = 4;                 // je 4 Angler → Mult-Stufe
const STEP_SPINS      = 10;                // Scatter-Retrigger: +10 Spins
const MULT_LADDER     = [1, 2, 3, 10];     // 0–3 / 4–7 / 8–11 / 12+ Angler
const FEATURE_BUY_COST = 60;               // Feature-Kauf = 60× Einsatz

// Geldfisch-Werte (Vielfaches des Einsatzes) und Gewichte
const MONEY_VALUES  = [0.5, 1, 1.5, 2, 3, 5, 8, 12, 20, 50, 200];
const MONEY_WEIGHTS = [34, 26, 18, 11, 7, 4, 2.5, 1.5, 0.8, 0.3, 0.06];

const MAX_WIN_MULT = 5000;                 // Sicherheits-Cap pro Runde

function defaultRng(n) { return Math.floor(Math.random() * n); }

function weightedPick(rng, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng(Math.round(total * 1000)) / 1000;
  for (let i = 0; i < weights.length; i++) { if (roll < weights[i]) return i; roll -= weights[i]; }
  return weights.length - 1;
}

// Eine Zelle ziehen (gibt Symbol-ID). Freispiel nutzt andere Gewichte.
function drawCell(rng, free) {
  const w = free ? W_FREE : W_BASE;
  const flat = [...w.reg, w.money, w.wild, w.scatter];
  const pick = weightedPick(rng, flat);
  if (pick < REGULARS) return pick;          // 0..5
  if (pick === REGULARS) return MONEY;        // 6
  if (pick === REGULARS + 1) return WILD;     // 7
  return SCATTER;                             // 8
}

function newBoard(rng, free, forceScatters = 0) {
  const grid = new Array(CELLS);
  for (let i = 0; i < CELLS; i++) grid[i] = drawCell(rng, free);
  if (forceScatters > 0) {
    const idx = [...Array(CELLS).keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = rng(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let k = 0; k < forceScatters; k++) grid[idx[k]] = SCATTER;
    for (let k = forceScatters; k < CELLS; k++) if (grid[idx[k]] === SCATTER) grid[idx[k]] = (drawCell(rng, free) === SCATTER ? 0 : drawCell(rng, free));
  }
  return grid;
}

function count(grid, sym) { let c = 0; for (const v of grid) if (v === sym) c++; return c; }

function payTier(n) { return n >= 10 ? 2 : n >= 8 ? 1 : 0; }

// Reguläre Gewinne (pay-anywhere ab 6 gleichen, Wild substituiert)
function regularWins(grid, bet) {
  const wilds = count(grid, WILD);
  const wins = [];
  let total = 0;
  for (let s = 0; s < REGULARS; s++) {
    const cells = [];
    for (let i = 0; i < CELLS; i++) if (grid[i] === s) cells.push(i);
    const n = cells.length + wilds;          // Wild zählt mit
    if (cells.length >= 2 && n >= 6) {
      const pay = PAYS[s][payTier(n)] * bet;
      if (pay > 0) { wins.push({ s, cells, wilds, n, pay }); total += pay; }
    }
  }
  return { wins, total };
}

function moneyOnGrid(grid, values) {
  const out = [];
  for (let i = 0; i < CELLS; i++) if (grid[i] === MONEY) out.push({ cell: i, value: values[i] });
  return out;
}

// Ein Spin. Im Freispiel werden Geldfischen Werte zugelost; Angler kassieren.
function playSpin(bet, { free = false, rng = defaultRng, forceScatters = 0, mult = 1 } = {}) {
  const grid = newBoard(rng, free, forceScatters);
  const scatters = count(grid, SCATTER);
  const reg = regularWins(grid, bet);
  const scPay = (SCATTER_PAYS[Math.min(scatters, 5)] || 0) * bet;

  // Geldwerte je Money-Zelle
  const values = new Array(CELLS).fill(0);
  for (let i = 0; i < CELLS; i++) if (grid[i] === MONEY) values[i] = MONEY_VALUES[weightedPick(rng, MONEY_WEIGHTS)];
  const money = moneyOnGrid(grid, values);
  const wilds = [];
  for (let i = 0; i < CELLS; i++) if (grid[i] === WILD) wilds.push(i);

  // Collect nur im Freispiel: jeder Angler kassiert ALLE Geldwerte (× Multiplikator)
  let collected = 0;
  if (free && wilds.length > 0 && money.length > 0) {
    const sum = money.reduce((a, m) => a + m.value, 0);
    collected = wilds.length * sum * mult * bet;
  }

  const spinWin = reg.total + scPay + collected;
  return { free, grid, scatters, reg: reg.wins, regWin: reg.total, scPay,
           money, wilds, collected, mult, fishermen: wilds.length, spinWin };
}

// Komplette Runde: Basis-Spin + ggf. Freispiele.
function spin({ bet, freeBuy = false, rng = defaultRng }) {
  const rounds = [];
  let totalWin = 0;

  const base = playSpin(bet, { free: false, rng, forceScatters: freeBuy ? 3 : 0 });
  rounds.push(base);
  totalWin += base.spinWin;

  let freeSpins = (freeBuy || base.scatters >= 3) ? FREE_SPINS_BASE : 0;
  const freeSpinsAwarded = freeSpins;
  let fishermenTotal = 0;
  let mult = MULT_LADDER[0];
  let guard = 0;

  while (freeSpins > 0 && guard < 1000) {
    guard++; freeSpins--;
    const fr = playSpin(bet, { free: true, rng, mult });
    rounds.push(fr);
    totalWin += fr.spinWin;

    // Angler-Leiter steigert NUR den Multiplikator (×2/×3/×10 bei 4/8/12 Anglern),
    // KEINE Extra-Spins → keine Runaway-Session. Extra-Spins nur über 3+ Scatter.
    fishermenTotal += fr.fishermen;
    mult = MULT_LADDER[Math.min(Math.floor(fishermenTotal / FISHERMAN_STEP), MULT_LADDER.length - 1)];
    if (fr.scatters >= 3) freeSpins += STEP_SPINS;                 // Scatter-Retrigger
  }

  const cap = bet * MAX_WIN_MULT;
  const capped = totalWin > cap;
  if (capped) totalWin = cap;

  return {
    rounds, totalWin: Math.floor(totalWin),
    baseScatters: base.scatters, freeSpinsAwarded,
    fishermen: fishermenTotal, finalMult: mult,
    freeBuy: !!freeBuy, capped,
  };
}

// Monte-Carlo-RTP (für Tuning). rng = Math.random-basiert reicht.
function simulate(n, { freeBuy = false, bet = 1000 } = {}) {
  let wagered = 0, won = 0, ftrig = 0, hit = 0, maxWin = 0;
  let reg = 0, sc = 0, coll = 0;
  for (let i = 0; i < n; i++) {
    const r = spin({ bet, freeBuy, rng: defaultRng });
    wagered += freeBuy ? bet * FEATURE_BUY_COST : bet;
    won += r.totalWin;
    for (const rd of r.rounds) { reg += rd.regWin; sc += rd.scPay; coll += rd.collected; }
    if (r.freeSpinsAwarded > 0) ftrig++;
    if (r.totalWin > 0) hit++;
    if (r.totalWin > maxWin) maxWin = r.totalWin;
  }
  return {
    rtp: won / wagered, freeTriggerPct: ftrig / n, hitPct: hit / n, maxWinX: maxWin,
    regRtp: reg / wagered, scRtp: sc / wagered, collRtp: coll / wagered, // vor Cap, grobe Anteile
  };
}

module.exports = {
  spin, playSpin, simulate,
  COLS, ROWS, CELLS, REGULARS, MONEY, WILD, SCATTER,
  FEATURE_BUY_COST, FREE_SPINS_BASE, MAX_WIN_MULT,
  PAYS, SCATTER_PAYS, MONEY_VALUES, MULT_LADDER,
};
