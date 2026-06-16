const express = require('express');

// Spieler-Marktplatz für Shop-Items (item_market).
// Ausgelagert aus server.js — Abhängigkeiten via sharedDeps.
module.exports = function({ db, requireAuth, rateLimit, addCoins, SHOP_ITEMS, sseEmit, createNotif }) {
  const router = express.Router();

  // Alle offenen Angebote
  router.get('/api/market', requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT * FROM item_market WHERE sold_at IS NULL ORDER BY created_at DESC LIMIT 100`).all();
    res.json(rows);
  });

  // Eigene offene Angebote
  router.get('/api/market/my', requireAuth, (req, res) => {
    const me = db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id;
    if (!me) return res.status(401).json({ error: 'Nicht angemeldet' });
    res.json(db.prepare(`SELECT * FROM item_market WHERE seller_id = ? AND sold_at IS NULL`).all(me));
  });

  // Item einstellen
  router.post('/api/market/list', requireAuth, (req, res) => {
    const me = db.prepare('SELECT discord_id, username FROM users WHERE id = ?').get(req.session.userId);
    if (!me) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`market-list:${me.discord_id}`, 15, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
    const { item_key, price } = req.body;
    const p = Math.floor(+price || 0);
    if (!item_key || typeof item_key !== 'string') return res.status(400).json({ error: 'Ungültiges Item' });
    if (p < 1 || p > 100000) return res.status(400).json({ error: 'Preis: 1–100.000 Coins' });
    const shopItem = SHOP_ITEMS.find(i => i.id === item_key);
    if (!shopItem) return res.status(400).json({ error: 'Item nicht im Shop' });
    const owned = db.prepare('SELECT 1 FROM shop_purchases WHERE discord_id = ? AND item_id = ?').get(me.discord_id, item_key);
    if (!owned) return res.status(400).json({ error: 'Du besitzt dieses Item nicht' });
    const alreadyListed = db.prepare('SELECT 1 FROM item_market WHERE seller_id = ? AND item_key = ? AND sold_at IS NULL').get(me.discord_id, item_key);
    if (alreadyListed) return res.status(400).json({ error: 'Item bereits eingestellt' });
    db.prepare('INSERT INTO item_market (seller_id, seller_name, item_key, item_name, price) VALUES (?,?,?,?,?)').run(me.discord_id, me.username, item_key, shopItem.name, p);
    res.json({ ok: true });
  });

  // Item kaufen
  router.post('/api/market/buy/:id', requireAuth, (req, res) => {
    const buyer = db.prepare('SELECT discord_id, username FROM users WHERE id = ?').get(req.session.userId);
    if (!buyer) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`market-buy:${buyer.discord_id}`, 20, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
    const listing = db.prepare('SELECT * FROM item_market WHERE id = ? AND sold_at IS NULL').get(+req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing nicht gefunden' });
    if (listing.seller_id === buyer.discord_id) return res.status(400).json({ error: 'Kannst dein eigenes Item nicht kaufen' });
    const alreadyOwns = db.prepare('SELECT 1 FROM shop_purchases WHERE discord_id = ? AND item_id = ?').get(buyer.discord_id, listing.item_key);
    if (alreadyOwns) return res.status(400).json({ error: 'Du besitzt dieses Item bereits' });
    const newBal = addCoins(buyer.discord_id, buyer.username, -listing.price, 'market:buy', { item: listing.item_key });
    if (newBal === null) return res.status(400).json({ error: 'Nicht genug Coins' });
    db.prepare("UPDATE item_market SET sold_at = datetime('now'), buyer_id = ?, buyer_name = ? WHERE id = ?").run(buyer.discord_id, buyer.username, listing.id);
    db.prepare('DELETE FROM shop_purchases WHERE discord_id = ? AND item_id = ?').run(listing.seller_id, listing.item_key);
    const shopItem = SHOP_ITEMS.find(i => i.id === listing.item_key);
    if (shopItem) {
      const equipCol = { title: 'equipped_title', frame: 'equipped_frame', deck: 'equipped_deck', namecolor: 'equipped_namecolor', deco: 'equipped_deco', banner: 'equipped_banner', truck: 'equipped_truck' }[shopItem.type];
      if (equipCol) db.prepare(`UPDATE coin_balances SET ${equipCol} = NULL WHERE discord_id = ? AND ${equipCol} = ?`).run(listing.seller_id, listing.item_key);
    }
    db.prepare("INSERT OR IGNORE INTO shop_purchases (discord_id, item_id, price) VALUES (?, ?, 0)").run(buyer.discord_id, listing.item_key);
    addCoins(listing.seller_id, listing.seller_name, listing.price, 'market:sold', { item: listing.item_key, buyer: buyer.username });
    sseEmit('market_sold', { item: listing.item_name, buyer: buyer.username, price: listing.price }, listing.seller_id);
    createNotif(listing.seller_id, 'market_sold', { item: listing.item_name, buyer: buyer.username, price: listing.price });
    res.json({ ok: true, balance: newBal });
  });

  // Eigenes Angebot zurückziehen
  router.delete('/api/market/:id', requireAuth, (req, res) => {
    const me = db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id;
    if (!me) return res.status(401).json({ error: 'Nicht angemeldet' });
    const listing = db.prepare('SELECT * FROM item_market WHERE id = ? AND sold_at IS NULL AND seller_id = ?').get(+req.params.id, me);
    if (!listing) return res.status(404).json({ error: 'Listing nicht gefunden' });
    db.prepare('DELETE FROM item_market WHERE id = ?').run(listing.id);
    res.json({ ok: true });
  });

  return router;
};
