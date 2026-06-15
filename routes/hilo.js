const express = require('express');
const crypto  = require('crypto');

const HILO_MIN_BET     = 10;
const HILO_MAX_BET     = 1000;
const DAILY_LOSS_LIMIT = 2500;

const VAL_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS      = ['♠', '♥', '♦', '♣'];

function randomCard() {
  return {
    value: Math.floor(crypto.randomBytes(1)[0] % 13) + 1, // 1-13, crypto RNG
    suit:  Math.floor(crypto.randomBytes(1)[0] % 4),       // 0-3
  };
}

function dailyLoss(db, did) {
  return db.prepare(`
    SELECT COALESCE(SUM(ABS(amount)), 0) AS l
    FROM coin_transactions
    WHERE discord_id = ? AND reason = 'hilo:loss' AND date(created_at) = date('now')
  `).get(did).l;
}

module.exports = function makeHiLoRouter({ db, coinIdent, addCoins, rateLimit }) {
  const router = express.Router();

  // GET /api/hilo/start — erste Karte ziehen, in Session speichern
  router.get('/api/hilo/start', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    const card = randomCard();
    req.session.hiloCard = card;

    const bal  = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    const lost = dailyLoss(db, ident.id);

    res.json({
      card,
      label:     VAL_LABELS[card.value],
      suit:      SUITS[card.suit],
      balance:   bal,
      daily_loss: lost,
      limit:     DAILY_LOSS_LIMIT,
      min_bet:   HILO_MIN_BET,
      max_bet:   HILO_MAX_BET,
    });
  });

  // POST /api/hilo/play { bet, guess: 'higher'|'lower' }
  router.post('/api/hilo/play', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    if (rateLimit(`hilo:${ip}`, 40, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });

    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    const prevCard = req.session.hiloCard;
    if (!prevCard) return res.status(400).json({ error: 'Kein Spiel gestartet – zuerst /api/hilo/start aufrufen' });

    let { bet, guess } = req.body;
    bet = Math.round(+bet || 0);

    if (!['higher', 'lower'].includes(guess))
      return res.status(400).json({ error: 'Ungültiger Tipp (higher|lower)' });
    if (bet < HILO_MIN_BET || bet > HILO_MAX_BET)
      return res.status(400).json({ error: `Einsatz: ${HILO_MIN_BET}–${HILO_MAX_BET} Coins` });

    // Verlustlimit
    const lost = dailyLoss(db, ident.id);
    if (lost >= DAILY_LOSS_LIMIT)
      return res.status(400).json({ error: 'Tages-Verlustlimit erreicht – morgen wieder spielen', daily_loss: lost, limit: DAILY_LOSS_LIMIT });

    // Nächste Karte
    const nextCard = randomCard();

    // Sieg? Gleichstand = Verlust (Haus-Vorteil ~7,7 %)
    const won = (guess === 'higher' && nextCard.value > prevCard.value)
             || (guess === 'lower'  && nextCard.value < prevCard.value);
    const tie = nextCard.value === prevCard.value;

    let finalBal;
    if (won) {
      finalBal = addCoins(ident.id, ident.name, bet, 'hilo:win', { bet, prev: prevCard.value, next: nextCard.value });
    } else {
      const maxLoss = DAILY_LOSS_LIMIT - lost;
      const actualLoss = Math.min(bet, maxLoss);
      finalBal = addCoins(ident.id, ident.name, -actualLoss, 'hilo:loss', { bet: actualLoss, prev: prevCard.value, next: nextCard.value });
    }

    if (finalBal === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    // Neue Karte als nächste Current-Card speichern
    req.session.hiloCard = nextCard;

    res.json({
      prev_card:   { ...prevCard, label: VAL_LABELS[prevCard.value], suit: SUITS[prevCard.suit] },
      next_card:   { ...nextCard, label: VAL_LABELS[nextCard.value], suit: SUITS[nextCard.suit] },
      won,
      tie,
      payout:      won ? bet : -Math.min(bet, DAILY_LOSS_LIMIT - lost),
      balance:     finalBal,
      daily_loss:  dailyLoss(db, ident.id),
      limit:       DAILY_LOSS_LIMIT,
    });
  });

  return router;
};
