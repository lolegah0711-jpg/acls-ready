const express = require('express');

// AutoMarkt Pro — Fahrzeughandel-Simulator.
// Eigene Währung (am_cash), damit die echte Coin-Wirtschaft nicht inflationiert
// werden kann. Echter Plattform-Bezug nur über gedeckelte Season-XP pro Tag.
// ponytail: Marktfaktor ist reines RNG (kein Live-Angebot/Nachfrage) — bei Bedarf
//           später durch aggregierte Verkaufsmengen ersetzen.
module.exports = function({ db, requireLogin, coinIdent, addSeasonXp, rateLimit }) {
  const router = express.Router();

  const VEHICLES = [
    { vkey: 'kleinwagen',  name: 'Stadtflitzer',    category: 'Kleinwagen',   rarity: 'common',    base: 6000 },
    { vkey: 'limousine',   name: 'Business-Limo',   category: 'Limousine',    rarity: 'common',    base: 12000 },
    { vkey: 'kombi',       name: 'Familien-Kombi',  category: 'Kombi',        rarity: 'common',    base: 10000 },
    { vkey: 'suv',         name: 'Gelände-SUV',     category: 'SUV',          rarity: 'rare',      base: 22000 },
    { vkey: 'pickup',      name: 'Arbeits-Pickup',  category: 'Nutzfahrzeug', rarity: 'rare',      base: 18000 },
    { vkey: 'hothatch',    name: 'Hot Hatch GTI',   category: 'Sportwagen',   rarity: 'rare',      base: 28000 },
    { vkey: 'muscle',      name: 'Muscle Car',      category: 'Sportwagen',   rarity: 'epic',      base: 45000 },
    { vkey: 'oldtimer',    name: 'Klassik-Oldtimer',category: 'Oldtimer',     rarity: 'epic',      base: 55000 },
    { vkey: 'sportcoupe',  name: 'Sport-Coupé',     category: 'Sportwagen',   rarity: 'epic',      base: 70000 },
    { vkey: 'supercar',    name: 'Supersportler',   category: 'Luxus',        rarity: 'legendary', base: 140000 },
    { vkey: 'hypercar',    name: 'Hypercar',        category: 'Luxus',        rarity: 'legendary', base: 250000 },
  ];
  const byKey = Object.fromEntries(VEHICLES.map(v => [v.vkey, v]));

  const RESTORE_PER_POINT = (base) => Math.max(20, Math.round(base * 0.006));
  const XP_DAILY_CAP = 100; // max. Season-XP/Tag aus AutoMarkt
  const RARITY_WEIGHT = { common: 10, rare: 5, epic: 2, legendary: 1 };
  const rand = (a, b) => a + Math.random() * (b - a);
  const today = () => new Date().toISOString().slice(0, 10);

  // Seltenheits-gewichtete Zufallswahl (Commons häufig, Legendaries selten)
  function pickVehicle(pool) {
    const total = pool.reduce((s, v) => s + RARITY_WEIGHT[v.rarity], 0);
    let r = Math.random() * total;
    for (const v of pool) { r -= RARITY_WEIGHT[v.rarity]; if (r <= 0) return v; }
    return pool[pool.length - 1];
  }
  function makeOffer(v) {
    const condition = Math.round(rand(25, 60));
    const price = Math.round(v.base * (condition / 100) * rand(0.9, 1.05));
    return { ...v, condition, price };
  }

  function getState(ident) {
    let s = db.prepare('SELECT * FROM am_state WHERE discord_id = ?').get(ident.id);
    if (!s) {
      db.prepare('INSERT INTO am_state (discord_id, username) VALUES (?,?)').run(ident.id, ident.name);
      s = db.prepare('SELECT * FROM am_state WHERE discord_id = ?').get(ident.id);
    }
    // Tagesangebote erzeugen wenn neuer Tag
    if (s.offer_date !== today()) {
      // Erstes Angebot garantiert bezahlbar, damit ein frischer Händler immer starten kann
      const budget = Math.max(s.cash, 2000);
      const affordable = VEHICLES.filter(v => v.base * 0.60 * 1.05 <= budget); // max möglicher Preis ≤ Budget
      const offers = [makeOffer(pickVehicle(affordable.length ? affordable : [VEHICLES[0]]))];
      for (let i = 1; i < 3; i++) offers.push(makeOffer(pickVehicle(VEHICLES)));
      db.prepare('UPDATE am_state SET offer_date = ?, offers = ? WHERE discord_id = ?').run(today(), JSON.stringify(offers), ident.id);
      s.offer_date = today(); s.offers = JSON.stringify(offers);
    }
    return s;
  }

  function awardXp(ident, s, amount) {
    let used = s.xp_day === today() ? s.xp_today : 0;
    const give = Math.max(0, Math.min(amount, XP_DAILY_CAP - used));
    if (give > 0) { addSeasonXp(ident.id, ident.name, give, 'automarkt'); used += give; }
    db.prepare('UPDATE am_state SET xp_day = ?, xp_today = ? WHERE discord_id = ?').run(today(), used, ident.id);
  }

  const levelFor = (profit) => Math.max(1, Math.floor(Math.sqrt(Math.max(0, profit) / 5000)) + 1);

  router.get('/api/automarkt', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    const s = getState(ident);
    const garage = db.prepare('SELECT * FROM am_garage WHERE discord_id = ? ORDER BY created_at DESC').all(ident.id);
    res.json({
      cash: s.cash, level: s.level, sold_count: s.sold_count, profit_total: s.profit_total,
      offers: JSON.parse(s.offers || '[]'),
      garage: garage.map(g => ({ ...g, restore_per_point: RESTORE_PER_POINT(g.base_value),
        sell_estimate: Math.round(g.base_value * (g.condition / 100)) })),
    });
  });

  // Fahrzeug aus dem Tagesangebot kaufen
  router.post('/api/automarkt/buy/:idx', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`am-buy:${ident.id}`, 30, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
    const s = getState(ident);
    const offers = JSON.parse(s.offers || '[]');
    const idx = +req.params.idx;
    const o = offers[idx];
    if (!o) return res.status(404).json({ error: 'Angebot nicht verfügbar' });
    if (s.cash < o.price) return res.status(400).json({ error: 'Nicht genug Guthaben' });
    db.prepare('UPDATE am_state SET cash = cash - ? WHERE discord_id = ?').run(o.price, ident.id);
    db.prepare('INSERT INTO am_garage (discord_id, vkey, name, category, rarity, base_value, condition, buy_price) VALUES (?,?,?,?,?,?,?,?)')
      .run(ident.id, o.vkey, o.name, o.category, o.rarity, o.base, o.condition, o.price);
    offers.splice(idx, 1);
    db.prepare('UPDATE am_state SET offers = ? WHERE discord_id = ?').run(JSON.stringify(offers), ident.id);
    res.json({ ok: true });
  });

  // Restaurieren: Zustand +Punkte gegen Guthaben
  router.post('/api/automarkt/restore/:id', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`am-restore:${ident.id}`, 60, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
    const g = db.prepare('SELECT * FROM am_garage WHERE id = ? AND discord_id = ?').get(+req.params.id, ident.id);
    if (!g) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    let points = Math.floor(+req.body.points || 0);
    if (points < 1) return res.status(400).json({ error: 'Ungültige Punktzahl' });
    points = Math.min(points, 100 - g.condition);
    if (points <= 0) return res.status(400).json({ error: 'Fahrzeug ist bereits top' });
    const cost = points * RESTORE_PER_POINT(g.base_value);
    const s = db.prepare('SELECT cash FROM am_state WHERE discord_id = ?').get(ident.id);
    if (s.cash < cost) return res.status(400).json({ error: 'Nicht genug Guthaben' });
    db.prepare('UPDATE am_state SET cash = cash - ? WHERE discord_id = ?').run(cost, ident.id);
    db.prepare('UPDATE am_garage SET condition = condition + ? WHERE id = ?').run(points, g.id);
    res.json({ ok: true, cost });
  });

  // Verkaufen: Marktwert = base × Zustand% × RNG-Marktfaktor
  router.post('/api/automarkt/sell/:id', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`am-sell:${ident.id}`, 30, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
    const g = db.prepare('SELECT * FROM am_garage WHERE id = ? AND discord_id = ?').get(+req.params.id, ident.id);
    if (!g) return res.status(404).json({ error: 'Fahrzeug nicht gefunden' });
    const marketFactor = rand(0.9, 1.2);
    const value = Math.round(g.base_value * (g.condition / 100) * marketFactor);
    const profit = value - g.buy_price;
    db.prepare('DELETE FROM am_garage WHERE id = ?').run(g.id);
    const s = db.prepare('SELECT * FROM am_state WHERE discord_id = ?').get(ident.id);
    const newProfit = s.profit_total + profit;
    db.prepare('UPDATE am_state SET cash = cash + ?, sold_count = sold_count + 1, profit_total = ?, level = ? WHERE discord_id = ?')
      .run(value, newProfit, levelFor(newProfit), ident.id);
    if (profit > 0) awardXp(ident, s, Math.min(15, Math.ceil(profit / 1000)));
    res.json({ ok: true, value, profit, marketFactor: +marketFactor.toFixed(2) });
  });

  router.get('/api/automarkt/leaderboard', requireLogin, (req, res) => {
    res.json(db.prepare(
      'SELECT username, level, sold_count, profit_total FROM am_state WHERE profit_total > 0 ORDER BY profit_total DESC LIMIT 15'
    ).all());
  });

  return router;
};
