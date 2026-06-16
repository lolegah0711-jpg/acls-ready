const express = require('express');

const MIN_BET = 100;
const MAX_BET = 10000;

module.exports = function({ db, coinIdent, addCoins, rateLimit, requireAdmin, queueNotification, auditLog }) {
  const router = express.Router();

  function createNotifDirect(discordId, type, data) {
    try {
      db.prepare('INSERT INTO notifications (discord_id, type, data) VALUES (?, ?, ?)')
        .run(discordId, type, JSON.stringify(data));
    } catch {}
  }

  // GET /api/bets/search?q= — Gegner-Suche (alle mit Coin-Konto)
  router.get('/api/bets/search', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json([]);
    const like = '%' + q.toLowerCase() + '%';

    const rows = db.prepare(`
      SELECT cb.discord_id,
             COALESCE(u.username, cb.username) AS username,
             cb.balance,
             u.avatar
      FROM coin_balances cb
      LEFT JOIN users u ON u.discord_id = cb.discord_id AND u.is_active = 1
      WHERE LOWER(COALESCE(u.username, cb.username)) LIKE ?
        AND cb.discord_id != ?
      ORDER BY COALESCE(u.username, cb.username) COLLATE NOCASE ASC
      LIMIT 8
    `).all(like, ident.id);

    res.json(rows);
  });

  // GET /api/bets/my — eigene Wetten (als Ersteller oder Gegner)
  router.get('/api/bets/my', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    const rows = db.prepare(`
      SELECT * FROM coin_bets
      WHERE creator_did = ? OR opponent_did = ?
      ORDER BY created_at DESC
      LIMIT 60
    `).all(ident.id, ident.id);

    res.json(rows);
  });

  // POST /api/bets — neue Wette erstellen
  router.post('/api/bets', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress;
    if (rateLimit(`bet_create:${ip}`, 10, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });

    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    let { opponent_did, amount, description } = req.body;
    amount = Math.round(+amount || 0);
    description = String(description || '').trim();

    if (!opponent_did) return res.status(400).json({ error: 'Gegner auswählen' });
    if (opponent_did === ident.id) return res.status(400).json({ error: 'Nicht gegen sich selbst wetten' });
    if (amount < MIN_BET || amount > MAX_BET)
      return res.status(400).json({ error: `Betrag: ${MIN_BET.toLocaleString('de-DE')}–${MAX_BET.toLocaleString('de-DE')} Coins` });
    if (!description || description.length < 5)
      return res.status(400).json({ error: 'Bedingung zu kurz (mind. 5 Zeichen)' });
    if (description.length > 200)
      return res.status(400).json({ error: 'Bedingung zu lang (max. 200 Zeichen)' });

    // Prüfe ob Gegner existiert
    const opponentRow = db.prepare(`
      SELECT COALESCE(u.username, cb.username) AS username
      FROM coin_balances cb
      LEFT JOIN users u ON u.discord_id = cb.discord_id
      WHERE cb.discord_id = ?
    `).get(opponent_did);
    if (!opponentRow) return res.status(400).json({ error: 'Gegner nicht gefunden' });

    // Einsatz sofort abziehen (gesperrt)
    const newBal = addCoins(ident.id, ident.name, -amount, 'bet:locked', { vs: opponentRow.username });
    if (newBal === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    const r = db.prepare(`
      INSERT INTO coin_bets (creator_did, creator_name, opponent_did, opponent_name, amount, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ident.id, ident.name, opponent_did, opponentRow.username, amount, description);

    createNotifDirect(opponent_did, 'bet_received', {
      from: ident.name,
      amount,
      description: description.slice(0, 80),
      bet_id: r.lastInsertRowid,
    });

    res.json({ ok: true, id: r.lastInsertRowid, balance: newBal });
  });

  // POST /api/bets/:id/accept — Wette annehmen
  router.post('/api/bets/:id/accept', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    const bet = db.prepare('SELECT * FROM coin_bets WHERE id = ?').get(+req.params.id);
    if (!bet) return res.status(404).json({ error: 'Wette nicht gefunden' });
    if (bet.opponent_did !== ident.id) return res.status(403).json({ error: 'Kein Zugriff' });
    if (bet.status !== 'pending') return res.status(400).json({ error: 'Wette kann nicht mehr angenommen werden' });

    const newBal = addCoins(ident.id, ident.name, -bet.amount, 'bet:locked', { vs: bet.creator_name, bet_id: bet.id });
    if (newBal === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    db.prepare('UPDATE coin_bets SET status = ? WHERE id = ?').run('accepted', bet.id);

    createNotifDirect(bet.creator_did, 'bet_accepted', {
      by: ident.name,
      amount: bet.amount,
      description: bet.description.slice(0, 80),
      bet_id: bet.id,
    });

    res.json({ ok: true, balance: newBal });
  });

  // POST /api/bets/:id/decline — Wette ablehnen (Gegner)
  router.post('/api/bets/:id/decline', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    const bet = db.prepare('SELECT * FROM coin_bets WHERE id = ?').get(+req.params.id);
    if (!bet) return res.status(404).json({ error: 'Wette nicht gefunden' });
    if (bet.opponent_did !== ident.id) return res.status(403).json({ error: 'Kein Zugriff' });
    if (bet.status !== 'pending') return res.status(400).json({ error: 'Wette kann nicht mehr abgelehnt werden' });

    addCoins(bet.creator_did, bet.creator_name, bet.amount, 'bet:refund_declined', { by: ident.name, bet_id: bet.id });
    db.prepare('UPDATE coin_bets SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?').run('declined', bet.id);

    createNotifDirect(bet.creator_did, 'bet_declined', {
      by: ident.name,
      amount: bet.amount,
      description: bet.description.slice(0, 80),
    });

    res.json({ ok: true });
  });

  // POST /api/bets/:id/cancel — Wette stornieren (Ersteller, nur pending)
  router.post('/api/bets/:id/cancel', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    const bet = db.prepare('SELECT * FROM coin_bets WHERE id = ?').get(+req.params.id);
    if (!bet) return res.status(404).json({ error: 'Wette nicht gefunden' });
    if (bet.creator_did !== ident.id) return res.status(403).json({ error: 'Kein Zugriff' });
    if (bet.status !== 'pending') return res.status(400).json({ error: 'Nur offene Wetten können storniert werden' });

    const newBal = addCoins(ident.id, ident.name, bet.amount, 'bet:refund_cancelled', { bet_id: bet.id });
    db.prepare('UPDATE coin_bets SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?').run('cancelled', bet.id);

    res.json({ ok: true, balance: newBal });
  });

  // GET /api/admin/bets — Admin: alle offenen/angenommenen Wetten
  router.get('/api/admin/bets', requireAdmin, (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM coin_bets
      WHERE status IN ('pending', 'accepted')
      ORDER BY status ASC, created_at ASC
    `).all();
    res.json(rows);
  });

  // POST /api/admin/bets/:id/resolve — Admin: Wette auflösen
  router.post('/api/admin/bets/:id/resolve', requireAdmin, (req, res) => {
    const bet = db.prepare('SELECT * FROM coin_bets WHERE id = ?').get(+req.params.id);
    if (!bet) return res.status(404).json({ error: 'Wette nicht gefunden' });
    if (bet.status !== 'accepted') return res.status(400).json({ error: 'Wette muss erst angenommen werden' });

    const { winner_did, admin_note } = req.body;
    if (!winner_did) return res.status(400).json({ error: 'Gewinner angeben' });
    if (winner_did !== bet.creator_did && winner_did !== bet.opponent_did)
      return res.status(400).json({ error: 'Ungültiger Gewinner' });

    const winner_name = winner_did === bet.creator_did ? bet.creator_name : bet.opponent_name;
    const loser_did   = winner_did === bet.creator_did ? bet.opponent_did : bet.creator_did;
    const loser_name  = winner_did === bet.creator_did ? bet.opponent_name : bet.creator_name;
    const payout = bet.amount * 2;

    addCoins(winner_did, winner_name, payout, 'bet:win', { bet_id: bet.id, vs: loser_name }, false);

    const adminName = req.adminUser?.username || 'Admin';
    db.prepare(`
      UPDATE coin_bets
      SET status = 'resolved', winner_did = ?, winner_name = ?,
          resolved_by = ?, admin_note = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(winner_did, winner_name, adminName, admin_note || null, bet.id);

    auditLog(req, 'bet_resolved', `Wette #${bet.id}: ${winner_name} gewinnt ${payout} Coins (vs ${loser_name})`);

    createNotifDirect(winner_did, 'bet_won', {
      amount: payout,
      vs: loser_name,
      description: bet.description.slice(0, 80),
    });
    createNotifDirect(loser_did, 'bet_lost', {
      amount: bet.amount,
      vs: winner_name,
      description: bet.description.slice(0, 80),
    });

    res.json({ ok: true });
  });

  return router;
};
