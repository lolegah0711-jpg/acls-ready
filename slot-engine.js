// ════════════════════════════════════════════════════════════════
//  ACLS Mega Spin — Tumble/Cascade-Slot-Engine (server-autoritativ)
//  6×5-Raster, "pays anywhere" (8+ gleiche), Freispiele + Multiplikatoren.
//  Reine Mathematik – keine Coin-/DB-Logik (die liegt in server.js).
//  Wird auch von der RTP-Simulation (sim) genutzt → deterministisch testbar.
// ════════════════════════════════════════════════════════════════

const COLS = 6, ROWS = 5, CELLS = COLS * ROWS;
const SCATTER = 8;            // Symbol-ID des Scatters (ACLS-Logo)
const PAY_SYMBOLS = 8;        // Symbol-IDs 0..7

// Gewichte für eine Zell-Ziehung (Symbol 0 = niedrigstwertig, 7 = höchstwertig)
const PAY_WEIGHTS  = [15, 14, 13, 12, 11, 10, 8, 6];
const SCATTER_WEIGHT = 2;
const TOTAL_WEIGHT = PAY_WEIGHTS.reduce((a, b) => a + b, 0) + SCATTER_WEIGHT;

// Auszahlung als Vielfaches des GESAMT-Einsatzes, je Symbol & Trefferzahl-Stufe.
// Stufen: [8–9, 10–11, 12+]  (Sweet-Bonanza-artig)
const PAYS = [
  [0.50, 1.10, 2.7],    // 0
  [0.70, 1.30, 4.0],    // 1
  [0.80, 1.90, 5.3],    // 2
  [1.10, 2.70, 8.0],    // 3
  [1.60, 4.00, 13.3],   // 4
  [2.70, 6.70, 21.4],   // 5
  [4.00, 10.70, 32.0],  // 6
  [6.70, 21.40, 66.8],  // 7
];

// Scatter-Auszahlung (Vielfaches des Einsatzes) ab 4 Scattern
const SCATTER_PAYS = { 4: 3, 5: 5, 6: 25 };
const FREE_SPINS_BASE = 10;        // 4+ Scatter → 10 Freispiele
const FREE_RETRIGGER  = 5;         // 3+ Scatter in Freispielen → +5
const FEATURE_BUY_COST = 100;      // Feature-Kauf = 100× Einsatz

// Multiplikator-Bomben (nur in Freispielen)
const MULT_VALUES  = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100];
const MULT_WEIGHTS = [22, 20, 16, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1];
// Erwartete Anzahl Multiplikatoren pro Freispiel (über mehrere Slots verteilt)
const MULT_CHANCE = [0.78, 0.42, 0.16];  // P(1), P(2), P(3) Bomben

// Sicherheits-Cap: maximaler Gewinn pro gesamtem Spin (Vielfaches des Einsatzes)
const MAX_WIN_MULT = 5000;

function defaultRng(n) {
  // Krypto-sichere Ganzzahl in [0, n) – im Server via crypto.randomInt überschrieben
  return Math.floor(Math.random() * n);
}

function drawCell(rng, allowScatter = true) {
  let roll = rng(allowScatter ? TOTAL_WEIGHT : TOTAL_WEIGHT - SCATTER_WEIGHT);
  for (let s = 0; s < PAY_SYMBOLS; s++) {
    if (roll < PAY_WEIGHTS[s]) return s;
    roll -= PAY_WEIGHTS[s];
  }
  return SCATTER;
}

function newBoard(rng, forceScatters = 0) {
  const grid = new Array(CELLS);
  for (let i = 0; i < CELLS; i++) grid[i] = drawCell(rng, true);
  if (forceScatters > 0) {
    // Feature-Kauf: exakt N Scatter garantiert platzieren
    const idx = [...Array(CELLS).keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = rng(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let k = 0; k < forceScatters; k++) grid[idx[k]] = SCATTER;
    // restliche Scatter entfernen, damit es exakt N sind
    for (let k = forceScatters; k < CELLS; k++) if (grid[idx[k]] === SCATTER) grid[idx[k]] = drawCell(rng, false);
  }
  return grid;
}

function countScatters(grid) {
  let c = 0;
  for (const v of grid) if (v === SCATTER) c++;
  return c;
}

// Findet alle Gewinn-Cluster (Symbol mit Anzahl ≥ 8, "pays anywhere")
function findClusters(grid) {
  const cellsBySym = Array.from({ length: PAY_SYMBOLS }, () => []);
  for (let i = 0; i < CELLS; i++) {
    const v = grid[i];
    if (v >= 0 && v < PAY_SYMBOLS) cellsBySym[v].push(i);
  }
  const clusters = [];
  for (let s = 0; s < PAY_SYMBOLS; s++) {
    if (cellsBySym[s].length >= 8) clusters.push({ s, cells: cellsBySym[s] });
  }
  return clusters;
}

function payTier(count) { return count >= 12 ? 2 : count >= 10 ? 1 : 0; }

function clusterPay(sym, count, bet) {
  return PAYS[sym][payTier(count)] * bet;
}

function scatterPay(count, bet) {
  return (SCATTER_PAYS[Math.min(count, 6)] || 0) * bet;
}

// Tumble: Gewinnzellen entfernen, oben nachfallen lassen, neu auffüllen.
function tumble(grid, clusters, rng) {
  const remove = new Set();
  for (const c of clusters) for (const cell of c.cells) remove.add(cell);
  const next = new Array(CELLS).fill(null);
  for (let col = 0; col < COLS; col++) {
    const kept = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      const idx = row * COLS + col;
      if (!remove.has(idx)) kept.push(grid[idx]);   // von unten nach oben behaltene
    }
    // kept[0] = unterste behaltene Zelle
    let row = ROWS - 1;
    for (const v of kept) { next[row * COLS + col] = v; row--; }
    while (row >= 0) { next[row * COLS + col] = drawCell(rng, true); row--; }
  }
  return next;
}

