/**
 * Auth middleware factory — call with (db) to get middleware functions.
 * All middleware functions read from the same db instance.
 */
module.exports = function makeAuth(db) {
  function getUser(req) {
    if (!req.session.userId) return null;
    return db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(req.session.userId) || null;
  }

  function requireAuth(req, res, next) {
    const u = getUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (u.role === 'citizen') return res.status(403).json({ error: 'Kein Zugriff' });
    next();
  }

  function requireLogin(req, res, next) {
    const u = getUser(req);
    if (u) return next();
    if (req.session.voterDiscordId) {
      const vu = db.prepare('SELECT * FROM users WHERE discord_id = ? AND is_active = 1').get(req.session.voterDiscordId);
      if (vu) { req.session.userId = vu.id; return next(); }
    }
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }

  function requireAdmin(req, res, next) {
    const u = getUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (u.role !== 'admin') return res.status(403).json({ error: 'Kein Zugriff' });
    req.adminUser = u;
    next();
  }

  function requireAusbilder(req, res, next) {
    const u = getUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (!['admin', 'ausbilder'].includes(u.role)) return res.status(403).json({ error: 'Kein Zugriff' });
    req.adminUser = u;
    next();
  }

  function requireAnySession(req, res, next) {
    if (req.session.userId || req.session.voterDiscordId) return next();
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }

  return { getUser, requireAuth, requireLogin, requireAdmin, requireAusbilder, requireAnySession };
};
