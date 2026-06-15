const express = require('express');
const crypto  = require('crypto');

// Europäisches Roulette (Single Zero)
const NUMBERS = Array.from({ length: 37 }, (_, i) => i); // 0-36
const RED_NUMS  = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const BLACK_NUMS = new Set([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]);

const ROULETTE_MIN     = 10;
const ROULETTE_MAX     = 500;
const ROULETTE_MAX_BET = 2000; // max Gesamteinsatz pro Spin
const DAILY_LOSS_LIMIT = 15000;

function spinResult() {
  const buf = crypto.randomBytes(4);
  return buf.readUInt32BE(0) % 37; // 0 – 36
}

function calcPayout(number, bets) {
  let totalWin = 0;
  for (const b of bets) {
    const { type, value, amount } = b;
    let hit = false;
    let mult = 0;
    switch (type) {
      case 'single':   hit = number === +value;                              mult = 35; break;
      case 'color':
        if (value === 'rot')   hit = RED_NUMS.has(number);
        if (value === 'schwarz') hit = BLACK_NUMS.has(number);
        if (value === 'null')  hit = number === 0;
        mult = (value === 'null') ? 35 : 1;
        break;
      case 'even_odd':
        if (number === 0) break;
        if (value === 'gerade') hit = number % 2 === 0;
        if (value === 'ungerade') hit = number % 2 !== 0;
        mult = 1; break;
      case 'half':
        if (number === 0) break;
        if (value === '1-18') hit = number >= 1 && number <= 18;
        if (value === '19-36') hit = number >= 19 && number <= 36;
        mult = 1; break;
      case 'dozen':
        if (number === 0) break;
        if (value === '1') hit = number >= 1 && number <= 12;
        if (value === '2') hit = number >= 13 && number <= 24;
        if (value === '3') hit = number >= 25 && number <= 36;
        mult = 2; break;
      case 'column':
        if (number === 0) break;
        if (value === '1') hit = number % 3 === 1;
        if (value === '2') hit = number % 3 === 2;
        if (value === '3') hit = number % 3 === 0;
        mult = 2; break;
    }
    if (hit) totalWin += amount * (mult + 1); // amount zurück + Gewinn
    // Einsatz ist bereits abgezogen worden — bei Verlust kein Rückgabe
  }
  return totalWin;
}

module.exports = function makeRouletteRouter({ db, coinIdent, addCoins, rateLimit, queueNotification }) {
  const router = express.Router();

  function dailyNet(did) {
    return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
      WHERE discord_id = ? AND reason LIKE 'roulette:%' AND date(created_at) = date('now')`).get(did).s;
  }

  // GET /api/roulette/state
  router.get('/api/roulette/state', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const bal  = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    const net  = dailyNet(ident.id);
    res.json({
      balance: bal,
      username: ident.name,
      minBet: ROULETTE_MIN,
      maxBet: ROULETTE_MAX,
      maxTotal: ROULETTE_MAX_BET,
      dailyNet: net,
      dailyLossLimit: DAILY_LOSS_LIMIT,
      lossLeft: Math.max(0, DAILY_LOSS_LIMIT + Math.min(0, net)),
      numbers: { red: [...RED_NUMS], black: [...BLACK_NUMS] },
    });
  });

  // POST /api/roulette/play — bets: [{ type, value, amount }, ...]
  router.post('/api/roulette/play', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`rl:${ident.id}`, 20, 60_000)) return res.status(429).json({ error: 'Zu schnell' });

    const bets = Array.isArray(req.body.bets) ? req.body.bets : [];
    if (!bets.length) return res.status(400).json({ error: 'Kein Einsatz platziert' });

    // Validiere jeden Einsatz
    const VALID_TYPES = new Set(['single','color','even_odd','half','dozen','column']);
    for (const b of bets) {
      if (!VALID_TYPES.has(b.type)) return res.status(400).json({ error: 'Ungültiger Einsatztyp' });
      const amt = Math.round(+b.amount || 0);
      if (amt < ROULETTE_MIN || amt > ROULETTE_MAX) return res.status(400).json({ error: `Einsatz muss zwischen ${ROULETTE_MIN} und ${ROULETTE_MAX} Coins liegen` });
      b.amount = amt;
    }

    const totalBet = bets.reduce((s, b) => s + b.amount, 0);
    if (totalBet > ROULETTE_MAX_BET) return res.status(400).json({ error: `Gesamteinsatz darf ${ROULETTE_MAX_BET} Coins nicht überschreiten` });

    // Tages-Verlustlimit prüfen
    const net = dailyNet(ident.id);
    if (net <= -DAILY_LOSS_LIMIT) return res.status(400).json({ error: 'Tages-Verlustlimit erreicht – bitte morgen wieder spielen' });

    // Gesamteinsatz abziehen
    const balAfterBet = addCoins(ident.id, ident.name, -totalBet, 'roulette:bet', { bets });
    if (balAfterBet === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    // Spin
    const number = spinResult();
    const payout = calcPayout(number, bets);

    let finalBal = balAfterBet;
    if (payout > 0) {
      finalBal = addCoins(ident.id, ident.name, payout, 'roulette:win', { number, payout });
    }

    // Farbe des Ergebnisses
    const color = number === 0 ? 'null' : RED_NUMS.has(number) ? 'rot' : 'schwarz';

    res.json({
      number,
      color,
      payout,
      net: payout - totalBet,
      balance: finalBal,
    });
  });

  // GET /api/roulette/history — letzte 20 Runden dieser Session (in-memory, kein DB)
  // Für echte History: casino/recent-wins nutzen

  return router;
};
