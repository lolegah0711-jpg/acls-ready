const express = require('express');

const WORDS = [
  { word: 'POLIZEI',       hint: 'Ordnungshüter' },
  { word: 'STREIFE',       hint: 'Patrouille auf den Straßen' },
  { word: 'FAHNDUNG',      hint: 'Suche nach Verdächtigen' },
  { word: 'PROTOKOLL',     hint: 'Schriftliche Aufzeichnung' },
  { word: 'BUSSGELD',      hint: 'Strafe für Vergehen' },
  { word: 'FESTNAHME',     hint: 'Verhaftung einer Person' },
  { word: 'FUEHRERSCHEIN', hint: 'Nachweis der Fahrberechtigung' },
  { word: 'KONTROLLE',     hint: 'Überprüfung im Straßenverkehr' },
  { word: 'ABSCHLEPPEN',   hint: 'Fahrzeug aus dem Weg räumen' },
  { word: 'STREIFENWAGEN', hint: 'Polizeifahrzeug' },
  { word: 'BLAULICHT',     hint: 'Signalleuchte auf Einsatzfahrzeugen' },
  { word: 'FUNKGERAET',    hint: 'Kommunikationsgerät im Dienst' },
  { word: 'HANDSCHELLEN',  hint: 'Fesselungsmittel bei Verhaftungen' },
  { word: 'EINSATZWAGEN',  hint: 'Fahrzeug für den Notfall' },
  { word: 'GEISELNAHME',   hint: 'Schweres Verbrechen' },
  { word: 'BANKRAUB',      hint: 'Überfall auf eine Bank' },
  { word: 'VERFOLGUNG',    hint: 'Hinterherjagen eines Flüchtigen' },
  { word: 'AUSBILDUNG',    hint: 'Training und Qualifizierung' },
  { word: 'BEFOERDERUNG',  hint: 'Aufstieg im Rang' },
  { word: 'IDENTITAET',    hint: 'Wer jemand ist' },
  { word: 'TATORT',        hint: 'Ort des Verbrechens' },
  { word: 'ZEUGE',         hint: 'Hat das Vergehen gesehen' },
  { word: 'MUNITION',      hint: 'Patronen für eine Schusswaffe' },
  { word: 'SIRENE',        hint: 'Akustisches Warnsignal' },
  { word: 'NOTRUF',        hint: 'Hilferuf in der Not' },
  { word: 'GERICHTSSAAL',  hint: 'Ort der Verhandlung' },
  { word: 'VERDAECHTIGER', hint: 'Person unter Verdacht' },
  { word: 'BESCHLAGNAHME', hint: 'Einziehung von Gegenständen' },
  { word: 'ALKOHOLTEST',   hint: 'Atemkontrolle im Straßenverkehr' },
  { word: 'SPURENSICHERUNG',hint: 'Beweismittelsuche am Tatort' },
  { word: 'PARKVERBOT',    hint: 'Halteverbot in einer Zone' },
  { word: 'SCHICHTPLAN',   hint: 'Dienstplanung für Mitarbeiter' },
  { word: 'WERKZEUG',      hint: 'Gerät für Reparaturen' },
  { word: 'MOTORRAD',      hint: 'Zweirädriges Kraftfahrzeug' },
  { word: 'HUBSCHRAUBER',  hint: 'Luftfahrzeug mit Rotorblättern' },
  { word: 'KRAFTSTOFF',    hint: 'Sprit für das Fahrzeug' },
  { word: 'UEBERHOLEN',    hint: 'An einem anderen Fahrzeug vorbeifahren' },
  { word: 'AMPEL',         hint: 'Verkehrssignalanlage' },
  { word: 'AUTOPANNE',     hint: 'Fahrzeugausfall auf der Straße' },
  { word: 'STECKBRIEF',    hint: 'Personenbeschreibung zur Fahndung' },
  { word: 'BEWERBUNG',     hint: 'Antrag auf eine Stelle' },
  { word: 'CODENAME',      hint: 'Geheimer Deckname' },
  { word: 'RAZZIA',        hint: 'Plötzliche Polizeiaktion' },
  { word: 'UNDERCOVER',    hint: 'Verdeckter Ermittler' },
  { word: 'KARTELLCHEF',   hint: 'Anführer einer kriminellen Organisation' },
];

const MIN_BET   = 25;
const MAX_BET   = 500;
const WIN_MULT  = 2.0;
const MAX_WRONG = 6;

module.exports = function makeHangmanRouter({ db, coinIdent, addCoins, rateLimit }) {
  const router = express.Router();

  router.get('/api/hangman/start', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    let bet = Math.round(+req.query.bet || 0);
    if (bet < MIN_BET || bet > MAX_BET)
      return res.status(400).json({ error: `Einsatz: ${MIN_BET}–${MAX_BET} Coins` });

    const newBal = addCoins(ident.id, ident.name, -bet, 'hangman:bet', { bet });
    if (newBal === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    const pick = WORDS[Math.floor(Math.random() * WORDS.length)];
    req.session.hangman = {
      word:    pick.word,
      hint:    pick.hint,
      guessed: [],
      wrong:   0,
      bet,
      done:    false,
    };

    res.json({
      length:    pick.word.length,
      hint:      pick.hint,
      wrong:     0,
      max_wrong: MAX_WRONG,
      guessed:   [],
      display:   Array.from(pick.word).map(() => '_'),
      balance:   newBal,
      bet,
      min_bet:   MIN_BET,
      max_bet:   MAX_BET,
      win_mult:  WIN_MULT,
    });
  });

  router.post('/api/hangman/guess', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    if (rateLimit(`hangman:${ip}`, 120, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });

    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    const g = req.session.hangman;
    if (!g || g.done) return res.status(400).json({ error: 'Kein aktives Spiel – zuerst starten' });

    const letter = String(req.body.letter || '').toUpperCase().trim();
    if (!letter || letter.length !== 1) return res.status(400).json({ error: 'Ungültiger Buchstabe' });

    if (g.guessed.includes(letter))
      return res.status(400).json({ error: 'Buchstabe bereits geraten' });

    g.guessed.push(letter);
    const isCorrect = g.word.includes(letter);
    if (!isCorrect) g.wrong++;

    const display = Array.from(g.word).map(c => g.guessed.includes(c) ? c : '_');
    const won  = display.every(c => c !== '_');
    const lost = g.wrong >= MAX_WRONG;

    let balance = null;
    let payout  = 0;

    if (won || lost) {
      g.done = true;
      if (won) {
        payout  = Math.round(g.bet * WIN_MULT);
        balance = addCoins(ident.id, ident.name, payout, 'hangman:win', { bet: g.bet, word: g.word });

        const userId = db.prepare('SELECT id FROM users WHERE discord_id = ?').get(ident.id)?.id;
        if (userId) {
          const prev = db.prepare(`SELECT score FROM game_scores WHERE user_id = ? AND game = 'hangman'`).get(userId)?.score ?? 0;
          db.prepare(`
            INSERT INTO game_scores (user_id, game, score, updated_at)
            VALUES (?, 'hangman', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, game) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at
          `).run(userId, prev + 1);
        }
      }
    }

    res.json({
      correct:   isCorrect,
      letter,
      display,
      guessed:   g.guessed,
      wrong:     g.wrong,
      max_wrong: MAX_WRONG,
      won,
      lost,
      word:      (won || lost) ? g.word : null,
      balance,
      payout,
      bet:       g.bet,
    });
  });

  router.get('/api/hangman/balance', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    res.json({ balance: bal, min_bet: MIN_BET, max_bet: MAX_BET, win_mult: WIN_MULT });
  });

  return router;
};
