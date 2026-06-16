const express = require('express');
const crypto = require('crypto');
const slotEngine = require('../slot-engine');
const bigbassEngine = require('../bigbass-engine');

// Casino-Spiele: Blackjack, Mega Spin (Slot), Plinko, Big Bass, Mines, Rocket.
// Ausgelagert aus server.js. checkGameBadges/seasonIncQuest hängen an Badge-/Season-Logik
// mit vielen weiteren Aufrufstellen in server.js und werden daher injiziert statt verschoben.
module.exports = function({ db, coinIdent, addCoins, rateLimit, checkGameBadges, seasonIncQuest }) {
  const router = express.Router();

  // ════════════════════════════════════════════════════════════════
  //  BLACKJACK — serverseitig, Einsatz in ACLS-Coins
  // ════════════════════════════════════════════════════════════════
  const bjGames = new Map(); // discordId -> aktive Hand

  // Bei Server-Neustart gingen laufende Hände (RAM) verloren →
  // vermerkte Einsätze automatisch erstatten
  {
    const pending = db.prepare('SELECT * FROM blackjack_pending').all();
    for (const p of pending) {
      addCoins(p.discord_id, p.username, p.bet, 'blackjack:refund', { reason: 'Server-Neustart' });
      console.log(`[Blackjack] Einsatz erstattet nach Neustart: ${p.username} +${p.bet}`);
    }
    if (pending.length) db.prepare('DELETE FROM blackjack_pending').run();
  }

  function bjShuffledDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    const deck = [];
    for (const s of suits) for (const r of ranks) deck.push({ r, s });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
  function bjValue(cards) {
    let total = 0, aces = 0;
    for (const c of cards) {
      if (c.r === 'A') { total += 11; aces++; }
      else if (['J','Q','K'].includes(c.r)) total += 10;
      else total += +c.r;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }
  function bjPublic(g, done) {
    const base = {
      bet: g.bet, doubled: g.doubled,
      dealer: done ? g.dealer : [g.dealer[0], { r: '?', s: '?' }],
      dealerVal: done ? bjValue(g.dealer) : null,
      done: !!done,
    };
    if (g.split) {
      const ai = Math.min(g.split.active, 1);
      return { ...base, split: true, activeSplit: g.split.active, hands: g.split.hands, handVals: g.split.hands.map(bjValue), bets: g.split.bets, player: g.split.hands[ai], playerVal: bjValue(g.split.hands[ai]) };
    }
    return { ...base, player: g.player, playerVal: bjValue(g.player) };
  }
  // Dealer zieht bis 17, dann auswerten. Gibt {result, payout} zurück.
  function bjResolve(g, ident) {
    if (bjValue(g.player) <= 21) {
      while (bjValue(g.dealer) < 17) g.dealer.push(g.deck.pop());
    }
    const pv = bjValue(g.player), dv = bjValue(g.dealer);
    let payout = 0, result;
    if (pv > 21)                  result = 'bust';
    else if (dv > 21 || pv > dv)  { result = 'win';  payout = g.bet * 2; }
    else if (pv === dv)           { result = 'push'; payout = g.bet; }
    else                          result = 'loss';
    if (g.natural && result === 'win') payout = Math.floor(g.bet * 2.5);
    if (payout > 0) addCoins(ident.id, ident.name, payout, 'blackjack:' + result, { bet: g.bet });
    bjGames.delete(ident.id);
    db.prepare('DELETE FROM blackjack_pending WHERE discord_id = ?').run(ident.id);
    if (ident.user) checkGameBadges(ident.user.id, ident.id);
    // Größter Netto-Gewinn als Highscore
    const net = payout - g.bet;
    if (net > 0) {
      if (ident.user) {
        db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'blackjack', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, game) DO UPDATE SET
            score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END
        `).run(ident.user.id, net);
      } else {
        db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'blackjack', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(discord_id, game) DO UPDATE SET
            score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
            username = excluded.username
        `).run(ident.id, ident.name, net);
      }
    }
    return { result, payout };
  }

  function resolveSplit(g, ident) {
    const anyAlive = g.split.results.some(r => r !== 'bust');
    if (anyAlive) while (bjValue(g.dealer) < 17) g.dealer.push(g.deck.pop());
    const dv = bjValue(g.dealer);
    let totalPayout = 0;
    const splitResults = g.split.hands.map((hand, i) => {
      if (g.split.results[i] === 'bust') return { result: 'bust', payout: 0 };
      const pv = bjValue(hand);
      let payout = 0, result;
      if      (pv > 21)            { result = 'bust';  payout = 0; }
      else if (dv > 21 || pv > dv) { result = 'win';   payout = g.split.bets[i] * 2; }
      else if (pv === dv)          { result = 'push';  payout = g.split.bets[i]; }
      else                         { result = 'loss';  payout = 0; }
      totalPayout += payout;
      return { result, payout };
    });
    if (totalPayout > 0) addCoins(ident.id, ident.name, totalPayout, 'blackjack:split_result', { splitResults });
    bjGames.delete(ident.id);
    db.prepare('DELETE FROM blackjack_pending WHERE discord_id = ?').run(ident.id);
    if (ident.user) checkGameBadges(ident.user.id, ident.id);
    const net = totalPayout - g.bet * 2;
    if (net > 0) {
      if (ident.user) {
        db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'blackjack', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, game) DO UPDATE SET
            score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END
        `).run(ident.user.id, net);
      } else {
        db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'blackjack', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(discord_id, game) DO UPDATE SET
            score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
            username = excluded.username
        `).run(ident.id, ident.name, net);
      }
    }
    return splitResults;
  }

  router.get('/api/blackjack/state', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const row = db.prepare('SELECT balance, equipped_deck FROM coin_balances WHERE discord_id = ?').get(ident.id);
    const g = bjGames.get(ident.id);
    res.json({ balance: row?.balance ?? 0, hand: g ? bjPublic(g, false) : null, username: ident.name, deck: row?.equipped_deck || null });
  });

  router.post('/api/blackjack/start', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`bj:${ident.id}`, 30, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
    if (bjGames.has(ident.id)) return res.status(400).json({ error: 'Hand läuft bereits' });
    const bet = Math.floor(+req.body.bet || 0);
    if (bet < 10 || bet > 1000) return res.status(400).json({ error: 'Einsatz: 10 bis 1000 Coins' });
    const bal = addCoins(ident.id, ident.name, -bet, 'blackjack:bet');
    if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    const deck = bjShuffledDeck();
    const g = { deck, bet, doubled: false, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], natural: false };
    bjGames.set(ident.id, g);
    db.prepare('INSERT OR REPLACE INTO blackjack_pending (discord_id, username, bet) VALUES (?, ?, ?)').run(ident.id, ident.name, bet);

    // Natural Blackjack → sofort auswerten
    if (bjValue(g.player) === 21) {
      g.natural = true;
      const { result, payout } = bjResolve(g, ident);
      const newBal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
      return res.json({ hand: bjPublic(g, true), result, payout, balance: newBal });
    }
    res.json({ hand: bjPublic(g, false), balance: bal });
  });

  router.post('/api/blackjack/hit', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const g = bjGames.get(ident.id);
    if (!g) return res.status(400).json({ error: 'Keine aktive Hand' });
    if (g.split) {
      const hand = g.split.hands[g.split.active];
      hand.push(g.deck.pop());
      if (bjValue(hand) > 21) {
        g.split.results[g.split.active] = 'bust';
        if (g.split.active === 0) { g.split.active = 1; return res.json({ hand: bjPublic(g, false) }); }
        const splitResults = resolveSplit(g, ident);
        const pub = bjPublic(g, true);
        const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
        return res.json({ hand: pub, splitResults, payout: splitResults.reduce((s,r) => s+r.payout, 0), balance: bal });
      }
      return res.json({ hand: bjPublic(g, false) });
    }
    g.player.push(g.deck.pop());
    if (bjValue(g.player) > 21) {
      const { result, payout } = bjResolve(g, ident);
      const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
      return res.json({ hand: bjPublic(g, true), result, payout, balance: bal });
    }
    res.json({ hand: bjPublic(g, false) });
  });

  router.post('/api/blackjack/double', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const g = bjGames.get(ident.id);
    if (!g) return res.status(400).json({ error: 'Keine aktive Hand' });
    if (g.split) return res.status(400).json({ error: 'Verdoppeln beim Split nicht möglich' });
    if (g.player.length !== 2) return res.status(400).json({ error: 'Verdoppeln nur als erster Zug' });
    const extra = addCoins(ident.id, ident.name, -g.bet, 'blackjack:double');
    if (extra === null) return res.status(400).json({ error: 'Nicht genug Coins zum Verdoppeln' });
    g.bet *= 2; g.doubled = true;
    db.prepare('UPDATE blackjack_pending SET bet = ? WHERE discord_id = ?').run(g.bet, ident.id);
    g.player.push(g.deck.pop());
    const { result, payout } = bjResolve(g, ident);
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    res.json({ hand: bjPublic(g, true), result, payout, balance: bal });
  });

  router.post('/api/blackjack/stand', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const g = bjGames.get(ident.id);
    if (!g) return res.status(400).json({ error: 'Keine aktive Hand' });
    if (g.split) {
      if (g.split.active === 0) { g.split.active = 1; return res.json({ hand: bjPublic(g, false) }); }
      const splitResults = resolveSplit(g, ident);
      const pub = bjPublic(g, true);
      const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
      return res.json({ hand: pub, splitResults, payout: splitResults.reduce((s,r) => s+r.payout, 0), balance: bal });
    }
    const { result, payout } = bjResolve(g, ident);
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    res.json({ hand: bjPublic(g, true), result, payout, balance: bal });
  });

  router.post('/api/blackjack/split', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const g = bjGames.get(ident.id);
    if (!g) return res.status(400).json({ error: 'Keine aktive Hand' });
    if (g.split) return res.status(400).json({ error: 'Bereits gesplittet' });
    if (g.player.length !== 2) return res.status(400).json({ error: 'Split nur mit 2 Karten möglich' });
    if (g.player[0].r !== g.player[1].r) return res.status(400).json({ error: 'Split nur bei gleichen Karten' });
    const bal = addCoins(ident.id, ident.name, -g.bet, 'blackjack:split', { originalBet: g.bet });
    if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins zum Splitten' });
    g.split = {
      hands: [[g.player[0], g.deck.pop()], [g.player[1], g.deck.pop()]],
      bets: [g.bet, g.bet],
      active: 0,
      results: [null, null],
    };
    db.prepare('UPDATE blackjack_pending SET bet = ? WHERE discord_id = ?').run(g.bet * 2, ident.id);
    res.json({ hand: bjPublic(g, false), balance: bal });
  });

  router.post('/api/blackjack/insurance', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const g = bjGames.get(ident.id);
    if (!g) return res.status(400).json({ error: 'Keine aktive Hand' });
    if (g.insurance !== undefined) return res.status(400).json({ error: 'Versicherung bereits entschieden' });
    if (g.player.length !== 2 || g.split) return res.status(400).json({ error: 'Versicherung nur als erster Zug' });
    if (g.dealer[0].r !== 'A') return res.status(400).json({ error: 'Versicherung nur bei Dealer-Ass' });
    const insAmt = Math.floor(g.bet / 2);
    if (insAmt < 1) return res.status(400).json({ error: 'Einsatz zu klein für Versicherung' });
    const balAfter = addCoins(ident.id, ident.name, -insAmt, 'blackjack:insurance:bet');
    if (balAfter === null) return res.status(400).json({ error: 'Nicht genug Coins für Versicherung' });
    g.insurance = insAmt;
    const dealerBJ = bjValue(g.dealer) === 21;
    if (dealerBJ) {
      addCoins(ident.id, ident.name, insAmt * 3, 'blackjack:insurance:win');
      const playerBJ = bjValue(g.player) === 21;
      if (playerBJ) addCoins(ident.id, ident.name, g.bet, 'blackjack:push', { bet: g.bet });
      bjGames.delete(ident.id);
      db.prepare('DELETE FROM blackjack_pending WHERE discord_id = ?').run(ident.id);
      if (ident.user) checkGameBadges(ident.user.id, ident.id);
      const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
      return res.json({ hand: bjPublic(g, true), dealerBJ: true, insurance: 'win', insurancePayout: insAmt * 3, result: playerBJ ? 'push' : 'loss', payout: playerBJ ? g.bet : 0, balance: bal });
    }
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    res.json({ hand: bjPublic(g, false), insurance: 'lost', balance: bal });
  });

  // ════════════════════════════════════════════════════════════════
  //  ACLS Mega Spin — Tumble-Slot (server-autoritativ, Coin-Einsatz)
  //  Spielmathematik in slot-engine.js (RTP ~95 %, per Monte-Carlo getunt).
  //  Schutz: Max-Einsatz, Tages-Verlustlimit, harter Win-Cap, Rate-Limit, Krypto-RNG.
  // ════════════════════════════════════════════════════════════════
  const SLOT_MIN_BET          = 5;
  const SLOT_MAX_BET          = 250;
  const SLOT_FEATURE_MAX_BET  = 50;       // Feature-Kauf = 100× Einsatz → max 5000 Coins
  const SLOT_DAILY_LOSS_LIMIT = 15000;     // Spielerschutz: max Netto-Verlust pro Tag
  const SLOT_ABS_MAX_WIN      = 250000;   // harte Obergrenze pro Spin (Coin-Wirtschaft)

  function slotDailyNet(did) {
    return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
      WHERE discord_id = ? AND reason LIKE 'slot:%' AND date(created_at) = date('now')`).get(did).s;
  }

  router.get('/api/slot/state', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    const net = slotDailyNet(ident.id);
    res.json({
      balance: bal, username: ident.name,
      minBet: SLOT_MIN_BET, maxBet: SLOT_MAX_BET,
      featureCostMult: slotEngine.FEATURE_BUY_COST, featureMaxBet: SLOT_FEATURE_MAX_BET,
      dailyNet: net, dailyLossLimit: SLOT_DAILY_LOSS_LIMIT,
      lossLeft: Math.max(0, SLOT_DAILY_LOSS_LIMIT + Math.min(0, net)),
    });
  });

  router.post('/api/slot/spin', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`slot:${ident.id}`, 90, 60_000)) return res.status(429).json({ error: 'Zu schnell – kurz durchatmen' });

    const buyFeature = !!req.body.buyFeature;
    const bet    = Math.floor(+req.body.bet || 0);
    const maxBet = buyFeature ? SLOT_FEATURE_MAX_BET : SLOT_MAX_BET;
    if (!Number.isInteger(bet) || bet < SLOT_MIN_BET || bet > maxBet)
      return res.status(400).json({ error: `Einsatz: ${SLOT_MIN_BET}–${maxBet} Coins${buyFeature ? ' (Feature-Kauf)' : ''}` });

    // Spielerschutz: Tages-Verlustlimit (Netto-Verlust heute)
    const netBefore = slotDailyNet(ident.id);
    if (netBefore <= -SLOT_DAILY_LOSS_LIMIT)
      return res.status(400).json({ error: `Tages-Verlustlimit erreicht (${SLOT_DAILY_LOSS_LIMIT} Coins). Spielerschutz – morgen geht's weiter.` });

    const cost = buyFeature ? bet * slotEngine.FEATURE_BUY_COST : bet;
    const balAfterBet = addCoins(ident.id, ident.name, -cost, 'slot:bet', { bet, feature: buyFeature });
    if (balAfterBet === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    const result = slotEngine.spin({ bet, freeBuy: buyFeature, rng: (n) => crypto.randomInt(n) });
    const win = Math.min(result.totalWin, SLOT_ABS_MAX_WIN);
    let balance = balAfterBet;
    if (win > 0)
      balance = addCoins(ident.id, ident.name, win, 'slot:win', { bet, x: +(win / bet).toFixed(2), feature: buyFeature });

    // Highscore = größter Netto-Gewinn; Spiel-Badges
    const netWin = win - cost;
    if (netWin > 0) {
      if (ident.user) {
        db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'slot', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, game) DO UPDATE SET
            score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END`).run(ident.user.id, netWin);
        checkGameBadges(ident.user.id, ident.id);
      } else {
        db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'slot', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(discord_id, game) DO UPDATE SET
            score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
            username   = excluded.username`).run(ident.id, ident.name, netWin);
      }
    }
    try { seasonIncQuest(ident.id, 'games', 1); } catch {}

    res.json({
      ok: true, bet, cost, buyFeature,
      rounds: result.rounds, totalWin: win,
      capped: result.capped || win < result.totalWin,
      freeSpinsAwarded: result.freeSpinsAwarded, baseScatters: result.baseScatters,
      balance, dailyNet: slotDailyNet(ident.id),
    });
  });

  // ════════════════════════════════════════════════════════════════
  //  PLINKO  (Kugel fällt durch Pegs, landet im Multiplikator-Bucket)
  //  12 Reihen → 13 Buckets · Bucket = Anzahl Rechts-Bounces (binomial)
  //  RTP ~95 % pro Risiko · server-seitige Krypto-RNG, Tages-Verlustlimit
  // ════════════════════════════════════════════════════════════════
  const PLINKO_MIN_BET          = 5;
  const PLINKO_MAX_BET          = 250;
  const PLINKO_DAILY_LOSS_LIMIT = 15000;
  const PLINKO_ABS_MAX_WIN      = 250000;
  const PLINKO_ROWS             = 12;
  const PLINKO_TABLES = {
    low:    [8, 2.4, 1.4, 1.2, 1.08, 0.95, 0.6, 0.95, 1.08, 1.2, 1.4, 2.4, 8],
    medium: [29, 8, 3, 1.6, 1.0, 0.7, 0.5, 0.7, 1.0, 1.6, 3, 8, 29],
    high:   [170, 22, 5.5, 1.8, 0.5, 0.4, 0.4, 0.4, 0.5, 1.8, 5.5, 22, 170],
  };

  function plinkoDailyNet(did) {
    return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
      WHERE discord_id = ? AND reason LIKE 'plinko:%' AND date(created_at) = date('now')`).get(did).s;
  }

  router.get('/api/plinko/state', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    const net = plinkoDailyNet(ident.id);
    res.json({
      balance: bal, username: ident.name,
      minBet: PLINKO_MIN_BET, maxBet: PLINKO_MAX_BET, rows: PLINKO_ROWS, tables: PLINKO_TABLES,
      dailyNet: net, dailyLossLimit: PLINKO_DAILY_LOSS_LIMIT,
      lossLeft: Math.max(0, PLINKO_DAILY_LOSS_LIMIT + Math.min(0, net)),
    });
  });

  router.post('/api/plinko/drop', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`plinko:${ident.id}`, 90, 60_000)) return res.status(429).json({ error: 'Zu schnell – kurz durchatmen' });

    const risk = ['low', 'medium', 'high'].includes(req.body.risk) ? req.body.risk : 'medium';
    const bet  = Math.floor(+req.body.bet || 0);
    if (!Number.isInteger(bet) || bet < PLINKO_MIN_BET || bet > PLINKO_MAX_BET)
      return res.status(400).json({ error: `Einsatz: ${PLINKO_MIN_BET}–${PLINKO_MAX_BET} Coins` });

    // Spielerschutz: Tages-Verlustlimit
    if (plinkoDailyNet(ident.id) <= -PLINKO_DAILY_LOSS_LIMIT)
      return res.status(400).json({ error: `Tages-Verlustlimit erreicht (${PLINKO_DAILY_LOSS_LIMIT} Coins). Spielerschutz – morgen geht's weiter.` });

    const balAfterBet = addCoins(ident.id, ident.name, -bet, 'plinko:bet', { bet, risk });
    if (balAfterBet === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    // Kugel fallen lassen: pro Reihe 50/50 links(0)/rechts(1) – Bucket = Summe der Rechts
    const path = [];
    let rights = 0;
    for (let i = 0; i < PLINKO_ROWS; i++) { const r = crypto.randomInt(2); path.push(r); rights += r; }
    const bucket = rights;
    const mult   = PLINKO_TABLES[risk][bucket];
    const win    = Math.min(Math.floor(bet * mult), PLINKO_ABS_MAX_WIN);

    let balance = balAfterBet;
    if (win > 0) balance = addCoins(ident.id, ident.name, win, 'plinko:win', { bet, x: mult, bucket });

    // Highscore = größter Netto-Gewinn (Staff in game_scores, Bürger in visitor_game_scores)
    const netWin = win - bet;
    if (netWin > 0) {
      if (ident.user) {
        db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'plinko', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, game) DO UPDATE SET
            score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END`).run(ident.user.id, netWin);
        checkGameBadges(ident.user.id, ident.id);
      } else {
        db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'plinko', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(discord_id, game) DO UPDATE SET
            score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
            username   = excluded.username`).run(ident.id, ident.name, netWin);
      }
    }
    try { seasonIncQuest(ident.id, 'games', 1); } catch {}

    res.json({ ok: true, bet, risk, path, bucket, mult, win, balance, dailyNet: plinkoDailyNet(ident.id) });
  });

  // ════════════════════════════════════════════════════════════════
  //  BIG BASS  (Money-Collect-Slot, 5×3) — Mathematik in bigbass-engine.js
  //  Freispiele: Geldfische tragen Werte, Angler-Wild kassiert ein,
  //  je 4 Angler Multiplikator-Stufe (×2/×3/×10). RTP ~94 %.
  // ════════════════════════════════════════════════════════════════
  const BIGBASS_MIN_BET          = 5;
  const BIGBASS_MAX_BET          = 250;
  const BIGBASS_FEATURE_MAX_BET  = 50;       // Feature-Kauf = 60× Einsatz → max 3000 Coins
  const BIGBASS_DAILY_LOSS_LIMIT = 15000;
  const BIGBASS_ABS_MAX_WIN      = 250000;

  function bigbassDailyNet(did) {
    return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
      WHERE discord_id = ? AND reason LIKE 'bigbass:%' AND date(created_at) = date('now')`).get(did).s;
  }

  router.get('/api/bigbass/state', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    const net = bigbassDailyNet(ident.id);
    res.json({
      balance: bal, username: ident.name,
      minBet: BIGBASS_MIN_BET, maxBet: BIGBASS_MAX_BET,
      featureCostMult: bigbassEngine.FEATURE_BUY_COST, featureMaxBet: BIGBASS_FEATURE_MAX_BET,
      pays: bigbassEngine.PAYS, scatterPays: bigbassEngine.SCATTER_PAYS, moneyValues: bigbassEngine.MONEY_VALUES,
      cols: bigbassEngine.COLS, rows: bigbassEngine.ROWS,
      dailyNet: net, dailyLossLimit: BIGBASS_DAILY_LOSS_LIMIT,
      lossLeft: Math.max(0, BIGBASS_DAILY_LOSS_LIMIT + Math.min(0, net)),
    });
  });

  router.post('/api/bigbass/spin', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`bigbass:${ident.id}`, 90, 60_000)) return res.status(429).json({ error: 'Zu schnell – kurz durchatmen' });

    const buyFeature = !!req.body.buyFeature;
    const bet    = Math.floor(+req.body.bet || 0);
    const maxBet = buyFeature ? BIGBASS_FEATURE_MAX_BET : BIGBASS_MAX_BET;
    if (!Number.isInteger(bet) || bet < BIGBASS_MIN_BET || bet > maxBet)
      return res.status(400).json({ error: `Einsatz: ${BIGBASS_MIN_BET}–${maxBet} Coins${buyFeature ? ' (Feature-Kauf)' : ''}` });

    if (bigbassDailyNet(ident.id) <= -BIGBASS_DAILY_LOSS_LIMIT)
      return res.status(400).json({ error: `Tages-Verlustlimit erreicht (${BIGBASS_DAILY_LOSS_LIMIT} Coins). Spielerschutz – morgen geht's weiter.` });

    const cost = buyFeature ? bet * bigbassEngine.FEATURE_BUY_COST : bet;
    const balAfterBet = addCoins(ident.id, ident.name, -cost, 'bigbass:bet', { bet, feature: buyFeature });
    if (balAfterBet === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    const result = bigbassEngine.spin({ bet, freeBuy: buyFeature, rng: (n) => crypto.randomInt(n) });
    const win = Math.min(result.totalWin, BIGBASS_ABS_MAX_WIN);
    let balance = balAfterBet;
    if (win > 0)
      balance = addCoins(ident.id, ident.name, win, 'bigbass:win', { bet, x: +(win / bet).toFixed(2), feature: buyFeature });

    const netWin = win - cost;
    if (netWin > 0) {
      if (ident.user) {
        db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'bigbass', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, game) DO UPDATE SET
            score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END`).run(ident.user.id, netWin);
        checkGameBadges(ident.user.id, ident.id);
      } else {
        db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'bigbass', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(discord_id, game) DO UPDATE SET
            score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
            updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
            username   = excluded.username`).run(ident.id, ident.name, netWin);
      }
    }
    try { seasonIncQuest(ident.id, 'games', 1); } catch {}

    res.json({
      ok: true, bet, cost, buyFeature,
      rounds: result.rounds, totalWin: win,
      capped: result.capped || win < result.totalWin,
      freeSpinsAwarded: result.freeSpinsAwarded, baseScatters: result.baseScatters,
      fishermen: result.fishermen, finalMult: result.finalMult,
      balance, dailyNet: bigbassDailyNet(ident.id),
    });
  });

  // ════════════════════════════════════════════════════════════════
  //  MINES  (5×5 – Bomben meiden, Multiplikator steigt, jederzeit Cashout)
  //  RTP fest = MINES_RTP (jeder Cashout = RTP × faire Quote, strategieunabhängig).
  //  Spielzustand in DB (übersteht Neustarts).
  // ════════════════════════════════════════════════════════════════
  const MINES_MIN_BET = 5, MINES_MAX_BET = 250, MINES_TILES = 25;
  const MINES_DAILY_LOSS_LIMIT = 15000, MINES_ABS_MAX_WIN = 250000, MINES_RTP = 0.97;

  function minesDailyNet(did) {
    return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
      WHERE discord_id = ? AND reason LIKE 'mines:%' AND date(created_at) = date('now')`).get(did).s;
  }
  // Multiplikator nach k sicheren Aufdeckungen bei m Bomben (RTP × faire Quote)
  function minesMultiplier(mines, k) {
    if (k <= 0) return 1;
    let f = 1;
    for (let i = 0; i < k; i++) f *= (MINES_TILES - i) / (MINES_TILES - mines - i);
    return Math.floor(MINES_RTP * f * 100) / 100;
  }
  function minesStatePayload(g) {
    const revealed = JSON.parse(g.revealed);
    const safeTotal = MINES_TILES - g.mines;
    return {
      active: true, bet: g.bet, mines: g.mines, revealed, picks: revealed.length, safeTotal,
      multiplier: minesMultiplier(g.mines, revealed.length),
      nextMultiplier: revealed.length < safeTotal ? minesMultiplier(g.mines, revealed.length + 1) : null,
    };
  }
  function finishMinesScore(ident, netWin) {
    if (netWin <= 0) return;
    if (ident.user) {
      db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'mines', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, game) DO UPDATE SET
          score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END`).run(ident.user.id, netWin);
      checkGameBadges(ident.user.id, ident.id);
    } else {
      db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'mines', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(discord_id, game) DO UPDATE SET
          score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
          username = excluded.username`).run(ident.id, ident.name, netWin);
    }
  }

  router.get('/api/mines/state', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    const net = minesDailyNet(ident.id);
    const g = db.prepare('SELECT * FROM mines_games WHERE discord_id = ?').get(ident.id);
    res.json({
      balance: bal, username: ident.name,
      minBet: MINES_MIN_BET, maxBet: MINES_MAX_BET, tiles: MINES_TILES,
      dailyNet: net, dailyLossLimit: MINES_DAILY_LOSS_LIMIT,
      lossLeft: Math.max(0, MINES_DAILY_LOSS_LIMIT + Math.min(0, net)),
      game: g ? minesStatePayload(g) : null,
    });
  });

  router.post('/api/mines/start', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`mines:${ident.id}`, 60, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
    if (db.prepare('SELECT 1 FROM mines_games WHERE discord_id = ?').get(ident.id))
      return res.status(400).json({ error: 'Es läuft bereits ein Spiel' });
    const bet = Math.floor(+req.body.bet || 0);
    const mines = Math.floor(+req.body.mines || 0);
    if (!Number.isInteger(bet) || bet < MINES_MIN_BET || bet > MINES_MAX_BET)
      return res.status(400).json({ error: `Einsatz: ${MINES_MIN_BET}–${MINES_MAX_BET} Coins` });
    if (!Number.isInteger(mines) || mines < 1 || mines > 24)
      return res.status(400).json({ error: 'Bomben: 1–24' });
    if (minesDailyNet(ident.id) <= -MINES_DAILY_LOSS_LIMIT)
      return res.status(400).json({ error: `Tages-Verlustlimit erreicht (${MINES_DAILY_LOSS_LIMIT} Coins). Spielerschutz – morgen geht's weiter.` });

    const bal = addCoins(ident.id, ident.name, -bet, 'mines:bet', { bet, mines });
    if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    const idx = [...Array(MINES_TILES).keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const minePos = idx.slice(0, mines).sort((a, b) => a - b);
    db.prepare('INSERT INTO mines_games (discord_id, username, bet, mines, mine_pos, revealed) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ident.id, ident.name, bet, mines, JSON.stringify(minePos), '[]');
    try { seasonIncQuest(ident.id, 'games', 1); } catch {}

    const g = db.prepare('SELECT * FROM mines_games WHERE discord_id = ?').get(ident.id);
    res.json({ ok: true, balance: bal, ...minesStatePayload(g) });
  });

  router.post('/api/mines/reveal', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`mines-r:${ident.id}`, 60, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
    const g = db.prepare('SELECT * FROM mines_games WHERE discord_id = ?').get(ident.id);
    if (!g) return res.status(400).json({ error: 'Kein laufendes Spiel' });
    const tile = Math.floor(+req.body.tile);
    if (!Number.isInteger(tile) || tile < 0 || tile >= MINES_TILES) return res.status(400).json({ error: 'Ungültiges Feld' });
    const revealed = JSON.parse(g.revealed);
    if (revealed.includes(tile)) return res.status(400).json({ error: 'Feld schon aufgedeckt' });
    const minePos = JSON.parse(g.mine_pos);

    if (minePos.includes(tile)) {
      db.prepare('DELETE FROM mines_games WHERE discord_id = ?').run(ident.id);
      const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
      return res.json({ ok: true, mine: true, tile, minePositions: minePos, balance: bal, dailyNet: minesDailyNet(ident.id) });
    }

    revealed.push(tile);
    const safeTotal = MINES_TILES - g.mines;
    if (revealed.length >= safeTotal) {
      const mult = minesMultiplier(g.mines, safeTotal);
      const win = Math.min(Math.round(g.bet * mult), MINES_ABS_MAX_WIN);
      const bal = addCoins(ident.id, ident.name, win, 'mines:win', { bet: g.bet, mines: g.mines, x: mult });
      db.prepare('DELETE FROM mines_games WHERE discord_id = ?').run(ident.id);
      finishMinesScore(ident, win - g.bet);
      return res.json({ ok: true, mine: false, tile, revealed, cashedOut: true, multiplier: mult, win, balance: bal, minePositions: minePos });
    }
    db.prepare('UPDATE mines_games SET revealed = ? WHERE discord_id = ?').run(JSON.stringify(revealed), ident.id);
    res.json({ ok: true, mine: false, tile, revealed, picks: revealed.length, safeTotal,
      multiplier: minesMultiplier(g.mines, revealed.length),
      nextMultiplier: minesMultiplier(g.mines, revealed.length + 1) });
  });

  router.post('/api/mines/cashout', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`mines-c:${ident.id}`, 30, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
    const g = db.prepare('SELECT * FROM mines_games WHERE discord_id = ?').get(ident.id);
    if (!g) return res.status(400).json({ error: 'Kein laufendes Spiel' });
    const revealed = JSON.parse(g.revealed);
    if (revealed.length < 1) return res.status(400).json({ error: 'Erst mindestens ein Feld aufdecken' });
    const mult = minesMultiplier(g.mines, revealed.length);
    const win = Math.min(Math.round(g.bet * mult), MINES_ABS_MAX_WIN);
    const bal = addCoins(ident.id, ident.name, win, 'mines:win', { bet: g.bet, mines: g.mines, x: mult });
    db.prepare('DELETE FROM mines_games WHERE discord_id = ?').run(ident.id);
    finishMinesScore(ident, win - g.bet);
    res.json({ ok: true, win, multiplier: mult, balance: bal, minePositions: JSON.parse(g.mine_pos) });
  });

  // ════════════════════════════════════════════════════════════════
  //  ACLS ROCKET (Crash) — Ziel-Multiplikator setzen, vor dem Absturz kassieren.
  //  Crash-Punkt server-seitig: crash = RTP/(1-r). P(Crash ≥ m) = RTP/m
  //  → EV = RTP × Einsatz für JEDES Ziel (fair, exploit-/disconnect-sicher).
  // ════════════════════════════════════════════════════════════════
  const ROCKET_MIN_BET = 5, ROCKET_MAX_BET = 250;
  const ROCKET_DAILY_LOSS_LIMIT = 15000, ROCKET_ABS_MAX_WIN = 250000;
  const ROCKET_RTP = 0.97, ROCKET_MAX_TARGET = 100;

  function rocketDailyNet(did) {
    return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
      WHERE discord_id = ? AND reason LIKE 'rocket:%' AND date(created_at) = date('now')`).get(did).s;
  }
  function finishRocketScore(ident, netWin) {
    if (netWin <= 0) return;
    if (ident.user) {
      db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'rocket', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, game) DO UPDATE SET
          score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END`).run(ident.user.id, netWin);
      checkGameBadges(ident.user.id, ident.id);
    } else {
      db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'rocket', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(discord_id, game) DO UPDATE SET
          score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
          username = excluded.username`).run(ident.id, ident.name, netWin);
    }
  }

  router.get('/api/rocket/state', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    const net = rocketDailyNet(ident.id);
    res.json({
      balance: bal, username: ident.name,
      minBet: ROCKET_MIN_BET, maxBet: ROCKET_MAX_BET, maxTarget: ROCKET_MAX_TARGET,
      dailyNet: net, dailyLossLimit: ROCKET_DAILY_LOSS_LIMIT,
      lossLeft: Math.max(0, ROCKET_DAILY_LOSS_LIMIT + Math.min(0, net)),
    });
  });

  router.post('/api/rocket/play', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`rocket:${ident.id}`, 90, 60_000)) return res.status(429).json({ error: 'Zu schnell – kurz durchatmen' });
    const bet = Math.floor(+req.body.bet || 0);
    const target = Math.floor((+req.body.target || 0) * 100) / 100;
    if (!Number.isInteger(bet) || bet < ROCKET_MIN_BET || bet > ROCKET_MAX_BET)
      return res.status(400).json({ error: `Einsatz: ${ROCKET_MIN_BET}–${ROCKET_MAX_BET} Coins` });
    if (!isFinite(target) || target < 1.01 || target > ROCKET_MAX_TARGET)
      return res.status(400).json({ error: `Ziel-Multiplikator: 1.01×–${ROCKET_MAX_TARGET}×` });
    if (rocketDailyNet(ident.id) <= -ROCKET_DAILY_LOSS_LIMIT)
      return res.status(400).json({ error: `Tages-Verlustlimit erreicht (${ROCKET_DAILY_LOSS_LIMIT} Coins). Spielerschutz – morgen geht's weiter.` });

    const bal0 = addCoins(ident.id, ident.name, -bet, 'rocket:bet', { bet, target });
    if (bal0 === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    const r = crypto.randomInt(1, 1_000_000_000) / 1_000_000_000; // (0,1)
    const crashPoint = Math.floor((ROCKET_RTP / (1 - r)) * 100) / 100; // kann < 1.00 sein → Sofort-Crash
    const won = crashPoint >= target;
    let win = 0, balance = bal0;
    if (won) { win = Math.min(Math.round(bet * target), ROCKET_ABS_MAX_WIN); balance = addCoins(ident.id, ident.name, win, 'rocket:win', { bet, x: target }); finishRocketScore(ident, win - bet); }
    try { seasonIncQuest(ident.id, 'games', 1); } catch {}

    res.json({ ok: true, crashPoint, target, won, win, balance, dailyNet: rocketDailyNet(ident.id) });
  });

  // Big Wins für die Spielbank-Lobby (Slot + Blackjack)
  router.get('/api/casino/recent-wins', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const rows = db.prepare(`
      SELECT cb.username AS username, t.amount AS amount, t.reason AS reason, t.meta AS meta, t.created_at AS created_at
      FROM coin_transactions t LEFT JOIN coin_balances cb ON cb.discord_id = t.discord_id
      WHERE t.reason IN ('slot:win', 'blackjack:win', 'plinko:win', 'bigbass:win', 'mines:win', 'rocket:win') AND t.amount >= 250
      ORDER BY t.id DESC LIMIT 12`).all();
    res.json(rows.map(r => {
      let meta = {}; try { meta = JSON.parse(r.meta || '{}'); } catch {}
      return { username: r.username || 'Spieler', amount: r.amount, game: r.reason.split(':')[0], x: meta.x || null, at: r.created_at };
    }));
  });

  return router;
};
