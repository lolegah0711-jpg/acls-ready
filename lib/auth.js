/**
 * Auth middleware factory — EINZIGE Quelle für Auth-Middleware.
 * Aufruf: require('./lib/auth')(db, { touchSeen, isBot })
 *  - touchSeen(userId): optionaler Hook, aktualisiert last_seen_at (gedrosselt)
 *  - isBot(req):        optionaler Hook, true wenn gültiges Bot-Secret (für requireAuthOrBot)
 * Semantik entspricht exakt den früheren Inline-Funktionen aus server.js.
 */
module.exports = function makeAuth(db, { touchSeen, isBot } = {}) {
  function getUser(req) {
    if (!req.session?.userId) return null;
    const u = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(req.session.userId) || null;
    if (u && touchSeen) touchSeen(u.id);
    return u;
  }

  // Mitarbeiter-Zugriff (Citizens ausgeschlossen)
  function requireAuth(req, res, next) {
    const u = getUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (u.role === 'citizen') return res.status(403).json({ error: 'Kein Zugriff' });
    next();
  }

  // Wie requireAuth, aber Citizens sind auch erlaubt (für Minispiele)
  function requireLogin(req, res, next) {
    const u = getUser(req);
    if (u) return next();
    // Voter session: check if this Discord user exists in the DB (e.g. citizen role)
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
    const user = getUser(req);
    if (!user || (user.role !== 'ausbilder' && user.role !== 'admin')) return res.status(403).json({ error: 'Kein Zugriff' });
    req.ausbilderUser = user;
    req.adminUser     = user; // Kompatibilität: manche Handler lesen req.adminUser
    next();
  }

  // Beliebige Session (Mitarbeiter ODER Voter/Bürger)
  function requireAnySession(req, res, next) {
    if (getUser(req) || req.session?.voterDiscordId) return next();
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }

  // Mitarbeiter ODER Bot (x-bot-secret Header)
  function requireAuthOrBot(req, res, next) {
    if (isBot && isBot(req)) return next();
    const u = getUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
    next();
  }

  return { getUser, requireAuth, requireLogin, requireAdmin, requireAusbilder, requireAnySession, requireAuthOrBot };
};