function rollMultipliers(rng) {
  const out = [];
  const r = rng(100) / 100;
  let n = 0;
  if (r < MULT_CHANCE[2]) n = 3;
  else if (r < MULT_CHANCE[2] + MULT_CHANCE[1]) n = 2;
  else if (r < MULT_CHANCE[2] + MULT_CHANCE[1] + MULT_CHANCE[0]) n = 1;
  const mtw = MULT_WEIGHTS.reduce((a, b) => a + b, 0);
  for (let k = 0; k < n; k++) {
    let roll = rng(mtw);
    for (let i = 0; i < MULT_VALUES.length; i++) {
      if (roll < MULT_WEIGHTS[i]) { out.push(MULT_VALUES[i]); break; }
      roll -= MULT_WEIGHTS[i];
    }
  }
  return out;
}

// Ein einzelner Spin (Basis oder Freispiel). Liefert Schritte für die Animation.
function playSpin(bet, { free = false, rng = defaultRng, forceScatters = 0 } = {}) {
  let grid = newBoard(rng, forceScatters);
  const scatters = countScatters(grid);
  const steps = [];
  let baseWin = 0;
  while (true) {
    const clusters = findClusters(grid);
    const stepWin = clusters.reduce((a, c) => a + clusterPay(c.s, c.cells.length, bet), 0);
    steps.push({ grid: grid.slice(), clusters, stepWin });
    if (!clusters.length) break;
    baseWin += stepWin;
    grid = tumble(grid, clusters, rng);
  }
  const scPay = scatterPay(scatters, bet);
  baseWin += scPay;

  let multipliers = [];
  let roundWin = baseWin;
  if (free) {
    multipliers = rollMultipliers(rng);
    if (baseWin > 0 && multipliers.length) {
      const sum = multipliers.reduce((a, b) => a + b, 0);
      roundWin = baseWin * sum;
    }
  }
  return { free, steps, scatters, scPay, multipliers, baseWin, roundWin };
}

// Komplette Spielrunde: Basis-Spin + ggf. Freispiele. Server-autoritativ.
function spin({ bet, freeBuy = false, rng = defaultRng }) {
  const rounds = [];
  let totalWin = 0;

  // Basis-Spin (Feature-Kauf erzwingt 4 Scatter)
  const base = playSpin(bet, { free: false, rng, forceScatters: freeBuy ? 4 : 0 });
  rounds.push(base);
  totalWin += base.roundWin;

  // Freispiele bei 4+ Scattern (oder gekauftem Feature)
  let freeSpins = (freeBuy || base.scatters >= 4) ? FREE_SPINS_BASE : 0;
  const freeSpinsAwarded = freeSpins;
  let guard = 0;
  while (freeSpins > 0 && guard < 500) {
    guard++; freeSpins--;
    const fr = playSpin(bet, { free: true, rng });
    rounds.push(fr);
    totalWin += fr.roundWin;
    if (fr.scatters >= 3) freeSpins += FREE_RETRIGGER;  // Retrigger
  }

  // Sicherheits-Cap gegen extreme Auszahlungen (Coin-Wirtschaft)
  const cap = bet * MAX_WIN_MULT;
  const capped = totalWin > cap;
  if (capped) totalWin = cap;

  return {
    rounds,
    totalWin: Math.floor(totalWin),
    baseScatters: base.scatters,
    freeSpinsAwarded,
    freeBuy: !!freeBuy,
    capped,
  };
}

module.exports = {
  spin, playSpin,
  COLS, ROWS, CELLS, SCATTER, PAY_SYMBOLS,
  FEATURE_BUY_COST, FREE_SPINS_BASE, MAX_WIN_MULT,
  PAYS, SCATTER_PAYS, MULT_VALUES,
};
