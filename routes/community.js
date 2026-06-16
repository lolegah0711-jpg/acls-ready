const express = require('express');

// Community: Freundesliste, Gästebuch, Profil-Vergleich.
// Ausgelagert aus server.js. friendStats wird injiziert (hängt an Season-/Tier-Helfern).
module.exports = function({ db, requireLogin, getUser, rateLimit, createNotif, friendStats }) {
  const router = express.Router();

  const GUESTBOOK_MAX_LEN = 300;

  // Identität: Mitarbeiter/Citizen (users-Eintrag) oder reine Voter-Session
  function guestbookIdent(req) {
    const u = getUser(req);
    if (u) return { user: u, did: u.discord_id, name: u.username, avatar: u.avatar || null };
    if (req.session?.voterDiscordId)
      return { user: null, did: req.session.voterDiscordId, name: req.session.voterUsername || 'Bürger', avatar: req.session.voterAvatar || null };
    return null;
  }

  // ── Freundesliste ──────────────────────────────────────────────
  router.get('/api/friends', requireLogin, (req, res) => {
    const u = getUser(req);
    const rows = db.prepare('SELECT friend_id, created_at FROM friends WHERE user_id = ? ORDER BY created_at ASC').all(u.id);
    const friends = rows.map(r => {
      const s = friendStats(r.friend_id);
      return s ? { ...s, since: r.created_at } : null;
    }).filter(Boolean);
    res.json({ me: friendStats(u.id), friends });
  });

  router.post('/api/friends/:id', requireLogin, (req, res) => {
    const u = getUser(req);
    const fid = +req.params.id;
    if (fid === u.id) return res.status(400).json({ error: 'Du kannst dich nicht selbst hinzufügen' });
    const target = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(fid);
    if (!target) return res.status(404).json({ error: 'Mitglied nicht gefunden' });
    const count = db.prepare('SELECT COUNT(*) AS c FROM friends WHERE user_id = ?').get(u.id).c;
    if (count >= 30) return res.status(400).json({ error: 'Maximal 30 Freunde' });
    try { db.prepare('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)').run(u.id, fid); }
    catch { return res.status(400).json({ error: 'Bereits in deiner Liste' }); }
    res.json({ ok: true });
  });

  router.delete('/api/friends/:id', requireLogin, (req, res) => {
    const u = getUser(req);
    db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(u.id, +req.params.id);
    res.json({ ok: true });
  });

  // Detail-Vergleich: ich vs. Freund (Spiel-Bestscores beider Seiten)
  router.get('/api/friends/compare/:id', requireLogin, (req, res) => {
    const u = getUser(req);
    const mine   = friendStats(u.id);
    const theirs = friendStats(+req.params.id);
    if (!theirs) return res.status(404).json({ error: 'Nicht gefunden' });
    const games = db.prepare(`
      SELECT game,
        MAX(CASE WHEN user_id = ? THEN score END) AS my_score,
        MAX(CASE WHEN user_id = ? THEN score END) AS their_score
      FROM game_scores WHERE user_id IN (?, ?) GROUP BY game ORDER BY game
    `).all(u.id, +req.params.id, u.id, +req.params.id);
    res.json({ me: mine, friend: theirs, games });
  });

  // ── Gästebuch (Mitarbeiter UND Bürger dürfen schreiben) ────────
  router.get('/api/guestbook/:userId', (req, res) => {
    if (!guestbookIdent(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
    const rows = db.prepare(`
      SELECT g.id, g.message, g.created_at, g.author_id,
             COALESCE(u.username, g.author_name, 'Bürger') AS author_name,
             COALESCE(u.avatar, g.author_avatar)           AS author_avatar,
             COALESCE(u.discord_id, g.author_discord_id)   AS author_discord_id
      FROM guestbook g LEFT JOIN users u ON u.id = g.author_id
      WHERE g.profile_user_id = ?
      ORDER BY g.created_at DESC LIMIT 50
    `).all(+req.params.userId);
    res.json(rows);
  });

  router.post('/api/guestbook/:userId', (req, res) => {
    const ident = guestbookIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`guestbook:${ident.did}`, 5, 5 * 60_000))
      return res.status(429).json({ error: 'Bitte warte etwas zwischen den Einträgen' });
    const target = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(+req.params.userId);
    if (!target) return res.status(404).json({ error: 'Profil nicht gefunden' });
    const message = String(req.body.message || '').trim();
    if (message.length < 2) return res.status(400).json({ error: 'Nachricht zu kurz' });
    if (message.length > GUESTBOOK_MAX_LEN) return res.status(400).json({ error: `Maximal ${GUESTBOOK_MAX_LEN} Zeichen` });
    db.prepare(`INSERT INTO guestbook (profile_user_id, author_id, author_discord_id, author_name, author_avatar, message)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(target.id, ident.user?.id || null, ident.did, ident.name, ident.avatar, message);
    const profileOwner = db.prepare('SELECT discord_id FROM users WHERE id = ?').get(target.id);
    if (profileOwner && profileOwner.discord_id !== ident.did) {
      createNotif(profileOwner.discord_id, 'guestbook', { authorName: ident.name, preview: message.slice(0, 80) });
    }
    res.json({ ok: true });
  });

  // Löschen darf: Autor (Mitarbeiter oder Bürger), Profil-Inhaber oder Admin
  router.delete('/api/guestbook/:id', (req, res) => {
    const ident = guestbookIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const entry = db.prepare('SELECT * FROM guestbook WHERE id = ?').get(+req.params.id);
    if (!entry) return res.status(404).json({ error: 'Nicht gefunden' });
    const isAuthor  = (entry.author_id && ident.user && entry.author_id === ident.user.id)
                   || (entry.author_discord_id && entry.author_discord_id === ident.did);
    const isOwner   = ident.user && entry.profile_user_id === ident.user.id;
    const isAdminU  = ident.user?.role === 'admin';
    if (!isAuthor && !isOwner && !isAdminU) return res.status(403).json({ error: 'Kein Zugriff' });
    db.prepare('DELETE FROM guestbook WHERE id = ?').run(entry.id);
    res.json({ ok: true });
  });

  return router;
};
