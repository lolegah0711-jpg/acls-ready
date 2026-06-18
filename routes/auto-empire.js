const express = require('express');

// Auto Empire — Idle-Wirtschaftsstrategie. Werkstätten + Mechaniker produzieren
// auch offline (gedeckelt auf 8h). Eigene Währung (ae_cash) schützt die echte
// Coin-Wirtschaft; Plattform-Bezug nur über gedeckelte Season-XP/Tag.
module.exports = function({ db, requireLogin, coinIdent, addSeasonXp, rateLimit }) {
  const router = express.Router();

  const BASE_RATE = 50;            // ae_cash / Stunde / Werkstatt
  const OFFLINE_CAP_H = 8;         // max. Offline-Produktion in Stunden
  const XP_DAILY_CAP = 100;
  const today = () => new Date().toISOString().slice(0, 10);

  const workshopCost = (n) => Math.round(800 * Math.pow(1.6, n - 1));   // nächste Werkstatt
  const mechanicCost = (n) => Math.round(500 * Math.pow(1.5, n));       // nächster Mechaniker
  const ratePerHour  = (s) => Math.round(s.workshops * BASE_RATE * (1 + s.mechanics * 0.5));
  const levelFor     = (produced) => Math.max(1, Math.floor(Math.sqrt(produced / 2000)) + 1);

  function getState(ident) {
    let s = db.prepare('SELECT * FROM ae_state WHERE discord_id = ?').get(ident.id);
    if (!s) {
      db.prepare('INSERT INTO ae_state (discord_id, username) VALUES (?,?)').run(ident.id, ident.name);
      s = db.prepare('SELECT * FROM ae_state WHERE discord_id = ?').get(ident.id);
    }
    return s;
  }

  function pending(s) {
    const elapsedH = Math.min(OFFLINE_CAP_H, (Date.now() - new Date(s.last_collect + 'Z').getTime()) / 3.6e6);
    return Math.max(0, Math.floor(ratePerHour(s) * elapsedH));
  }

  function awardXp(ident, s, amount) {
    let used = s.xp_day === today() ? s.xp_today : 0;
    const give = Math.max(0, Math.min(amount, XP_DAILY_CAP - used));
    if (give > 0) { addSeasonXp(ident.id, ident.name, give, 'auto-empire'); used += give; }
    db.prepare('UPDATE ae_state SET xp_day = ?, xp_today = ? WHERE discord_id = ?').run(today(), used, ident.id);
  }

  function view(s) {
    return {
      cash: s.cash, workshops: s.workshops, mechanics: s.mechanics, level: s.level,
      total_produced: s.total_produced, rate_per_hour: ratePerHour(s),
      pending: pending(s), offline_cap_h: OFFLINE_CAP_H,
      next_workshop_cost: workshopCost(s.workshops + 1),
      next_mechanic_cost: mechanicCost(s.mechanics),
    };
  }

  router.get('/api/empire', requireLogin, (req, res) => {
    res.json(view(getState(coinIdent(req))));
  });

  // Produktion einsammeln
  router.post('/api/empire/collect', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`ae-collect:${ident.id}`, 60, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
    const s = getState(ident);
    const got = pending(s);
    if (got <= 0) return res.status(400).json({ error: 'Noch nichts produziert' });
    db.prepare("UPDATE ae_state SET cash = cash + ?, total_produced = total_produced + ?, last_collect = datetime('now'), level = ? WHERE discord_id = ?")
      .run(got, got, levelFor(s.total_produced + got), ident.id);
    awardXp(ident, s, Math.min(10, Math.ceil(got / 500)));
    res.json({ ok: true, collected: got, ...view(getState(ident)) });
  });

  // Werkstatt bauen
  router.post('/api/empire/build', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    const s = getState(ident);
    const cost = workshopCost(s.workshops + 1);
    if (s.cash < cost) return res.status(400).json({ error: 'Nicht genug Guthaben' });
    db.prepare('UPDATE ae_state SET cash = cash - ?, workshops = workshops + 1 WHERE discord_id = ?').run(cost, ident.id);
    res.json({ ok: true, ...view(getState(ident)) });
  });

  // Mechaniker einstellen
  router.post('/api/empire/hire', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    const s = getState(ident);
    const cost = mechanicCost(s.mechanics);
    if (s.cash < cost) return res.status(400).json({ error: 'Nicht genug Guthaben' });
    db.prepare('UPDATE ae_state SET cash = cash - ?, mechanics = mechanics + 1 WHERE discord_id = ?').run(cost, ident.id);
    res.json({ ok: true, ...view(getState(ident)) });
  });

  router.get('/api/empire/leaderboard', requireLogin, (req, res) => {
    res.json(db.prepare(
      'SELECT username, level, workshops, mechanics, total_produced FROM ae_state WHERE total_produced > 0 ORDER BY total_produced DESC LIMIT 15'
    ).all());
  });

  return router;
};
