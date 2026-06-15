const express = require('express');

// Shop-Items die im Schwarzmarkt auftauchen dürfen (keine Verbrauchsartikel)
const ELIGIBLE_TYPES = ['title', 'frame', 'banner', 'namecolor', 'deco', 'deck', 'truck'];

module.exports = function makeBlackmarketRouter({ db, requireAdmin, coinIdent, addCoins, rateLimit, SHOP_ITEMS }) {
  const router = express.Router();

  function todayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function ensureSlotsForToday() {
    const today = todayKey();
    const existing = db.prepare('SELECT slot FROM blackmarket_slots WHERE date = ?').all(today);
    if (existing.length >= 3) return;

    // Noch nicht generiert — 3 zufällige Items wählen
    const pool = SHOP_ITEMS.filter(i => ELIGIBLE_TYPES.includes(i.type));
    const picked = [];
    while (picked.length < 3 && pool.length > picked.length) {
      const idx = Math.floor(Math.random() * pool.length);
      if (!picked.includes(pool[idx])) picked.push(pool[idx]);
    }

    const ins = db.prepare('INSERT OR IGNORE INTO blackmarket_slots (date, slot, item_id, discount) VALUES (?, ?, ?, ?)');
    db.transaction(() => {
      picked.forEach((item, i) => {
        // Rabatt: 20 – 45 %
        const disc = 20 + Math.floor(Math.random() * 26);
        ins.run(today, i, item.id, disc);
      });
    })();
  }

  // GET /api/blackmarket — heutige Angebote
  router.get('/api/blackmarket', (req, res) => {
    ensureSlotsForToday();
    const today   = todayKey();
    const ident   = coinIdent(req);
    const slots   = db.prepare('SELECT * FROM blackmarket_slots WHERE date = ? ORDER BY slot').all(today);
    const bought  = ident
      ? db.prepare('SELECT slot FROM blackmarket_purchases WHERE date = ? AND discord_id = ?').all(today, ident.id).map(r => r.slot)
      : [];

    const result = slots.map(slot => {
      const item = SHOP_ITEMS.find(i => i.id === slot.item_id);
      if (!item) return null;
      const discountedPrice = Math.round(item.price * (1 - slot.discount / 100));
      const alreadyOwned = ident
        ? !!db.prepare('SELECT 1 FROM shop_purchases WHERE discord_id = ? AND item_id = ?').get(ident.id, item.id)
        : false;
      return {
        slot: slot.slot,
        item_id: item.id,
        name: item.name,
        type: item.type,
        original_price: item.price,
        discounted_price: discountedPrice,
        discount: slot.discount,
        desc: item.desc,
        color: item.color || null,
        sold: bought.includes(slot.slot),
        already_owned: alreadyOwned,
      };
    }).filter(Boolean);

    // Balance mitliefern
    const balance = ident
      ? db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0
      : null;

    res.json({ date: today, slots: result, balance });
  });

  // POST /api/blackmarket/buy — ein Slot kaufen
  router.post('/api/blackmarket/buy', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`bm:${ident.id}`, 10, 60_000)) return res.status(429).json({ error: 'Zu schnell' });

    ensureSlotsForToday();
    const today  = todayKey();
    const slotNr = parseInt(req.body.slot, 10);
    if (isNaN(slotNr) || slotNr < 0 || slotNr > 2) return res.status(400).json({ error: 'Ungültiger Slot' });

    const slot = db.prepare('SELECT * FROM blackmarket_slots WHERE date = ? AND slot = ?').get(today, slotNr);
    if (!slot) return res.status(404).json({ error: 'Slot nicht gefunden' });

    const item = SHOP_ITEMS.find(i => i.id === slot.item_id);
    if (!item) return res.status(404).json({ error: 'Artikel nicht gefunden' });

    // Schon gekauft? (this user × this slot today)
    const dup = db.prepare('SELECT 1 FROM blackmarket_purchases WHERE date = ? AND discord_id = ? AND slot = ?').get(today, ident.id, slotNr);
    if (dup) return res.status(400).json({ error: 'Dieses Angebot hast du heute bereits gekauft' });

    // Schon im normalen Shop besessen?
    const owned = db.prepare('SELECT 1 FROM shop_purchases WHERE discord_id = ? AND item_id = ?').get(ident.id, item.id);
    if (owned) return res.status(400).json({ error: 'Diesen Artikel besitzt du bereits' });

    const discountedPrice = Math.round(item.price * (1 - slot.discount / 100));
    const bal = addCoins(ident.id, ident.name, -discountedPrice, 'blackmarket:' + item.id, { item: item.id, discount: slot.discount });
    if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    // Als normaler Shop-Kauf registrieren + Schwarzmarkt-Purchase
    db.prepare('INSERT INTO shop_purchases (discord_id, item_id, price) VALUES (?, ?, ?)').run(ident.id, item.id, discountedPrice);
    db.prepare('INSERT INTO blackmarket_purchases (date, slot, discord_id, item_id, price_paid) VALUES (?, ?, ?, ?, ?)').run(today, slotNr, ident.id, item.id, discountedPrice);

    // Auto-equip
    const EQUIP_MAP = { title: 'equipped_title', frame: 'equipped_frame', truck: 'equipped_truck', deck: 'equipped_deck', banner: 'equipped_banner', namecolor: 'equipped_namecolor', deco: 'equipped_deco' };
    const col = EQUIP_MAP[item.type];
    if (col) db.prepare(`UPDATE coin_balances SET ${col} = ? WHERE discord_id = ?`).run(item.id, ident.id);

    res.json({ ok: true, balance: bal, item_name: item.name });
  });

  // POST /api/admin/blackmarket/refresh — Admin kann Slots manuell neu auslosen
  router.post('/api/admin/blackmarket/refresh', requireAdmin, (req, res) => {
    const today = todayKey();
    db.prepare('DELETE FROM blackmarket_slots WHERE date = ?').run(today);
    ensureSlotsForToday();
    res.json({ ok: true });
  });

  return router;
};
