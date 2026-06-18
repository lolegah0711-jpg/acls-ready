const express = require('express');

// Clubs / Gilden mit Vereinskasse (Treasury).
// Coins fließen aus der echten Coin-Wirtschaft in die Kasse (Sink) und über
// Auszahlung zurück. coinIdent → Staff + Bürger können Clubs nutzen.
module.exports = function({ db, requireLogin, coinIdent, addCoins, rateLimit, createNotif }) {
  const router = express.Router();

  const CREATE_COST = 500;
  const MAX_MEMBERS = 50;

  const memberOf = (did) => db.prepare(
    'SELECT c.*, m.role FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE m.discord_id = ?'
  ).get(did);

  const clubLog = (clubId, ident, action, amount = 0) =>
    db.prepare('INSERT INTO club_log (club_id, discord_id, username, action, amount) VALUES (?,?,?,?,?)')
      .run(clubId, ident?.id || null, ident?.name || null, action, amount);

  function clubPublic(c) {
    const members = db.prepare(
      'SELECT discord_id, username, role, contribution, joined_at FROM club_members WHERE club_id = ? ORDER BY contribution DESC'
    ).all(c.id);
    return { ...c, members, member_count: members.length };
  }

  // Rangliste aller Clubs
  router.get('/api/clubs', requireLogin, (req, res) => {
    const rows = db.prepare(`
      SELECT c.id, c.name, c.tag, c.description, c.logo_emoji, c.treasury, c.total_xp, c.created_at,
             (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id) AS member_count
      FROM clubs c
      ORDER BY c.total_xp DESC, c.treasury DESC
      LIMIT 100
    `).all();
    res.json(rows);
  });

  // Mein Club (oder null)
  router.get('/api/clubs/mine', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    const c = memberOf(ident.id);
    if (!c) return res.json(null);
    const log = db.prepare('SELECT username, action, amount, created_at FROM club_log WHERE club_id = ? ORDER BY created_at DESC LIMIT 30').all(c.id);
    res.json({ ...clubPublic(c), my_role: c.role, log });
  });

  // Club-Detail
  router.get('/api/clubs/:id', requireLogin, (req, res) => {
    const c = db.prepare('SELECT * FROM clubs WHERE id = ?').get(+req.params.id);
    if (!c) return res.status(404).json({ error: 'Club nicht gefunden' });
    res.json(clubPublic(c));
  });

  // Club gründen (kostet 500 Coins)
  router.post('/api/clubs/create', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`club-create:${ident.id}`, 5, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
    if (memberOf(ident.id)) return res.status(400).json({ error: 'Du bist bereits in einem Club' });

    const name = String(req.body.name || '').trim().slice(0, 32);
    const tag  = String(req.body.tag || '').trim().toUpperCase().slice(0, 4);
    const description = String(req.body.description || '').trim().slice(0, 200);
    const logo_emoji = String(req.body.logo_emoji || '🏎️').trim().slice(0, 8) || '🏎️';
    if (name.length < 3) return res.status(400).json({ error: 'Name: mind. 3 Zeichen' });
    if (!/^[A-Z0-9]{2,4}$/.test(tag)) return res.status(400).json({ error: 'Tag: 2–4 Buchstaben/Zahlen' });
    if (db.prepare('SELECT 1 FROM clubs WHERE name = ? COLLATE NOCASE').get(name)) return res.status(409).json({ error: 'Name bereits vergeben' });
    if (db.prepare('SELECT 1 FROM clubs WHERE tag = ?').get(tag)) return res.status(409).json({ error: 'Tag bereits vergeben' });

    const bal = addCoins(ident.id, ident.name, -CREATE_COST, 'club:create', { name });
    if (bal === null) return res.status(400).json({ error: `Nicht genug Coins (${CREATE_COST} benötigt)` });

    const r = db.prepare('INSERT INTO clubs (name, tag, description, logo_emoji, founder_did) VALUES (?,?,?,?,?)')
      .run(name, tag, description, logo_emoji, ident.id);
    db.prepare('INSERT INTO club_members (club_id, discord_id, username, role) VALUES (?,?,?,?)')
      .run(r.lastInsertRowid, ident.id, ident.name, 'president');
    clubLog(r.lastInsertRowid, ident, 'Club gegründet');
    res.json({ ok: true, id: r.lastInsertRowid, balance: bal });
  });

  // Beitreten
  router.post('/api/clubs/:id/join', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (memberOf(ident.id)) return res.status(400).json({ error: 'Du bist bereits in einem Club' });
    const c = db.prepare('SELECT * FROM clubs WHERE id = ?').get(+req.params.id);
    if (!c) return res.status(404).json({ error: 'Club nicht gefunden' });
    const count = db.prepare('SELECT COUNT(*) AS c FROM club_members WHERE club_id = ?').get(c.id).c;
    if (count >= MAX_MEMBERS) return res.status(400).json({ error: 'Club ist voll' });
    db.prepare('INSERT INTO club_members (club_id, discord_id, username, role) VALUES (?,?,?,?)')
      .run(c.id, ident.id, ident.name, 'member');
    clubLog(c.id, ident, 'ist beigetreten');
    res.json({ ok: true });
  });

  // Verlassen (Präsident muss vorher übergeben oder als Letzter auflösen)
  router.post('/api/clubs/leave', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    const c = memberOf(ident.id);
    if (!c) return res.status(400).json({ error: 'Du bist in keinem Club' });
    const count = db.prepare('SELECT COUNT(*) AS c FROM club_members WHERE club_id = ?').get(c.id).c;
    if (c.role === 'president' && count > 1)
      return res.status(400).json({ error: 'Übergib zuerst die Präsidentschaft oder wirf alle anderen raus' });
    db.prepare('DELETE FROM club_members WHERE club_id = ? AND discord_id = ?').run(c.id, ident.id);
    if (count <= 1) { // letzter raus → Club + Kasse auflösen
      if (c.treasury > 0) addCoins(ident.id, ident.name, c.treasury, 'club:dissolve', { club: c.name });
      db.prepare('DELETE FROM clubs WHERE id = ?').run(c.id);
      db.prepare('DELETE FROM club_log WHERE club_id = ?').run(c.id);
      return res.json({ ok: true, dissolved: true });
    }
    clubLog(c.id, ident, 'hat den Club verlassen');
    res.json({ ok: true });
  });

  // In die Vereinskasse einzahlen (Coin-Sink, erhöht total_xp + Beitrag)
  router.post('/api/clubs/donate', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    if (rateLimit(`club-donate:${ident.id}`, 30, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
    const c = memberOf(ident.id);
    if (!c) return res.status(400).json({ error: 'Du bist in keinem Club' });
    const amount = Math.floor(+req.body.amount || 0);
    if (amount < 1 || amount > 1_000_000) return res.status(400).json({ error: 'Betrag: 1–1.000.000' });
    const bal = addCoins(ident.id, ident.name, -amount, 'club:donate', { club: c.name });
    if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });
    db.prepare('UPDATE clubs SET treasury = treasury + ?, total_xp = total_xp + ? WHERE id = ?').run(amount, amount, c.id);
    db.prepare('UPDATE club_members SET contribution = contribution + ? WHERE club_id = ? AND discord_id = ?').run(amount, c.id, ident.id);
    clubLog(c.id, ident, 'hat in die Kasse eingezahlt', amount);
    res.json({ ok: true, balance: bal });
  });

  // Aus der Vereinskasse auszahlen (nur Präsident)
  router.post('/api/clubs/withdraw', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    const c = memberOf(ident.id);
    if (!c) return res.status(400).json({ error: 'Du bist in keinem Club' });
    if (c.role !== 'president') return res.status(403).json({ error: 'Nur der Präsident darf auszahlen' });
    const amount = Math.floor(+req.body.amount || 0);
    if (amount < 1) return res.status(400).json({ error: 'Ungültiger Betrag' });
    if (amount > c.treasury) return res.status(400).json({ error: 'Kasse nicht gedeckt' });
    db.prepare('UPDATE clubs SET treasury = treasury - ? WHERE id = ?').run(amount, c.id);
    addCoins(ident.id, ident.name, amount, 'club:withdraw', { club: c.name });
    clubLog(c.id, ident, 'hat aus der Kasse ausgezahlt', -amount);
    res.json({ ok: true });
  });

  // Mitglied rauswerfen (nur Präsident)
  router.post('/api/clubs/kick/:did', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    const c = memberOf(ident.id);
    if (!c || c.role !== 'president') return res.status(403).json({ error: 'Nur der Präsident darf Mitglieder entfernen' });
    const target = String(req.params.did);
    if (target === ident.id) return res.status(400).json({ error: 'Dich selbst kannst du nicht kicken' });
    const m = db.prepare('SELECT username FROM club_members WHERE club_id = ? AND discord_id = ?').get(c.id, target);
    if (!m) return res.status(404).json({ error: 'Mitglied nicht gefunden' });
    db.prepare('DELETE FROM club_members WHERE club_id = ? AND discord_id = ?').run(c.id, target);
    clubLog(c.id, ident, `hat ${m.username || target} entfernt`);
    try { createNotif(target, 'club_kick', { club: c.name }); } catch {}
    res.json({ ok: true });
  });

  // Präsidentschaft übergeben (nur Präsident)
  router.post('/api/clubs/transfer/:did', requireLogin, (req, res) => {
    const ident = coinIdent(req);
    const c = memberOf(ident.id);
    if (!c || c.role !== 'president') return res.status(403).json({ error: 'Nur der Präsident darf übergeben' });
    const target = String(req.params.did);
    const m = db.prepare('SELECT username FROM club_members WHERE club_id = ? AND discord_id = ?').get(c.id, target);
    if (!m) return res.status(404).json({ error: 'Mitglied nicht gefunden' });
    db.prepare("UPDATE club_members SET role = 'member' WHERE club_id = ? AND discord_id = ?").run(c.id, ident.id);
    db.prepare("UPDATE club_members SET role = 'president' WHERE club_id = ? AND discord_id = ?").run(c.id, target);
    clubLog(c.id, ident, `hat die Präsidentschaft an ${m.username || target} übergeben`);
    res.json({ ok: true });
  });

  return router;
};
