require('dotenv').config();
const express      = require('express');
const compression  = require('compression');
const session      = require('express-session');
const path     = require('path');
const fs       = require('fs');
const cron     = require('node-cron');
const fetch    = require('node-fetch');
const crypto   = require('crypto');
const { initDb } = require('./database');
const slotEngine = require('./slot-engine');
const bigbassEngine = require('./bigbass-engine');

// Uploads-Ordner anlegen
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Pflicht-Secrets — Server startet nicht ohne sie in Produktion
const GAME_SECRET = process.env.GAME_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { console.error('[FATAL] GAME_SECRET nicht gesetzt'); process.exit(1); })()
  : 'acls-game-hmac-secret-dev');

// Timing-sicherer Secret-Vergleich (verhindert Timing-Angriffe)
function secretEqual(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // konstante Zeit
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}
const BOT_API_SECRET = process.env.BOT_API_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { console.error('[FATAL] BOT_API_SECRET nicht gesetzt'); process.exit(1); })()
  : 'acls-bot-secret-dev');


const GAME_LIMITS = {
  race:         { minSec: 25,  maxScore: 999999  },
  brick:        { minSec: 25,  maxScore: 999999  },
  deadzone:     { minSec: 15,  maxScore: 9999999 },
  tetris:       { minSec: 20,  maxScore: 9999999 },
  snake:        { minSec: 10,  maxScore: 100000  },
  skycop:       { minSec: 15,  maxScore: 9999999 },
  doodlejump:   { minSec: 15,  maxScore: 9999999 },
  '2048':       { minSec: 30,  maxScore: 5000000 },
  bookofra:     { minSec: 20,  maxScore: 99999999},
  towerdefense: { minSec: 45,  maxScore: 999999  },
  quiz:         { minSec: 30,  maxScore: 15000   },
  idle:         { minSec: 60,  maxScore: 1e15    },
  rpg:          { minSec: 60,  maxScore: 1e9     },
  tow:          { minSec: 20,  maxScore: 200000  },
  memory:       { minSec: 15,  maxScore: 200000  },
  reaction:     { minSec: 15,  maxScore: 30000   },
};

// ── ACLS-Coins: Umrechnung pro Spiel (score / divisor = Coins) ──
const GAME_COIN_DIV = {
  race: 2000, brick: 1200, deadzone: 30000, tetris: 20000, snake: 50,
  skycop: 20000, doodlejump: 15000, '2048': 30000, bookofra: 500000,
  towerdefense: 800, quiz: 150, idle: 1e12, rpg: 5e6, tow: 60, memory: 150, reaction: 600,
};
const COINS_MAX_PER_SUBMIT = 60;   // max Coins pro Spielrunde
const COINS_DAILY_GAME_CAP = 150;  // max Coins pro Spiel pro Tag

function makeGameToken(uid, game, ts) {
  return crypto.createHmac('sha256', GAME_SECRET)
    .update(`${uid}:${game}:${ts}`)
    .digest('hex').slice(0, 32);
}

const app  = express();
const db   = initDb();
const PORT = process.env.PORT || 3000;

// ── Persistent SQLite session store (no extra packages needed) ──
class SQLiteStore extends session.Store {
  constructor(database) {
    super();
    this.db = database;
    this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid     TEXT PRIMARY KEY,
      data    TEXT NOT NULL,
      expires INTEGER NOT NULL
    )`);
    setInterval(() => {
      this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
    }, 5 * 60 * 1000);
  }
  get(sid, cb) {
    const row = this.db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid);
    if (!row) return cb(null, null);
    if (row.expires <= Date.now()) { this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); return cb(null, null); }
    try { cb(null, JSON.parse(row.data)); } catch { cb(null, null); }
  }
  set(sid, sess, cb) {
    const exp = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000;
    this.db.prepare('INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?, ?, ?)').run(sid, JSON.stringify(sess), exp);
    cb?.();
  }
  destroy(sid, cb) { this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); cb?.(); }
  touch(sid, sess, cb) {
    const exp = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000;
    this.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').run(exp, sid);
    cb?.();
  }
}

// ── Middleware ──────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(session({
  store: new SQLiteStore(db),
  secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production'
    ? (() => { console.error('[FATAL] SESSION_SECRET nicht gesetzt'); process.exit(1); })()
    : 'acls-session-secret-dev'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
}));

// ── Sicherheits-Header ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://unpkg.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: https://cdn.discordapp.com https://i.pravatar.cc https://via.placeholder.com https://i.imgur.com https://imgur.com",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '));
  next();
});

// ── CSRF-Schutz: alle state-ändernden Routen prüfen auf gleichen Origin ──
app.use((req, res, next) => {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  // Bot-Secret-Anfragen (von bot.js) erlauben — Secret-Wert muss korrekt sein
  if (secretEqual(req.headers['x-bot-secret'], BOT_API_SECRET)) return next();
  // OAuth-Callback erlauben
  if (req.path === '/auth/callback' || req.path === '/auth/discord') return next();
  // Exakter Host-Vergleich (kein Substring – sonst umgeht z.B. evil.com/?host.de den Schutz)
  const host   = req.headers['host'] || '';
  const source = req.headers['origin'] || req.headers['referer'] || '';
  let srcHost  = '';
  try { srcHost = new URL(source).host; } catch { srcHost = ''; }
  if (!srcHost || srcHost !== host) return res.status(403).json({ error: 'CSRF-Schutz: ungültiger Origin' });
  next();
});
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// ── Auth helpers ────────────────────────────────────────────────
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

// ── Audit Log ────────────────────────────────────────────────────
function auditLog(req, action, details = '') {
  const u = getUser(req);
  const userId   = u?.id   || null;
  const username = u?.username || (req.session.voterUsername || 'unbekannt');
  const ip = req.ip || req.socket?.remoteAddress || '';
  db.prepare('INSERT INTO audit_log (user_id, username, action, details, ip) VALUES (?, ?, ?, ?, ?)')
    .run(userId, username, action, details, ip);
}

// ── Rate Limiter (in-memory, per IP) ────────────────────────────
const _rateLimits = new Map();
function rateLimit(key, maxPerWindow, windowMs) {
  const now = Date.now();
  const entry = _rateLimits.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count++;
  _rateLimits.set(key, entry);
  return entry.count > maxPerWindow;
}
// Cleanup alle 5 Minuten
setInterval(() => { const now = Date.now(); _rateLimits.forEach((v, k) => { if (now > v.reset) _rateLimits.delete(k); }); }, 5 * 60 * 1000);

// ── Helpers ─────────────────────────────────────────────────────
// Hilfsfunktion: Berliner Datumsteile auslesen
function _berlinParts() {
  const now = new Date();
  const p = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
  }).formatToParts(now);
  const get = t => +p.find(x => x.type === t).value;
  const y = get('year'), m = get('month'), d = get('day'), h = get('hour');
  const weekday = new Date(y, m - 1, d).getDay(); // 0=So…6=Sa
  return { y, m, d, h, weekday };
}

// ISO-Montag einer Berliner Woche als "YYYY-MM-DD"
function _mondayKey(y, m, d) {
  const isoDay = (new Date(y, m - 1, d).getDay() + 6) % 7; // Mo=0…So=6
  const mon = new Date(y, m - 1, d - isoDay);
  return `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
}

// Aktuelle ISO-Woche in Berliner Zeit (für Auswertung)
function weekKey() {
  const { y, m, d } = _berlinParts();
  return _mondayKey(y, m, d);
}

// Abstimmungs-Wochenschlüssel: nach Sonntag 18:00 Berliner Zeit → nächste Woche
function votingWeekKey() {
  const { y, m, d, h, weekday } = _berlinParts();
  if (weekday === 0 && h >= 18) return _mondayKey(y, m, d + 1); // nächster Montag
  return _mondayKey(y, m, d);
}

const DISCORD_API      = 'https://discord.com/api/v10';
const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOK_URL  = 'https://discord.com/api/oauth2/token';

// Syncs guild nickname + avatar for all active users via Bot token
async function syncGuildMembers() {
  if (!process.env.DISCORD_GUILD_ID || !process.env.DISCORD_BOT_TOKEN) return 0;
  const users = db.prepare('SELECT id, discord_id FROM users WHERE is_active = 1').all();
  let synced = 0;
  for (const user of users) {
    try {
      const r = await fetch(`${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.discord_id}`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      });
      if (!r.ok) continue;
      const member = await r.json();
      const name   = member.nick || member.user?.global_name || member.user?.username;
      const avatar = member.user?.avatar;
      if (name)             db.prepare('UPDATE users SET username = ? WHERE id = ?').run(name, user.id);
      if (avatar !== undefined) db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, user.id);
      synced++;
    } catch (e) { /* einzelne Fehler überspringen */ }
  }
  return synced;
}

// EOW auswerten (Mitarbeiter- + Bürgerstimmen kombiniert)
function runEowEvaluation() {
  const wk = weekKey();
  const winner = db.prepare(`
    SELECT nominee_id, COUNT(*) as votes FROM (
      SELECT nominee_id FROM eow_votes WHERE week = ?
      UNION ALL
      SELECT nominee_id FROM citizen_votes WHERE week = ?
    ) GROUP BY nominee_id ORDER BY votes DESC LIMIT 1
  `).get(wk, wk);
  if (winner) {
    db.prepare('INSERT OR REPLACE INTO eow_winners (user_id, week, vote_count) VALUES (?, ?, ?)')
      .run(winner.nominee_id, wk, winner.votes);
    checkAndAwardBadges(winner.nominee_id);
    console.log(`[EoW] ${wk}: user #${winner.nominee_id} (${winner.votes} Stimmen)`);
    const winnerUser = db.prepare('SELECT discord_id, username FROM users WHERE id = ?').get(winner.nominee_id);
    if (winnerUser) queueNotification('eow', winnerUser.discord_id, { username: winnerUser.username, votes: winner.votes, week: wk });
  } else {
    console.log(`[EoW] ${wk}: keine Stimmen`);
  }
  // Stimmen zurücksetzen damit nächste Woche neu abgestimmt werden kann
  db.prepare('DELETE FROM eow_votes WHERE week = ?').run(wk);
  db.prepare('DELETE FROM citizen_votes WHERE week = ?').run(wk);
  console.log(`[EoW] ${wk}: Stimmen zurückgesetzt`);
  return winner || null;
}

// ════════════════════════════════════════════════════════════════
//  DISCORD OAUTH
// ════════════════════════════════════════════════════════════════
function parseCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

app.get('/auth/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id:     process.env.DISCORD_CLIENT_ID,
    redirect_uri:  process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope:         'identify',
    state,
  });
  res.cookie('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 5 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  });
  res.redirect(`${DISCORD_AUTH_URL}?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (rateLimit(`oauth:${ip}`, 10, 60_000)) return res.status(429).redirect('/?error=rate_limit');
  const { code, state } = req.query;
  const savedState = parseCookie(req, 'oauth_state');
  res.clearCookie('oauth_state', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  if (!code) return res.redirect('/?error=no_code');
  if (!state || !savedState || !secretEqual(state, savedState)) return res.redirect('/?error=state_mismatch');

  try {
    // Exchange code → token
    const tokRes = await fetch(DISCORD_TOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  process.env.DISCORD_REDIRECT_URI,
      }),
    });
    const tok = await tokRes.json();
    if (!tok.access_token) return res.redirect('/?error=token_failed');

    // Fetch Discord user
    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const dUser = await userRes.json();

    // Check whitelist
    const dbUser = db.prepare('SELECT * FROM users WHERE discord_id = ? AND is_active = 1').get(dUser.id);
    if (!dbUser) {
      // Non-whitelisted user → voter-only session (Wunschname überlebt den Re-Login)
      const custom = db.prepare('SELECT username FROM voter_names WHERE discord_id = ?').get(dUser.id)?.username;
      req.session.voterDiscordId  = dUser.id;
      req.session.voterUsername   = custom || dUser.username;
      req.session.voterAvatar     = dUser.avatar;
      return res.redirect('/?mode=vote');
    }

    // Sync name + avatar — bevorzuge Server-Nickname falls Bot-Token vorhanden
    let displayName = dUser.global_name || dUser.username;
    let avatarHash  = dUser.avatar;
    if (process.env.DISCORD_GUILD_ID && process.env.DISCORD_BOT_TOKEN) {
      try {
        const mRes = await fetch(`${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${dUser.id}`, {
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        });
        if (mRes.ok) {
          const member = await mRes.json();
          displayName = member.nick || member.user?.global_name || member.user?.username || displayName;
          avatarHash  = member.user?.avatar ?? avatarHash;
        }
      } catch (_) { /* Fallback auf globalen Namen */ }
    }
    // Bürger mit users-Eintrag: selbst gewählter Name hat Vorrang vor Discord-Sync
    if (dbUser.role === 'citizen') {
      const custom = db.prepare('SELECT username FROM voter_names WHERE discord_id = ?').get(dUser.id)?.username;
      if (custom) displayName = custom;
    }
    db.prepare('UPDATE users SET username = ?, avatar = ? WHERE id = ?').run(displayName, avatarHash, dbUser.id);

    req.session.userId = dbUser.id;

    // BATCH 7: Referral-Reward
    if (req.session.referralBy && req.session.referralBy !== dUser.id) {
      try {
        db.prepare('INSERT OR IGNORE INTO referrals (referrer_did, referred_did) VALUES (?,?)').run(req.session.referralBy, dUser.id);
        if (db.prepare('SELECT changes() as c').get().c > 0) {
          const referrer = db.prepare('SELECT username FROM users WHERE discord_id = ?').get(req.session.referralBy);
          if (referrer) addCoins(req.session.referralBy, referrer.username, 100, 'referral:bonus', { referred: dUser.username });
        }
      } catch {}
      delete req.session.referralBy;
    }

    res.redirect('/');
  } catch (err) {
    console.error('[OAuth]', err.message);
    res.redirect('/?error=oauth_failed');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/auth/me', (req, res) => {
  const u = getUser(req);
  if (u) {
    if (u.role === 'citizen') return res.json({ voter: true, id: u.id, discord_id: u.discord_id, username: u.username, avatar: u.avatar });
    return res.json({ id: u.id, discord_id: u.discord_id, username: u.username, avatar: u.avatar, role: u.role, rank: u.rank });
  }
  if (req.session.voterDiscordId) return res.json({
    voter: true,
    discord_id: req.session.voterDiscordId,
    username:   req.session.voterUsername,
    avatar:     req.session.voterAvatar,
  });
  res.json(null);
});

// ════════════════════════════════════════════════════════════════
//  USERS
// ════════════════════════════════════════════════════════════════
app.get('/api/users', requireAuthOrBot, (req, res) => {
  res.json(db.prepare('SELECT id, discord_id, username, avatar, role, rank, is_active, created_at FROM users WHERE is_active = 1 ORDER BY username').all());
});

app.post('/api/users', (req, res) => {
  const requester = getUser(req);
  const { discord_id, username, role } = req.body;
  if (!discord_id || !username) return res.status(400).json({ error: 'Fehlende Felder' });
  try {
    const result = db.transaction(() => {
      const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
      if (totalUsers > 0 && (!requester || requester.role !== 'admin')) {
        return { error: 'Nur Admins können Nutzer anlegen', status: 403 };
      }
      const assignedRole = totalUsers === 0 ? 'admin' : (role || 'member');
      const r = db.prepare('INSERT INTO users (discord_id, username, role, added_by) VALUES (?, ?, ?, ?)')
        .run(discord_id, username, assignedRole, requester?.id || null);
      return { id: r.lastInsertRowid };
    })();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ id: result.id });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Discord-ID bereits vorhanden' });
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

app.patch('/api/users/:id', requireAdmin, (req, res) => {
  const { role, is_active, username } = req.body;
  if (role !== undefined)      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  if (is_active !== undefined) db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
  if (username)                db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username.trim(), req.params.id);
  auditLog(req, 'user_update', `id=${req.params.id} ${JSON.stringify({role,is_active,username})}`);
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const target = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
  auditLog(req, 'user_deactivate', `id=${req.params.id} username=${target?.username}`);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  EMPLOYEE OF THE WEEK
// ════════════════════════════════════════════════════════════════
app.get('/api/eow', requireAuth, (req, res) => {
  const wk   = votingWeekKey();
  const user = getUser(req);

  const winner = db.prepare(`
    SELECT w.*, u.username, u.avatar FROM eow_winners w
    JOIN users u ON u.id = w.user_id WHERE w.week = ?
  `).get(wk);

  const lastWinner = winner || db.prepare(`
    SELECT w.*, u.username, u.avatar FROM eow_winners w
    JOIN users u ON u.id = w.user_id ORDER BY w.announced_at DESC LIMIT 1
  `).get();

  const standings = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.discord_id, COUNT(*) as votes
    FROM eow_votes v JOIN users u ON u.id = v.nominee_id
    WHERE v.week = ? GROUP BY v.nominee_id ORDER BY votes DESC
  `).all(wk);

  // BATCH 1.2: N+1 Fix — ein Query mit GROUP_CONCAT statt N Queries
  const voterMap = {};
  db.prepare('SELECT nominee_id, GROUP_CONCAT(voter_username) as names FROM citizen_votes WHERE week = ? GROUP BY nominee_id').all(wk).forEach(r => {
    voterMap[r.nominee_id] = r.names ? r.names.split(',') : [];
  });
  standings.forEach(s => { s.voters = voterMap[s.id] || []; });

  const history = db.prepare(`
    SELECT w.week, w.vote_count, u.username, u.avatar, u.discord_id FROM eow_winners w
    JOIN users u ON u.id = w.user_id ORDER BY w.announced_at DESC LIMIT 10
  `).all();

  const myVoteRow = db.prepare('SELECT nominee_id, has_changed FROM eow_votes WHERE voter_id = ? AND week = ?').get(user.id, wk);

  const citizenVotes = db.prepare(`
    SELECT nominee_id, COUNT(*) as votes FROM citizen_votes WHERE week = ? GROUP BY nominee_id
  `).all(wk);

  const citizenVoterNames = db.prepare(`
    SELECT nominee_id, voter_username FROM citizen_votes WHERE week = ? ORDER BY rowid ASC
  `).all(wk);

  res.json({ week: wk, currentWinner: winner, displayWinner: lastWinner, standings, history, myVoteFor: myVoteRow?.nominee_id || null, myHasChanged: myVoteRow?.has_changed === 1, citizenVotes, citizenVoterNames });
});

app.post('/api/eow/reset', requireAdmin, (req, res) => {
  const wk = votingWeekKey();
  db.prepare('DELETE FROM eow_votes WHERE week = ?').run(wk);
  db.prepare('DELETE FROM citizen_votes WHERE week = ?').run(wk);
  auditLog(req, 'eow_reset', `week=${wk}`);
  res.json({ ok: true });
});

app.post('/api/eow/vote', requireAuth, (req, res) => {
  const wk   = votingWeekKey();
  const user = getUser(req);
  const { nominee_id } = req.body;
  if (+nominee_id === user.id) return res.status(400).json({ error: 'Keine Selbstnominierung' });
  const existing = db.prepare('SELECT id, has_changed FROM eow_votes WHERE voter_id = ? AND week = ?').get(user.id, wk);
  if (existing) {
    if (existing.has_changed) return res.status(409).json({ error: 'Stimme wurde bereits geändert' });
    db.prepare('UPDATE eow_votes SET nominee_id = ?, has_changed = 1 WHERE id = ?').run(+nominee_id, existing.id);
    sseEmit('eow_vote', {});
    return res.json({ ok: true, changed: true });
  }
  try {
    db.prepare('INSERT INTO eow_votes (voter_id, nominee_id, week) VALUES (?, ?, ?)').run(user.id, +nominee_id, wk);
    sseEmit('eow_vote', {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Fehler' });
  }
});

app.post('/api/eow/count', requireAdmin, (req, res) => {
  const winner = runEowEvaluation();
  if (!winner) return res.json({ message: 'Keine Stimmen diese Woche' });
  res.json({ ok: true, winner_id: winner.nominee_id, votes: winner.votes });
});

// ════════════════════════════════════════════════════════════════
//  EXAMS
// ════════════════════════════════════════════════════════════════
app.get('/api/exam-categories', (req, res) => {
  res.json(db.prepare(`
    SELECT ec.*, (SELECT COUNT(*) FROM exam_questions WHERE category_id = ec.id AND is_active = 1) as question_count
    FROM exam_categories ec
  `).all());
});

app.get('/api/exam-questions/:catId', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM exam_questions WHERE category_id = ? AND is_active = 1 ORDER BY id DESC').all(req.params.catId));
});

// Öffentlicher Übungsmodus für Bürger — gibt 15 zufällige Fragen zurück
app.get('/api/practice-questions/:catId', (req, res) => {
  const rows = db.prepare('SELECT id, question, option_a, option_b, option_c, option_d, correct_answer FROM exam_questions WHERE category_id = ? AND is_active = 1 ORDER BY RANDOM() LIMIT 15').all(req.params.catId);
  res.json(rows);
});

app.post('/api/exam-questions', requireAdmin, (req, res) => {
  const { category_id, question, option_a, option_b, option_c, option_d, correct_answer } = req.body;
  if (!question || !option_a || !option_b || !option_c || !option_d) return res.status(400).json({ error: 'Fehlende Felder' });
  const r = db.prepare(`
    INSERT INTO exam_questions (category_id, question, option_a, option_b, option_c, option_d, correct_answer, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(category_id, question, option_a, option_b, option_c, option_d, +correct_answer, req.adminUser.id);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/exam-questions/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE exam_questions SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/bans/check', requireAuth, (req, res) => {
  const { name, id } = req.query;
  if (!name) return res.json({ banned: false });
  const nameLower = name.trim().toLowerCase();
  const ban = db.prepare(`
    SELECT b.*, u.username as issued_by_name FROM bans b
    JOIN users u ON u.id = b.issued_by
    WHERE b.is_active = 1
    AND (lower(b.person_name) = ? ${id ? 'OR (b.person_id IS NOT NULL AND b.person_id = ?)' : ''})
    ORDER BY b.issued_at DESC LIMIT 1
  `).get(...(id ? [nameLower, id] : [nameLower]));
  res.json(ban ? { banned: true, ban } : { banned: false });
});

app.post('/api/exams/start', requireAuth, (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || '';
  if (rateLimit(`exam:${ip}`, 10, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
  const { category_id, mode, citizen_name, citizen_id } = req.body;
  const limit = mode === 'flash' ? 5 : 10;
  const qSql = `SELECT id, question, option_a, option_b, option_c, option_d,
    correct_answer, COALESCE(is_ko,0) as is_ko
    FROM exam_questions WHERE category_id = ? AND is_active = 1 AND is_ko = ? ORDER BY RANDOM() LIMIT ?`;
  const koQ  = db.prepare(qSql).all(category_id, 1, 1);
  const regQ = db.prepare(qSql).all(category_id, 0, limit - koQ.length);
  const total = koQ.length + regQ.length;
  if (total < limit) return res.status(400).json({ error: `Nicht genug Fragen (${total}/${limit})` });
  const questions = [...koQ, ...regQ].sort(() => Math.random() - 0.5);
  req.session.activeExam = { category_id: +category_id, mode, question_ids: questions.map(q => q.id), citizenName: citizen_name || null, citizenId: citizen_id || null };
  res.json(questions);
});

app.post('/api/exams/submit', requireAuth, (req, res) => {
  const { answers } = req.body;
  const exam = req.session.activeExam;
  const user = getUser(req);
  if (!exam) return res.status(400).json({ error: 'Kein aktiver Test' });

  const placeholders = exam.question_ids.map(() => '?').join(',');
  const questions = db.prepare(`SELECT id, question, correct_answer FROM exam_questions WHERE id IN (${placeholders})`).all(...exam.question_ids);

  let score = 0;
  const results = questions.map(q => {
    const ua = parseInt(answers[q.id]);
    const ok = ua === q.correct_answer;
    if (ok) score++;
    return { id: q.id, correct_answer: q.correct_answer, user_answer: ua, correct: ok };
  });
  const total  = questions.length;
  const passed = score >= Math.ceil(total * 0.7);
  db.prepare('INSERT INTO exam_sessions (user_id, category_id, mode, score, total, passed) VALUES (?, ?, ?, ?, ?, ?)')
    .run(user.id, exam.category_id, exam.mode, score, total, passed ? 1 : 0);

  const wrongQuestions = results
    .filter(r => !r.correct)
    .map(r => questions.find(q => q.id === r.id)?.question)
    .filter(Boolean);
  const notesJson = wrongQuestions.length ? JSON.stringify({ wrong: wrongQuestions }) : null;

  let registryId = null;
  const category = db.prepare('SELECT name FROM exam_categories WHERE id = ?').get(exam.category_id);
  if (exam.citizenName) {
    const r = db.prepare(`INSERT INTO registry (citizen_name, citizen_id, category_id, examiner_id, exam_type, passed, notes)
      VALUES (?, ?, ?, ?, 'Theorie', ?, ?)`)
      .run(exam.citizenName, exam.citizenId || null, exam.category_id, user.id, passed ? 1 : 0, notesJson);
    registryId = r.lastInsertRowid;
  }

  let banId = null;
  if (!passed && exam.citizenName) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const b = db.prepare(`INSERT INTO bans (person_name, person_id, reason, issued_by, duration_days, expires_at, is_active)
      VALUES (?, ?, ?, ?, 1, ?, 1)`)
      .run(exam.citizenName, exam.citizenId || null, `Prüfung nicht bestanden – ${category?.name || 'Unbekannt'}`, user.id, expiresAt);
    banId = b.lastInsertRowid;
  }

  // ACLS-Coins für den Prüfer (nur echte Bürger-Prüfungen): Blitz 25, Standard 50
  if (exam.citizenName) {
    const coins = exam.mode === 'flash' ? 25 : 50;
    addCoins(user.discord_id, user.username, coins, exam.mode === 'flash' ? 'exam:blitz' : 'exam:standard', { category: category?.name });
  }

  delete req.session.activeExam;
  checkAndAwardBadges(user.id);
  queueNotification('exam', null, {
    channelType: 'theory',
    examType: `${category?.name || 'Unbekannt'} Theorie`,
    examinerName: user.username,
    citizenName: exam.citizenName || null,
    passed,
    score: `${score}/${total}`,
    percentage: Math.round((score / total) * 100),
    date: new Date().toISOString().split('T')[0],
  });
  sseEmit('exam', { passed, category: exam.categoryName });
  res.json({ score, total, passed, percentage: Math.round((score / total) * 100), results, registryId, banId });
});

function createBan(db, personName, personId, reason, issuedById) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return db.prepare(`INSERT INTO bans (person_name, person_id, reason, issued_by, duration_days, expires_at, is_active)
    VALUES (?, ?, ?, ?, 1, ?, 1)`)
    .run(personName, personId || null, reason, issuedById, expiresAt).lastInsertRowid;
}

// K.O.-Frage falsch → sofort ban + registry-Eintrag
app.post('/api/exams/ko-fail', requireAuth, (req, res) => {
  const { citizen_name, citizen_id, category_id, question } = req.body;
  const user = getUser(req);
  const category = db.prepare('SELECT name FROM exam_categories WHERE id = ?').get(+category_id);
  let banId = null;
  if (citizen_name) {
    const notesJson = question ? JSON.stringify({ wrong: [question] }) : null;
    db.prepare(`INSERT INTO registry (citizen_name, citizen_id, category_id, examiner_id, exam_type, passed, notes) VALUES (?, ?, ?, ?, 'Theorie', 0, ?)`)
      .run(citizen_name, citizen_id || null, +category_id, user.id, notesJson);
    banId = createBan(db, citizen_name, citizen_id, `K.O.-Frage falsch – ${category?.name || ''}`, user.id);
    // Auch eine per K.O. beendete Prüfung wurde abgehalten → Coins für den Prüfer
    const koMode = req.session.activeExam?.mode;
    const coins = koMode === 'flash' ? 25 : 50;
    addCoins(user.discord_id, user.username, coins, koMode === 'flash' ? 'exam:blitz' : 'exam:standard', { category: category?.name, ko: true });
  }
  delete req.session.activeExam;
  res.json({ banId });
});

// Praxis-Prüfung auswerten
app.post('/api/exams/practical', requireAuth, (req, res) => {
  const { citizen_name, citizen_id, category_id, errors } = req.body;
  const user = getUser(req);
  const passed = !errors || errors.length === 0;
  const r = db.prepare(`INSERT INTO registry (citizen_name, citizen_id, category_id, examiner_id, exam_type, passed) VALUES (?, ?, ?, ?, 'Praxis', ?)`)
    .run(citizen_name, citizen_id || null, +category_id, user.id, passed ? 1 : 0);
  let banId = null;
  if (!passed && citizen_name) {
    banId = createBan(db, citizen_name, citizen_id, `Praxisprüfung nicht bestanden – ${errors.join(', ')}`, user.id);
  }
  const practCat = db.prepare('SELECT name FROM exam_categories WHERE id = ?').get(+category_id);
  // Coins für den Prüfer: Praxisprüfung zählt wie eine Standard-Prüfung
  addCoins(user.discord_id, user.username, 50, 'exam:praxis', { category: practCat?.name });
  queueNotification('exam', null, {
    channelType: 'practical',
    examType: `${practCat?.name || 'Unbekannt'} Praxis`,
    examinerName: user.username,
    citizenName: citizen_name || null,
    passed,
    errors: errors || [],
    date: new Date().toISOString().split('T')[0],
  });
  res.json({ passed, registryId: r.lastInsertRowid, banId });
});

// ════════════════════════════════════════════════════════════════
//  REGISTRY
// ════════════════════════════════════════════════════════════════
app.get('/api/registry', requireAuth, (req, res) => {
  if (rateLimit('registry:' + req.ip, 30, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
  const { search, category } = req.query;
  let sql = `
    SELECT r.*, ec.name as category_name, ec.icon, u.username as examiner_name,
      (SELECT COUNT(*) FROM citizen_notes cn WHERE LOWER(cn.citizen_name)=LOWER(r.citizen_name)) as note_count
    FROM registry r JOIN exam_categories ec ON ec.id = r.category_id JOIN users u ON u.id = r.examiner_id WHERE 1=1`;
  const params = [];
  if (search)   { sql += ' AND (LOWER(r.citizen_name) LIKE ? OR LOWER(r.citizen_id) LIKE ?)'; params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`); }
  if (category) { sql += ' AND r.category_id = ?'; params.push(+category); }
  sql += ' ORDER BY r.registered_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/registry', requireAuth, (req, res) => {
  const { citizen_name, citizen_id, category_id, exam_type, passed, notes } = req.body;
  const user = getUser(req);
  if (!citizen_name || !category_id) return res.status(400).json({ error: 'Fehlende Felder' });
  const r = db.prepare(`
    INSERT INTO registry (citizen_name, citizen_id, category_id, examiner_id, exam_type, passed, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(citizen_name, citizen_id, +category_id, user.id, exam_type || 'Theorie', passed !== false ? 1 : 0, notes || null);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/registry/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM registry WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  FACTIONS
// ════════════════════════════════════════════════════════════════
app.get('/api/factions', requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT f.*, u.username as created_by_name FROM factions f JOIN users u ON u.id = f.created_by ORDER BY f.name`).all());
});

// Farbwert säubern: nur unbedenkliche Zeichen (kein <>"' ) – Defense-in-Depth zum Output-Escaping
const cleanColor = c => {
  if (c == null) return null;
  const s = String(c).trim().slice(0, 40);
  return s && /^[\w\s#().,%/-]*$/.test(s) ? s : null;
};

app.post('/api/factions', requireAuth, (req, res) => {
  const { name, primary_color, secondary_color, pearl_color, notes } = req.body;
  const user = getUser(req);
  if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const r = db.prepare('INSERT INTO factions (name, primary_color, secondary_color, pearl_color, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name.trim().slice(0, 80), cleanColor(primary_color), cleanColor(secondary_color), cleanColor(pearl_color), notes?.trim().slice(0, 500) || null, user.id);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/factions/:id', requireAdmin, (req, res) => {
  const { name, primary_color, secondary_color, pearl_color, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  db.prepare('UPDATE factions SET name=?, primary_color=?, secondary_color=?, pearl_color=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name.trim().slice(0, 80), cleanColor(primary_color), cleanColor(secondary_color), cleanColor(pearl_color), notes?.trim().slice(0, 500) || null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/factions/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM factions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  MAP SPOTS
// ════════════════════════════════════════════════════════════════
app.get('/api/map-spots', requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT s.*, u.username as created_by_name FROM map_spots s JOIN users u ON u.id = s.created_by ORDER BY s.created_at DESC`).all());
});

app.post('/api/map-spots', requireAuth, (req, res) => {
  const { name, description, x_pos, y_pos, spot_type } = req.body;
  const user = getUser(req);
  if (!name || x_pos === undefined || y_pos === undefined) return res.status(400).json({ error: 'Fehlende Felder' });
  const r = db.prepare('INSERT INTO map_spots (name, description, x_pos, y_pos, spot_type, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, description || null, +x_pos, +y_pos, spot_type || 'tow', user.id);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/map-spots/:id', requireAuth, (req, res) => {
  const spot = db.prepare('SELECT * FROM map_spots WHERE id = ?').get(req.params.id);
  const user = getUser(req);
  if (!spot) return res.status(404).json({ error: 'Nicht gefunden' });
  if (spot.created_by !== user.id && user.role !== 'admin') return res.status(403).json({ error: 'Kein Zugriff' });
  db.prepare('DELETE FROM map_spots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  BANS
// ════════════════════════════════════════════════════════════════
app.get('/api/bans', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT b.*, u.username as issued_by_name, lu.username as lifted_by_name
    FROM bans b JOIN users u ON u.id = b.issued_by LEFT JOIN users lu ON lu.id = b.lifted_by
    ORDER BY b.issued_at DESC
  `).all());
});

app.post('/api/bans', requireAuth, (req, res) => {
  const { person_name, person_id, reason, duration_days } = req.body;
  const user = getUser(req);
  if (!person_name || !reason) return res.status(400).json({ error: 'Fehlende Felder' });
  let expires_at = null;
  if (duration_days && +duration_days > 0) {
    const d = new Date(); d.setDate(d.getDate() + +duration_days);
    expires_at = d.toISOString();
  }
  const r = db.prepare('INSERT INTO bans (person_name, person_id, reason, issued_by, duration_days, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(person_name, person_id || null, reason, user.id, duration_days || null, expires_at);
  auditLog(req, 'ban_create', `person=${person_name} id=${person_id} reason=${reason} days=${duration_days||'∞'}`);
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/bans/:id/lift', requireAdmin, (req, res) => {
  const user = getUser(req);
  const ban = db.prepare('SELECT person_name FROM bans WHERE id=?').get(req.params.id);
  db.prepare('UPDATE bans SET is_active=0, lifted_by=?, lifted_at=CURRENT_TIMESTAMP WHERE id=?').run(user.id, req.params.id);
  auditLog(req, 'ban_lift', `ban_id=${req.params.id} person=${ban?.person_name}`);
  res.json({ ok: true });
});

app.delete('/api/bans/:id', requireAdmin, (req, res) => {
  const ban = db.prepare('SELECT person_name FROM bans WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM bans WHERE id = ?').run(req.params.id);
  auditLog(req, 'ban_delete', `ban_id=${req.params.id} person=${ban?.person_name}`);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  IC LOG
// ════════════════════════════════════════════════════════════════
app.get('/api/ic-log', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT l.*, u.username as user_name, lu.username as logged_by_name
    FROM ic_log l JOIN users u ON u.id = l.user_id LEFT JOIN users lu ON lu.id = l.logged_by
    ORDER BY l.date DESC, l.created_at DESC LIMIT 100
  `).all());
});

app.get('/api/ic-stats', requireAuthOrBot, (req, res) => {
  if (rateLimit('icstats:' + req.ip, 10, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
  // ISO-Wochenstart = Montag: (wochentag + 6) % 7 Tage zurück
  res.json(db.prepare(`
    SELECT u.id, u.username, u.avatar, u.discord_id,
      COALESCE(SUM(l.hours), 0) as total,
      COALESCE(SUM(CASE WHEN l.date >= date('now', '-' || CAST((CAST(strftime('%w','now') AS INTEGER) + 6) % 7 AS TEXT) || ' days')
        THEN l.hours ELSE 0 END), 0) as week,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', l.date) = strftime('%Y-%m', 'now') THEN l.hours ELSE 0 END), 0) as month
    FROM users u LEFT JOIN ic_log l ON l.user_id = u.id
    WHERE u.is_active = 1 GROUP BY u.id ORDER BY week DESC
  `).all());
});

app.get('/api/monatsbericht', requireAuthOrBot, (req, res) => {
  if (rateLimit('bericht:' + req.ip, 5, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
  const weekStart = `date('now', '-' || CAST((CAST(strftime('%w','now') AS INTEGER) + 6) % 7 AS TEXT) || ' days')`;
  const total = db.prepare(`SELECT COUNT(*) as c, SUM(passed) as p FROM registry`).get();
  const week  = db.prepare(`SELECT COUNT(*) as c, SUM(passed) as p FROM registry WHERE date >= ${weekStart}`).get();
  const month = db.prepare(`SELECT COUNT(*) as c, SUM(passed) as p FROM registry WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`).get();
  const byExaminer = db.prepare(`
    SELECT u.username, COUNT(*) as c, SUM(r.passed) as p
    FROM registry r JOIN users u ON u.id = r.examiner_id
    WHERE strftime('%Y-%m', r.date) = strftime('%Y-%m', 'now')
    GROUP BY r.examiner_id ORDER BY c DESC LIMIT 10
  `).all();
  const byCategory = db.prepare(`
    SELECT ec.name, COUNT(*) as c, SUM(r.passed) as p
    FROM registry r JOIN exam_categories ec ON ec.id = r.category_id
    WHERE strftime('%Y-%m', r.date) = strftime('%Y-%m', 'now')
    GROUP BY r.category_id ORDER BY c DESC
  `).all();
  const icWeek = db.prepare(`
    SELECT u.username, COALESCE(SUM(l.hours),0) as h
    FROM users u JOIN ic_log l ON l.user_id = u.id
    WHERE u.is_active = 1 AND l.date >= ${weekStart}
    GROUP BY u.id ORDER BY h DESC LIMIT 5
  `).all();
  res.json({ total, week, month, byExaminer, byCategory, icWeek });
});

app.post('/api/ic-log', requireAdmin, (req, res) => {
  const { user_id, hours, date, notes } = req.body;
  const r = db.prepare('INSERT INTO ic_log (user_id, hours, date, notes, logged_by, auto) VALUES (?, ?, ?, ?, ?, 0)')
    .run(+user_id, +hours, date, notes || null, req.adminUser.id);
  checkAndAwardBadges(+user_id);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/ic-log/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM ic_log WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/ic-log/reset', requireAdmin, (req, res) => {
  const { scope } = req.body;
  if (scope === 'week')
    db.prepare("DELETE FROM ic_log WHERE date >= date('now', '-' || CAST((CAST(strftime('%w','now') AS INTEGER) + 6) % 7 AS TEXT) || ' days')").run();
  else if (scope === 'month')
    db.prepare("DELETE FROM ic_log WHERE strftime('%Y-%m',date)=strftime('%Y-%m','now')").run();
  else if (scope === 'all')
    db.prepare('DELETE FROM ic_log').run();
  else return res.status(400).json({ error: 'Ungültiger Scope' });
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  CITIZEN VOTES (öffentlich — jeder Discord-Nutzer)
// ════════════════════════════════════════════════════════════════
app.get('/api/citizen-votes', (req, res) => {
  const wk = votingWeekKey();
  const counts = db.prepare('SELECT nominee_id, COUNT(*) as votes FROM citizen_votes WHERE week = ? GROUP BY nominee_id').all(wk);
  const discordId = req.session.voterDiscordId || (req.session.userId ? db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id : null);
  const myVote = discordId ? db.prepare('SELECT nominee_id, has_changed FROM citizen_votes WHERE voter_discord_id = ? AND week = ?').get(discordId, wk) : null;
  res.json({ counts, myVoteFor: myVote?.nominee_id || null, myHasChanged: myVote?.has_changed === 1 });
});

app.post('/api/citizen-vote', (req, res) => {
  const ip        = req.ip || req.socket?.remoteAddress || 'unknown';
  if (rateLimit(`vote:${ip}`, 5, 60 * 1000)) return res.status(429).json({ error: 'Zu viele Anfragen, bitte warte kurz' });

  const discordId = req.session.voterDiscordId || (req.session.userId ? db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id : null);
  const username  = req.session.voterUsername  || (req.session.userId ? db.prepare('SELECT username FROM users WHERE id = ?').get(req.session.userId)?.username : null);
  if (!discordId) return res.status(401).json({ error: 'Nicht angemeldet' });

  const { nominee_id } = req.body;
  if (!nominee_id) return res.status(400).json({ error: 'Fehlende Felder' });

  const wk = votingWeekKey();
  const existing = db.prepare('SELECT id, has_changed FROM citizen_votes WHERE voter_discord_id = ? AND week = ?').get(discordId, wk);
  if (existing) {
    if (existing.has_changed) return res.status(409).json({ error: 'Stimme wurde bereits geändert' });
    db.prepare('UPDATE citizen_votes SET nominee_id = ?, has_changed = 1 WHERE id = ?').run(+nominee_id, existing.id);
    return res.json({ ok: true, changed: true });
  }
  try {
    db.prepare('INSERT INTO citizen_votes (voter_discord_id, voter_username, nominee_id, week) VALUES (?, ?, ?, ?)')
      .run(discordId, username, +nominee_id, wk);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Fehler' });
  }
});

app.get('/api/users/public', (req, res) => {
  res.json(db.prepare('SELECT id, username, avatar, discord_id FROM users WHERE is_active = 1 ORDER BY username').all());
});

// Vom Bot aufgerufen wenn Server-Nickname sich ändert
app.post('/api/sync-member', (req, res) => {
  const { bot_secret, discord_id, username, avatar } = req.body;
  if (!secretEqual(bot_secret, BOT_API_SECRET)) return res.status(403).end();
  const user = db.prepare('SELECT id, role FROM users WHERE discord_id = ? AND is_active = 1').get(discord_id);
  if (user) {
    // Bürger mit Wunschnamen: Discord-Sync überschreibt den Namen nicht
    const hasCustom = user.role === 'citizen'
      && db.prepare('SELECT 1 FROM voter_names WHERE discord_id = ?').get(discord_id);
    if (username && !hasCustom) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, user.id);
    if (avatar !== undefined) db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, user.id);
  }
  res.json({ ok: true });
});

// ── Bürger: eigenen Anzeigenamen ändern ─────────────────────────
app.post('/api/voter/name', (req, res) => {
  const u = getUser(req);
  const did = u ? u.discord_id : req.session?.voterDiscordId;
  if (!did) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (u && u.role !== 'citizen')
    return res.status(403).json({ error: 'Mitarbeiter-Namen werden über Discord synchronisiert' });
  if (rateLimit(`rename:${did}`, 3, 3600_000))
    return res.status(429).json({ error: 'Maximal 3 Namensänderungen pro Stunde' });
  const name = String(req.body.username || '').trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (name.length < 2 || name.length > 32)
    return res.status(400).json({ error: 'Name muss 2–32 Zeichen lang sein' });
  db.prepare(`INSERT INTO voter_names (discord_id, username) VALUES (?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, updated_at = CURRENT_TIMESTAMP`).run(did, name);
  if (u) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(name, u.id);
  if (req.session.voterDiscordId) req.session.voterUsername = name;
  // Anzeigename überall nachziehen, wo er denormalisiert gespeichert ist
  db.prepare('UPDATE coin_balances SET username = ? WHERE discord_id = ?').run(name, did);
  db.prepare('UPDATE visitor_game_scores SET username = ? WHERE discord_id = ?').run(name, did);
  auditLog(req, 'voter_rename', name);
  res.json({ ok: true, username: name });
});

// Admin: alle Guild-Mitglieder manuell synchronisieren
app.post('/api/sync-members', requireAdmin, async (req, res) => {
  try {
    const synced = await syncGuildMembers();
    res.json({ ok: true, synced });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  GTA V MAP PROXY (umgeht imgur-Hotlink-Sperre)
// ════════════════════════════════════════════════════════════════
let _gtaMapCache = null;
let _gtaMapCachedAt = 0;
app.get('/api/gta-map', async (req, res) => {
  try {
    if (_gtaMapCache && Date.now() - _gtaMapCachedAt < 86400000) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(_gtaMapCache);
    }
    const r = await fetch('https://i.imgur.com/IimSBGR.jpeg', {
      headers: { 'Referer': 'https://imgur.com/', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const buf = await r.buffer();
    _gtaMapCache = buf;
    _gtaMapCachedAt = Date.now();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(buf);
  } catch (e) {
    console.error('[GTA Map]', e.message);
    res.status(502).end();
  }
});

// Active sessions – persisted in SQLite so restarts don't clear them
db.exec(`CREATE TABLE IF NOT EXISTS active_bot_sessions (
  discord_id   TEXT PRIMARY KEY,
  username     TEXT,
  channel_name TEXT,
  joined_at    TEXT NOT NULL
)`);
// Stale sessions older than 12h bereinigen (Bot-Absturz ohne Leave-Event)
db.prepare(`DELETE FROM active_bot_sessions WHERE joined_at < datetime('now', '-12 hours')`).run();

app.post('/api/active-session', (req, res) => {
  const { bot_secret, discord_id, username, channel_name, joined_at } = req.body;
  if (!secretEqual(bot_secret, BOT_API_SECRET)) return res.status(403).end();
  if (joined_at) {
    db.prepare('INSERT OR REPLACE INTO active_bot_sessions (discord_id, username, channel_name, joined_at) VALUES (?, ?, ?, ?)')
      .run(discord_id, username || discord_id, channel_name, joined_at);
  } else {
    db.prepare('DELETE FROM active_bot_sessions WHERE discord_id = ?').run(discord_id);
  }
  res.json({ ok: true });
});

app.get('/api/active-sessions', requireAuthOrBot, (req, res) => {
  const now = Date.now();
  const rows = db.prepare('SELECT * FROM active_bot_sessions').all();
  const result = rows.map(s => {
    const user = db.prepare('SELECT id, username FROM users WHERE discord_id = ? AND is_active = 1').get(s.discord_id);
    const minutesSince = Math.floor((now - new Date(s.joined_at).getTime()) / 60000);
    return { discord_id: s.discord_id, username: user?.username || s.username, channelName: s.channel_name, joinedAt: s.joined_at, minutesSince };
  });
  res.json(result);
});

// Called by bot.js to store auto-tracked voice sessions
app.post('/api/voice-session', (req, res) => {
  const { bot_secret, discord_id, channel_id, channel_name, joined_at, left_at, duration_minutes, hours, date, notes } = req.body;
  if (!secretEqual(bot_secret, BOT_API_SECRET)) {
    return res.status(403).json({ error: 'Ungültiger Bot-Secret' });
  }
  db.prepare('INSERT INTO voice_sessions (discord_id, channel_id, channel_name, joined_at, left_at, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(discord_id, channel_id, channel_name, joined_at, left_at, duration_minutes);

  // Auto-add to ic_log if user exists and >= 1 minute
  if (duration_minutes >= 1) {
    const user = db.prepare('SELECT * FROM users WHERE discord_id = ? AND is_active = 1').get(discord_id);
    if (user) {
      db.prepare('INSERT INTO ic_log (user_id, hours, date, notes, logged_by, auto) VALUES (?, ?, ?, ?, NULL, 1)')
        .run(user.id, +hours, date, notes || `Auto: ${channel_name} (${duration_minutes} Min)`);
      checkAndAwardBadges(user.id);
    }
  }
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  DASHBOARD (aggregated)
// ════════════════════════════════════════════════════════════════
app.get('/api/dashboard', requireAuth, (req, res) => {
  const total   = db.prepare('SELECT COUNT(*) as c FROM registry').get().c;
  const passed  = db.prepare('SELECT COUNT(*) as c FROM registry WHERE passed = 1').get().c;
  const failed  = total - passed;
  const rate    = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
  const today   = new Date().toISOString().split('T')[0];

  const todayCount = db.prepare("SELECT COUNT(*) as c FROM registry WHERE date(registered_at) = ?").get(today).c;
  const weekCount  = db.prepare("SELECT COUNT(*) as c FROM registry WHERE registered_at >= date('now','-6 days')").get().c;
  const monthCount = db.prepare("SELECT COUNT(*) as c FROM registry WHERE strftime('%Y-%m',registered_at)=strftime('%Y-%m','now')").get().c;

  const top5 = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.discord_id, COUNT(*) as count FROM registry r
    JOIN users u ON u.id = r.examiner_id GROUP BY r.examiner_id ORDER BY count DESC LIMIT 5
  `).all();

  // Last 5 registry entries with full detail (prüfer + prüfling)
  const lastExams = db.prepare(`
    SELECT r.*, ec.name as category_name, ec.icon, u.username as examiner_name
    FROM registry r JOIN exam_categories ec ON ec.id = r.category_id JOIN users u ON u.id = r.examiner_id
    ORDER BY r.registered_at DESC LIMIT 5
  `).all();

  const wk         = votingWeekKey();
  const eowWinner  = db.prepare(`SELECT w.*, u.username, u.avatar, u.discord_id FROM eow_winners w JOIN users u ON u.id=w.user_id WHERE w.week=?`).get(wk);
  const lastWinner = eowWinner || db.prepare(`SELECT w.*, u.username, u.avatar, u.discord_id FROM eow_winners w JOIN users u ON u.id=w.user_id ORDER BY w.announced_at DESC LIMIT 1`).get();

  // Aktuelle Stimmen (Mitarbeiter + Bürger kombiniert) für Dashboard-Anzeige
  const eowStandings = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.discord_id, COUNT(*) as votes
    FROM (
      SELECT nominee_id FROM eow_votes WHERE week = ?
      UNION ALL
      SELECT nominee_id FROM citizen_votes WHERE week = ?
    ) v JOIN users u ON u.id = v.nominee_id
    GROUP BY v.nominee_id ORDER BY votes DESC LIMIT 3
  `).all(wk, wk);

  const icWeekTop = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.discord_id, COALESCE(SUM(l.hours),0) as hours FROM users u
    LEFT JOIN ic_log l ON l.user_id=u.id AND l.date >= date('now','-6 days')
    WHERE u.is_active=1 GROUP BY u.id ORDER BY hours DESC LIMIT 3
  `).all();

  res.json({ total, passed, failed, rate, todayCount, weekCount, monthCount, top5, lastExams,
    eowWinner: lastWinner, isCurrentWeekWinner: !!eowWinner, eowStandings, currentWeek: wk, icWeekTop });
});

// ════════════════════════════════════════════════════════════════
//  ANNOUNCEMENTS
// ════════════════════════════════════════════════════════════════
app.get('/api/announcements', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT a.*, u.username as author FROM announcements a
    JOIN users u ON u.id = a.created_by
    ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 20
  `).all());
});

app.post('/api/announcements', requireAdmin, (req, res) => {
  const { title, content } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'Titel und Inhalt erforderlich' });
  const r = db.prepare('INSERT INTO announcements (title, content, created_by) VALUES (?, ?, ?)').run(title.trim(), content.trim(), req.adminUser.id);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/announcements/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.patch('/api/announcements/:id/pin', requireAdmin, (req, res) => {
  const a = db.prepare('SELECT is_pinned FROM announcements WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Nicht gefunden' });
  db.prepare('UPDATE announcements SET is_pinned = ? WHERE id = ?').run(a.is_pinned ? 0 : 1, req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  DASHBOARD PERSONALISIERUNG
// ════════════════════════════════════════════════════════════════
app.get('/api/dashboard/prefs', requireAuth, (req, res) => {
  const u = getUser(req);
  const row = db.prepare('SELECT layout FROM dashboard_prefs WHERE user_id = ?').get(u.id);
  res.json({ layout: row ? JSON.parse(row.layout) : [] });
});

app.post('/api/dashboard/prefs', requireAuth, (req, res) => {
  const u = getUser(req);
  const layout = JSON.stringify(req.body.layout || []);
  db.prepare(`INSERT INTO dashboard_prefs (user_id, layout, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET layout=excluded.layout, updated_at=excluded.updated_at`)
    .run(u.id, layout);
  res.json({ ok: true });
});

app.get('/api/dashboard/note', requireAuth, (req, res) => {
  const u = getUser(req);
  const row = db.prepare('SELECT content FROM dashboard_notes WHERE user_id = ?').get(u.id);
  res.json({ content: row?.content || '' });
});

app.post('/api/dashboard/note', requireAuth, (req, res) => {
  const u = getUser(req);
  const content = (req.body.content || '').slice(0, 2000);
  db.prepare(`INSERT INTO dashboard_notes (user_id, content, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`)
    .run(u.id, content);
  res.json({ ok: true });
});

app.get('/api/dashboard/streak', requireAuth, (req, res) => {
  const u = getUser(req);
  const row = db.prepare('SELECT streak, best_streak, last_daily FROM coin_balances WHERE discord_id = ?').get(u.discord_id);
  res.json({ streak: row?.streak || 0, best_streak: row?.best_streak || 0, last_daily: row?.last_daily || null });
});

app.get('/api/dashboard/coin-history', requireAuth, (req, res) => {
  const u = getUser(req);
  const rows = db.prepare(`
    SELECT date(created_at) as day, SUM(amount) as net
    FROM coin_transactions
    WHERE discord_id = ? AND created_at >= date('now', '-6 days')
    GROUP BY date(created_at) ORDER BY day ASC
  `).all(u.discord_id);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    days.push({ day: key, net: rows.find(r => r.day === key)?.net || 0 });
  }
  res.json(days);
});

// ════════════════════════════════════════════════════════════════
//  RANKS
// ════════════════════════════════════════════════════════════════
app.patch('/api/users/:id/rank', requireAdmin, (req, res) => {
  const { rank } = req.body;
  const valid = ['Azubi', 'Mitarbeiter', 'Senior', 'Führungskraft', 'Rang 12'];
  if (!valid.includes(rank)) return res.status(400).json({ error: 'Ungültiger Rang' });
  db.prepare('UPDATE users SET rank = ? WHERE id = ?').run(rank, req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  BADGES
// ════════════════════════════════════════════════════════════════
// ── Spiel-Achievements: nach Score-Submit, Blackjack-Gewinn, Duell-Ende ──
function checkGameBadges(userId, discordId) {
  try {
    const distinct = db.prepare('SELECT COUNT(DISTINCT game) AS c FROM game_scores WHERE user_id = ?').get(userId).c;
    if (distinct >= 3)  awardBadge(userId, 'game_3');
    if (distinct >= 10) awardBadge(userId, 'game_10');
    const tow = db.prepare(`SELECT score FROM game_scores WHERE user_id = ? AND game = 'tow'`).get(userId)?.score || 0;
    if (tow >= 1000) awardBadge(userId, 'tow_pro');
    const bj = db.prepare(`SELECT score FROM game_scores WHERE user_id = ? AND game = 'blackjack'`).get(userId)?.score || 0;
    if (bj >= 500) awardBadge(userId, 'bj_500');
    if (discordId) {
      const wins = db.prepare(`SELECT COUNT(*) AS c FROM quiz_duels WHERE winner_did = ? AND status = 'done'`).get(discordId).c;
      if (wins >= 5)  awardBadge(userId, 'duel_5');
      if (wins >= 25) awardBadge(userId, 'duel_25');
      const earned = db.prepare('SELECT total_earned FROM coin_balances WHERE discord_id = ?').get(discordId)?.total_earned || 0;
      if (earned >= 1000)  awardBadge(userId, 'coins_1k');
      if (earned >= 10000) awardBadge(userId, 'coins_10k');
    }
  } catch (e) { console.error('[Badges]', e.message); }
}

function queueNotification(type, discordId, payload) {
  try {
    db.prepare('INSERT INTO bot_notifications (type, discord_id, payload) VALUES (?, ?, ?)')
      .run(type, discordId || null, JSON.stringify(payload));
  } catch(e) {}
}

function awardBadge(userId, badgeType) {
  try {
    db.prepare('INSERT INTO user_badges (user_id, badge_type) VALUES (?, ?)').run(userId, badgeType);
    const user = db.prepare('SELECT discord_id, username FROM users WHERE id = ?').get(userId);
    if (user) {
      queueNotification('badge', user.discord_id, { badgeType, username: user.username });
      createNotif(user.discord_id, 'badge', { badgeType });
    }
  } catch(e) {}
}

function createNotif(discordId, type, data) {
  try {
    db.prepare('INSERT INTO notifications (discord_id, type, data) VALUES (?, ?, ?)')
      .run(discordId, type, JSON.stringify(data));
    sseEmit('notification', { discord_id: discordId }, discordId);
  } catch(e) {}
}

function checkAndAwardBadges(userId) {
  const conducted = db.prepare('SELECT COUNT(*) as c FROM registry WHERE examiner_id = ?').get(userId).c;
  if (conducted >= 10)  awardBadge(userId, 'exams_10');
  if (conducted >= 50)  awardBadge(userId, 'exams_50');
  if (conducted >= 100) awardBadge(userId, 'exams_100');

  const eowWins = db.prepare('SELECT COUNT(*) as c FROM eow_winners WHERE user_id = ?').get(userId).c;
  if (eowWins >= 1) awardBadge(userId, 'eow_1');
  if (eowWins >= 3) awardBadge(userId, 'eow_3');
  if (eowWins >= 5) awardBadge(userId, 'eow_5');

  // Kategorie-Abzeichen: mind. 1 bestandene Prüfung pro Kategorie abgenommen
  const cats = db.prepare(`
    SELECT ec.name FROM registry r
    JOIN exam_categories ec ON ec.id = r.category_id
    WHERE r.examiner_id = ? AND r.passed = 1
    GROUP BY r.category_id
  `).all(userId);
  for (const cat of cats) {
    awardBadge(userId, 'cat_' + cat.name.toLowerCase().replace(/[^a-z]/g, ''));
  }

  // IC-Zeit Meilensteine
  const icTotal = db.prepare('SELECT COALESCE(SUM(hours),0) as h FROM ic_log WHERE user_id = ?').get(userId).h;
  if (icTotal >= 10)  awardBadge(userId, 'ic_10');
  if (icTotal >= 50)  awardBadge(userId, 'ic_50');
  if (icTotal >= 100) awardBadge(userId, 'ic_100');
  if (icTotal >= 250) awardBadge(userId, 'ic_250');
  if (icTotal >= 500) awardBadge(userId, 'ic_500');
}

app.get('/api/my-badges', requireAuth, (req, res) => {
  const u       = getUser(req);
  const badges  = db.prepare('SELECT badge_type, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at ASC').all(u.id);
  const conducted = db.prepare('SELECT COUNT(*) as c FROM registry WHERE examiner_id = ?').get(u.id).c;
  const eowWins   = db.prepare('SELECT COUNT(*) as c FROM eow_winners WHERE user_id = ?').get(u.id).c;
  const icTotal   = db.prepare('SELECT COALESCE(SUM(hours),0) as h FROM ic_log WHERE user_id = ?').get(u.id).h;
  // Gaming-Statistiken für die Spiel-Achievements
  const distinctGames = db.prepare('SELECT COUNT(DISTINCT game) as c FROM game_scores WHERE user_id = ?').get(u.id).c;
  const duelWins      = db.prepare(`SELECT COUNT(*) as c FROM quiz_duels WHERE winner_did = ? AND status = 'done'`).get(u.discord_id).c;
  const coinsEarned   = db.prepare('SELECT COALESCE(total_earned, 0) as e FROM coin_balances WHERE discord_id = ?').get(u.discord_id)?.e || 0;
  const towBest       = db.prepare(`SELECT COALESCE(score, 0) as s FROM game_scores WHERE user_id = ? AND game = 'tow'`).get(u.id)?.s || 0;
  const bjBest        = db.prepare(`SELECT COALESCE(score, 0) as s FROM game_scores WHERE user_id = ? AND game = 'blackjack'`).get(u.id)?.s || 0;
  const bestStreak    = db.prepare('SELECT COALESCE(best_streak, 0) as s FROM coin_balances WHERE discord_id = ?').get(u.discord_id)?.s || 0;
  res.json({ badges, stats: { conducted, eowWins, icTotal: +icTotal, distinctGames, duelWins, coinsEarned, towBest, bjBest, bestStreak } });
});

app.get('/api/badges/:userId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT badge_type, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at ASC').all(req.params.userId));
});

// ════════════════════════════════════════════════════════════════
//  FREUNDESLISTE + VERGLEICH
// ════════════════════════════════════════════════════════════════
// ── Bürger-Rang: Stufen nach insgesamt verdienten Coins ─────────
// Gilt für Nicht-Staff (role='citizen'). Staff behält den ACLS-Rang.
const CITIZEN_TIERS = [
  { min: 0,      name: 'Neubürger',   color: '#9ca3af', icon: '🌱' },
  { min: 1000,   name: 'Bürger',      color: '#cbd5e1', icon: '🪪' },
  { min: 10000,  name: 'Stammgast',   color: '#60a5fa', icon: '⭐' },
  { min: 50000,  name: 'VIP',         color: '#fbbf24', icon: '💎' },
  { min: 150000, name: 'Ehrenbürger', color: '#f472b6', icon: '👑' },
];
function citizenTier(earned) {
  let t = CITIZEN_TIERS[0];
  for (const x of CITIZEN_TIERS) if ((earned || 0) >= x.min) t = x;
  return { name: t.name, color: t.color, icon: t.icon };
}

function friendStats(userId) {
  const u = db.prepare('SELECT id, discord_id, username, avatar, role, rank FROM users WHERE id = ? AND is_active = 1').get(userId);
  if (!u) return null;
  const coins = db.prepare('SELECT balance, total_earned, streak, best_streak FROM coin_balances WHERE discord_id = ?').get(u.discord_id);
  const earned  = coins?.total_earned || 0;
  const sp      = db.prepare('SELECT xp FROM season_pass WHERE season = ? AND discord_id = ?').get(seasonKey(), u.discord_id);
  const isStaff = u.role !== 'citizen';
  return {
    id: u.id, discord_id: u.discord_id, username: u.username, avatar: u.avatar, role: u.role, rank: u.rank,
    is_staff:      isStaff,
    season_level:  seasonLevel(sp?.xp || 0),
    season_max:    SEASON_MAX_LEVEL,
    tier:          isStaff ? null : citizenTier(earned),
    coins_earned:  coins?.total_earned || 0,
    coins_balance: coins?.balance || 0,
    streak:        coins?.streak || 0,
    best_streak:   coins?.best_streak || 0,
    ic_total:      +(db.prepare('SELECT COALESCE(SUM(hours),0) AS h FROM ic_log WHERE user_id = ?').get(u.id).h.toFixed(1)),
    ic_week:       +(db.prepare("SELECT COALESCE(SUM(hours),0) AS h FROM ic_log WHERE user_id = ? AND date >= date('now','-7 days')").get(u.id).h.toFixed(1)),
    badges:        db.prepare('SELECT COUNT(*) AS c FROM user_badges WHERE user_id = ?').get(u.id).c,
    exams:         db.prepare('SELECT COUNT(*) AS c FROM registry WHERE examiner_id = ?').get(u.id).c,
    eow_wins:      db.prepare('SELECT COUNT(*) AS c FROM eow_winners WHERE user_id = ?').get(u.id).c,
    games_played:  db.prepare('SELECT COUNT(DISTINCT game) AS c FROM game_scores WHERE user_id = ?').get(u.id).c,
    duel_wins:     db.prepare(`SELECT COUNT(*) AS c FROM quiz_duels WHERE winner_did = ? AND status = 'done'`).get(u.discord_id).c,
  };
}

app.get('/api/friends', requireLogin, (req, res) => {
  const u = getUser(req);
  // BATCH 1.3: N+1 Fix — alle friend_ids auf einmal laden, dann friendStats nur für gefundene
  const rows = db.prepare('SELECT friend_id, created_at FROM friends WHERE user_id = ? ORDER BY created_at ASC').all(u.id);
  const friends = rows.map(r => {
    const s = friendStats(r.friend_id);
    return s ? { ...s, since: r.created_at } : null;
  }).filter(Boolean);
  res.json({ me: friendStats(u.id), friends });
});

app.post('/api/friends/:id', requireLogin, (req, res) => {
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

app.delete('/api/friends/:id', requireLogin, (req, res) => {
  const u = getUser(req);
  db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(u.id, +req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  GÄSTEBUCH — Kommentare auf Mitarbeiter-Profilen
//  Schreiben dürfen Mitarbeiter UND Bürger (auch ohne users-Eintrag)
// ════════════════════════════════════════════════════════════════
const GUESTBOOK_MAX_LEN = 300;

// Identität: Mitarbeiter/Citizen (users-Eintrag) oder reine Voter-Session
function guestbookIdent(req) {
  const u = getUser(req);
  if (u) return { user: u, did: u.discord_id, name: u.username, avatar: u.avatar || null };
  if (req.session?.voterDiscordId)
    return { user: null, did: req.session.voterDiscordId, name: req.session.voterUsername || 'Bürger', avatar: req.session.voterAvatar || null };
  return null;
}

app.get('/api/guestbook/:userId', (req, res) => {
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

app.post('/api/guestbook/:userId', (req, res) => {
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
  // Profil-Inhaber benachrichtigen (nicht wenn man selbst schreibt)
  const profileOwner = db.prepare('SELECT discord_id FROM users WHERE id = ?').get(target.id);
  if (profileOwner && profileOwner.discord_id !== ident.did) {
    createNotif(profileOwner.discord_id, 'guestbook', { authorName: ident.name, preview: message.slice(0, 80) });
  }
  res.json({ ok: true });
});

// Löschen darf: Autor (Mitarbeiter oder Bürger), Profil-Inhaber oder Admin
app.delete('/api/guestbook/:id', (req, res) => {
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

// Detail-Vergleich: ich vs. Freund (Spiel-Bestscores beider Seiten)
app.get('/api/friends/compare/:id', requireLogin, (req, res) => {
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

// ════════════════════════════════════════════════════════════════
//  COMPLAINTS
// ════════════════════════════════════════════════════════════════
app.post('/api/complaints', (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || '';
  if (rateLimit(`complaint:${ip}`, 3, 5 * 60_000)) return res.status(429).json({ error: 'Bitte warte etwas bevor du eine weitere Beschwerde einreichst' });
  const { citizen_name, citizen_discord_id, subject, message } = req.body;
  if (!citizen_name?.trim() || !subject?.trim() || !message?.trim()) return res.status(400).json({ error: 'Pflichtfelder fehlen' });
  db.prepare('INSERT INTO complaints (citizen_name, citizen_discord_id, subject, message) VALUES (?, ?, ?, ?)').run(citizen_name.trim(), citizen_discord_id || null, subject.trim(), message.trim());
  res.json({ ok: true });
});

// Bürger sieht eigene Beschwerden
app.get('/api/my-complaints', (req, res) => {
  const discordId = req.session.voterDiscordId || (req.session.userId ? db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id : null);
  if (!discordId) return res.json([]);
  const rows = db.prepare('SELECT id, subject, status, admin_response, admin_response_at, created_at FROM complaints WHERE citizen_discord_id = ? ORDER BY created_at DESC LIMIT 20').all(discordId);
  res.json(rows);
});

app.get('/api/complaints', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM complaints ORDER BY created_at DESC').all());
});

app.patch('/api/complaints/:id', requireAdmin, (req, res) => {
  const { status, admin_response } = req.body;
  db.prepare('UPDATE complaints SET status = ?, admin_response = ?, admin_response_at = CASE WHEN ? IS NOT NULL THEN datetime(\'now\') ELSE admin_response_at END WHERE id = ?')
    .run(status, admin_response || null, admin_response || null, req.params.id);
  auditLog(req, 'complaint_update', `id=${req.params.id} status=${status}`);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  PROFILE
// ════════════════════════════════════════════════════════════════
function requireAuthOrBot(req, res, next) {
  if (secretEqual(req.headers['x-bot-secret'], BOT_API_SECRET)) return next();
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
  next();
}

app.get('/api/profile/:id', requireAnySession, (req, res) => {
  const u = db.prepare('SELECT id, discord_id, username, avatar, role, rank, ic_weekly_goal, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Nicht gefunden' });
  const cosm = db.prepare('SELECT equipped_title, equipped_frame, equipped_banner, equipped_namecolor, equipped_deco FROM coin_balances WHERE discord_id = ?').get(u.discord_id);
  u.equipped_title     = cosm?.equipped_title || null;
  u.equipped_frame     = cosm?.equipped_frame || null;
  u.equipped_banner    = cosm?.equipped_banner || null;
  u.equipped_namecolor = cosm?.equipped_namecolor || null;
  u.equipped_deco      = cosm?.equipped_deco || null;
  const examStats   = db.prepare('SELECT COUNT(*) as total, COALESCE(SUM(passed),0) as passed FROM exam_sessions WHERE user_id=?').get(u.id);
  const conducted   = db.prepare('SELECT COUNT(*) as c FROM registry WHERE examiner_id=?').get(u.id).c;
  const eowWins     = db.prepare('SELECT COUNT(*) as c FROM eow_winners WHERE user_id=?').get(u.id).c;
  const icTotal     = db.prepare('SELECT COALESCE(SUM(hours),0) as h FROM ic_log WHERE user_id=?').get(u.id)?.h || 0;
  const icWeek      = db.prepare("SELECT COALESCE(SUM(hours),0) as h FROM ic_log WHERE user_id=? AND date>=date('now','-7 days')").get(u.id)?.h || 0;
  const recentExams = db.prepare(`SELECT s.*, ec.name as category_name FROM exam_sessions s JOIN exam_categories ec ON ec.id=s.category_id WHERE s.user_id=? ORDER BY s.taken_at DESC LIMIT 5`).all(u.id);
  const badges      = db.prepare('SELECT badge_type, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at ASC').all(u.id);
  const icGoal = u.ic_weekly_goal || 0;
  const byCategory = db.prepare(`SELECT ec.name as category, COUNT(*) as count FROM registry r JOIN exam_categories ec ON ec.id=r.category_id WHERE r.examiner_id=? GROUP BY r.category_id`).all(u.id);
  const birthday   = db.prepare('SELECT birthday FROM user_birthdays WHERE user_id = ?').get(u.id)?.birthday || null;
  const honoraryTitles = db.prepare('SELECT id, title, color, granted_by, granted_at FROM honorary_titles WHERE user_id = ? ORDER BY granted_at ASC').all(u.id);
  res.json({ user: u, stats: { total_exams: examStats.total, passed_exams: examStats.passed, conducted, eow_wins: eowWins, ic_total: +icTotal.toFixed(2), ic_week: +icWeek.toFixed(2), ic_goal: icGoal }, recentExams, badges, byCategory, birthday, honoraryTitles });
});

// ── Globale Suche ────────────────────────────────────────────────
app.get('/api/search', requireAuth, (req, res) => {
  if (rateLimit('search:' + req.ip, 20, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ bans: [], users: [], registry: [] });
  const like = `%${q}%`;
  const bans = db.prepare(`
    SELECT b.*, u.username as issued_by_name FROM bans b
    JOIN users u ON u.id = b.issued_by
    WHERE b.person_name LIKE ? OR b.person_id LIKE ? OR b.reason LIKE ?
    ORDER BY b.is_active DESC, b.issued_at DESC LIMIT 20
  `).all(like, like, like);
  const users = db.prepare(`
    SELECT id, discord_id, username, avatar, role, rank, is_active FROM users
    WHERE (username LIKE ? OR discord_id LIKE ?) AND is_active = 1 LIMIT 20
  `).all(like, like);
  const registry = db.prepare(`
    SELECT r.*, ec.name as category_name, u.username as examiner_name
    FROM registry r JOIN exam_categories ec ON ec.id=r.category_id JOIN users u ON u.id=r.examiner_id
    WHERE r.citizen_name LIKE ? OR r.citizen_id LIKE ?
    ORDER BY r.registered_at DESC LIMIT 20
  `).all(like, like);
  res.json({ bans, users, registry });
});

// ── IC-Zeit Wochenziel ───────────────────────────────────────────
app.patch('/api/users/me/goal', requireAuth, (req, res) => {
  const { goal } = req.body;
  const user = getUser(req);
  if (typeof goal !== 'number' || goal < 0 || goal > 200) return res.status(400).json({ error: 'Ungültiges Ziel' });
  db.prepare('UPDATE users SET ic_weekly_goal = ? WHERE id = ?').run(goal, user.id);
  res.json({ ok: true });
});

// ── SSE Echtzeit-Events ──────────────────────────────────────────
const sseClients = new Set();
function sseEmit(event, data, onlyDiscordId = null) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => {
    // Personenbezogene Events (z. B. Kontostand) nur an den Betroffenen
    if (onlyDiscordId && res._discordId !== onlyDiscordId) return;
    try { res.write(msg); } catch {}
  });
}

// Auch Bürger (Voter-Session) dürfen Live-Events empfangen (z. B. Quiz-Duell)
function requireAnySession(req, res, next) {
  if (getUser(req) || req.session?.voterDiscordId) return next();
  return res.status(401).json({ error: 'Nicht angemeldet' });
}

app.get('/api/sse', requireAnySession, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');
  res._discordId = coinIdent(req)?.id || null;
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ════════════════════════════════════════════════════════════════
//  CRON: Sunday 20:00 — auto-count EoW
// ════════════════════════════════════════════════════════════════
// Abgelaufene Sperren stündlich deaktivieren
cron.schedule('* * * * *', () => {
  const r = db.prepare(`UPDATE bans SET is_active=0 WHERE is_active=1 AND expires_at IS NOT NULL AND expires_at <= datetime('now')`).run();
  if (r.changes > 0) console.log(`[Cron] ${r.changes} abgelaufene Sperre(n) deaktiviert`);
});

// Sonntag 18:00 Berliner Zeit — Mitarbeiter der Woche automatisch auswerten
cron.schedule('0 18 * * 0', () => {
  runEowEvaluation();
}, { timezone: 'Europe/Berlin' });

// Täglich 03:00 Berliner Zeit — Server-Nicknamen aller Mitglieder synchronisieren
cron.schedule('0 3 * * *', async () => {
  const n = await syncGuildMembers();
  if (n > 0) console.log(`[Cron] ${n} Mitglieder-Namen synchronisiert`);
}, { timezone: 'Europe/Berlin' });

// Täglich 03:30 — SQLite Datenbank-Backup (letzte 7 Tage behalten)
cron.schedule('30 3 * * *', () => {
  try {
    const fs   = require('fs');
    const dir  = path.join(__dirname, 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    const date = new Date().toISOString().slice(0, 10);
    const src  = process.env.DB_PATH || path.join(__dirname, 'acls.db');
    const dest = path.join(dir, `acls_${date}.db`);
    fs.copyFileSync(src, dest);
    console.log(`[Backup] ${dest}`);
    // Backups älter als 7 Tage löschen
    const files = fs.readdirSync(dir).filter(f => f.startsWith('acls_') && f.endsWith('.db')).sort();
    files.slice(0, Math.max(0, files.length - 7)).forEach(f => {
      fs.unlinkSync(path.join(dir, f));
      console.log(`[Backup] Gelöscht: ${f}`);
    });
  } catch (e) { console.error('[Backup] Fehler:', e.message); }
}, { timezone: 'Europe/Berlin' });

// ════════════════════════════════════════════════════════════════
//  AUSBILDER – RANK EXAM SYSTEM
// ════════════════════════════════════════════════════════════════
function requireAusbilder(req, res, next) {
  const user = getUser(req);
  if (!user || (user.role !== 'ausbilder' && user.role !== 'admin')) return res.status(403).json({ error: 'Kein Zugriff' });
  req.ausbilderUser = user;
  next();
}

app.get('/api/rank-questions', requireAusbilder, (req, res) => {
  const { type } = req.query;
  const qs = type
    ? db.prepare(`SELECT * FROM rank_questions WHERE (exam_type=? OR exam_type='both') AND is_active=1 ORDER BY created_at DESC`).all(type)
    : db.prepare(`SELECT * FROM rank_questions WHERE is_active=1 ORDER BY exam_type, created_at DESC`).all();
  res.json(qs);
});

app.post('/api/rank-questions', requireAusbilder, (req, res) => {
  const { exam_type, question, option_a } = req.body;
  try {
    const r = db.prepare(`INSERT INTO rank_questions (exam_type,question,option_a) VALUES (?,?,?)`)
      .run(exam_type || 'gesellen', question, option_a);
    res.json({ id: r.lastInsertRowid });
  } catch {
    const r = db.prepare(`INSERT INTO rank_questions (exam_type,question,option_a,option_b,correct_answer) VALUES (?,?,?,?,?)`)
      .run(exam_type || 'gesellen', question, option_a, '', 0);
    res.json({ id: r.lastInsertRowid });
  }
});

app.delete('/api/rank-questions/:id', requireAusbilder, (req, res) => {
  db.prepare('UPDATE rank_questions SET is_active=0 WHERE id=?').run(+req.params.id);
  res.json({ ok: true });
});

// ── Rank Exam helpers ───────────────────────────────────────────
function getActiveExam(req) {
  const code = req.session.rankExamCode;
  if (!code) return null;
  return db.prepare('SELECT * FROM active_rank_exams WHERE join_code = ?').get(code);
}

function scoreAndFinalize(exam, user) {
  const m1_data   = JSON.parse(exam.m1_data || '[]');
  const m2_answers= JSON.parse(exam.m2_answers || '{}');
  const m3_ratings= JSON.parse(exam.m3_ratings || '[0,0,0,0,0,0]');
  const question_ids = JSON.parse(exam.question_ids || '[]');

  const m1_score  = m1_data.filter(l => (l.found?1:0)+(l.best_route?1:0)+(l.stvo?1:0) >= 2).length;
  const m1_max    = m1_data.length;
  const m1_passed = m1_score >= Math.ceil(m1_max * 0.75);

  const m2_total  = question_ids.length;
  const m2_score  = question_ids.filter(id => parseInt(m2_answers[String(id)]) === 1).length;
  const m2_passed = m2_total === 0 || m2_score >= Math.ceil(m2_total * 0.7);

  const m3_score  = m3_ratings.length ? m3_ratings.reduce((a,b)=>a+b,0)/m3_ratings.length : 0;
  const m3_passed = m3_score >= 2.5;

  const passed = m1_passed && m2_passed && m3_passed;
  const examiner_id  = exam.examiner1_id;
  const examiner2_id = exam.examiner2_id || null;
  const r = db.prepare(`INSERT INTO rank_exams
    (exam_type,examinee_name,examinee_id,examiner_id,examiner2_id,
     m1_data,m1_score,m1_max,m1_passed,m2_score,m2_total,m2_passed,
     m3_data,m3_score,m3_passed,passed,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(exam.exam_type, exam.examinee_name, exam.examinee_id,
         examiner_id, examiner2_id,
         exam.m1_data, m1_score, m1_max, m1_passed?1:0,
         m2_score, m2_total, m2_passed?1:0,
         JSON.stringify({ ratings: m3_ratings, notes: exam.m3_notes }),
         m3_score, m3_passed?1:0, passed?1:0, exam.m3_notes||null);

  db.prepare('DELETE FROM active_rank_exams WHERE join_code = ?').run(exam.join_code);
  const e2 = examiner2_id ? db.prepare('SELECT username FROM users WHERE id=?').get(examiner2_id) : null;
  return { id: r.lastInsertRowid, passed, m1_passed, m1_score, m1_max, m2_passed, m2_score, m2_total, m3_passed, m3_score, examiner2_name: e2?.username || null };
}

app.post('/api/rank-exam/start', requireAusbilder, (req, res) => {
  const { exam_type, examinee_name, examinee_id, examiner2_id, m1_locations } = req.body;
  const user = getUser(req);
  const questions = db.prepare(`SELECT id,question,option_a FROM rank_questions WHERE exam_type=? AND is_active=1 ORDER BY RANDOM() LIMIT 5`).all(exam_type);
  const join_code = Math.random().toString(36).substring(2,8).toUpperCase();
  db.prepare(`INSERT INTO active_rank_exams (join_code,exam_type,examinee_name,examinee_id,examiner1_id,examiner2_id,question_ids,m1_locations)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(join_code, exam_type, examinee_name||'', examinee_id||null, user.id, examiner2_id||null,
         JSON.stringify(questions.map(q=>q.id)), JSON.stringify(m1_locations||[]));
  req.session.rankExamCode = join_code;
  res.json({ join_code, questions });
});

app.post('/api/rank-exam/join', requireAusbilder, (req, res) => {
  const { join_code } = req.body;
  const exam = db.prepare('SELECT * FROM active_rank_exams WHERE join_code = ?').get((join_code||'').toUpperCase().trim());
  if (!exam) return res.status(404).json({ error: 'Code nicht gefunden' });
  const user = getUser(req);
  if (exam.examiner1_id !== user.id && exam.examiner2_id !== user.id)
    return res.status(403).json({ error: 'Du bist nicht als Prüfer für diese Prüfung eingetragen' });
  req.session.rankExamCode = exam.join_code;
  const ids = JSON.parse(exam.question_ids || '[]');
  // BATCH 2.2: Array-Länge begrenzen
  if (!Array.isArray(ids) || ids.length > 100) return res.status(400).json({ error: 'Ungültige Fragen-IDs' });
  const questions = ids.length
    ? db.prepare(`SELECT id,question,option_a FROM rank_questions WHERE id IN (${ids.map(()=>'?').join(',')}) AND is_active=1`).all(...ids)
    : [];
  res.json({
    join_code:      exam.join_code,
    exam_type:      exam.exam_type,
    examinee_name:  exam.examinee_name,
    examinee_id:    exam.examinee_id,
    m1_locations:   JSON.parse(exam.m1_locations || '[]'),
    m1_data:        JSON.parse(exam.m1_data || 'null'),
    m2_answers:     JSON.parse(exam.m2_answers || '{}'),
    m3_ratings:     JSON.parse(exam.m3_ratings || '[0,0,0,0,0,0]'),
    m3_notes:       exam.m3_notes || '',
    questions,
  });
});

app.put('/api/rank-exam/active', requireAusbilder, (req, res) => {
  const exam = getActiveExam(req);
  if (!exam) return res.status(400).json({ error: 'Kein aktiver Test' });
  const fields = [];
  const vals   = [];
  if (req.body.m1_data    !== undefined) { fields.push('m1_data=?');    vals.push(JSON.stringify(req.body.m1_data)); }
  if (req.body.m2_answers !== undefined) { fields.push('m2_answers=?'); vals.push(JSON.stringify(req.body.m2_answers)); }
  if (req.body.m3_ratings !== undefined) { fields.push('m3_ratings=?'); vals.push(JSON.stringify(req.body.m3_ratings)); }
  if (req.body.m3_notes   !== undefined) { fields.push('m3_notes=?');   vals.push(req.body.m3_notes); }
  if (req.body.current_module  !== undefined) { fields.push('current_module=?');  vals.push(req.body.current_module); }
  if (req.body.current_m2_idx !== undefined) { fields.push('current_m2_idx=?'); vals.push(req.body.current_m2_idx); }
  if (fields.length) db.prepare(`UPDATE active_rank_exams SET ${fields.join(',')} WHERE join_code=?`).run(...vals, exam.join_code);
  res.json({ ok: true });
});

// Polling endpoint: liefert aktuellen Exam-State (für Echtzeit-Sync ohne SSE)
app.get('/api/rank-exam/state', requireAusbilder, (req, res) => {
  const exam = getActiveExam(req);
  if (!exam) return res.status(404).json({ error: 'Kein aktiver Test' });
  res.json({
    m1_data:        JSON.parse(exam.m1_data   || 'null'),
    m2_answers:     JSON.parse(exam.m2_answers || '{}'),
    m3_ratings:     JSON.parse(exam.m3_ratings || '[0,0,0,0,0,0]'),
    m3_notes:       exam.m3_notes || '',
    current_module:  exam.current_module  || 'm1',
    current_m2_idx:  exam.current_m2_idx  ?? 0,
  });
});

app.post('/api/rank-exam/submit', requireAusbilder, (req, res) => {
  const exam = getActiveExam(req);
  const user = getUser(req);
  if (!exam) return res.status(400).json({ error: 'Kein aktiver Test' });
  delete req.session.rankExamCode;
  res.json(scoreAndFinalize(exam, user));
});

app.get('/api/rank-exams', requireAusbilder, (req, res) => {
  res.json(db.prepare(`SELECT re.*,u.username as examiner_name,u2.username as examiner2_name FROM rank_exams re JOIN users u ON u.id=re.examiner_id LEFT JOIN users u2 ON u2.id=re.examiner2_id ORDER BY re.taken_at DESC LIMIT 50`).all());
});

app.get('/api/rank-exams/:id/certificate', requireAusbilder, (req, res) => {
  const exam = db.prepare(`
    SELECT re.*,u.username as examiner_name,u2.username as examiner2_name
    FROM rank_exams re
    JOIN users u ON u.id=re.examiner_id
    LEFT JOIN users u2 ON u2.id=re.examiner2_id
    WHERE re.id=? AND re.passed=1
  `).get(+req.params.id);
  if (!exam) return res.status(404).send('Zertifikat nicht gefunden oder Prüfung nicht bestanden.');

  const hesc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const date = new Date(exam.taken_at).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' });
  const typeFull = exam.exam_type === 'meister' ? 'Meisterprüfung' : 'Gesellenprüfung';
  const typeTitle = exam.exam_type === 'meister' ? 'MEISTERZEUGNIS' : 'GESELLENZEUGNIS';
  const m3_ratings = JSON.parse(exam.m3_data || '{}').ratings || [];
  const m3avg = m3_ratings.length ? (m3_ratings.reduce((a,b)=>a+b,0)/m3_ratings.length).toFixed(1) : '–';
  const examiners = hesc([exam.examiner_name, exam.examiner2_name].filter(Boolean).join(' & '));
  const examinee  = hesc(exam.examinee_name);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Zertifikat – ${examinee}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Georgia',serif; background:#f5f0e8; display:flex; justify-content:center; align-items:flex-start; min-height:100vh; padding:2rem; }
  .page { width:210mm; min-height:297mm; background:#fff; padding:18mm 20mm; position:relative; box-shadow:0 4px 40px rgba(0,0,0,.18); }

  /* decorative border */
  .page::before {
    content:''; position:absolute; inset:8mm;
    border:2px solid #b8860b; pointer-events:none;
  }
  .page::after {
    content:''; position:absolute; inset:10.5mm;
    border:1px solid #b8860b; pointer-events:none;
  }

  .header { text-align:center; padding-bottom:10mm; border-bottom:2px solid #b8860b; margin-bottom:10mm; }
  .org { font-size:11pt; letter-spacing:.25em; text-transform:uppercase; color:#666; margin-bottom:3mm; }
  .org-name { font-size:22pt; font-weight:bold; color:#1a1a1a; letter-spacing:.05em; margin-bottom:1mm; }
  .org-sub { font-size:9pt; color:#888; letter-spacing:.15em; text-transform:uppercase; }

  .cert-type { text-align:center; margin:8mm 0 5mm; }
  .cert-type h1 { font-size:28pt; letter-spacing:.3em; color:#b8860b; text-transform:uppercase; font-weight:normal; }
  .cert-type .subtitle { font-size:10pt; color:#888; letter-spacing:.1em; margin-top:2mm; }

  .award { text-align:center; margin:8mm 0; }
  .award .awarded-to { font-size:9pt; color:#888; letter-spacing:.15em; text-transform:uppercase; margin-bottom:3mm; }
  .award .name { font-size:26pt; color:#1a1a1a; font-style:italic; border-bottom:1px solid #ccc; display:inline-block; padding-bottom:2mm; min-width:120mm; }

  .body-text { text-align:center; margin:7mm 0; font-size:11pt; line-height:1.8; color:#333; }
  .body-text strong { color:#1a1a1a; }

  .modules { margin:8mm 0; border:1px solid #e0d5c0; border-radius:4px; overflow:hidden; }
  .modules-title { background:#f5f0e8; padding:3mm 5mm; font-size:8.5pt; letter-spacing:.12em; text-transform:uppercase; color:#888; border-bottom:1px solid #e0d5c0; }
  .module-row { display:flex; justify-content:space-between; align-items:center; padding:2.5mm 5mm; border-bottom:1px solid #f0e8d8; font-size:9.5pt; }
  .module-row:last-child { border-bottom:none; }
  .module-row .m-label { color:#444; }
  .module-row .m-score { font-weight:bold; color:#2d6a2d; }

  .footer { margin-top:12mm; display:flex; justify-content:space-between; align-items:flex-end; }
  .sig-block { text-align:center; flex:1; }
  .sig-line { border-top:1px solid #999; margin:0 10mm 2mm; }
  .sig-label { font-size:8pt; color:#888; letter-spacing:.08em; }
  .sig-name { font-size:9.5pt; color:#333; margin-top:1mm; }

  .seal { width:28mm; height:28mm; border:2px solid #b8860b; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#b8860b; font-size:7pt; text-align:center; letter-spacing:.05em; text-transform:uppercase; flex-shrink:0; }

  .cert-id { text-align:center; margin-top:6mm; font-size:7.5pt; color:#bbb; letter-spacing:.05em; }

  @media print {
    body { background:none; padding:0; }
    .page { box-shadow:none; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="org">Automobil-Club Los Santos</div>
    <div class="org-name">ACLS</div>
    <div class="org-sub">ColdRP · Fahrzeugservice &amp; Prüfwesen</div>
  </div>

  <div class="cert-type">
    <h1>${typeTitle}</h1>
    <div class="subtitle">${typeFull} – erfolgreich bestanden</div>
  </div>

  <div class="award">
    <div class="awarded-to">Hiermit wird bestätigt, dass</div>
    <div class="name">${examinee}</div>
  </div>

  <div class="body-text">
    die <strong>${typeFull}</strong> des Automobil-Club Los Santos<br>
    am <strong>${date}</strong> erfolgreich abgelegt und bestanden hat.<br>
    Alle drei Module wurden gemäß den Ausbildungsrichtlinien geprüft<br>
    und mit bestandenem Ergebnis abgeschlossen.
  </div>

  <div class="modules">
    <div class="modules-title">Modulergebnisse</div>
    <div class="module-row">
      <span class="m-label">Modul 1 – Ortskunde</span>
      <span class="m-score">${exam.m1_score}/${exam.m1_max} Orte bestanden ✓</span>
    </div>
    <div class="module-row">
      <span class="m-label">Modul 2 – Mentalteil / Dienstvorschriften</span>
      <span class="m-score">${exam.m2_score}/${exam.m2_total} Fragen richtig ✓</span>
    </div>
    <div class="module-row">
      <span class="m-label">Modul 3 – Praktischer Teil Auto Tuning</span>
      <span class="m-score">Ø ${m3avg}/4 ✓</span>
    </div>
  </div>

  <div class="footer">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Datum</div>
      <div class="sig-name">${date}</div>
    </div>
    <div class="seal">ACLS<br>offiziell<br>geprüft</div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Prüfer</div>
      <div class="sig-name">${examiners}</div>
    </div>
  </div>

  <div class="cert-id">Zertifikat-Nr. ACLS-${String(exam.id).padStart(4,'0')} · ${exam.exam_type.toUpperCase()}</div>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`);
});

// ════════════════════════════════════════════════════════════════
//  BOT NOTIFICATIONS
// ════════════════════════════════════════════════════════════════
// EOW-Standings für Bot-Erinnerung (Bot-Secret geschützt)
app.get('/api/bot/eow-standings', (req, res) => {
  if (!secretEqual(req.headers['x-bot-secret'], BOT_API_SECRET)) return res.status(401).end();
  const wk = votingWeekKey();
  const standings = db.prepare(`
    SELECT u.username, u.discord_id, COUNT(*) as votes
    FROM (
      SELECT nominee_id FROM eow_votes WHERE week = ?
      UNION ALL
      SELECT nominee_id FROM citizen_votes WHERE week = ?
    ) v JOIN users u ON u.id = v.nominee_id
    GROUP BY v.nominee_id ORDER BY votes DESC LIMIT 5
  `).all(wk, wk);
  const staffVotes   = db.prepare('SELECT COUNT(DISTINCT voter_id) as c FROM eow_votes WHERE week = ?').get(wk)?.c || 0;
  const citizenVotes = db.prepare('SELECT COUNT(DISTINCT voter_discord_id) as c FROM citizen_votes WHERE week = ?').get(wk)?.c || 0;
  res.json({ standings, staffVotes, citizenVotes, totalVotes: staffVotes + citizenVotes, week: wk });
});

// ── Bot: ACLS-Coins Kontostand ──────────────────────────────────
app.get('/api/bot/coins/:discordId', (req, res) => {
  if (!secretEqual(req.headers['x-bot-secret'], BOT_API_SECRET)) return res.status(401).end();
  const did = req.params.discordId;
  const row = db.prepare('SELECT * FROM coin_balances WHERE discord_id = ?').get(did);
  const wk  = weekKey();
  const weekEarned = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
    WHERE discord_id = ? AND amount > 0 AND date(created_at) >= ?
  `).get(did, wk).s;
  const rank = row ? db.prepare('SELECT COUNT(*) AS c FROM coin_balances WHERE total_earned > ?').get(row.total_earned).c + 1 : null;
  res.json({ balance: row?.balance ?? 0, totalEarned: row?.total_earned ?? 0, weekEarned, rank, username: row?.username || null });
});

// ── Bot: Coins Top 10 (Woche + Allzeit) ─────────────────────────
app.get('/api/bot/coins-top', (req, res) => {
  if (!secretEqual(req.headers['x-bot-secret'], BOT_API_SECRET)) return res.status(401).end();
  const wk = weekKey();
  const week = db.prepare(`
    SELECT t.discord_id, COALESCE(b.username, t.discord_id) AS username, SUM(t.amount) AS earned
    FROM coin_transactions t LEFT JOIN coin_balances b ON b.discord_id = t.discord_id
    WHERE t.amount > 0 AND date(t.created_at) >= ?
    GROUP BY t.discord_id ORDER BY earned DESC LIMIT 10
  `).all(wk);
  const alltime = db.prepare('SELECT discord_id, username, total_earned AS earned FROM coin_balances ORDER BY total_earned DESC LIMIT 10').all();
  res.json({ week, alltime, weekStart: wk });
});

// ── Bot: aktuelles Wochenturnier ────────────────────────────────
app.get('/api/bot/tournament', (req, res) => {
  if (!secretEqual(req.headers['x-bot-secret'], BOT_API_SECRET)) return res.status(401).end();
  const t = ensureTournament();
  const info = TOURNAMENT_GAMES[t.game] || { name: t.game, url: '/' };
  const board = db.prepare('SELECT discord_id, username, score FROM tournament_scores WHERE week = ? ORDER BY score DESC LIMIT 10').all(t.week);
  res.json({ week: t.week, game: t.game, gameName: info.name, gameUrl: info.url, prizes: TOURNAMENT_PRIZES, leaderboard: board });
});

// ── Bot: Wochenzusammenfassung (für Montags-Post) ───────────────
app.get('/api/bot/weekly-summary', (req, res) => {
  if (!secretEqual(req.headers['x-bot-secret'], BOT_API_SECRET)) return res.status(401).end();
  const eow = db.prepare(`
    SELECT u.username, w.vote_count, w.week FROM eow_winners w
    JOIN users u ON u.id = w.user_id ORDER BY w.week DESC LIMIT 1
  `).get() || null;
  const t = db.prepare('SELECT week, game, winner_username, winner_score FROM tournaments WHERE finished = 1 ORDER BY week DESC LIMIT 1').get() || null;
  const applications = db.prepare(`SELECT COUNT(*) AS c FROM applications WHERE created_at >= datetime('now', '-7 days')`).get().c;
  const coinsTop = db.prepare(`
    SELECT t.discord_id, COALESCE(b.username, t.discord_id) AS username, SUM(t.amount) AS earned
    FROM coin_transactions t LEFT JOIN coin_balances b ON b.discord_id = t.discord_id
    WHERE t.amount > 0 AND t.created_at >= datetime('now', '-7 days')
    GROUP BY t.discord_id ORDER BY earned DESC LIMIT 3
  `).all();
  res.json({
    eow,
    tournament: t ? { ...t, gameName: TOURNAMENT_GAMES[t.game]?.name || t.game } : null,
    applications,
    coinsTop,
  });
});

app.get('/api/bot-notifications', (req, res) => {
  if (!secretEqual(req.headers['x-bot-secret'], BOT_API_SECRET)) return res.status(401).end();
  const rows = db.prepare('SELECT * FROM bot_notifications WHERE sent = 0 ORDER BY created_at ASC').all();
  if (rows.length) {
    const ids = rows.map(r => r.id);
    db.prepare(`UPDATE bot_notifications SET sent = 1 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  }
  res.json(rows);
});

app.post('/api/bot-notifications/:id/sent', (req, res) => {
  if (!secretEqual(req.headers['x-bot-secret'], BOT_API_SECRET)) return res.status(401).end();
  db.prepare('UPDATE bot_notifications SET sent = 1 WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  SPA fallback
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
//  PREISLISTE
// ════════════════════════════════════════════════════════════════
app.get('/api/prices', (req, res) => {
  res.json(db.prepare('SELECT * FROM price_items ORDER BY category, sort_order, id').all());
});

app.post('/api/prices', requireAdmin, (req, res) => {
  const { category, name, price, notes } = req.body;
  if (!category?.trim() || !name?.trim() || !price?.trim()) return res.status(400).json({ error: 'Fehlende Felder' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM price_items WHERE category = ?').get(category.trim()).m;
  const r = db.prepare('INSERT INTO price_items (category, name, price, notes, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(category.trim(), name.trim(), price.trim(), notes?.trim() || null, maxOrder + 1);
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/prices/:id', requireAdmin, (req, res) => {
  const { category, name, price, notes } = req.body;
  const item = db.prepare('SELECT id FROM price_items WHERE id = ?').get(+req.params.id);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  db.prepare('UPDATE price_items SET category=?, name=?, price=?, notes=? WHERE id=?')
    .run(category.trim(), name.trim(), price.trim(), notes?.trim() || null, +req.params.id);
  res.json({ ok: true });
});

app.delete('/api/prices/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM price_items WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
});

// ── FAHRZEUGMARKT ────────────────────────────────────────────────
app.get('/api/car-listings', (req, res) => {
  res.json(db.prepare('SELECT * FROM car_listings ORDER BY created_at DESC').all());
});

// Stellt sicher dass image_data-Spalte existiert
function ensureImageCol() {
  try { db.exec('ALTER TABLE car_listings ADD COLUMN image_data TEXT'); } catch {}
}

// Speichert base64-Bild auf Disk, gibt Pfad zurück (oder null)
function saveCarImage(base64, existingPath) {
  if (!base64) return existingPath || null;
  const match = base64.match(/^data:image\/(jpeg|png|webp|gif);base64,(.+)$/);
  if (!match) return existingPath || null;
  const ext  = match[1] === 'jpeg' ? 'jpg' : match[1];
  const name = `car_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const dest = path.join(UPLOADS_DIR, name);
  fs.writeFileSync(dest, Buffer.from(match[2], 'base64'));
  // Altes Bild löschen
  if (existingPath && existingPath.startsWith('/uploads/')) {
    try { fs.unlinkSync(path.join(__dirname, existingPath)); } catch {}
  }
  return `/uploads/${name}`;
}

app.post('/api/car-listings', requireLogin, (req, res) => {
  const { name, phone, car, price, notes, listing_type, duration, image_data } = req.body;
  if (!name?.trim() || !phone?.trim() || !car?.trim() || !price?.trim())
    return res.status(400).json({ error: 'Fehlende Felder' });
  if (image_data) {
    if (!/^data:image\/(jpeg|png|webp|gif);base64,/.test(image_data))
      return res.status(400).json({ error: 'Ungültiges Bildformat (nur JPEG/PNG/WebP/GIF)' });
    if (image_data.length > 2_000_000)
      return res.status(400).json({ error: 'Bild zu groß (max 1.5 MB)' });
  }
  ensureImageCol();
  const u = getUser(req);
  try {
    const imagePath = saveCarImage(image_data, null);
    const r = db.prepare(
      'INSERT INTO car_listings (name, phone, car, price, notes, listing_type, duration, owner_discord_id, owner_user_id, image_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(name.trim(), phone.trim(), car.trim(), price.trim(), notes?.trim() || null, listing_type || 'verkauf', duration || null, u?.discord_id || null, u?.id || null, imagePath);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (err) {
    console.error('car-listing insert:', err.message);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

app.patch('/api/car-listings/:id', requireLogin, (req, res) => {
  const u = getUser(req);
  if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Kein Zugriff' });
  const { name, phone, car, price, notes } = req.body;
  if (!name?.trim() || !phone?.trim() || !car?.trim() || !price?.trim())
    return res.status(400).json({ error: 'Fehlende Felder' });
  const item = db.prepare('SELECT * FROM car_listings WHERE id = ?').get(+req.params.id);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  const { listing_type, duration, image_data } = req.body;
  if (image_data && image_data.startsWith('data:')) {
    if (!/^data:image\/(jpeg|png|webp|gif);base64,/.test(image_data))
      return res.status(400).json({ error: 'Ungültiges Bildformat (nur JPEG/PNG/WebP/GIF)' });
    if (image_data.length > 2_000_000)
      return res.status(400).json({ error: 'Bild zu groß (max 1.5 MB)' });
  }
  ensureImageCol();
  try {
    const newImagePath = image_data && image_data.startsWith('data:')
      ? saveCarImage(image_data, item.image_data)
      : (image_data === null ? null : item.image_data);
    db.prepare('UPDATE car_listings SET name=?, phone=?, car=?, price=?, notes=?, listing_type=?, duration=?, image_data=? WHERE id=?')
      .run(name.trim(), phone.trim(), car.trim(), price.trim(), notes?.trim() || null, listing_type || 'verkauf', duration || null, newImagePath, +req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('car-listing update:', err.message);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

app.delete('/api/car-listings/:id', requireLogin, (req, res) => {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
  const item = db.prepare('SELECT * FROM car_listings WHERE id = ?').get(+req.params.id);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  if (u.role !== 'admin' && item.owner_discord_id !== u.discord_id)
    return res.status(403).json({ error: 'Kein Zugriff' });
  db.prepare('DELETE FROM car_listings WHERE id = ?').run(+req.params.id);
  if (item.image_data?.startsWith('/uploads/')) {
    try { fs.unlinkSync(path.join(__dirname, item.image_data)); } catch {}
  }
  res.json({ ok: true });
});

// ── Galaxie-Jäger Charakter ─────────────────────────────────────
function xpForLevel(lv) { return lv * 100; }

app.get('/api/game-char', requireLogin, (req, res) => {
  const user = getUser(req);
  let char = db.prepare('SELECT * FROM game_characters WHERE user_id = ?').get(user.id);
  if (!char) {
    db.prepare('INSERT OR IGNORE INTO game_characters (user_id) VALUES (?)').run(user.id);
    char = db.prepare('SELECT * FROM game_characters WHERE user_id = ?').get(user.id);
  }
  res.json(char);
});

app.post('/api/game-char/save', requireLogin, (req, res) => {
  const user = getUser(req);
  const { xp, kills } = req.body;
  if (typeof xp !== 'number' || typeof kills !== 'number') return res.status(400).json({ error: 'Ungültig' });
  db.prepare('INSERT OR IGNORE INTO game_characters (user_id) VALUES (?)').run(user.id);
  let char = db.prepare('SELECT * FROM game_characters WHERE user_id = ?').get(user.id);
  char.xp += Math.max(0, Math.floor(xp));
  char.total_kills += Math.max(0, Math.floor(kills));
  // Level ups
  let levelsGained = 0;
  while (char.xp >= xpForLevel(char.level)) {
    char.xp -= xpForLevel(char.level);
    char.level++;
    char.skill_points++;
    levelsGained++;
  }
  db.prepare(`UPDATE game_characters SET level=?,xp=?,skill_points=?,total_kills=? WHERE user_id=?`)
    .run(char.level, char.xp, char.skill_points, char.total_kills, user.id);
  res.json({ char, levelsGained });
});

app.post('/api/game-char/upgrade', requireLogin, (req, res) => {
  const user  = getUser(req);
  const { skill } = req.body;
  const SKILLS = ['skill_damage','skill_firerate','skill_speed','skill_shield'];
  if (!SKILLS.includes(skill)) return res.status(400).json({ error: 'Unbekannter Skill' });
  const char = db.prepare('SELECT * FROM game_characters WHERE user_id = ?').get(user.id);
  if (!char || char.skill_points <= 0) return res.status(400).json({ error: 'Keine Punkte' });
  if (char[skill] >= 5) return res.status(400).json({ error: 'Bereits maximal' });
  db.prepare(`UPDATE game_characters SET ${skill}=${skill}+1, skill_points=skill_points-1 WHERE user_id=?`).run(user.id);
  res.json({ ok: true, char: db.prepare('SELECT * FROM game_characters WHERE user_id=?').get(user.id) });
});

app.get('/api/game-char/leaderboard', (req, res) => {
  const rows = db.prepare(`
    SELECT gc.user_id, u.username, u.avatar, u.discord_id, gc.level, gc.total_kills,
           gc.skill_damage, gc.skill_firerate, gc.skill_speed, gc.skill_shield
    FROM game_characters gc JOIN users u ON u.id = gc.user_id
    ORDER BY gc.level DESC, gc.total_kills DESC LIMIT 15
  `).all();
  res.json(rows);
});

// ── Twitch Status ───────────────────────────────────────────────
const TWITCH_CLIENT_ID     = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_CHANNEL       = 'xonolanx';
let _twitchToken = null, _twitchTokenExp = 0;
let _twitchCache = null, _twitchCacheTs  = 0;

async function getTwitchToken() {
  if (_twitchToken && Date.now() < _twitchTokenExp) return _twitchToken;
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  const d = await r.json();
  _twitchToken    = d.access_token;
  _twitchTokenExp = Date.now() + (d.expires_in - 300) * 1000;
  return _twitchToken;
}

app.get('/api/twitch-status', async (req, res) => {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET)
    return res.json({ live: false, channel: TWITCH_CHANNEL, configured: false });
  if (_twitchCache && Date.now() - _twitchCacheTs < 60000)
    return res.json(_twitchCache);
  try {
    const token = await getTwitchToken();
    const r = await fetch(`https://api.twitch.tv/helix/streams?user_login=${TWITCH_CHANNEL}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    const data = await r.json();
    const s = data.data?.[0];
    _twitchCache = s
      ? { live: true,  channel: TWITCH_CHANNEL, title: s.title, game: s.game_name,
          viewers: s.viewer_count,
          thumbnail: s.thumbnail_url?.replace('{width}','320').replace('{height}','180') }
      : { live: false, channel: TWITCH_CHANNEL };
    _twitchCacheTs = Date.now();
    res.json(_twitchCache);
  } catch {
    res.json({ live: false, channel: TWITCH_CHANNEL, error: true });
  }
});

// ── Minigame Ranglisten ─────────────────────────────────────────
app.get('/api/game-scores/:game', (req, res) => {
  const staff = db.prepare(`
    SELECT u.username, u.avatar, u.discord_id, gs.score, gs.updated_at
    FROM game_scores gs JOIN users u ON u.id = gs.user_id
    WHERE gs.game = ?
  `).all(req.params.game);
  const visitors = db.prepare(`
    SELECT NULL as avatar, vgs.discord_id, vgs.username, vgs.score, vgs.updated_at
    FROM visitor_game_scores vgs WHERE vgs.game = ?
  `).all(req.params.game);
  // Merge: wenn ein Besucher auch Staff ist, Staff-Eintrag hat Vorrang
  const staffIds = new Set(staff.map(r => r.discord_id));
  const merged = [...staff, ...visitors.filter(v => !staffIds.has(v.discord_id))];
  merged.sort((a, b) => b.score - a.score);
  res.json(merged.slice(0, 15));
});

app.get('/api/game-token/:game', (req, res) => {
  const user      = getUser(req);
  const discordId = req.session?.voterDiscordId;
  const uid = user ? `u:${user.id}` : discordId ? `v:${discordId}` : null;
  if (!uid) return res.status(401).json({ error: 'Nicht angemeldet' });
  const ts    = Date.now();
  const token = makeGameToken(uid, req.params.game, ts);
  res.json({ token, ts });
});

app.post('/api/game-scores/:game', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (rateLimit(`score:${ip}`, 20, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
  const { score, token, ts } = req.body;
  if (typeof score !== 'number' || score < 0 || !isFinite(score))
    return res.status(400).json({ error: 'Ungültiger Score' });

  const user      = getUser(req);
  const discordId = req.session?.voterDiscordId;
  const uid = user ? `u:${user.id}` : discordId ? `v:${discordId}` : null;
  if (!uid) return res.status(401).json({ error: 'Nicht angemeldet' });

  const game   = req.params.game;
  const limits = GAME_LIMITS[game];

  // Token-Validierung
  if (!token || typeof ts !== 'number') return res.status(400).json({ error: 'Kein Spieltoken' });
  const expected = makeGameToken(uid, game, ts);
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)))
    return res.status(403).json({ error: 'Ungültiges Token' });

  const elapsedSec = (Date.now() - ts) / 1000;
  if (elapsedSec < (limits?.minSec ?? 10))
    return res.status(400).json({ error: 'Spielzeit zu kurz' });
  if (elapsedSec > 86400)
    return res.status(400).json({ error: 'Token abgelaufen' });
  if (limits && score > limits.maxScore)
    return res.status(400).json({ error: 'Score ungültig' });

  // ── ACLS-Coins gutschreiben + Turnier-Score eintragen ──
  const cDid  = user ? user.discord_id : discordId;
  const cName = user ? user.username   : (req.session.voterUsername || 'Bürger');
  let coinsEarned = 0;
  try {
    const div = GAME_COIN_DIV[game];
    if (div) {
      let coins = Math.min(COINS_MAX_PER_SUBMIT, Math.floor(score / div));
      // Coin-Booster: doppelte Spiel-Coins (Tagescap bleibt bestehen)
      if (coins > 0 && getPerk(cDid, 'booster')) coins *= 2;
      if (coins > 0) {
        const today = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
          WHERE discord_id = ? AND reason = ? AND date(created_at) = date('now')`).get(cDid, `game:${game}`).s;
        coins = Math.min(coins, Math.max(0, COINS_DAILY_GAME_CAP - today));
        if (coins > 0) { addCoins(cDid, cName, coins, `game:${game}`, { score }); coinsEarned = coins; }
      }
    }
    const t = ensureTournament();
    if (t && !t.finished && t.game === game) {
      db.prepare(`
        INSERT INTO tournament_scores (week, discord_id, username, avatar, score) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(week, discord_id) DO UPDATE SET
          score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          username   = excluded.username,
          avatar     = COALESCE(excluded.avatar, avatar),
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END
      `).run(t.week, cDid, cName, user?.avatar || null, score);
      sseEmit('tournament', { week: t.week });
    }
  } catch (e) { console.error('[Coins]', e.message); }

  // ── Saison-Pass: XP + Wochen-Quest-Fortschritt ──
  try {
    seasonIncQuest(cDid, 'games', 1);
    if (coinsEarned > 0) {
      seasonIncQuest(cDid, 'game_coins', coinsEarned);
      addSeasonXp(cDid, cName, coinsEarned); // XP wächst mit verdienten Coins
    }
  } catch (e) { console.error('[Season]', e.message); }

  if (user) {
    db.prepare(`
      INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, game) DO UPDATE SET
        score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
        updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END
    `).run(user.id, game, score);
    checkGameBadges(user.id, user.discord_id);
    return res.json({ ok: true, coinsEarned });
  }
  const username = req.session.voterUsername || 'Bürger';
  db.prepare(`
    INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(discord_id, game) DO UPDATE SET
      score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
      updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
      username   = excluded.username
  `).run(discordId, username, game, score);
  res.json({ ok: true, coinsEarned });
});

// ── Idle Clicker Save ────────────────────────────────────────────
app.get('/api/idle-save', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  const row = db.prepare('SELECT * FROM idle_saves WHERE user_id = ?').get(user.id);
  if (!row) return res.json(null);
  res.json({
    gold: row.gold, totalEarned: row.total_earned,
    buildings: JSON.parse(row.buildings), upgrades: JSON.parse(row.upgrades),
    prestige: row.prestige, clickPower: row.click_power,
    prestigePoints: row.prestige_points || 0,
    prestigeUpgrades: JSON.parse(row.prestige_upgrades || '{}'),
  });
});

app.post('/api/idle-save', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { gold, totalEarned, buildings, upgrades, prestige, clickPower, prestigePoints, prestigeUpgrades } = req.body;
  if (typeof gold !== 'number' || gold < 0 || !isFinite(gold))
    return res.status(400).json({ error: 'Ungültig' });

  // Gebäude-Validierung: nur bekannte IDs, nicht-negative Integer
  const KNOWN_BUILDINGS = new Set(['parking','wash','shop','garage','tuning','dealer','speedway','logistic','factory','empire']);
  if (buildings && typeof buildings === 'object') {
    for (const [id, cnt] of Object.entries(buildings)) {
      if (!KNOWN_BUILDINGS.has(id)) return res.status(400).json({ error: `Unbekanntes Gebäude: ${id}` });
      if (!Number.isInteger(cnt) || cnt < 0 || cnt > 9999)
        return res.status(400).json({ error: `Ungültige Gebäudeanzahl: ${id}` });
    }
  }

  const row = db.prepare('SELECT * FROM idle_saves WHERE user_id = ?').get(user.id);
  if (row) {
    const prevBuildings = JSON.parse(row.buildings);
    // GPS-Werte identisch mit game12.html BUILDINGS-Array
    const baseRates = { parking:.1, wash:.5, shop:4, garage:20, tuning:90, dealer:400, speedway:1800, logistic:7500, factory:30000, empire:150000 };
    const gpsMax = Object.entries(prevBuildings).reduce((s, [id, cnt]) => s + (baseRates[id] || 0) * cnt, 0);
    const elapsed = Math.max(0, (Date.now() - new Date(row.updated_at).getTime()) / 1000);
    // Großzügiger Puffer (×5) damit Upgrades, Prestige-Boni und Offline-Zeit nie fälschlich blockieren
    const maxGold = row.gold + gpsMax * elapsed * 5 + 1e6;
    if (gold > maxGold)
      return res.status(400).json({ error: 'Ungültige Daten' });
  }

  // Prestige-Quest + Saison-XP: ein Prestige-Vorgang seit dem letzten Save.
  // WICHTIG: prestigeDelta sind gewonnene Prestige-PUNKTE (skalieren mit dem
  // Fortschritt, oft 50–100 pro Prestige) – NICHT als XP-Multiplikator nutzen,
  // sonst springt man mit einem einzigen Prestige sofort auf Max-Level.
  const prestigeDelta = Math.max(0, (prestige || 0) - (row?.prestige || 0));
  if (prestigeDelta > 0) {
    seasonIncQuest(user.discord_id, 'prestige', 1);
    addSeasonXp(user.discord_id, user.username, 60);
  }

  db.prepare(`
    INSERT INTO idle_saves (user_id, gold, total_earned, buildings, upgrades, prestige, click_power, prestige_points, prestige_upgrades)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      gold=excluded.gold, total_earned=excluded.total_earned, buildings=excluded.buildings,
      upgrades=excluded.upgrades, prestige=excluded.prestige, click_power=excluded.click_power,
      prestige_points=excluded.prestige_points, prestige_upgrades=excluded.prestige_upgrades,
      updated_at=CURRENT_TIMESTAMP
  `).run(user.id, gold, totalEarned || 0, JSON.stringify(buildings || {}),
    JSON.stringify(upgrades || {}), prestige || 0, clickPower || 1,
    Math.max(0, Math.floor(prestigePoints || 0)), JSON.stringify(prestigeUpgrades || {}));
  res.json({ ok: true });
});

// ── RPG Save ─────────────────────────────────────────────────────
app.get('/api/rpg-save', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  const row = db.prepare('SELECT * FROM rpg_saves WHERE user_id = ?').get(user.id);
  if (!row) return res.json(null);
  res.json({
    class: row.class, level: row.level, xp: row.xp, totalXp: row.total_xp,
    hp: row.hp, maxHp: row.max_hp, gold: row.gold,
    dungeon: row.dungeon, kills: row.kills,
    equipment: JSON.parse(row.equipment), skills: JSON.parse(row.skills),
  });
});

app.post('/api/rpg-save', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { class: cls, level, xp, totalXp, hp, maxHp, gold, dungeon, kills, equipment, skills } = req.body;
  if (!level || level < 1 || level > 50 || typeof gold !== 'number' || gold < 0)
    return res.status(400).json({ error: 'Ungültig' });

  const row = db.prepare('SELECT * FROM rpg_saves WHERE user_id = ?').get(user.id);
  if (row) {
    const elapsed = Math.max(0, (Date.now() - new Date(row.updated_at).getTime()) / 1000);
    const maxXpGain = 200 * elapsed + 10000;
    if ((totalXp || 0) > (row.total_xp + maxXpGain))
      return res.status(400).json({ error: 'Ungültige Daten' });
  }

  db.prepare(`
    INSERT INTO rpg_saves (user_id, class, level, xp, total_xp, hp, max_hp, gold, dungeon, kills, equipment, skills)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      class=excluded.class, level=excluded.level, xp=excluded.xp, total_xp=excluded.total_xp,
      hp=excluded.hp, max_hp=excluded.max_hp, gold=excluded.gold, dungeon=excluded.dungeon,
      kills=excluded.kills, equipment=excluded.equipment, skills=excluded.skills,
      updated_at=CURRENT_TIMESTAMP
  `).run(user.id, cls || 'mechaniker', level, xp || 0, totalXp || 0,
    hp || maxHp || 100, maxHp || 100, gold || 0, dungeon || 0, kills || 0,
    JSON.stringify(equipment || {}), JSON.stringify(skills || []));
  res.json({ ok: true });
});

// ── Audit-Log ───────────────────────────────────────────────────
app.get('/api/audit-log', requireAdmin, (req, res) => {
  const { q, action, page = 1 } = req.query;
  const limit  = 50;
  const offset = (Math.max(1, +page) - 1) * limit;
  const conditions = [];
  const params = [];
  if (q)      { conditions.push("(LOWER(username) LIKE ? OR LOWER(details) LIKE ?)"); params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`); }
  if (action) { conditions.push("action = ?"); params.push(action); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) as c FROM audit_log ${where}`).get(...params).c;
  const rows  = db.prepare(`SELECT id, username, action, details, ip, created_at FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ rows, total, page: +page, pages: Math.ceil(total / limit) });
});

app.get('/preise', (req, res) => res.sendFile(path.join(__dirname, 'public', 'preise.html')));
app.get('/game',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('/game2', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game2.html')));
app.get('/game3', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game3.html')));
app.get('/game4', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game4.html')));
app.get('/game5', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game5.html')));
app.get('/game6', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game6.html')));
app.get('/game7', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game7.html')));
app.get('/game8', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game8.html')));
app.get('/game9', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game9.html')));
app.get('/game10', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game10.html')));
app.get('/game11', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game11.html')));
app.get('/game12', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game12.html')));
app.get('/game13', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game13.html')));
app.get('/game14', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game14.html')));
app.get('/game15', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game15.html')));
app.get('/game16', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game16.html')));
app.get('/game17', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game17.html')));
app.get('/game18', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game18.html')));
app.get('/game19', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game19.html')));
app.get('/game20', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game20.html')));
app.get('/game21', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game21.html')));
app.get('/game22', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game22.html')));
app.get('/game23', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game23.html')));
app.get('/game24', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game24.html')));
app.get('/game25', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game25.html')));
app.get('/spielbank', (req, res) => res.sendFile(path.join(__dirname, 'public', 'spielbank.html')));
app.get('/quiz', (req, res) => {
  const cats = db.prepare(`SELECT ec.id, ec.name, ec.icon, (SELECT COUNT(*) FROM exam_questions WHERE category_id = ec.id AND is_active = 1) as question_count FROM exam_categories ec`).all();
  const fs = require('fs');
  const html = fs.readFileSync(path.join(__dirname, 'public', 'quiz.html'), 'utf8');
  const injected = html.replace('</head>', '<script>window.__CATS__=' + JSON.stringify(cats) + ';</script></head>');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(injected);
});
// ── ORGANIGRAMM (öffentlich) ──────────────────────────────────────
app.get('/api/organigramm', (req, res) => {
  const staff = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.discord_id, u.role, u.rank,
           cb.equipped_title, cb.equipped_frame, cb.equipped_namecolor, cb.equipped_deco
    FROM users u LEFT JOIN coin_balances cb ON cb.discord_id = u.discord_id
    WHERE u.is_active = 1
    ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'ausbilder' THEN 1 ELSE 2 END, u.username
  `).all();
  const htMap = {};
  db.prepare('SELECT user_id, icon, title, color FROM honorary_titles ORDER BY granted_at ASC').all()
    .forEach(ht => { (htMap[ht.user_id] = htMap[ht.user_id] || []).push({ icon: ht.icon, title: ht.title, color: ht.color }); });
  staff.forEach(u => { u.honorary_titles = htMap[u.id] || []; });
  res.json(staff);
});

// ── BEWERBUNGEN ────────────────────────────────────────────────────
app.get('/api/applications/mine', (req, res) => {
  const discordId = req.session.voterDiscordId ||
    (req.session.userId ? db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id : null);
  if (!discordId) return res.status(401).json({ error: 'Nicht angemeldet' });
  const row = db.prepare('SELECT * FROM applications WHERE discord_id = ? ORDER BY created_at DESC LIMIT 1').get(discordId);
  res.json(row || null);
});

app.post('/api/applications', (req, res) => {
  const discordId = req.session.voterDiscordId ||
    (req.session.userId ? db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id : null);
  const username  = req.session.voterUsername ||
    (req.session.userId ? db.prepare('SELECT username FROM users WHERE id = ?').get(req.session.userId)?.username : null);
  if (!discordId) return res.status(401).json({ error: 'Nicht angemeldet' });
  const user = req.session.userId ? db.prepare('SELECT role FROM users WHERE id = ? AND is_active = 1').get(req.session.userId) : null;
  if (user && user.role && user.role !== 'citizen') return res.status(400).json({ error: 'Du bist bereits Mitarbeiter' });
  const existing = db.prepare('SELECT id FROM applications WHERE discord_id = ? AND status = ?').get(discordId, 'pending');
  if (existing) return res.status(409).json({ error: 'Du hast bereits eine offene Bewerbung' });
  const { ic_name, ic_age, experience, motivation, availability } = req.body;
  if (!ic_name?.trim() || !experience?.trim() || !motivation?.trim() || !availability?.trim())
    return res.status(400).json({ error: 'Bitte alle Pflichtfelder ausfüllen' });
  const r = db.prepare(
    'INSERT INTO applications (discord_id, discord_username, ic_name, ic_age, experience, motivation, availability) VALUES (?,?,?,?,?,?,?)'
  ).run(discordId, username || 'Unbekannt', ic_name.trim(), ic_age?.trim() || null, experience.trim(), motivation.trim(), availability.trim());
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.get('/api/applications', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.username as reviewer_name FROM applications a
    LEFT JOIN users u ON u.id = a.reviewed_by
    ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC
  `).all();
  res.json(rows);
});

app.patch('/api/applications/:id', requireAdmin, (req, res) => {
  const { status, admin_note } = req.body;
  if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });
  db.prepare('UPDATE applications SET status=?, admin_note=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(status, admin_note?.trim() || null, req.adminUser.id, +req.params.id);
  auditLog(req, 'application_' + status, `id=${req.params.id}`);
  res.json({ ok: true });
});

app.delete('/api/applications/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM applications WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
});

// ── BATCH 10: Community-Fragen-Einreichung ───────────────────────
app.post('/api/question-suggestions', requireAnySession, (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (rateLimit('qsugg:' + ident.id, 5, 3600_000)) return res.status(429).json({ error: 'Max 5 Vorschläge pro Stunde' });
  const { category_id, question, option_a, option_b, option_c, option_d, correct } = req.body;
  if (!question?.trim() || !option_a?.trim() || !option_b?.trim() || !option_c?.trim() || !option_d?.trim()) return res.status(400).json({ error: 'Alle Felder ausfüllen' });
  if (!['A','B','C','D'].includes(correct)) return res.status(400).json({ error: 'Korrekte Antwort: A/B/C/D' });
  const cat = db.prepare('SELECT id FROM exam_categories WHERE id = ?').get(+category_id);
  if (!cat) return res.status(400).json({ error: 'Kategorie nicht gefunden' });
  const u = getUser(req);
  db.prepare(`INSERT INTO question_suggestions (user_id, discord_id, username, category_id, question, option_a, option_b, option_c, option_d, correct) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(u?.id || null, ident.id, ident.name, +category_id, question.trim(), option_a.trim(), option_b.trim(), option_c.trim(), option_d.trim(), correct);
  res.json({ ok: true });
});

app.get('/api/question-suggestions', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT qs.*, ec.name as cat_name
    FROM question_suggestions qs
    LEFT JOIN exam_categories ec ON ec.id = qs.category_id
    ORDER BY CASE qs.status WHEN 'pending' THEN 0 ELSE 1 END, qs.created_at DESC
    LIMIT 100
  `).all();
  res.json(rows);
});

app.post('/api/question-suggestions/:id/approve', requireAdmin, (req, res) => {
  const qs = db.prepare('SELECT * FROM question_suggestions WHERE id = ?').get(+req.params.id);
  if (!qs || qs.status !== 'pending') return res.status(400).json({ error: 'Nicht gefunden oder bereits reviewed' });
  // correct ist A/B/C/D (wie questions-admin erwartet)
  db.prepare(`INSERT INTO exam_questions (category_id, question, option_a, option_b, option_c, option_d, correct_answer, is_active, is_seeded, created_by) VALUES (?,?,?,?,?,?,?,1,0,?)`)
    .run(qs.category_id, qs.question, qs.option_a, qs.option_b, qs.option_c, qs.option_d, qs.correct, req.adminUser.id);
  db.prepare('UPDATE question_suggestions SET status="approved", reviewed_by=?, review_note=?, reward_paid=1 WHERE id=?').run(req.adminUser.id, req.body.note||'', qs.id);
  if (!qs.reward_paid) {
    addCoins(qs.discord_id, qs.username, 50, 'question:approved', { question_id: qs.id });
    createNotif(qs.discord_id, 'question_approved', { reward: 50 });
  }
  auditLog(req, 'question_approved', `suggestion ${qs.id} by ${qs.username}`);
  res.json({ ok: true });
});

app.post('/api/question-suggestions/:id/reject', requireAdmin, (req, res) => {
  const qs = db.prepare('SELECT id, status FROM question_suggestions WHERE id = ?').get(+req.params.id);
  if (!qs || qs.status !== 'pending') return res.status(400).json({ error: 'Nicht gefunden' });
  db.prepare('UPDATE question_suggestions SET status="rejected", reviewed_by=?, review_note=? WHERE id=?').run(req.adminUser.id, req.body.note||'', qs.id);
  res.json({ ok: true });
});

// ── BATCH 9: Admin Analytics ──────────────────────────────────────
app.get('/api/admin/analytics', requireAdmin, (req, res) => {
  const days = Math.min(30, Math.max(1, parseInt(req.query.days) || 7));

  const dau = db.prepare(`
    SELECT date(created_at) as day, COUNT(DISTINCT discord_id) as users
    FROM coin_transactions
    WHERE created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all(days);

  const gameUsage = db.prepare(`
    SELECT game, COUNT(*) as sessions, SUM(score) as total_score
    FROM game_scores
    WHERE updated_at >= datetime('now', '-7 days')
    GROUP BY game
    ORDER BY sessions DESC
    LIMIT 15
  `).all();

  const coinFlow = db.prepare(`
    SELECT
      date(created_at) as day,
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as earned,
      SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as spent
    FROM coin_transactions
    WHERE created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all(days);

  const newUsers = db.prepare(`
    SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-' || ? || ' days')
  `).get(days).c;

  const examStats = db.prepare(`
    SELECT date(registered_at) as day, COUNT(*) as total, SUM(passed) as passed
    FROM registry
    WHERE registered_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(registered_at)
    ORDER BY day ASC
  `).all(days);

  const topEarners = db.prepare(`
    SELECT ct.discord_id, u.username, SUM(ct.amount) as net
    FROM coin_transactions ct
    LEFT JOIN users u ON u.discord_id = ct.discord_id
    WHERE ct.created_at >= datetime('now', '-7 days') AND ct.amount > 0
    GROUP BY ct.discord_id
    ORDER BY net DESC
    LIMIT 10
  `).all();

  res.json({ dau, gameUsage, coinFlow, newUsers, examStats, topEarners, days });
});

// ── BATCH 7: Referral-System ─────────────────────────────────────
app.get('/join', (req, res) => {
  const ref = req.query.ref;
  if (ref && /^\d+$/.test(ref)) {
    req.session.referralBy = ref;
    req.session.save(() => res.redirect('/'));
    return;
  }
  res.redirect('/');
});

app.get('/api/referral/link', requireAnySession, (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const link = `${req.protocol}://${req.get('host')}/join?ref=${ident.id}`;
  const count = db.prepare('SELECT COUNT(*) as c FROM referrals WHERE referrer_did = ?').get(ident.id).c;
  res.json({ link, count });
});

// ── BATCH 6: Geburtstags-System ──────────────────────────────────
app.post('/api/birthday', requireAuth, (req, res) => {
  const u = getUser(req);
  const { birthday } = req.body;
  if (!/^\d{2}-\d{2}$/.test(birthday)) return res.status(400).json({ error: 'Format: MM-DD' });
  const [mm, dd] = birthday.split('-').map(Number);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return res.status(400).json({ error: 'Ungültiges Datum' });
  db.prepare('INSERT INTO user_birthdays (user_id, birthday) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET birthday=excluded.birthday, updated_at=datetime("now")').run(u.id, birthday);
  res.json({ ok: true });
});

app.get('/api/birthdays/today', (req, res) => {
  const today = new Date();
  const mmdd = String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  const bdays = db.prepare(`
    SELECT u.username, u.discord_id, u.avatar
    FROM user_birthdays ub JOIN users u ON u.id = ub.user_id
    WHERE ub.birthday = ? AND u.is_active = 1
  `).all(mmdd);
  res.json(bdays);
});

app.get('/api/birthdays', requireAuth, (req, res) => {
  const bdays = db.prepare(`
    SELECT u.username, u.discord_id, u.avatar, ub.birthday
    FROM user_birthdays ub JOIN users u ON u.id = ub.user_id
    WHERE u.is_active = 1
    ORDER BY substr(ub.birthday,1,2)*100+substr(ub.birthday,4,2)
  `).all();
  res.json(bdays);
});

// ── BATCH 5: Bürger Prüfungs-History ─────────────────────────────
app.get('/api/citizen-history', requireAuth, (req, res) => {
  const { name, id } = req.query;
  if (!name?.trim()) return res.status(400).json({ error: 'Name erforderlich' });
  const rows = db.prepare(`
    SELECT r.*, ec.name as category_name, u.username as examiner_name
    FROM registry r
    LEFT JOIN exam_categories ec ON ec.id = r.category_id
    LEFT JOIN users u ON u.id = r.examiner_id
    WHERE LOWER(r.citizen_name) = LOWER(?)
    ${id ? 'AND r.citizen_id = ?' : ''}
    ORDER BY r.registered_at DESC
    LIMIT 100
  `).all(...[name.trim(), ...(id ? [id.trim()] : [])]);

  const stats = {
    total: rows.length,
    passed: rows.filter(r => r.passed).length,
    byCategory: {}
  };
  rows.forEach(r => {
    const cn = r.category_name || 'Unbekannt';
    if (!stats.byCategory[cn]) stats.byCategory[cn] = { total: 0, passed: 0 };
    stats.byCategory[cn].total++;
    if (r.passed) stats.byCategory[cn].passed++;
  });

  res.json({ rows, stats });
});

// ── BATCH 4: Achievement-Feed ─────────────────────────────────────
app.get('/api/achievement-feed', (req, res) => {
  const feed = db.prepare(`
    SELECT ub.badge_type, ub.earned_at, u.username, u.discord_id, u.avatar
    FROM user_badges ub
    JOIN users u ON u.id = ub.user_id
    ORDER BY ub.earned_at DESC
    LIMIT 50
  `).all();
  res.json(feed);
});

// ── UMFRAGEN (Poll-Widget) — BATCH 8: bis zu 5 aktive Polls ──────
app.get('/api/poll/active', (req, res) => {
  const discordId = req.session.voterDiscordId ||
    (req.session.userId ? db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id : null);
  const polls = db.prepare('SELECT * FROM polls WHERE is_active = 1 ORDER BY created_at DESC LIMIT 5').all();
  if (!polls.length) return res.json([]);
  const result = polls.map(poll => {
    const options = JSON.parse(poll.options);
    const votes = db.prepare('SELECT option_idx, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_idx').all(poll.id);
    const myVoteRow = discordId ? db.prepare('SELECT option_idx FROM poll_votes WHERE poll_id = ? AND discord_id = ?').get(poll.id, discordId) : null;
    return { id: poll.id, question: poll.question, options, votes, myVote: myVoteRow?.option_idx ?? null };
  });
  res.json(result);
});

app.post('/api/poll/vote', (req, res) => {
  const discordId = req.session.voterDiscordId ||
    (req.session.userId ? db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id : null);
  if (!discordId) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { poll_id, option_idx } = req.body;
  const poll = db.prepare('SELECT * FROM polls WHERE id = ? AND is_active = 1').get(+poll_id);
  if (!poll) return res.status(404).json({ error: 'Umfrage nicht gefunden' });
  const options = JSON.parse(poll.options);
  if (+option_idx < 0 || +option_idx >= options.length) return res.status(400).json({ error: 'Ungültige Option' });
  const existing = db.prepare('SELECT id FROM poll_votes WHERE poll_id = ? AND discord_id = ?').get(+poll_id, discordId);
  if (existing) return res.status(409).json({ error: 'Du hast bereits abgestimmt' });
  db.prepare('INSERT INTO poll_votes (poll_id, discord_id, option_idx) VALUES (?,?,?)').run(+poll_id, discordId, +option_idx);
  res.json({ ok: true });
});

app.post('/api/polls', requireAdmin, (req, res) => {
  const { question, options } = req.body;
  const opts = (Array.isArray(options) ? options : []).map(o => String(o).trim()).filter(Boolean);
  if (!question?.trim() || opts.length < 2) return res.status(400).json({ error: 'Frage und mindestens 2 Optionen erforderlich' });
  // BATCH 8: max 5 aktive Polls — älteste deaktivieren falls 5 schon aktiv
  const activeCount = db.prepare('SELECT COUNT(*) as c FROM polls WHERE is_active = 1').get().c;
  if (activeCount >= 5) {
    db.prepare('UPDATE polls SET is_active = 0 WHERE id = (SELECT id FROM polls WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1)').run();
  }
  const r = db.prepare('INSERT INTO polls (question, options, created_by) VALUES (?,?,?)').run(question.trim(), JSON.stringify(opts), req.adminUser.id);
  auditLog(req, 'poll_created', `q=${question.trim().slice(0, 50)}`);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.delete('/api/polls/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM poll_votes WHERE poll_id = ?').run(+req.params.id);
  db.prepare('DELETE FROM polls WHERE id = ?').run(+req.params.id);
  auditLog(req, 'poll_deleted', `id=${req.params.id}`);
  res.json({ ok: true });
});

app.patch('/api/polls/:id/deactivate', requireAdmin, (req, res) => {
  db.prepare('UPDATE polls SET is_active = 0 WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
});

// ── WÖCHENTLICHE CHALLENGES ────────────────────────────────────────
app.get('/api/challenges', (req, res) => {
  const wk = votingWeekKey();
  const userId = req.session.userId;
  const voterDiscordId = req.session.voterDiscordId;

  const now = new Date();
  const day = now.getUTCDay();
  const daysToMon = day === 0 ? 6 : day - 1;
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() - daysToMon);
  const mondayDate = mon.toISOString().split('T')[0];

  const challenges = [];

  if (userId) {
    const voted = db.prepare('SELECT 1 FROM eow_votes WHERE voter_id = ? AND week = ?').get(userId, wk);
    challenges.push({ id: 'eow_vote', icon: 'fa-trophy', title: 'MdW abstimmen', desc: 'Stimme für den Mitarbeiter der Woche ab', progress: voted ? 1 : 0, target: 1 });

    const exam = db.prepare('SELECT 1 FROM rank_exams WHERE examiner_id = ? AND date(taken_at) >= ?').get(userId, mondayDate);
    challenges.push({ id: 'conduct_exam', icon: 'fa-clipboard-check', title: 'Prüfung abhalten', desc: 'Halte diese Woche eine Rang-Prüfung ab', progress: exam ? 1 : 0, target: 1 });
  } else if (voterDiscordId) {
    const voted = db.prepare('SELECT 1 FROM citizen_votes WHERE voter_discord_id = ? AND week = ?').get(voterDiscordId, wk);
    challenges.push({ id: 'citizen_vote', icon: 'fa-trophy', title: 'MdW abstimmen', desc: 'Stimme für einen ACLS-Mitarbeiter ab', progress: voted ? 1 : 0, target: 1 });

    const listing = db.prepare('SELECT 1 FROM car_listings WHERE owner_discord_id = ? AND date(created_at) >= ?').get(voterDiscordId, mondayDate);
    challenges.push({ id: 'create_listing', icon: 'fa-car-side', title: 'Inserat erstellen', desc: 'Erstelle ein Inserat im Fahrzeugmarkt', progress: listing ? 1 : 0, target: 1 });
  }

  res.json(challenges);
});

// ════════════════════════════════════════════════════════════════
//  CITIZEN NOTES (interne Notizen pro Bürger — nur Mitarbeiter)
// ════════════════════════════════════════════════════════════════
app.get('/api/citizen-notes', requireAuth, (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  res.json(db.prepare(`
    SELECT cn.*, u.username as created_by_name
    FROM citizen_notes cn JOIN users u ON u.id = cn.created_by
    WHERE cn.citizen_name = ? ORDER BY cn.created_at DESC
  `).all(name));
});

app.post('/api/citizen-notes', requireAuth, (req, res) => {
  const { citizen_name, citizen_id, note } = req.body;
  const user = getUser(req);
  if (!citizen_name?.trim() || !note?.trim()) return res.status(400).json({ error: 'Name und Notiz erforderlich' });
  const r = db.prepare('INSERT INTO citizen_notes (citizen_name, citizen_id, note, created_by) VALUES (?, ?, ?, ?)')
    .run(citizen_name.trim(), citizen_id || null, note.trim(), user.id);
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/citizen-notes/:id', requireAuth, (req, res) => {
  const user = getUser(req);
  const note = db.prepare('SELECT created_by FROM citizen_notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Nicht gefunden' });
  if (note.created_by !== user.id && user.role !== 'admin') return res.status(403).json({ error: 'Kein Zugriff' });
  db.prepare('DELETE FROM citizen_notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  FAQ
// ════════════════════════════════════════════════════════════════
app.get('/api/faq', (req, res) => {
  res.json(db.prepare('SELECT * FROM faq_items ORDER BY category, sort_order, id').all());
});

app.post('/api/faq', requireAdmin, (req, res) => {
  const { question, answer, category, sort_order } = req.body;
  if (!question?.trim() || !answer?.trim()) return res.status(400).json({ error: 'Frage und Antwort erforderlich' });
  const user = getUser(req);
  const r = db.prepare('INSERT INTO faq_items (question, answer, category, sort_order, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(question.trim(), answer.trim(), (category || 'Allgemein').trim(), sort_order || 0, user.id);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/faq/:id', requireAdmin, (req, res) => {
  const { question, answer, category, sort_order } = req.body;
  if (!question?.trim() || !answer?.trim()) return res.status(400).json({ error: 'Frage und Antwort erforderlich' });
  db.prepare('UPDATE faq_items SET question=?, answer=?, category=?, sort_order=? WHERE id=?')
    .run(question.trim(), answer.trim(), (category || 'Allgemein').trim(), sort_order || 0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/faq/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM faq_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  ACLS-COINS — globale Spielwährung
// ════════════════════════════════════════════════════════════════
// Identität für Coins: Mitarbeiter (users) ODER Bürger (voter session)
function coinIdent(req) {
  const u = getUser(req);
  if (u) return { id: u.discord_id, name: u.username, user: u };
  if (req.session?.voterDiscordId)
    return { id: req.session.voterDiscordId, name: req.session.voterUsername || 'Bürger', user: null };
  return null;
}

// Coins gutschreiben/abziehen. Gibt neuen Kontostand zurück, null wenn nicht gedeckt.
// countEarned=false: zählt nicht zu total_earned (z. B. empfangene Transfers)
function addCoins(discordId, username, amount, reason, meta, countEarned = true) {
  amount = Math.round(amount);
  if (!amount) return db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(discordId)?.balance ?? 0;
  const cur = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(discordId)?.balance ?? 0;
  if (amount < 0 && cur + amount < 0) return null;
  db.prepare(`
    INSERT INTO coin_balances (discord_id, username, balance, total_earned, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(discord_id) DO UPDATE SET
      balance      = balance + excluded.balance,
      total_earned = total_earned + excluded.total_earned,
      username     = COALESCE(excluded.username, username),
      updated_at   = CURRENT_TIMESTAMP
  `).run(discordId, username || null, amount, amount > 0 && countEarned ? amount : 0);
  db.prepare('INSERT INTO coin_transactions (discord_id, amount, reason, meta) VALUES (?, ?, ?, ?)')
    .run(discordId, amount, reason, meta ? JSON.stringify(meta) : null);
  const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(discordId).balance;
  sseEmit('coins', { discord_id: discordId, balance: bal }, discordId);
  return bal;
}

// ── Admin: Coins verwalten (setzen / +/- buchen) ────────────────
// Nutzer suchen – deckt Staff + Bürger ab (jeder mit Coin-Konto oder User-Eintrag)
app.get('/api/admin/coins/search', requireAdmin, (req, res) => {
  const q = ('' + (req.query.q || '')).trim().toLowerCase();
  if (q.length < 1) return res.json([]);
  const like = '%' + q + '%';
  const rows = db.prepare(`
    SELECT cb.discord_id AS discord_id,
           COALESCE(u.username, cb.username) AS username,
           cb.balance AS balance, u.role AS role
    FROM coin_balances cb
    LEFT JOIN users u ON u.discord_id = cb.discord_id
    WHERE LOWER(COALESCE(u.username, cb.username)) LIKE ? OR cb.discord_id LIKE ?
    UNION
    SELECT u.discord_id AS discord_id, u.username AS username, 0 AS balance, u.role AS role
    FROM users u
    WHERE u.is_active = 1 AND LOWER(u.username) LIKE ?
      AND u.discord_id NOT IN (SELECT discord_id FROM coin_balances)
    ORDER BY balance DESC
    LIMIT 20
  `).all(like, like, like);
  res.json(rows);
});

// Coins setzen oder gutschreiben/abziehen
app.post('/api/admin/coins', requireAdmin, (req, res) => {
  const discordId = ('' + (req.body.discord_id || '')).trim();
  const mode      = req.body.mode === 'set' ? 'set' : 'add';
  const amount    = Math.round(+req.body.amount);
  if (!discordId)                return res.status(400).json({ error: 'Kein Ziel ausgewählt' });
  if (!Number.isFinite(amount))  return res.status(400).json({ error: 'Ungültiger Betrag' });

  const u    = db.prepare('SELECT username FROM users WHERE discord_id = ?').get(discordId);
  const cb   = db.prepare('SELECT username, balance FROM coin_balances WHERE discord_id = ?').get(discordId);
  const name = u?.username || cb?.username || 'Bürger';
  const cur  = cb?.balance ?? 0;

  let delta, reason;
  if (mode === 'set') {
    if (amount < 0) return res.status(400).json({ error: 'Zielwert darf nicht negativ sein' });
    delta  = amount - cur;
    reason = 'admin:set';
  } else {
    delta  = amount;
    reason = 'admin:grant';
  }
  if (delta === 0) return res.json({ ok: true, balance: cur, delta: 0 });

  // countEarned=false: Admin-Korrekturen verfälschen "verdiente" Coins / Leaderboards nicht
  const bal = addCoins(discordId, name, delta, reason, { by: req.adminUser.username, mode }, false);
  if (bal === null) return res.status(400).json({ error: 'Kontostand würde negativ werden' });
  auditLog(req, 'coins_admin', `target=${discordId} (${name}) mode=${mode} amount=${amount} delta=${delta} → ${bal}`);
  res.json({ ok: true, balance: bal, delta });
});

// Berliner Datum als YYYY-MM-DD (für Daily-Bonus)
function berlinDateStr() {
  const { y, m, d } = _berlinParts();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Berliner Datum von gestern als YYYY-MM-DD (für Streak-Prüfung)
function berlinYesterdayStr() {
  const { y, m, d } = _berlinParts();
  const yest = new Date(y, m - 1, d - 1);
  return `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
}

// ── Login-Streak: Bonus wächst mit der Serie ────────────────────
// Tag 1: 25 · ab Tag 2: +5 pro Tag bis max. 50 · Meilenstein-Extra bei 7/30 Tagen
const STREAK_MILESTONES = { 7: 75, 30: 300 };
function streakBonus(streak) {
  const base = Math.min(25 + (streak - 1) * 5, 50);
  return base + (STREAK_MILESTONES[streak] || 0);
}

const SHOP_ITEMS = [
  // Titel
  { id: 'title_rennfahrer', type: 'title', name: '🏎️ Rennfahrer',      price: 250,  desc: 'Titel unter deinem Namen' },
  { id: 'title_blitz',      type: 'title', name: '⚡ Blitzschnell',     price: 250,  desc: 'Titel unter deinem Namen' },
  { id: 'title_schrauber',  type: 'title', name: '🔧 Meisterschrauber', price: 350,  desc: 'Titel unter deinem Namen' },
  { id: 'title_casino',     type: 'title', name: '🎰 Casino-Hai',       price: 400,  desc: 'Titel unter deinem Namen' },
  { id: 'title_abschlepp',  type: 'title', name: '🚛 Abschleppkönig',   price: 500,  desc: 'Titel unter deinem Namen' },
  { id: 'title_champion',   type: 'title', name: '🏆 Turnier-Champion', price: 800,  desc: 'Titel unter deinem Namen' },
  { id: 'title_legende',    type: 'title', name: '👑 ACLS-Legende',     price: 1500, desc: 'Der teuerste Titel' },
  // Avatar-Rahmen
  { id: 'frame_gold',       type: 'frame', name: 'Gold-Rahmen',         price: 500,  desc: 'Goldener Avatar-Glow', color: '#ffd700' },
  { id: 'frame_neon',       type: 'frame', name: 'Neon-Rahmen',         price: 500,  desc: 'Cyan Avatar-Glow',     color: '#00f5ff' },
  { id: 'frame_feuer',      type: 'frame', name: 'Feuer-Rahmen',        price: 500,  desc: 'Oranger Avatar-Glow',  color: '#f97316' },
  { id: 'frame_lila',       type: 'frame', name: 'Twilight-Rahmen',     price: 500,  desc: 'Lila Avatar-Glow',     color: '#a855f7' },
  { id: 'frame_regenbogen', type: 'frame', name: 'Regenbogen-Rahmen',   price: 1200, desc: 'Animierter Regenbogen-Glow', color: 'rainbow' },
  // Truck-Skins (Abschlepp-Simulator)
  { id: 'skin_truck_black',  type: 'truck', name: 'Night-Ops Truck',     price: 400, desc: 'Schwarzer Abschlepper im Simulator', color: '#1f2937' },
  { id: 'skin_truck_gold',   type: 'truck', name: 'Goldener Truck',      price: 800, desc: 'Goldener Abschlepper im Simulator',  color: '#fbbf24' },
  { id: 'skin_truck_police', type: 'truck', name: 'Interceptor-Truck',   price: 600, desc: 'Weißer Truck mit Blaulicht',         color: '#e5e7eb' },
  // Kartendecks (Blackjack)
  { id: 'deck_gold',   type: 'deck', name: 'Gold-Deck',   price: 500, desc: 'Goldener Kartenrücken beim Blackjack' },
  { id: 'deck_carbon', type: 'deck', name: 'Carbon-Deck', price: 500, desc: 'Carbon-Kartenrücken beim Blackjack' },
  // Profil-Banner
  { id: 'banner_sunset',  type: 'banner', name: 'Sunset-Banner',  price: 600, desc: 'Hintergrund in deinem Profil' },
  { id: 'banner_skyline', type: 'banner', name: 'Skyline-Banner', price: 800, desc: 'Hintergrund in deinem Profil' },
  { id: 'banner_neon',    type: 'banner', name: 'Neon-Banner',    price: 600, desc: 'Hintergrund in deinem Profil' },
  // Namensfarbe
  { id: 'namecolor_gold', type: 'namecolor', name: 'Goldener Name', price: 750, desc: 'Dein Name in Gold – Team & Ranglisten' },
  // Avatar-Deko
  { id: 'deco_crown',  type: 'deco', name: '👑 Krone',              price: 600, desc: 'Deko neben deinem Namen' },
  { id: 'deco_wrench', type: 'deco', name: '🔧 Schraubenschlüssel', price: 450, desc: 'Deko neben deinem Namen' },
  { id: 'deco_blitz',  type: 'deco', name: '⚡ Blitz',              price: 450, desc: 'Deko neben deinem Namen' },
  { id: 'deco_halo',   type: 'deco', name: '😇 Heiligenschein',     price: 600, desc: 'Deko neben deinem Namen' },
  // Weitere Titel
  { id: 'title_pilot',      type: 'title', name: '✈️ Fluglehrer',      price: 400,  desc: 'Titel unter deinem Namen' },
  { id: 'title_kapitan',    type: 'title', name: '⚓ Kapitän',          price: 400,  desc: 'Titel unter deinem Namen' },
  { id: 'title_drift',      type: 'title', name: '🏁 Drift-King',       price: 600,  desc: 'Titel unter deinem Namen' },
  { id: 'title_nacht',      type: 'title', name: '🌙 Nachtschicht',     price: 300,  desc: 'Titel unter deinem Namen' },
  { id: 'title_glueck',     type: 'title', name: '🍀 Glückspilz',       price: 500,  desc: 'Titel unter deinem Namen' },
  { id: 'title_veteran',    type: 'title', name: '🎖️ Veteran',          price: 700,  desc: 'Titel unter deinem Namen' },
  { id: 'title_millionaer', type: 'title', name: '💰 Millionär',        price: 1000, desc: 'Titel unter deinem Namen' },
  // Weitere Avatar-Rahmen
  { id: 'frame_smaragd', type: 'frame', name: 'Smaragd-Rahmen', price: 500, desc: 'Grüner Avatar-Glow',  color: '#10b981' },
  { id: 'frame_rubin',   type: 'frame', name: 'Rubin-Rahmen',   price: 500, desc: 'Roter Avatar-Glow',   color: '#e11d48' },
  { id: 'frame_eis',     type: 'frame', name: 'Eis-Rahmen',     price: 500, desc: 'Eisblauer Avatar-Glow', color: '#7dd3fc' },
  { id: 'frame_pink',    type: 'frame', name: 'Pink-Rahmen',    price: 500, desc: 'Pinker Avatar-Glow',  color: '#ec4899' },
  // Weitere Avatar-Deko
  { id: 'deco_fire',    type: 'deco', name: '🔥 Flamme',    price: 450, desc: 'Deko neben deinem Namen' },
  { id: 'deco_star',    type: 'deco', name: '⭐ Stern',     price: 450, desc: 'Deko neben deinem Namen' },
  { id: 'deco_diamond', type: 'deco', name: '💎 Diamant',   price: 600, desc: 'Deko neben deinem Namen' },
  { id: 'deco_rocket',  type: 'deco', name: '🚀 Rakete',    price: 500, desc: 'Deko neben deinem Namen' },
  { id: 'deco_clover',  type: 'deco', name: '🍀 Kleeblatt', price: 500, desc: 'Deko neben deinem Namen' },
  { id: 'deco_skull',   type: 'deco', name: '💀 Totenkopf', price: 450, desc: 'Deko neben deinem Namen' },
  // Weitere Namensfarben
  { id: 'namecolor_cyan',  type: 'namecolor', name: 'Cyan-Name',  price: 750, desc: 'Dein Name in Cyan – Team & Ranglisten' },
  { id: 'namecolor_pink',  type: 'namecolor', name: 'Pink-Name',  price: 750, desc: 'Dein Name in Pink – Team & Ranglisten' },
  { id: 'namecolor_green', type: 'namecolor', name: 'Grüner Name', price: 750, desc: 'Dein Name in Grün – Team & Ranglisten' },
  { id: 'namecolor_red',   type: 'namecolor', name: 'Roter Name', price: 750, desc: 'Dein Name in Rot – Team & Ranglisten' },
  // Weitere Profil-Banner
  { id: 'banner_carbon', type: 'banner', name: 'Carbon-Banner', price: 600, desc: 'Hintergrund in deinem Profil' },
  { id: 'banner_galaxy', type: 'banner', name: 'Galaxy-Banner', price: 800, desc: 'Hintergrund in deinem Profil' },
  { id: 'banner_gold',   type: 'banner', name: 'Gold-Banner',   price: 800, desc: 'Hintergrund in deinem Profil' },
  { id: 'banner_matrix', type: 'banner', name: 'Matrix-Banner', price: 600, desc: 'Hintergrund in deinem Profil' },
  // Weitere Kartendecks (Blackjack)
  { id: 'deck_neon',  type: 'deck', name: 'Neon-Deck',  price: 500, desc: 'Neon-Kartenrücken beim Blackjack' },
  { id: 'deck_ocean', type: 'deck', name: 'Ocean-Deck', price: 500, desc: 'Blauer Kartenrücken beim Blackjack' },
  { id: 'deck_rot',   type: 'deck', name: 'Rubin-Deck', price: 500, desc: 'Roter Kartenrücken beim Blackjack' },
  // Freischaltungen
  { id: 'emotes_pack', type: 'perk', name: '😏 Duell-Emotes', price: 250, desc: 'Sende Emotes im Quiz-Duell' },
  // Verbrauchsartikel
  { id: 'vip_30',      type: 'consumable', name: '⭐ VIP-Rolle (30 Tage)', price: 2000, desc: 'Goldene VIP-Rolle im Discord' },
  { id: 'booster_24',  type: 'consumable', name: '⚡ Coin-Booster (24h)',  price: 300,  desc: 'Doppelte Minispiel-Coins für 24 Stunden' },
  { id: 'booster_72',  type: 'consumable', name: '⚡ Coin-Booster (72h)',  price: 750,  desc: 'Doppelte Minispiel-Coins für 3 Tage' },
  { id: 'mystery_box', type: 'consumable', name: '🎲 Mystery-Box',        price: 200,  desc: 'Coins, Lotterie-Los oder Rahmen – Überraschung!' },
];

// Welche Artikel-Typen in welchem coin_balances-Slot ausgerüstet werden
const EQUIP_SLOTS = {
  title: 'equipped_title', frame: 'equipped_frame', truck: 'equipped_truck',
  deck: 'equipped_deck', banner: 'equipped_banner', namecolor: 'equipped_namecolor', deco: 'equipped_deco',
};

// ── Zeitlich begrenzte Perks (VIP, Coin-Booster) ────────────────
function getPerk(did, perk) {
  return db.prepare(`SELECT * FROM user_perks WHERE discord_id = ? AND perk = ? AND expires_at > datetime('now')`).get(did, perk) || null;
}
function extendPerk(did, perk, hours) {
  const cur  = db.prepare('SELECT expires_at FROM user_perks WHERE discord_id = ? AND perk = ?').get(did, perk);
  const curD = cur ? new Date(cur.expires_at.replace(' ', 'T') + 'Z') : null;
  const base = curD && curD > new Date() ? curD : new Date();
  const iso  = new Date(base.getTime() + hours * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(`INSERT INTO user_perks (discord_id, perk, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(discord_id, perk) DO UPDATE SET expires_at = excluded.expires_at`).run(did, perk, iso);
  return iso;
}

// Mystery-Box öffnen: Coins, Lotterie-Los oder ein fehlender Rahmen
function openMysteryBox(ident) {
  const roll = crypto.randomInt(100);
  if (roll < 50) {
    const amount = 50 + crypto.randomInt(201); // 50–250
    addCoins(ident.id, ident.name, amount, 'mystery:coins');
    return { kind: 'coins', amount };
  }
  if (roll < 75) {
    db.prepare('INSERT INTO lottery_tickets (week, discord_id, username) VALUES (?, ?, ?)').run(weekKey(), ident.id, ident.name);
    return { kind: 'ticket' };
  }
  if (roll < 90) {
    const amount = 300 + crypto.randomInt(201); // 300–500
    addCoins(ident.id, ident.name, amount, 'mystery:coins');
    return { kind: 'coins', amount };
  }
  const owned = new Set(db.prepare('SELECT item_id FROM shop_purchases WHERE discord_id = ?').all(ident.id).map(r => r.item_id));
  const avail = SHOP_ITEMS.filter(i => i.type === 'frame' && !owned.has(i.id));
  if (!avail.length) {
    addCoins(ident.id, ident.name, 500, 'mystery:coins');
    return { kind: 'coins', amount: 500 };
  }
  const f = avail[crypto.randomInt(avail.length)];
  db.prepare('INSERT INTO shop_purchases (discord_id, item_id, price) VALUES (?, ?, 0)').run(ident.id, f.id);
  return { kind: 'frame', id: f.id, name: f.name };
}

// ════════════════════════════════════════════════════════════════
//  SAISON-PASS — XP-Leiste, Wochen-Quests & Belohnungsstufen
// ════════════════════════════════════════════════════════════════
// Saison = Kalendermonat (Berliner Zeit). Quests laufen wochenweise.
function seasonKey() {
  const { y, m } = _berlinParts();
  return `${y}-${String(m).padStart(2, '0')}`;
}
function seasonName() {
  const { y, m } = _berlinParts();
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  return `${months[m - 1]} ${y}`;
}

const SEASON_XP_PER_LEVEL = 250;

// Wochen-Quests (Reset jeden Montag). metric = Andockpunkt im Code.
const SEASON_QUESTS = [
  { id: 'play',     metric: 'games',      goal: 12, xp: 150, icon: '🎮', label: 'Spiele 12 Minispiel-Runden' },
  { id: 'coins',    metric: 'game_coins', goal: 300, xp: 150, icon: '🪙', label: 'Verdiene 300 Coins in Minispielen' },
  { id: 'daily',    metric: 'daily',      goal: 3,  xp: 120, icon: '📅', label: 'Hol dir an 3 Tagen den Tagesbonus' },
  { id: 'duel',     metric: 'duel_win',   goal: 2,  xp: 200, icon: '⚔️', label: 'Gewinne 2 Quiz-Duelle' },
  { id: 'prestige', metric: 'prestige',   goal: 1,  xp: 250, icon: '⭐', label: 'Mach 1× Prestige in der Werkstatt' },
];

// Belohnungsstufen. Stufe L wird bei xp >= L*250 erreicht.
// free = Gratis-Bahn · vip = nur mit aktiver VIP-Rolle.
const SEASON_REWARDS = [
  { level: 1,  free: { coins: 100 },              vip: { coins: 100 } },
  { level: 2,  free: { coins: 150 },              vip: { ticket: 1 } },
  { level: 3,  free: { ticket: 1 },               vip: { coins: 250 } },
  { level: 4,  free: { coins: 200 },              vip: { booster: 24 } },
  { level: 5,  free: { coins: 300 },              vip: { coins: 400 } },
  { level: 6,  free: { booster: 24 },             vip: { ticket: 2 } },
  { level: 7,  free: { coins: 350 },              vip: { coins: 500 } },
  { level: 8,  free: { ticket: 2 },               vip: { booster: 48 } },
  { level: 9,  free: { coins: 450 },              vip: { coins: 700 } },
  { level: 10, free: { coins: 600 },              vip: { item: 'frame_neon' } },
  { level: 11, free: { booster: 48 },             vip: { coins: 1000 } },
  { level: 12, free: { item: 'frame_gold', coins: 500 }, vip: { item: 'deco_crown', coins: 1000 } },
];
const SEASON_MAX_LEVEL = SEASON_REWARDS.length;

function seasonLevel(xp) { return Math.min(SEASON_MAX_LEVEL, Math.floor(xp / SEASON_XP_PER_LEVEL)); }

function addSeasonXp(discordId, username, amount) {
  amount = Math.floor(amount);
  if (!discordId || amount <= 0) return;
  const s = seasonKey();
  db.prepare(`INSERT INTO season_pass (season, discord_id, username, xp) VALUES (?, ?, ?, ?)
    ON CONFLICT(season, discord_id) DO UPDATE SET
      xp = xp + excluded.xp, username = COALESCE(excluded.username, username), updated_at = CURRENT_TIMESTAMP`)
    .run(s, discordId, username || null, amount);
  sseEmit('season', { discord_id: discordId }, discordId);
}

// Quest-Fortschritt erhöhen (über metric). Stoppt automatisch beim Ziel.
function seasonIncQuest(discordId, metric, amount = 1) {
  if (!discordId || amount <= 0) return;
  const wk = weekKey();
  for (const q of SEASON_QUESTS) {
    if (q.metric !== metric) continue;
    const row = db.prepare('SELECT progress FROM season_quest_progress WHERE week = ? AND discord_id = ? AND quest_id = ?').get(wk, discordId, q.id);
    const cur = row ? row.progress : 0;
    if (cur >= q.goal) continue;
    const next = Math.min(q.goal, cur + amount);
    db.prepare(`INSERT INTO season_quest_progress (week, discord_id, quest_id, progress) VALUES (?, ?, ?, ?)
      ON CONFLICT(week, discord_id, quest_id) DO UPDATE SET progress = excluded.progress`).run(wk, discordId, q.id, next);
  }
}

// Belohnung einlösen (Coins, Lotterie-Los, Booster, Shop-Item)
function grantSeasonReward(ident, reward) {
  if (!reward) return;
  if (reward.coins)   addCoins(ident.id, ident.name, reward.coins, 'season:reward');
  if (reward.ticket)  { const stmt = db.prepare('INSERT INTO lottery_tickets (week, discord_id, username) VALUES (?, ?, ?)'); for (let i = 0; i < reward.ticket; i++) stmt.run(weekKey(), ident.id, ident.name); }
  if (reward.booster) extendPerk(ident.id, 'booster', reward.booster);
  if (reward.item)    db.prepare('INSERT OR IGNORE INTO shop_purchases (discord_id, item_id, price) VALUES (?, ?, 0)').run(ident.id, reward.item);
}

app.get('/api/season', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const s   = seasonKey();
  const wk  = weekKey();
  const row = db.prepare('SELECT xp, claimed FROM season_pass WHERE season = ? AND discord_id = ?').get(s, ident.id);
  const xp  = row?.xp || 0;
  const claimed = new Set(JSON.parse(row?.claimed || '[]'));
  const level   = seasonLevel(xp);
  const isVip   = !!getPerk(ident.id, 'vip');

  const rewards = SEASON_REWARDS.map(r => ({
    level: r.level, free: r.free, vip: r.vip,
    reached: level >= r.level,
    freeClaimed: claimed.has('f' + r.level),
    vipClaimed:  claimed.has('v' + r.level),
  }));

  const prog = db.prepare('SELECT quest_id, progress, claimed FROM season_quest_progress WHERE week = ? AND discord_id = ?').all(wk, ident.id);
  const pmap = Object.fromEntries(prog.map(p => [p.quest_id, p]));
  const quests = SEASON_QUESTS.map(q => ({
    id: q.id, icon: q.icon, label: q.label, goal: q.goal, xp: q.xp,
    progress: Math.min(q.goal, pmap[q.id]?.progress || 0),
    claimed:  !!pmap[q.id]?.claimed,
  }));

  res.json({
    seasonName: seasonName(),
    xp, level, maxLevel: SEASON_MAX_LEVEL, xpPerLevel: SEASON_XP_PER_LEVEL,
    xpInLevel: level >= SEASON_MAX_LEVEL ? SEASON_XP_PER_LEVEL : xp - level * SEASON_XP_PER_LEVEL,
    isVip, rewards, quests,
  });
});

app.post('/api/season/claim-quest', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const q = SEASON_QUESTS.find(x => x.id === req.body.questId);
  if (!q) return res.status(400).json({ error: 'Unbekannte Quest' });
  const wk  = weekKey();
  const row = db.prepare('SELECT progress, claimed FROM season_quest_progress WHERE week = ? AND discord_id = ? AND quest_id = ?').get(wk, ident.id, q.id);
  if (!row || row.progress < q.goal) return res.status(400).json({ error: 'Quest noch nicht abgeschlossen' });
  if (row.claimed) return res.status(400).json({ error: 'Bereits eingelöst' });
  db.prepare('UPDATE season_quest_progress SET claimed = 1 WHERE week = ? AND discord_id = ? AND quest_id = ?').run(wk, ident.id, q.id);
  addSeasonXp(ident.id, ident.name, q.xp);
  res.json({ ok: true, xpGained: q.xp });
});

app.post('/api/season/claim-level', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { level, track } = req.body;
  const reward = SEASON_REWARDS.find(r => r.level === level);
  if (!reward || (track !== 'free' && track !== 'vip')) return res.status(400).json({ error: 'Ungültige Stufe' });

  const s   = seasonKey();
  const row = db.prepare('SELECT xp, claimed FROM season_pass WHERE season = ? AND discord_id = ?').get(s, ident.id);
  const xp  = row?.xp || 0;
  if (seasonLevel(xp) < level) return res.status(400).json({ error: 'Stufe noch nicht erreicht' });
  if (track === 'vip' && !getPerk(ident.id, 'vip')) return res.status(403).json({ error: 'Nur mit VIP-Rolle' });

  const claimed = new Set(JSON.parse(row?.claimed || '[]'));
  const key = (track === 'vip' ? 'v' : 'f') + level;
  if (claimed.has(key)) return res.status(400).json({ error: 'Bereits abgeholt' });

  grantSeasonReward(ident, track === 'vip' ? reward.vip : reward.free);
  claimed.add(key);
  db.prepare(`INSERT INTO season_pass (season, discord_id, username, xp, claimed) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(season, discord_id) DO UPDATE SET claimed = excluded.claimed, username = COALESCE(excluded.username, username)`)
    .run(s, ident.id, ident.name, xp, JSON.stringify([...claimed]));
  res.json({ ok: true });
});

app.get('/api/coins/me', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const row = db.prepare('SELECT * FROM coin_balances WHERE discord_id = ?').get(ident.id);
  const tx  = db.prepare('SELECT amount, reason, created_at FROM coin_transactions WHERE discord_id = ? ORDER BY id DESC LIMIT 15').all(ident.id);
  const vip     = getPerk(ident.id, 'vip');
  const booster = getPerk(ident.id, 'booster');
  const ctr     = db.prepare('SELECT text, status FROM custom_title_requests WHERE discord_id = ? ORDER BY id DESC LIMIT 1').get(ident.id);
  res.json({
    balance:        row?.balance ?? 0,
    totalEarned:    row?.total_earned ?? 0,
    equippedTitle:  row?.equipped_title || null,
    equippedFrame:  row?.equipped_frame || null,
    equippedTruck:  row?.equipped_truck || null,
    equippedDeck:   row?.equipped_deck || null,
    equippedBanner: row?.equipped_banner || null,
    equippedNamecolor: row?.equipped_namecolor || null,
    equippedDeco:   row?.equipped_deco || null,
    vipUntil:       vip?.expires_at || null,
    boosterUntil:   booster?.expires_at || null,
    customTitle:    ctr || null,
    dailyAvailable: (row?.last_daily || '') !== berlinDateStr(),
    // Streak gilt als aktiv, wenn heute oder gestern abgeholt wurde – sonst startet die Serie neu
    streak:         (row?.last_daily === berlinDateStr() || row?.last_daily === berlinYesterdayStr()) ? (row?.streak || 0) : 0,
    bestStreak:     row?.best_streak || 0,
    nextDaily:      streakBonus((row?.last_daily === berlinYesterdayStr()) ? (row?.streak || 0) + 1 : 1),
    transactions:   tx,
  });
});

app.post('/api/coins/daily', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const today = berlinDateStr();
  const row = db.prepare('SELECT last_daily, streak, best_streak FROM coin_balances WHERE discord_id = ?').get(ident.id);
  if (row?.last_daily === today) return res.status(400).json({ error: 'Tagesbonus heute schon abgeholt' });

  // Streak: gestern abgeholt → +1, sonst Neustart bei 1
  const streak = (row?.last_daily === berlinYesterdayStr()) ? (row?.streak || 0) + 1 : 1;
  const best   = Math.max(streak, row?.best_streak || 0);
  const amount = streakBonus(streak);
  const bal = addCoins(ident.id, ident.name, amount, 'daily', { streak });
  db.prepare('UPDATE coin_balances SET last_daily = ?, streak = ?, best_streak = ? WHERE discord_id = ?')
    .run(today, streak, best, ident.id);
  // Streak-Badges (nur Mitarbeiter mit users-Eintrag)
  if (ident.user) {
    if (streak >= 7)  awardBadge(ident.user.id, 'streak_7');
    if (streak >= 30) awardBadge(ident.user.id, 'streak_30');
  }
  // Saison-Pass: XP + Wochen-Quest „Tagesbonus"
  try { seasonIncQuest(ident.id, 'daily', 1); addSeasonXp(ident.id, ident.name, 50); } catch {}
  res.json({ ok: true, balance: bal, amount, streak, milestone: STREAK_MILESTONES[streak] || 0 });
});

app.get('/api/coins/leaderboard', (req, res) => {
  const rows = db.prepare('SELECT discord_id, username, balance, total_earned FROM coin_balances ORDER BY total_earned DESC LIMIT 10').all();
  res.json(rows);
});

// ── Tauschsystem: Coins an andere Mitglieder senden ─────────────
const TRANSFER_DAILY_LIMIT = 200; // max gesendete Coins pro Tag
const TRANSFER_MAX_SINGLE  = 200; // max pro Überweisung

app.post('/api/coins/transfer', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const ip = req.ip || req.socket?.remoteAddress || '';
  if (rateLimit(`transfer:${ip}`, 10, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });

  const { toDiscordId, amount } = req.body;
  if (!Number.isInteger(amount) || amount < 1 || amount > TRANSFER_MAX_SINGLE)
    return res.status(400).json({ error: `Betrag muss zwischen 1 und ${TRANSFER_MAX_SINGLE} liegen` });
  if (!toDiscordId || toDiscordId === ident.id)
    return res.status(400).json({ error: 'Ungültiger Empfänger' });

  const recipient = db.prepare('SELECT username, discord_id FROM users WHERE discord_id = ? AND is_active = 1').get(toDiscordId)
    || db.prepare('SELECT username, discord_id FROM coin_balances WHERE discord_id = ?').get(toDiscordId);
  if (!recipient) return res.status(404).json({ error: 'Empfänger nicht gefunden' });

  // Tageslimit: Summe der heute bereits gesendeten Coins (Berliner Tag via UTC-Datum genügt hier)
  const sentToday = db.prepare(`SELECT COALESCE(SUM(-amount), 0) AS s FROM coin_transactions
    WHERE discord_id = ? AND reason = 'transfer:out' AND date(created_at) = date('now')`).get(ident.id).s;
  if (sentToday + amount > TRANSFER_DAILY_LIMIT)
    return res.status(400).json({ error: `Tageslimit erreicht (${TRANSFER_DAILY_LIMIT} Coins/Tag, heute schon ${sentToday} gesendet)` });

  const result = db.transaction(() => {
    const newBal = addCoins(ident.id, ident.name, -amount, 'transfer:out', { to: toDiscordId, toName: recipient.username });
    if (newBal === null) return null;
    addCoins(toDiscordId, recipient.username, amount, 'transfer:in', { from: ident.id, fromName: ident.name }, false);
    createNotif(toDiscordId, 'transfer_in', { from: ident.name, amount });
    return newBal;
  })();
  if (result === null) return res.status(400).json({ error: 'Nicht genug Coins' });

  auditLog(req, 'coin_transfer', `${amount} Coins an ${recipient.username} (${toDiscordId})`);
  res.json({ ok: true, balance: result, sentToday: sentToday + amount, limit: TRANSFER_DAILY_LIMIT });
});

app.get('/api/shop', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const owned = new Set(db.prepare('SELECT item_id FROM shop_purchases WHERE discord_id = ?').all(ident.id).map(r => r.item_id));
  const row   = db.prepare('SELECT * FROM coin_balances WHERE discord_id = ?').get(ident.id);
  res.json({
    balance: row?.balance ?? 0,
    items: SHOP_ITEMS.map(it => ({
      ...it,
      owned:    owned.has(it.id),
      equipped: row?.equipped_title === it.id || row?.equipped_frame === it.id,
    })),
  });
});

app.post('/api/shop/buy', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const item = SHOP_ITEMS.find(i => i.id === req.body.itemId);
  if (!item) return res.status(404).json({ error: 'Artikel nicht gefunden' });

  // Verbrauchsartikel: immer wieder kaufbar, sofortige Wirkung
  if (item.type === 'consumable') {
    if (rateLimit(`shopc:${ident.id}`, 15, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
    const bal = addCoins(ident.id, ident.name, -item.price, 'shop:' + item.id);
    if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });
    if (item.id === 'vip_30') {
      const until = extendPerk(ident.id, 'vip', 30 * 24);
      queueNotification('vip', ident.id, { username: ident.name, until });
      auditLog(req, 'shop_buy', 'VIP-Rolle 30 Tage');
      return res.json({ ok: true, balance: bal, vipUntil: until });
    }
    if (item.id === 'booster_24') {
      const until = extendPerk(ident.id, 'booster', 24);
      return res.json({ ok: true, balance: bal, boosterUntil: until });
    }
    if (item.id === 'booster_72') {
      const until = extendPerk(ident.id, 'booster', 72);
      return res.json({ ok: true, balance: bal, boosterUntil: until });
    }
    if (item.id === 'mystery_box') {
      const mystery = openMysteryBox(ident);
      const newBal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
      return res.json({ ok: true, balance: newBal, mystery });
    }
  }

  const owned = db.prepare('SELECT 1 FROM shop_purchases WHERE discord_id = ? AND item_id = ?').get(ident.id, item.id);
  if (owned) return res.status(400).json({ error: 'Bereits gekauft' });
  const bal = addCoins(ident.id, ident.name, -item.price, 'shop:buy', { item: item.id });
  if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });
  db.prepare('INSERT INTO shop_purchases (discord_id, item_id, price) VALUES (?, ?, ?)').run(ident.id, item.id, item.price);
  // Direkt ausrüsten (falls der Typ einen Slot hat)
  const col = EQUIP_SLOTS[item.type];
  if (col) db.prepare(`UPDATE coin_balances SET ${col} = ? WHERE discord_id = ?`).run(item.id, ident.id);
  auditLog(req, 'shop_buy', `${item.name} für ${item.price} Coins`);
  res.json({ ok: true, balance: bal });
});

app.post('/api/shop/equip', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { itemId, slot } = req.body;
  if (itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Artikel nicht gefunden' });
    const col = EQUIP_SLOTS[item.type];
    if (!col) return res.status(400).json({ error: 'Nicht ausrüstbar' });
    const owned = db.prepare('SELECT 1 FROM shop_purchases WHERE discord_id = ? AND item_id = ?').get(ident.id, itemId);
    if (!owned) return res.status(403).json({ error: 'Nicht gekauft' });
    db.prepare(`INSERT INTO coin_balances (discord_id, username) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING`).run(ident.id, ident.name);
    db.prepare(`UPDATE coin_balances SET ${col} = ? WHERE discord_id = ?`).run(itemId, ident.id);
  } else {
    const col = EQUIP_SLOTS[slot];
    if (!col) return res.status(400).json({ error: 'Ungültiger Slot' });
    db.prepare(`UPDATE coin_balances SET ${col} = NULL WHERE discord_id = ?`).run(ident.id);
  }
  res.json({ ok: true });
});

// ── Wunsch-Titel (2500 Coins, Admin-Freigabe nötig) ─────────────
const CUSTOM_TITLE_PRICE = 2500;

app.post('/api/shop/custom-title', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const text = String(req.body.text || '').trim().replace(/\s+/g, ' ');
  if (text.length < 3 || text.length > 30) return res.status(400).json({ error: 'Titel muss 3–30 Zeichen lang sein' });
  const pending = db.prepare(`SELECT 1 FROM custom_title_requests WHERE discord_id = ? AND status = 'pending'`).get(ident.id);
  if (pending) return res.status(400).json({ error: 'Du hast bereits eine offene Anfrage' });
  const bal = addCoins(ident.id, ident.name, -CUSTOM_TITLE_PRICE, 'shop:custom_title', { text });
  if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });
  db.prepare('INSERT INTO custom_title_requests (discord_id, username, text) VALUES (?, ?, ?)').run(ident.id, ident.name, text);
  auditLog(req, 'shop_buy', `Wunsch-Titel beantragt: "${text}"`);
  res.json({ ok: true, balance: bal });
});

app.get('/api/admin/custom-titles', requireAdmin, (req, res) => {
  res.json(db.prepare(`SELECT * FROM custom_title_requests WHERE status = 'pending' ORDER BY id ASC`).all());
});

app.post('/api/admin/custom-titles/:id', requireAdmin, (req, res) => {
  const r = db.prepare('SELECT * FROM custom_title_requests WHERE id = ? AND status = ?').get(+req.params.id, 'pending');
  if (!r) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  if (req.body.action === 'approve') {
    db.prepare(`INSERT INTO coin_balances (discord_id, username) VALUES (?, ?) ON CONFLICT(discord_id) DO NOTHING`).run(r.discord_id, r.username);
    db.prepare('UPDATE coin_balances SET equipped_title = ? WHERE discord_id = ?').run('custom:' + r.text, r.discord_id);
    db.prepare(`UPDATE custom_title_requests SET status = 'approved' WHERE id = ?`).run(r.id);
    auditLog(req, 'custom_title', `Freigegeben: "${r.text}" (${r.username})`);
  } else {
    addCoins(r.discord_id, r.username, CUSTOM_TITLE_PRICE, 'shop:custom_title_refund');
    db.prepare(`UPDATE custom_title_requests SET status = 'rejected' WHERE id = ?`).run(r.id);
    auditLog(req, 'custom_title', `Abgelehnt: "${r.text}" (${r.username}) – Coins erstattet`);
  }
  res.json({ ok: true });
});

// ── Ehrentitel ──────────────────────────────────────────────────────
app.get('/api/admin/honorary-titles', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT ht.id, ht.title, ht.color, ht.granted_by, ht.granted_at,
           u.id AS user_id, u.username, u.discord_id, u.avatar
    FROM honorary_titles ht
    JOIN users u ON u.id = ht.user_id
    ORDER BY ht.granted_at DESC
  `).all();
  res.json(rows);
});

app.post('/api/admin/honorary-titles', requireAdmin, (req, res) => {
  const { user_id, title, color, icon } = req.body;
  if (!user_id || !title?.trim()) return res.status(400).json({ error: 'user_id und title erforderlich' });
  const titleText  = String(title).trim().slice(0, 40);
  const titleColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#fbbf24';
  const titleIcon  = String(icon || '⭐').slice(0, 8);
  const adminName  = req.adminUser?.username || 'Admin';
  const r = db.prepare(`
    INSERT INTO honorary_titles (user_id, title, color, icon, granted_by) VALUES (?, ?, ?, ?, ?)
  `).run(+user_id, titleText, titleColor, titleIcon, adminName);
  auditLog(req, 'honorary_title', `Vergeben an user_id=${user_id}: "${titleIcon} ${titleText}"`);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.delete('/api/admin/honorary-titles/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM honorary_titles WHERE id = ?').run(+req.params.id);
  auditLog(req, 'honorary_title', `Entzogen: id=${req.params.id}`);
  res.json({ ok: true });
});

// VIP-Test für die Leitung (Rang 12): 10 Minuten Probelauf, 1× pro Tag
app.post('/api/shop/vip-test', requireAuth, (req, res) => {
  const u = getUser(req);
  if (u.rank !== 'Rang 12') return res.status(403).json({ error: 'Nur für Rang 12' });
  if (getPerk(u.discord_id, 'vip')) return res.status(400).json({ error: 'VIP ist bereits aktiv' });
  if (getPerk(u.discord_id, 'vip_test_cd')) return res.status(400).json({ error: 'Test nur einmal pro Tag möglich' });
  const until = extendPerk(u.discord_id, 'vip', 10 / 60); // 10 Minuten
  extendPerk(u.discord_id, 'vip_test_cd', 24);            // Cooldown bis morgen
  queueNotification('vip', u.discord_id, { username: u.username, until, test: true });
  auditLog(req, 'vip_test', 'VIP-Rolle 10 Minuten getestet');
  res.json({ ok: true, until });
});

// Abgelaufene Perks: VIP-Rolle entziehen, Booster still löschen
// (alle 2 Minuten, damit auch der 10-Minuten-VIP-Test pünktlich endet)
cron.schedule('*/2 * * * *', () => {
  const expiredVips = db.prepare(`SELECT discord_id FROM user_perks WHERE perk = 'vip' AND expires_at <= datetime('now')`).all();
  for (const v of expiredVips) queueNotification('vip_remove', v.discord_id, {});
  const r = db.prepare(`DELETE FROM user_perks WHERE expires_at <= datetime('now')`).run();
  if (r.changes > 0) console.log(`[Perks] ${r.changes} abgelaufene Perk(s) entfernt`);
});

// ════════════════════════════════════════════════════════════════
//  WOCHENTURNIER — jede Woche ein anderes Spiel
// ════════════════════════════════════════════════════════════════
const TOURNAMENT_GAMES = {
  race:         { name: 'Autorennen',          url: '/game'   },
  brick:        { name: 'Brick Breaker',       url: '/game2'  },
  snake:        { name: 'Snake',               url: '/game4'  },
  tetris:       { name: 'Tetris',              url: '/game5'  },
  skycop:       { name: 'Sky Cop',             url: '/game7'  },
  doodlejump:   { name: 'Doodle Jump',         url: '/game8'  },
  towerdefense: { name: 'Tower Defense',       url: '/game9'  },
  '2048':       { name: '2048',                url: '/game10' },
  quiz:         { name: 'Quiz Survival',       url: '/game11' },
  tow:          { name: 'Abschlepp-Simulator', url: '/game14' },
  memory:       { name: 'Memory',              url: '/game16' },
};
const TOURNAMENT_PRIZES = [500, 250, 100];

function ensureTournament() {
  const wk = weekKey();
  let t = db.prepare('SELECT * FROM tournaments WHERE week = ?').get(wk);
  if (t) return t;
  const keys = Object.keys(TOURNAMENT_GAMES);
  // deterministische Rotation über die Wochennummer, nie 2× dasselbe nacheinander
  const weekNum = Math.floor(new Date(wk + 'T12:00:00Z').getTime() / (7 * 86400000));
  let game = keys[weekNum % keys.length];
  const prev = db.prepare('SELECT game FROM tournaments ORDER BY week DESC LIMIT 1').get();
  if (prev && prev.game === game) game = keys[(weekNum + 1) % keys.length];
  db.prepare('INSERT OR IGNORE INTO tournaments (week, game) VALUES (?, ?)').run(wk, game);
  return db.prepare('SELECT * FROM tournaments WHERE week = ?').get(wk);
}

app.get('/api/tournament', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const t = ensureTournament();
  const info = TOURNAMENT_GAMES[t.game] || { name: t.game, url: '/' };
  const board = db.prepare(`
    SELECT ts.discord_id, ts.username, ts.avatar, ts.score, ts.updated_at,
           cb.equipped_title, cb.equipped_frame, cb.equipped_namecolor, cb.equipped_deco
    FROM tournament_scores ts LEFT JOIN coin_balances cb ON cb.discord_id = ts.discord_id
    WHERE ts.week = ? ORDER BY ts.score DESC LIMIT 15
  `).all(t.week);
  const mine  = db.prepare('SELECT score FROM tournament_scores WHERE week = ? AND discord_id = ?').get(t.week, ident.id);
  const last  = db.prepare('SELECT * FROM tournaments WHERE finished = 1 ORDER BY week DESC LIMIT 1').get();
  res.json({
    week: t.week, game: t.game, gameName: info.name, gameUrl: info.url,
    finished: !!t.finished, prizes: TOURNAMENT_PRIZES,
    leaderboard: board, myScore: mine?.score ?? null,
    lastWinner: last ? { week: last.week, game: TOURNAMENT_GAMES[last.game]?.name || last.game, username: last.winner_username, score: last.winner_score } : null,
  });
});

function finalizeTournament() {
  const wk = weekKey();
  const t = db.prepare('SELECT * FROM tournaments WHERE week = ? AND finished = 0').get(wk);
  if (!t) return;
  const top = db.prepare('SELECT * FROM tournament_scores WHERE week = ? ORDER BY score DESC LIMIT 3').all(wk);
  top.forEach((r, i) => addCoins(r.discord_id, r.username, TOURNAMENT_PRIZES[i], 'tournament:prize', { week: wk, place: i + 1 }));
  const w = top[0] || null;
  db.prepare('UPDATE tournaments SET finished = 1, winner_discord_id = ?, winner_username = ?, winner_score = ? WHERE week = ?')
    .run(w?.discord_id || null, w?.username || null, w?.score ?? null, wk);
  if (w) queueNotification('tournament', w.discord_id, {
    week: wk,
    game: TOURNAMENT_GAMES[t.game]?.name || t.game,
    top:  top.map((r, i) => ({ place: i + 1, username: r.username, score: r.score, prize: TOURNAMENT_PRIZES[i] })),
  });
  sseEmit('tournament', { week: wk, finished: true });
  console.log(`[Turnier] ${wk} (${t.game}) ausgewertet — Sieger: ${w?.username || 'niemand'}`);
}

// Sonntag 20:00 Berliner Zeit — Wochenturnier auswerten
cron.schedule('0 20 * * 0', finalizeTournament, { timezone: 'Europe/Berlin' });

// ════════════════════════════════════════════════════════════════
//  WOCHENLOTTERIE — Lose kaufen, Sonntag 19:00 Ziehung
// ════════════════════════════════════════════════════════════════
const LOTTERY_TICKET_PRICE = 50;
const LOTTERY_MAX_TICKETS  = 20; // pro Person und Woche

app.get('/api/lottery', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const wk = weekKey();
  const total = db.prepare('SELECT COUNT(*) AS c FROM lottery_tickets WHERE week = ?').get(wk).c;
  const mine  = db.prepare('SELECT COUNT(*) AS c FROM lottery_tickets WHERE week = ? AND discord_id = ?').get(wk, ident.id).c;
  const players = db.prepare('SELECT COUNT(DISTINCT discord_id) AS c FROM lottery_tickets WHERE week = ?').get(wk).c;
  const last = db.prepare('SELECT * FROM lottery_draws ORDER BY week DESC LIMIT 1').get() || null;
  res.json({
    week: wk, ticketPrice: LOTTERY_TICKET_PRICE, maxTickets: LOTTERY_MAX_TICKETS,
    pot: total * LOTTERY_TICKET_PRICE, totalTickets: total, players, myTickets: mine,
    lastDraw: last,
  });
});

app.post('/api/lottery/buy', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (rateLimit(`lottery:${ident.id}`, 20, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
  const count = Math.floor(+req.body.count || 1);
  if (count < 1 || count > LOTTERY_MAX_TICKETS) return res.status(400).json({ error: 'Ungültige Anzahl' });
  const wk = weekKey();
  const mine = db.prepare('SELECT COUNT(*) AS c FROM lottery_tickets WHERE week = ? AND discord_id = ?').get(wk, ident.id).c;
  if (mine + count > LOTTERY_MAX_TICKETS) return res.status(400).json({ error: `Maximal ${LOTTERY_MAX_TICKETS} Lose pro Woche (du hast ${mine})` });
  const bal = addCoins(ident.id, ident.name, -count * LOTTERY_TICKET_PRICE, 'lottery:ticket', { week: wk, count });
  if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });
  const ins = db.prepare('INSERT INTO lottery_tickets (week, discord_id, username) VALUES (?, ?, ?)');
  for (let i = 0; i < count; i++) ins.run(wk, ident.id, ident.name);
  res.json({ ok: true, balance: bal, myTickets: mine + count });
});

function drawLottery() {
  const wk = weekKey();
  if (db.prepare('SELECT 1 FROM lottery_draws WHERE week = ?').get(wk)) return;
  const tickets = db.prepare('SELECT discord_id, username FROM lottery_tickets WHERE week = ?').all(wk);
  if (!tickets.length) {
    db.prepare('INSERT INTO lottery_draws (week, pot, tickets_total) VALUES (?, 0, 0)').run(wk);
    console.log(`[Lotterie] ${wk}: keine Lose verkauft`);
    return;
  }
  const winner = tickets[crypto.randomInt(tickets.length)];
  const pot = tickets.length * LOTTERY_TICKET_PRICE;
  addCoins(winner.discord_id, winner.username, pot, 'lottery:win', { week: wk });
  db.prepare('INSERT INTO lottery_draws (week, winner_discord_id, winner_username, pot, tickets_total) VALUES (?, ?, ?, ?, ?)')
    .run(wk, winner.discord_id, winner.username, pot, tickets.length);
  const winnerTickets = tickets.filter(t => t.discord_id === winner.discord_id).length;
  const players = new Set(tickets.map(t => t.discord_id)).size;
  queueNotification('lottery', winner.discord_id, {
    username: winner.username, pot, week: wk,
    tickets: winnerTickets, totalTickets: tickets.length, players,
  });
  sseEmit('lottery', { week: wk });
  console.log(`[Lotterie] ${wk}: ${winner.username} gewinnt ${pot} Coins (${tickets.length} Lose, ${players} Spieler)`);
}

// Sonntag 19:00 Berliner Zeit — Lotterie ziehen (vor der Turnier-Auswertung um 20:00)
cron.schedule('0 19 * * 0', drawLottery, { timezone: 'Europe/Berlin' });

// ════════════════════════════════════════════════════════════════
//  ADMIN-STATISTIK — Wochendaten für Diagramme
// ════════════════════════════════════════════════════════════════
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  // Gruppierung nach Wochen-Montag der letzten 12 Wochen
  const exams = db.prepare(`
    SELECT date(registered_at, 'weekday 0', '-6 days') AS wk, COUNT(*) AS c, COALESCE(SUM(passed), 0) AS p
    FROM registry WHERE registered_at >= datetime('now', '-84 days')
    GROUP BY wk ORDER BY wk
  `).all();
  const ic = db.prepare(`
    SELECT date(date, 'weekday 0', '-6 days') AS wk, ROUND(SUM(hours), 1) AS h
    FROM ic_log WHERE date >= date('now', '-84 days')
    GROUP BY wk ORDER BY wk
  `).all();
  const coins = db.prepare(`
    SELECT date(created_at, 'weekday 0', '-6 days') AS wk,
           SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS earned,
           SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS spent
    FROM coin_transactions WHERE created_at >= datetime('now', '-84 days')
    GROUP BY wk ORDER BY wk
  `).all();
  // Beliebteste Spiele (nach Spielrunden mit Coin-Gutschrift, letzte 12 Wochen)
  const games = db.prepare(`
    SELECT substr(reason, 6) AS game, COUNT(*) AS plays, SUM(amount) AS coins
    FROM coin_transactions
    WHERE reason LIKE 'game:%' AND created_at >= datetime('now', '-84 days')
    GROUP BY reason ORDER BY plays DESC LIMIT 10
  `).all();
  // Aktive Spieler pro Woche (mind. 1 Coin-Transaktion)
  const activePlayers = db.prepare(`
    SELECT date(created_at, 'weekday 0', '-6 days') AS wk, COUNT(DISTINCT discord_id) AS c
    FROM coin_transactions WHERE created_at >= datetime('now', '-84 days')
    GROUP BY wk ORDER BY wk
  `).all();
  // Tagesbonus-Abholungen pro Woche (Engagement-Indikator)
  const dailyClaims = db.prepare(`
    SELECT date(created_at, 'weekday 0', '-6 days') AS wk, COUNT(*) AS c
    FROM coin_transactions WHERE reason = 'daily' AND created_at >= datetime('now', '-84 days')
    GROUP BY wk ORDER BY wk
  `).all();
  const topStreaks = db.prepare(`
    SELECT username, streak, best_streak FROM coin_balances
    WHERE best_streak > 0 ORDER BY best_streak DESC, streak DESC LIMIT 5
  `).all();
  const summary = {
    activeStaff:   db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_active = 1 AND role != 'citizen'").get().c,
    coinsInUmlauf: db.prepare('SELECT COALESCE(SUM(balance), 0) AS s FROM coin_balances').get().s,
    coinsTotal:    db.prepare('SELECT COALESCE(SUM(total_earned), 0) AS s FROM coin_balances').get().s,
    examsTotal:    db.prepare('SELECT COUNT(*) AS c FROM registry').get().c,
    activeWeek:    db.prepare("SELECT COUNT(DISTINCT discord_id) AS c FROM coin_transactions WHERE created_at >= datetime('now', '-7 days')").get().c,
    transfers7d:   db.prepare("SELECT COALESCE(SUM(-amount), 0) AS s FROM coin_transactions WHERE reason = 'transfer:out' AND created_at >= datetime('now', '-7 days')").get().s,
  };
  res.json({ exams, ic, coins, games, activePlayers, dailyClaims, topStreaks, summary });
});

// ════════════════════════════════════════════════════════════════
//  QUIZ-DUELL — 1v1 live (nur Mitarbeiter)
// ════════════════════════════════════════════════════════════════
const DUEL_QUESTIONS  = 8;
const DUEL_TIME_MS    = 15000;
const DUEL_COINS_WIN  = 150, DUEL_COINS_LOSS = 25, DUEL_COINS_DRAW = 75;
const DUEL_EMOTES     = ['😏', '🔥', '💀', '😂', '👏', '😱'];

function duelByCode(code) {
  return db.prepare('SELECT * FROM quiz_duels WHERE code = ?').get(String(code || '').toUpperCase());
}
function myActiveDuel(did) {
  return db.prepare(`SELECT * FROM quiz_duels WHERE (host_did = ? OR guest_did = ?) AND status IN ('waiting','active') ORDER BY id DESC LIMIT 1`).get(did, did);
}

function finishDuel(d) {
  const winnerDid = d.host_score > d.guest_score ? d.host_did : d.guest_score > d.host_score ? d.guest_did : null;
  db.prepare(`UPDATE quiz_duels SET status = 'done', winner_did = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`).run(winnerDid, d.id);
  if (d.guest_did) {
    if (!winnerDid) {
      addCoins(d.host_did,  d.host_name,  DUEL_COINS_DRAW, 'duel:draw', { code: d.code });
      addCoins(d.guest_did, d.guest_name, DUEL_COINS_DRAW, 'duel:draw', { code: d.code });
    } else {
      const loserDid  = winnerDid === d.host_did ? d.guest_did  : d.host_did;
      const winName   = winnerDid === d.host_did ? d.host_name  : d.guest_name;
      const loseName  = winnerDid === d.host_did ? d.guest_name : d.host_name;
      addCoins(winnerDid, winName,  DUEL_COINS_WIN,  'duel:win',  { code: d.code });
      addCoins(loserDid,  loseName, DUEL_COINS_LOSS, 'duel:loss', { code: d.code });
      // Saison-Pass: Quest „Duell gewinnen" + XP für den Sieger
      try { seasonIncQuest(winnerDid, 'duel_win', 1); addSeasonXp(winnerDid, winName, 30); } catch {}
    }
    // Gaming-Achievements für beide Teilnehmer (sofern Mitarbeiter)
    for (const did of [d.host_did, d.guest_did]) {
      const u = db.prepare('SELECT id FROM users WHERE discord_id = ?').get(did);
      if (u) checkGameBadges(u.id, did);
    }
  }
  sseEmit('duel', { code: d.code, action: 'done' });
  if (d.bracket_id) advanceBracket(d);
}

// Lobby: offene Duelle + mein laufendes Duell (Mitarbeiter UND Bürger)
app.get('/api/duels', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const open = db.prepare(`
    SELECT code, created_at, host_name AS username, host_avatar AS avatar, host_did AS discord_id
    FROM quiz_duels WHERE status = 'waiting' ORDER BY id DESC LIMIT 20
  `).all();
  const mine = myActiveDuel(ident.id);
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN winner_did = ? THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN winner_did IS NOT NULL AND winner_did != ? THEN 1 ELSE 0 END) AS losses
    FROM quiz_duels WHERE status = 'done' AND (host_did = ? OR guest_did = ?)
  `).get(ident.id, ident.id, ident.id, ident.id);
  res.json({ open, myDuel: mine ? { code: mine.code, status: mine.status } : null, stats: { wins: stats?.wins || 0, losses: stats?.losses || 0 } });
});

app.post('/api/duels', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (rateLimit(`duel:${ident.id}`, 10, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
  const existing = myActiveDuel(ident.id);
  if (existing) return res.json({ ok: true, code: existing.code });
  const qs = db.prepare(`SELECT id FROM exam_questions WHERE is_active = 1 ORDER BY RANDOM() LIMIT ?`).all(DUEL_QUESTIONS);
  if (qs.length < DUEL_QUESTIONS) return res.status(400).json({ error: 'Zu wenige Fragen in der Datenbank' });
  const code = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
  db.prepare('INSERT INTO quiz_duels (code, host_did, host_name, host_avatar, question_ids) VALUES (?, ?, ?, ?, ?)')
    .run(code, ident.id, ident.name, ident.user?.avatar || null, JSON.stringify(qs.map(q => q.id)));
  sseEmit('duel', { code, action: 'open' });
  res.json({ ok: true, code });
});

app.post('/api/duels/:code/cancel', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const d = duelByCode(req.params.code);
  if (!d || d.host_did !== ident.id || d.status !== 'waiting') return res.status(400).json({ error: 'Nicht möglich' });
  db.prepare('DELETE FROM quiz_duels WHERE id = ?').run(d.id);
  sseEmit('duel', { code: d.code, action: 'open' });
  res.json({ ok: true });
});

app.post('/api/duels/:code/join', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const d = duelByCode(req.params.code);
  if (!d) return res.status(404).json({ error: 'Duell nicht gefunden' });
  if (d.status !== 'waiting') return res.status(400).json({ error: 'Duell läuft bereits' });
  if (d.host_did === ident.id) return res.status(400).json({ error: 'Du kannst nicht gegen dich selbst spielen' });
  if (myActiveDuel(ident.id)) return res.status(400).json({ error: 'Du bist bereits in einem Duell' });
  db.prepare(`UPDATE quiz_duels SET guest_did = ?, guest_name = ?, guest_avatar = ?, status = 'active', started_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(ident.id, ident.name, ident.user?.avatar || null, d.id);
  sseEmit('duel', { code: d.code, action: 'start' });
  res.json({ ok: true, code: d.code });
});

app.get('/api/duels/:code/state', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  let d = duelByCode(req.params.code);
  if (!d) return res.status(404).json({ error: 'Duell nicht gefunden' });
  const isParticipant = d.host_did === ident.id || d.guest_did === ident.id;
  if (!isParticipant && d.status === 'active') return res.status(403).json({ error: 'Kein Zugriff' });
  // Auto-Timeout: aktives Duell älter als 6 Minuten wird ausgewertet
  if (d.status === 'active' && d.started_at) {
    const ageMs = Date.now() - new Date(d.started_at.replace(' ', 'T') + 'Z').getTime();
    if (ageMs > 6 * 60 * 1000) { finishDuel(d); d = duelByCode(req.params.code); }
  }
  const isHost  = d.host_did === ident.id;
  const myAns   = isParticipant ? JSON.parse(isHost ? d.host_answers : d.guest_answers) : [];
  const oppAns  = isParticipant ? JSON.parse(isHost ? d.guest_answers : d.host_answers) : [];
  const qIds    = JSON.parse(d.question_ids);
  let question  = null;
  if (d.status === 'active' && isParticipant && myAns.length < qIds.length) {
    const q = db.prepare('SELECT id, question, option_a, option_b, option_c, option_d FROM exam_questions WHERE id = ?').get(qIds[myAns.length]);
    if (q) question = {
      idx: myAns.length,
      question: q.question,
      options: [q.option_a, q.option_b, q.option_c, q.option_d].filter(o => o && o.trim() !== ''),
    };
  }
  let result = null;
  if (d.status === 'done' && isParticipant)
    result = !d.winner_did ? 'draw' : d.winner_did === ident.id ? 'win' : 'loss';
  const hasEmotes = !!db.prepare('SELECT 1 FROM shop_purchases WHERE discord_id = ? AND item_id = ?').get(ident.id, 'emotes_pack');
  res.json({
    code: d.code, status: d.status, isHost,
    emotes: hasEmotes, emoteList: DUEL_EMOTES,
    host:  { username: d.host_name, avatar: d.host_avatar, discord_id: d.host_did },
    guest: d.guest_did ? { username: d.guest_name, avatar: d.guest_avatar, discord_id: d.guest_did } : null,
    total: qIds.length,
    myIdx: myAns.length, oppIdx: oppAns.length,
    myScore:  isHost ? d.host_score : d.guest_score,
    oppScore: isHost ? d.guest_score : d.host_score,
    myAnswers: myAns,
    question,
    timeMs: DUEL_TIME_MS,
    result,
    coins: { win: DUEL_COINS_WIN, loss: DUEL_COINS_LOSS, draw: DUEL_COINS_DRAW },
  });
});

// Emote an den Gegner senden (benötigt gekauftes Emote-Pack)
app.post('/api/duels/:code/emote', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const d = duelByCode(req.params.code);
  if (!d || d.status !== 'active') return res.status(400).json({ error: 'Duell nicht aktiv' });
  if (d.host_did !== ident.id && d.guest_did !== ident.id) return res.status(403).json({ error: 'Kein Zugriff' });
  if (!db.prepare('SELECT 1 FROM shop_purchases WHERE discord_id = ? AND item_id = ?').get(ident.id, 'emotes_pack'))
    return res.status(403).json({ error: 'Duell-Emotes gibt es im Coin-Shop' });
  const emote = String(req.body.emote || '');
  if (!DUEL_EMOTES.includes(emote)) return res.status(400).json({ error: 'Ungültiges Emote' });
  if (rateLimit(`emote:${ident.id}`, 10, 30_000)) return res.status(429).json({ error: 'Langsam!' });
  sseEmit('duel', { code: d.code, action: 'emote', emote, from: ident.name, fromDid: ident.id });
  res.json({ ok: true });
});

app.post('/api/duels/:code/answer', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const d = duelByCode(req.params.code);
  if (!d || d.status !== 'active') return res.status(400).json({ error: 'Duell nicht aktiv' });
  if (d.host_did !== ident.id && d.guest_did !== ident.id) return res.status(403).json({ error: 'Kein Zugriff' });
  const isHost = d.host_did === ident.id;
  const ansCol = isHost ? 'host_answers' : 'guest_answers';
  const scCol  = isHost ? 'host_score'   : 'guest_score';
  const myAns  = JSON.parse(isHost ? d.host_answers : d.guest_answers);
  const qIds   = JSON.parse(d.question_ids);
  if (myAns.length >= qIds.length) return res.status(400).json({ error: 'Schon alle beantwortet' });

  const q = db.prepare('SELECT * FROM exam_questions WHERE id = ?').get(qIds[myAns.length]);
  const answer = Number.isInteger(req.body.answer) ? req.body.answer : -1; // -1 = Zeit abgelaufen
  const ms = Math.max(0, Math.min(DUEL_TIME_MS, +req.body.ms || DUEL_TIME_MS));
  const correct = q && answer === q.correct_answer;
  const points = correct ? 100 + Math.round(50 * (DUEL_TIME_MS - ms) / DUEL_TIME_MS) : 0;

  myAns.push({ a: answer, correct: !!correct, pts: points });
  db.prepare(`UPDATE quiz_duels SET ${ansCol} = ?, ${scCol} = ${scCol} + ? WHERE id = ?`).run(JSON.stringify(myAns), points, d.id);

  const updated = duelByCode(d.code);
  const hostDone  = JSON.parse(updated.host_answers).length  >= qIds.length;
  const guestDone = JSON.parse(updated.guest_answers).length >= qIds.length;
  if (hostDone && guestDone) finishDuel(updated);
  else sseEmit('duel', { code: d.code, action: 'progress' });

  res.json({ ok: true, correct: !!correct, points, correctAnswer: q?.correct_answer });
});

// ════════════════════════════════════════════════════════════════
//  DUELL-TURNIER — 8 Spieler, K.o.-Bracket, Einsatz 100 → Pot 800
// ════════════════════════════════════════════════════════════════
const BRACKET_SIZE = 8;
const BRACKET_FEE  = 100;

function currentBracket() {
  return db.prepare(`SELECT * FROM duel_brackets WHERE status != 'done' ORDER BY id DESC LIMIT 1`).get();
}
function bracketPlayers(bid) {
  return db.prepare('SELECT * FROM duel_bracket_players WHERE bracket_id = ? ORDER BY rowid').all(bid);
}

function bracketCreateMatch(bid, round, matchIdx, p1, p2) {
  const qs = db.prepare('SELECT id FROM exam_questions WHERE is_active = 1 ORDER BY RANDOM() LIMIT ?').all(DUEL_QUESTIONS);
  const code = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
  db.prepare(`
    INSERT INTO quiz_duels (code, host_did, host_name, host_avatar, guest_did, guest_name, guest_avatar,
      question_ids, status, started_at, bracket_id, bracket_round, bracket_match)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, ?, ?, ?)
  `).run(code, p1.discord_id, p1.username, p1.avatar, p2.discord_id, p2.username, p2.avatar,
    JSON.stringify(qs.map(q => q.id)), bid, round, matchIdx);
  return code;
}

function startBracket(bid) {
  const players = bracketPlayers(bid);
  for (let i = players.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [players[i], players[j]] = [players[j], players[i]];
  }
  for (let m = 0; m < BRACKET_SIZE / 2; m++) bracketCreateMatch(bid, 1, m, players[m * 2], players[m * 2 + 1]);
  db.prepare(`UPDATE duel_brackets SET status = 'running' WHERE id = ?`).run(bid);
  const b = db.prepare('SELECT pot FROM duel_brackets WHERE id = ?').get(bid);
  queueNotification('bracket', null, { action: 'start', players: players.map(p => p.username), pot: b.pot });
  sseEmit('bracket', { action: 'start' });
  sseEmit('duel', { code: '', action: 'start' }); // Teilnehmer landen direkt im Match
  console.log(`[Bracket] Turnier #${bid} gestartet (${players.length} Spieler, Pot ${b.pot})`);
}

function advanceBracket(d) {
  // Gewinner sicherstellen — bei Gleichstand entscheidet das Los
  let winnerDid = db.prepare('SELECT winner_did FROM quiz_duels WHERE id = ?').get(d.id).winner_did;
  if (!winnerDid) {
    winnerDid = crypto.randomInt(2) === 0 ? d.host_did : d.guest_did;
    db.prepare('UPDATE quiz_duels SET winner_did = ? WHERE id = ?').run(winnerDid, d.id);
  }
  const loserDid = winnerDid === d.host_did ? d.guest_did : d.host_did;
  db.prepare('UPDATE duel_bracket_players SET eliminated_round = ? WHERE bracket_id = ? AND discord_id = ?')
    .run(d.bracket_round, d.bracket_id, loserDid);

  const openMatches = db.prepare(`SELECT COUNT(*) AS c FROM quiz_duels WHERE bracket_id = ? AND bracket_round = ? AND status != 'done'`)
    .get(d.bracket_id, d.bracket_round).c;
  if (openMatches > 0) { sseEmit('bracket', { action: 'progress' }); return; }

  const winners = db.prepare(`SELECT winner_did FROM quiz_duels WHERE bracket_id = ? AND bracket_round = ? ORDER BY bracket_match`)
    .all(d.bracket_id, d.bracket_round)
    .map(r => db.prepare('SELECT * FROM duel_bracket_players WHERE bracket_id = ? AND discord_id = ?').get(d.bracket_id, r.winner_did))
    .filter(Boolean);

  if (winners.length === 1) {
    // Finale entschieden → Auszahlung 75 % / 25 %
    const b = db.prepare('SELECT * FROM duel_brackets WHERE id = ?').get(d.bracket_id);
    const w = winners[0];
    const runner = db.prepare('SELECT * FROM duel_bracket_players WHERE bracket_id = ? AND discord_id = ?').get(d.bracket_id, loserDid);
    const wPrize = Math.round(b.pot * 0.75);
    const rPrize = b.pot - wPrize;
    addCoins(w.discord_id, w.username, wPrize, 'bracket:win', { bracket: b.id });
    if (runner) addCoins(runner.discord_id, runner.username, rPrize, 'bracket:second', { bracket: b.id });
    db.prepare(`UPDATE duel_brackets SET status = 'done', winner_did = ?, winner_name = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(w.discord_id, w.username, b.id);
    queueNotification('bracket', w.discord_id, {
      action: 'done', username: w.username, runner: runner?.username || null,
      pot: b.pot, prize: wPrize, prize2: rPrize,
    });
    sseEmit('bracket', { action: 'done' });
    console.log(`[Bracket] Turnier #${b.id}: ${w.username} gewinnt ${wPrize} Coins`);
    return;
  }

  // Nächste Runde erzeugen
  for (let m = 0; m < winners.length / 2; m++)
    bracketCreateMatch(d.bracket_id, d.bracket_round + 1, m, winners[m * 2], winners[m * 2 + 1]);
  sseEmit('bracket', { action: 'round' });
  sseEmit('duel', { code: '', action: 'start' });
}

app.get('/api/bracket', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const last = db.prepare(`SELECT winner_name, pot FROM duel_brackets WHERE status = 'done' ORDER BY id DESC LIMIT 1`).get() || null;
  const b = currentBracket();
  if (!b) return res.json({ bracket: null, fee: BRACKET_FEE, size: BRACKET_SIZE, lastWinner: last });
  const players = bracketPlayers(b.id);
  const matches = db.prepare(`
    SELECT code, status, host_did, host_name, guest_did, guest_name, host_score, guest_score, winner_did, bracket_round, bracket_match
    FROM quiz_duels WHERE bracket_id = ? ORDER BY bracket_round, bracket_match
  `).all(b.id);
  res.json({
    bracket: { id: b.id, status: b.status, pot: b.pot, fee: BRACKET_FEE, size: BRACKET_SIZE },
    players, matches,
    joined: players.some(p => p.discord_id === ident.id),
    lastWinner: last,
  });
});

app.post('/api/bracket/join', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (rateLimit(`bracket:${ident.id}`, 10, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });
  let b = currentBracket();
  if (b && b.status === 'running') return res.status(400).json({ error: 'Das Turnier läuft bereits' });
  if (myActiveDuel(ident.id)) return res.status(400).json({ error: 'Du bist gerade in einem Duell' });
  if (!b) {
    const r = db.prepare(`INSERT INTO duel_brackets (status, entry_fee) VALUES ('open', ?)`).run(BRACKET_FEE);
    b = db.prepare('SELECT * FROM duel_brackets WHERE id = ?').get(r.lastInsertRowid);
  }
  if (db.prepare('SELECT 1 FROM duel_bracket_players WHERE bracket_id = ? AND discord_id = ?').get(b.id, ident.id))
    return res.status(400).json({ error: 'Du bist schon angemeldet' });
  const bal = addCoins(ident.id, ident.name, -BRACKET_FEE, 'bracket:fee', { bracket: b.id });
  if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });
  db.prepare('INSERT INTO duel_bracket_players (bracket_id, discord_id, username, avatar) VALUES (?, ?, ?, ?)')
    .run(b.id, ident.id, ident.name, ident.user?.avatar || null);
  db.prepare('UPDATE duel_brackets SET pot = pot + ? WHERE id = ?').run(BRACKET_FEE, b.id);
  sseEmit('bracket', { action: 'join' });
  if (bracketPlayers(b.id).length >= BRACKET_SIZE) startBracket(b.id);
  res.json({ ok: true, balance: bal });
});

app.post('/api/bracket/leave', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const b = currentBracket();
  if (!b || b.status !== 'open') return res.status(400).json({ error: 'Abmelden nicht mehr möglich' });
  const row = db.prepare('SELECT 1 FROM duel_bracket_players WHERE bracket_id = ? AND discord_id = ?').get(b.id, ident.id);
  if (!row) return res.status(400).json({ error: 'Du bist nicht angemeldet' });
  db.prepare('DELETE FROM duel_bracket_players WHERE bracket_id = ? AND discord_id = ?').run(b.id, ident.id);
  db.prepare('UPDATE duel_brackets SET pot = pot - ? WHERE id = ?').run(BRACKET_FEE, b.id);
  addCoins(ident.id, ident.name, BRACKET_FEE, 'bracket:refund', { bracket: b.id });
  if (!bracketPlayers(b.id).length) db.prepare('DELETE FROM duel_brackets WHERE id = ?').run(b.id);
  sseEmit('bracket', { action: 'leave' });
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  ONBOARDING-CHECKLISTE für neue Mitarbeiter
// ════════════════════════════════════════════════════════════════
const ONBOARDING_ITEMS = [
  { id: 'regelwerk',   label: 'Regelwerk & StVO gelesen' },
  { id: 'discord',     label: 'Discord-Rollen & Kanäle eingerichtet' },
  { id: 'funk',        label: 'Funk-Einweisung erhalten' },
  { id: 'hq_tour',     label: 'HQ-Tour (Werkstatt, Foyer, Abschlepphof)' },
  { id: 'dispatch',    label: 'Dispatch-System erklärt bekommen' },
  { id: 'erste_fahrt', label: 'Erste Abschleppfahrt begleitet' },
  { id: 'kunde',       label: 'Kundengespräch begleitet' },
  { id: 'doku',        label: 'Dokumentation & Beweisfotos geübt' },
  { id: 'probe',       label: 'Probeprüfung Theorie bestanden' },
  { id: 'geselle',     label: 'Zur Gesellenprüfung angemeldet' },
];

function onboardingFor(userId) {
  const done = new Map(db.prepare(`
    SELECT op.item_id, op.done_at, u.username AS done_by_name
    FROM onboarding_progress op LEFT JOIN users u ON u.id = op.done_by
    WHERE op.user_id = ?
  `).all(userId).map(r => [r.item_id, r]));
  return ONBOARDING_ITEMS.map(it => ({
    ...it,
    done:       done.has(it.id),
    doneAt:     done.get(it.id)?.done_at || null,
    doneByName: done.get(it.id)?.done_by_name || null,
  }));
}

// Eigener Fortschritt (Dashboard-Karte für neue Mitarbeiter)
app.get('/api/onboarding/mine', requireAuth, (req, res) => {
  const u = getUser(req);
  const items = onboardingFor(u.id);
  const doneCount = items.filter(i => i.done).length;
  const ageDays = (Date.now() - new Date(u.created_at.replace(' ', 'T') + 'Z').getTime()) / 86400000;
  res.json({
    items, done: doneCount, total: items.length,
    // Karte zeigen: solange nicht fertig UND (schon begonnen ODER frisch dabei)
    show: doneCount < items.length && (doneCount > 0 || ageDays < 45),
  });
});

// Übersicht aller Mitarbeiter (für Ausbilder)
app.get('/api/onboarding', requireAusbilder, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.discord_id, u.rank, u.created_at,
      (SELECT COUNT(*) FROM onboarding_progress op WHERE op.user_id = u.id) AS done
    FROM users u WHERE u.is_active = 1 AND u.role != 'citizen'
    ORDER BY done ASC, u.created_at DESC
  `).all();
  res.json({ users, total: ONBOARDING_ITEMS.length });
});

app.get('/api/onboarding/:userId', requireAusbilder, (req, res) => {
  const u = db.prepare('SELECT id, username FROM users WHERE id = ?').get(+req.params.userId);
  if (!u) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ user: u, items: onboardingFor(u.id), total: ONBOARDING_ITEMS.length });
});

app.post('/api/onboarding/:userId/toggle', requireAusbilder, (req, res) => {
  const me = getUser(req);
  const userId = +req.params.userId;
  const item = ONBOARDING_ITEMS.find(i => i.id === req.body.item);
  if (!item) return res.status(400).json({ error: 'Unbekannter Punkt' });
  const exists = db.prepare('SELECT 1 FROM onboarding_progress WHERE user_id = ? AND item_id = ?').get(userId, item.id);
  if (exists) {
    db.prepare('DELETE FROM onboarding_progress WHERE user_id = ? AND item_id = ?').run(userId, item.id);
  } else {
    db.prepare('INSERT INTO onboarding_progress (user_id, item_id, done_by) VALUES (?, ?, ?)').run(userId, item.id, me.id);
  }
  res.json({ ok: true, done: !exists });
});

// Hängende aktive Duelle (auch Bracket-Matches) nach 6 Minuten auswerten
cron.schedule('* * * * *', () => {
  const stale = db.prepare(`SELECT * FROM quiz_duels WHERE status = 'active' AND started_at <= datetime('now', '-6 minutes')`).all();
  for (const d of stale) {
    try { finishDuel(d); } catch (e) { console.error('[Duell] Timeout-Auswertung:', e.message); }
  }
});

// ════════════════════════════════════════════════════════════════
//  BLACKJACK — serverseitig, Einsatz in ACLS-Coins
// ════════════════════════════════════════════════════════════════
const bjGames = new Map(); // discordId -> aktive Hand

// Bei Server-Neustart gingen laufende Hände (RAM) verloren →
// vermerkte Einsätze automatisch erstatten
{
  const pending = db.prepare('SELECT * FROM blackjack_pending').all();
  for (const p of pending) {
    addCoins(p.discord_id, p.username, p.bet, 'blackjack:refund', { reason: 'Server-Neustart' });
    console.log(`[Blackjack] Einsatz erstattet nach Neustart: ${p.username} +${p.bet}`);
  }
  if (pending.length) db.prepare('DELETE FROM blackjack_pending').run();
}

function bjShuffledDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function bjValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 'A') { total += 11; aces++; }
    else if (['J','Q','K'].includes(c.r)) total += 10;
    else total += +c.r;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function bjPublic(g, done) {
  const base = {
    bet: g.bet, doubled: g.doubled,
    dealer: done ? g.dealer : [g.dealer[0], { r: '?', s: '?' }],
    dealerVal: done ? bjValue(g.dealer) : null,
    done: !!done,
  };
  if (g.split) {
    const ai = Math.min(g.split.active, 1);
    return { ...base, split: true, activeSplit: g.split.active, hands: g.split.hands, handVals: g.split.hands.map(bjValue), bets: g.split.bets, player: g.split.hands[ai], playerVal: bjValue(g.split.hands[ai]) };
  }
  return { ...base, player: g.player, playerVal: bjValue(g.player) };
}
// Dealer zieht bis 17, dann auswerten. Gibt {result, payout} zurück.
function bjResolve(g, ident) {
  if (bjValue(g.player) <= 21) {
    while (bjValue(g.dealer) < 17) g.dealer.push(g.deck.pop());
  }
  const pv = bjValue(g.player), dv = bjValue(g.dealer);
  let payout = 0, result;
  if (pv > 21)                  result = 'bust';
  else if (dv > 21 || pv > dv)  { result = 'win';  payout = g.bet * 2; }
  else if (pv === dv)           { result = 'push'; payout = g.bet; }
  else                          result = 'loss';
  if (g.natural && result === 'win') payout = Math.floor(g.bet * 2.5);
  if (payout > 0) addCoins(ident.id, ident.name, payout, 'blackjack:' + result, { bet: g.bet });
  bjGames.delete(ident.id);
  db.prepare('DELETE FROM blackjack_pending WHERE discord_id = ?').run(ident.id);
  if (ident.user) checkGameBadges(ident.user.id, ident.id);
  // Größter Netto-Gewinn als Highscore
  const net = payout - g.bet;
  if (net > 0) {
    if (ident.user) {
      db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'blackjack', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, game) DO UPDATE SET
          score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END
      `).run(ident.user.id, net);
    } else {
      db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'blackjack', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(discord_id, game) DO UPDATE SET
          score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
          username = excluded.username
      `).run(ident.id, ident.name, net);
    }
  }
  return { result, payout };
}

function resolveSplit(g, ident) {
  const anyAlive = g.split.results.some(r => r !== 'bust');
  if (anyAlive) while (bjValue(g.dealer) < 17) g.dealer.push(g.deck.pop());
  const dv = bjValue(g.dealer);
  let totalPayout = 0;
  const splitResults = g.split.hands.map((hand, i) => {
    if (g.split.results[i] === 'bust') return { result: 'bust', payout: 0 };
    const pv = bjValue(hand);
    let payout = 0, result;
    if      (pv > 21)            { result = 'bust';  payout = 0; }
    else if (dv > 21 || pv > dv) { result = 'win';   payout = g.split.bets[i] * 2; }
    else if (pv === dv)          { result = 'push';  payout = g.split.bets[i]; }
    else                         { result = 'loss';  payout = 0; }
    totalPayout += payout;
    return { result, payout };
  });
  if (totalPayout > 0) addCoins(ident.id, ident.name, totalPayout, 'blackjack:split_result', { splitResults });
  bjGames.delete(ident.id);
  db.prepare('DELETE FROM blackjack_pending WHERE discord_id = ?').run(ident.id);
  if (ident.user) checkGameBadges(ident.user.id, ident.id);
  const net = totalPayout - g.bet * 2;
  if (net > 0) {
    if (ident.user) {
      db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'blackjack', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, game) DO UPDATE SET
          score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END
      `).run(ident.user.id, net);
    } else {
      db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'blackjack', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(discord_id, game) DO UPDATE SET
          score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
          username = excluded.username
      `).run(ident.id, ident.name, net);
    }
  }
  return splitResults;
}

app.get('/api/blackjack/state', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const row = db.prepare('SELECT balance, equipped_deck FROM coin_balances WHERE discord_id = ?').get(ident.id);
  const g = bjGames.get(ident.id);
  res.json({ balance: row?.balance ?? 0, hand: g ? bjPublic(g, false) : null, username: ident.name, deck: row?.equipped_deck || null });
});

app.post('/api/blackjack/start', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (rateLimit(`bj:${ident.id}`, 30, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
  if (bjGames.has(ident.id)) return res.status(400).json({ error: 'Hand läuft bereits' });
  const bet = Math.floor(+req.body.bet || 0);
  if (bet < 10 || bet > 1000) return res.status(400).json({ error: 'Einsatz: 10 bis 1000 Coins' });
  const bal = addCoins(ident.id, ident.name, -bet, 'blackjack:bet');
  if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });

  const deck = bjShuffledDeck();
  const g = { deck, bet, doubled: false, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], natural: false };
  bjGames.set(ident.id, g);
  db.prepare('INSERT OR REPLACE INTO blackjack_pending (discord_id, username, bet) VALUES (?, ?, ?)').run(ident.id, ident.name, bet);

  // Natural Blackjack → sofort auswerten
  if (bjValue(g.player) === 21) {
    g.natural = true;
    const { result, payout } = bjResolve(g, ident);
    const newBal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    return res.json({ hand: bjPublic(g, true), result, payout, balance: newBal });
  }
  res.json({ hand: bjPublic(g, false), balance: bal });
});

app.post('/api/blackjack/hit', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const g = bjGames.get(ident.id);
  if (!g) return res.status(400).json({ error: 'Keine aktive Hand' });
  if (g.split) {
    const hand = g.split.hands[g.split.active];
    hand.push(g.deck.pop());
    if (bjValue(hand) > 21) {
      g.split.results[g.split.active] = 'bust';
      if (g.split.active === 0) { g.split.active = 1; return res.json({ hand: bjPublic(g, false) }); }
      const splitResults = resolveSplit(g, ident);
      const pub = bjPublic(g, true);
      const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
      return res.json({ hand: pub, splitResults, payout: splitResults.reduce((s,r) => s+r.payout, 0), balance: bal });
    }
    return res.json({ hand: bjPublic(g, false) });
  }
  g.player.push(g.deck.pop());
  if (bjValue(g.player) > 21) {
    const { result, payout } = bjResolve(g, ident);
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    return res.json({ hand: bjPublic(g, true), result, payout, balance: bal });
  }
  res.json({ hand: bjPublic(g, false) });
});

app.post('/api/blackjack/double', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const g = bjGames.get(ident.id);
  if (!g) return res.status(400).json({ error: 'Keine aktive Hand' });
  if (g.split) return res.status(400).json({ error: 'Verdoppeln beim Split nicht möglich' });
  if (g.player.length !== 2) return res.status(400).json({ error: 'Verdoppeln nur als erster Zug' });
  const extra = addCoins(ident.id, ident.name, -g.bet, 'blackjack:double');
  if (extra === null) return res.status(400).json({ error: 'Nicht genug Coins zum Verdoppeln' });
  g.bet *= 2; g.doubled = true;
  db.prepare('UPDATE blackjack_pending SET bet = ? WHERE discord_id = ?').run(g.bet, ident.id);
  g.player.push(g.deck.pop());
  const { result, payout } = bjResolve(g, ident);
  const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
  res.json({ hand: bjPublic(g, true), result, payout, balance: bal });
});

app.post('/api/blackjack/stand', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const g = bjGames.get(ident.id);
  if (!g) return res.status(400).json({ error: 'Keine aktive Hand' });
  if (g.split) {
    if (g.split.active === 0) { g.split.active = 1; return res.json({ hand: bjPublic(g, false) }); }
    const splitResults = resolveSplit(g, ident);
    const pub = bjPublic(g, true);
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    return res.json({ hand: pub, splitResults, payout: splitResults.reduce((s,r) => s+r.payout, 0), balance: bal });
  }
  const { result, payout } = bjResolve(g, ident);
  const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
  res.json({ hand: bjPublic(g, true), result, payout, balance: bal });
});

app.post('/api/blackjack/split', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const g = bjGames.get(ident.id);
  if (!g) return res.status(400).json({ error: 'Keine aktive Hand' });
  if (g.split) return res.status(400).json({ error: 'Bereits gesplittet' });
  if (g.player.length !== 2) return res.status(400).json({ error: 'Split nur mit 2 Karten möglich' });
  if (g.player[0].r !== g.player[1].r) return res.status(400).json({ error: 'Split nur bei gleichen Karten' });
  const bal = addCoins(ident.id, ident.name, -g.bet, 'blackjack:split', { originalBet: g.bet });
  if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins zum Splitten' });
  g.split = {
    hands: [[g.player[0], g.deck.pop()], [g.player[1], g.deck.pop()]],
    bets: [g.bet, g.bet],
    active: 0,
    results: [null, null],
  };
  db.prepare('UPDATE blackjack_pending SET bet = ? WHERE discord_id = ?').run(g.bet * 2, ident.id);
  res.json({ hand: bjPublic(g, false), balance: bal });
});

app.post('/api/blackjack/insurance', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const g = bjGames.get(ident.id);
  if (!g) return res.status(400).json({ error: 'Keine aktive Hand' });
  if (g.insurance !== undefined) return res.status(400).json({ error: 'Versicherung bereits entschieden' });
  if (g.player.length !== 2 || g.split) return res.status(400).json({ error: 'Versicherung nur als erster Zug' });
  if (g.dealer[0].r !== 'A') return res.status(400).json({ error: 'Versicherung nur bei Dealer-Ass' });
  const insAmt = Math.floor(g.bet / 2);
  if (insAmt < 1) return res.status(400).json({ error: 'Einsatz zu klein für Versicherung' });
  const balAfter = addCoins(ident.id, ident.name, -insAmt, 'blackjack:insurance:bet');
  if (balAfter === null) return res.status(400).json({ error: 'Nicht genug Coins für Versicherung' });
  g.insurance = insAmt;
  const dealerBJ = bjValue(g.dealer) === 21;
  if (dealerBJ) {
    addCoins(ident.id, ident.name, insAmt * 3, 'blackjack:insurance:win');
    const playerBJ = bjValue(g.player) === 21;
    if (playerBJ) addCoins(ident.id, ident.name, g.bet, 'blackjack:push', { bet: g.bet });
    bjGames.delete(ident.id);
    db.prepare('DELETE FROM blackjack_pending WHERE discord_id = ?').run(ident.id);
    if (ident.user) checkGameBadges(ident.user.id, ident.id);
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    return res.json({ hand: bjPublic(g, true), dealerBJ: true, insurance: 'win', insurancePayout: insAmt * 3, result: playerBJ ? 'push' : 'loss', payout: playerBJ ? g.bet : 0, balance: bal });
  }
  const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
  res.json({ hand: bjPublic(g, false), insurance: 'lost', balance: bal });
});

// ════════════════════════════════════════════════════════════════
//  ACLS Mega Spin — Tumble-Slot (server-autoritativ, Coin-Einsatz)
//  Spielmathematik in slot-engine.js (RTP ~95 %, per Monte-Carlo getunt).
//  Schutz: Max-Einsatz, Tages-Verlustlimit, harter Win-Cap, Rate-Limit, Krypto-RNG.
// ════════════════════════════════════════════════════════════════
const SLOT_MIN_BET          = 5;
const SLOT_MAX_BET          = 250;
const SLOT_FEATURE_MAX_BET  = 50;       // Feature-Kauf = 100× Einsatz → max 5000 Coins
const SLOT_DAILY_LOSS_LIMIT = 15000;     // Spielerschutz: max Netto-Verlust pro Tag
const SLOT_ABS_MAX_WIN      = 250000;   // harte Obergrenze pro Spin (Coin-Wirtschaft)

function slotDailyNet(did) {
  return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
    WHERE discord_id = ? AND reason LIKE 'slot:%' AND date(created_at) = date('now')`).get(did).s;
}

app.get('/api/slot/state', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
  const net = slotDailyNet(ident.id);
  res.json({
    balance: bal, username: ident.name,
    minBet: SLOT_MIN_BET, maxBet: SLOT_MAX_BET,
    featureCostMult: slotEngine.FEATURE_BUY_COST, featureMaxBet: SLOT_FEATURE_MAX_BET,
    dailyNet: net, dailyLossLimit: SLOT_DAILY_LOSS_LIMIT,
    lossLeft: Math.max(0, SLOT_DAILY_LOSS_LIMIT + Math.min(0, net)),
  });
});

app.post('/api/slot/spin', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (rateLimit(`slot:${ident.id}`, 90, 60_000)) return res.status(429).json({ error: 'Zu schnell – kurz durchatmen' });

  const buyFeature = !!req.body.buyFeature;
  const bet    = Math.floor(+req.body.bet || 0);
  const maxBet = buyFeature ? SLOT_FEATURE_MAX_BET : SLOT_MAX_BET;
  if (!Number.isInteger(bet) || bet < SLOT_MIN_BET || bet > maxBet)
    return res.status(400).json({ error: `Einsatz: ${SLOT_MIN_BET}–${maxBet} Coins${buyFeature ? ' (Feature-Kauf)' : ''}` });

  // Spielerschutz: Tages-Verlustlimit (Netto-Verlust heute)
  const netBefore = slotDailyNet(ident.id);
  if (netBefore <= -SLOT_DAILY_LOSS_LIMIT)
    return res.status(400).json({ error: `Tages-Verlustlimit erreicht (${SLOT_DAILY_LOSS_LIMIT} Coins). Spielerschutz – morgen geht's weiter.` });

  const cost = buyFeature ? bet * slotEngine.FEATURE_BUY_COST : bet;
  const balAfterBet = addCoins(ident.id, ident.name, -cost, 'slot:bet', { bet, feature: buyFeature });
  if (balAfterBet === null) return res.status(400).json({ error: 'Nicht genug Coins' });

  const result = slotEngine.spin({ bet, freeBuy: buyFeature, rng: (n) => crypto.randomInt(n) });
  const win = Math.min(result.totalWin, SLOT_ABS_MAX_WIN);
  let balance = balAfterBet;
  if (win > 0)
    balance = addCoins(ident.id, ident.name, win, 'slot:win', { bet, x: +(win / bet).toFixed(2), feature: buyFeature });

  // Highscore = größter Netto-Gewinn; Spiel-Badges
  const netWin = win - cost;
  if (netWin > 0) {
    if (ident.user) {
      db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'slot', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, game) DO UPDATE SET
          score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END`).run(ident.user.id, netWin);
      checkGameBadges(ident.user.id, ident.id);
    } else {
      db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'slot', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(discord_id, game) DO UPDATE SET
          score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
          username   = excluded.username`).run(ident.id, ident.name, netWin);
    }
  }
  try { seasonIncQuest(ident.id, 'games', 1); } catch {}

  res.json({
    ok: true, bet, cost, buyFeature,
    rounds: result.rounds, totalWin: win,
    capped: result.capped || win < result.totalWin,
    freeSpinsAwarded: result.freeSpinsAwarded, baseScatters: result.baseScatters,
    balance, dailyNet: slotDailyNet(ident.id),
  });
});

// ════════════════════════════════════════════════════════════════
//  PLINKO  (Kugel fällt durch Pegs, landet im Multiplikator-Bucket)
//  12 Reihen → 13 Buckets · Bucket = Anzahl Rechts-Bounces (binomial)
//  RTP ~95 % pro Risiko · server-seitige Krypto-RNG, Tages-Verlustlimit
// ════════════════════════════════════════════════════════════════
const PLINKO_MIN_BET          = 5;
const PLINKO_MAX_BET          = 250;
const PLINKO_DAILY_LOSS_LIMIT = 15000;
const PLINKO_ABS_MAX_WIN      = 250000;
const PLINKO_ROWS             = 12;
const PLINKO_TABLES = {
  low:    [8, 2.4, 1.4, 1.2, 1.08, 0.95, 0.6, 0.95, 1.08, 1.2, 1.4, 2.4, 8],
  medium: [29, 8, 3, 1.6, 1.0, 0.7, 0.5, 0.7, 1.0, 1.6, 3, 8, 29],
  high:   [170, 22, 5.5, 1.8, 0.5, 0.4, 0.4, 0.4, 0.5, 1.8, 5.5, 22, 170],
};

function plinkoDailyNet(did) {
  return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
    WHERE discord_id = ? AND reason LIKE 'plinko:%' AND date(created_at) = date('now')`).get(did).s;
}

app.get('/api/plinko/state', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
  const net = plinkoDailyNet(ident.id);
  res.json({
    balance: bal, username: ident.name,
    minBet: PLINKO_MIN_BET, maxBet: PLINKO_MAX_BET, rows: PLINKO_ROWS, tables: PLINKO_TABLES,
    dailyNet: net, dailyLossLimit: PLINKO_DAILY_LOSS_LIMIT,
    lossLeft: Math.max(0, PLINKO_DAILY_LOSS_LIMIT + Math.min(0, net)),
  });
});

app.post('/api/plinko/drop', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (rateLimit(`plinko:${ident.id}`, 90, 60_000)) return res.status(429).json({ error: 'Zu schnell – kurz durchatmen' });

  const risk = ['low', 'medium', 'high'].includes(req.body.risk) ? req.body.risk : 'medium';
  const bet  = Math.floor(+req.body.bet || 0);
  if (!Number.isInteger(bet) || bet < PLINKO_MIN_BET || bet > PLINKO_MAX_BET)
    return res.status(400).json({ error: `Einsatz: ${PLINKO_MIN_BET}–${PLINKO_MAX_BET} Coins` });

  // Spielerschutz: Tages-Verlustlimit
  if (plinkoDailyNet(ident.id) <= -PLINKO_DAILY_LOSS_LIMIT)
    return res.status(400).json({ error: `Tages-Verlustlimit erreicht (${PLINKO_DAILY_LOSS_LIMIT} Coins). Spielerschutz – morgen geht's weiter.` });

  const balAfterBet = addCoins(ident.id, ident.name, -bet, 'plinko:bet', { bet, risk });
  if (balAfterBet === null) return res.status(400).json({ error: 'Nicht genug Coins' });

  // Kugel fallen lassen: pro Reihe 50/50 links(0)/rechts(1) – Bucket = Summe der Rechts
  const path = [];
  let rights = 0;
  for (let i = 0; i < PLINKO_ROWS; i++) { const r = crypto.randomInt(2); path.push(r); rights += r; }
  const bucket = rights;
  const mult   = PLINKO_TABLES[risk][bucket];
  const win    = Math.min(Math.floor(bet * mult), PLINKO_ABS_MAX_WIN);

  let balance = balAfterBet;
  if (win > 0) balance = addCoins(ident.id, ident.name, win, 'plinko:win', { bet, x: mult, bucket });

  // Highscore = größter Netto-Gewinn (Staff in game_scores, Bürger in visitor_game_scores)
  const netWin = win - bet;
  if (netWin > 0) {
    if (ident.user) {
      db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'plinko', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, game) DO UPDATE SET
          score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END`).run(ident.user.id, netWin);
      checkGameBadges(ident.user.id, ident.id);
    } else {
      db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'plinko', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(discord_id, game) DO UPDATE SET
          score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
          username   = excluded.username`).run(ident.id, ident.name, netWin);
    }
  }
  try { seasonIncQuest(ident.id, 'games', 1); } catch {}

  res.json({ ok: true, bet, risk, path, bucket, mult, win, balance, dailyNet: plinkoDailyNet(ident.id) });
});

// ════════════════════════════════════════════════════════════════
//  BIG BASS  (Money-Collect-Slot, 5×3) — Mathematik in bigbass-engine.js
//  Freispiele: Geldfische tragen Werte, Angler-Wild kassiert ein,
//  je 4 Angler Multiplikator-Stufe (×2/×3/×10). RTP ~94 %.
// ════════════════════════════════════════════════════════════════
const BIGBASS_MIN_BET          = 5;
const BIGBASS_MAX_BET          = 250;
const BIGBASS_FEATURE_MAX_BET  = 50;       // Feature-Kauf = 60× Einsatz → max 3000 Coins
const BIGBASS_DAILY_LOSS_LIMIT = 15000;
const BIGBASS_ABS_MAX_WIN      = 250000;

function bigbassDailyNet(did) {
  return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
    WHERE discord_id = ? AND reason LIKE 'bigbass:%' AND date(created_at) = date('now')`).get(did).s;
}

app.get('/api/bigbass/state', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
  const net = bigbassDailyNet(ident.id);
  res.json({
    balance: bal, username: ident.name,
    minBet: BIGBASS_MIN_BET, maxBet: BIGBASS_MAX_BET,
    featureCostMult: bigbassEngine.FEATURE_BUY_COST, featureMaxBet: BIGBASS_FEATURE_MAX_BET,
    pays: bigbassEngine.PAYS, scatterPays: bigbassEngine.SCATTER_PAYS, moneyValues: bigbassEngine.MONEY_VALUES,
    cols: bigbassEngine.COLS, rows: bigbassEngine.ROWS,
    dailyNet: net, dailyLossLimit: BIGBASS_DAILY_LOSS_LIMIT,
    lossLeft: Math.max(0, BIGBASS_DAILY_LOSS_LIMIT + Math.min(0, net)),
  });
});

app.post('/api/bigbass/spin', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (rateLimit(`bigbass:${ident.id}`, 90, 60_000)) return res.status(429).json({ error: 'Zu schnell – kurz durchatmen' });

  const buyFeature = !!req.body.buyFeature;
  const bet    = Math.floor(+req.body.bet || 0);
  const maxBet = buyFeature ? BIGBASS_FEATURE_MAX_BET : BIGBASS_MAX_BET;
  if (!Number.isInteger(bet) || bet < BIGBASS_MIN_BET || bet > maxBet)
    return res.status(400).json({ error: `Einsatz: ${BIGBASS_MIN_BET}–${maxBet} Coins${buyFeature ? ' (Feature-Kauf)' : ''}` });

  if (bigbassDailyNet(ident.id) <= -BIGBASS_DAILY_LOSS_LIMIT)
    return res.status(400).json({ error: `Tages-Verlustlimit erreicht (${BIGBASS_DAILY_LOSS_LIMIT} Coins). Spielerschutz – morgen geht's weiter.` });

  const cost = buyFeature ? bet * bigbassEngine.FEATURE_BUY_COST : bet;
  const balAfterBet = addCoins(ident.id, ident.name, -cost, 'bigbass:bet', { bet, feature: buyFeature });
  if (balAfterBet === null) return res.status(400).json({ error: 'Nicht genug Coins' });

  const result = bigbassEngine.spin({ bet, freeBuy: buyFeature, rng: (n) => crypto.randomInt(n) });
  const win = Math.min(result.totalWin, BIGBASS_ABS_MAX_WIN);
  let balance = balAfterBet;
  if (win > 0)
    balance = addCoins(ident.id, ident.name, win, 'bigbass:win', { bet, x: +(win / bet).toFixed(2), feature: buyFeature });

  const netWin = win - cost;
  if (netWin > 0) {
    if (ident.user) {
      db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'bigbass', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, game) DO UPDATE SET
          score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END`).run(ident.user.id, netWin);
      checkGameBadges(ident.user.id, ident.id);
    } else {
      db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'bigbass', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(discord_id, game) DO UPDATE SET
          score      = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
          updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
          username   = excluded.username`).run(ident.id, ident.name, netWin);
    }
  }
  try { seasonIncQuest(ident.id, 'games', 1); } catch {}

  res.json({
    ok: true, bet, cost, buyFeature,
    rounds: result.rounds, totalWin: win,
    capped: result.capped || win < result.totalWin,
    freeSpinsAwarded: result.freeSpinsAwarded, baseScatters: result.baseScatters,
    fishermen: result.fishermen, finalMult: result.finalMult,
    balance, dailyNet: bigbassDailyNet(ident.id),
  });
});

// ════════════════════════════════════════════════════════════════
//  MINES  (5×5 – Bomben meiden, Multiplikator steigt, jederzeit Cashout)
//  RTP fest = MINES_RTP (jeder Cashout = RTP × faire Quote, strategieunabhängig).
//  Spielzustand in DB (übersteht Neustarts).
// ════════════════════════════════════════════════════════════════
const MINES_MIN_BET = 5, MINES_MAX_BET = 250, MINES_TILES = 25;
const MINES_DAILY_LOSS_LIMIT = 15000, MINES_ABS_MAX_WIN = 250000, MINES_RTP = 0.97;

function minesDailyNet(did) {
  return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
    WHERE discord_id = ? AND reason LIKE 'mines:%' AND date(created_at) = date('now')`).get(did).s;
}
// Multiplikator nach k sicheren Aufdeckungen bei m Bomben (RTP × faire Quote)
function minesMultiplier(mines, k) {
  if (k <= 0) return 1;
  let f = 1;
  for (let i = 0; i < k; i++) f *= (MINES_TILES - i) / (MINES_TILES - mines - i);
  return Math.floor(MINES_RTP * f * 100) / 100;
}
function minesStatePayload(g) {
  const revealed = JSON.parse(g.revealed);
  const safeTotal = MINES_TILES - g.mines;
  return {
    active: true, bet: g.bet, mines: g.mines, revealed, picks: revealed.length, safeTotal,
    multiplier: minesMultiplier(g.mines, revealed.length),
    nextMultiplier: revealed.length < safeTotal ? minesMultiplier(g.mines, revealed.length + 1) : null,
  };
}
function finishMinesScore(ident, netWin) {
  if (netWin <= 0) return;
  if (ident.user) {
    db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'mines', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, game) DO UPDATE SET
        score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
        updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END`).run(ident.user.id, netWin);
    checkGameBadges(ident.user.id, ident.id);
  } else {
    db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'mines', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(discord_id, game) DO UPDATE SET
        score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
        updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
        username = excluded.username`).run(ident.id, ident.name, netWin);
  }
}

app.get('/api/mines/state', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
  const net = minesDailyNet(ident.id);
  const g = db.prepare('SELECT * FROM mines_games WHERE discord_id = ?').get(ident.id);
  res.json({
    balance: bal, username: ident.name,
    minBet: MINES_MIN_BET, maxBet: MINES_MAX_BET, tiles: MINES_TILES,
    dailyNet: net, dailyLossLimit: MINES_DAILY_LOSS_LIMIT,
    lossLeft: Math.max(0, MINES_DAILY_LOSS_LIMIT + Math.min(0, net)),
    game: g ? minesStatePayload(g) : null,
  });
});

app.post('/api/mines/start', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (rateLimit(`mines:${ident.id}`, 60, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
  if (db.prepare('SELECT 1 FROM mines_games WHERE discord_id = ?').get(ident.id))
    return res.status(400).json({ error: 'Es läuft bereits ein Spiel' });
  const bet = Math.floor(+req.body.bet || 0);
  const mines = Math.floor(+req.body.mines || 0);
  if (!Number.isInteger(bet) || bet < MINES_MIN_BET || bet > MINES_MAX_BET)
    return res.status(400).json({ error: `Einsatz: ${MINES_MIN_BET}–${MINES_MAX_BET} Coins` });
  if (!Number.isInteger(mines) || mines < 1 || mines > 24)
    return res.status(400).json({ error: 'Bomben: 1–24' });
  if (minesDailyNet(ident.id) <= -MINES_DAILY_LOSS_LIMIT)
    return res.status(400).json({ error: `Tages-Verlustlimit erreicht (${MINES_DAILY_LOSS_LIMIT} Coins). Spielerschutz – morgen geht's weiter.` });

  const bal = addCoins(ident.id, ident.name, -bet, 'mines:bet', { bet, mines });
  if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });

  const idx = [...Array(MINES_TILES).keys()];
  for (let i = idx.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const minePos = idx.slice(0, mines).sort((a, b) => a - b);
  db.prepare('INSERT INTO mines_games (discord_id, username, bet, mines, mine_pos, revealed) VALUES (?, ?, ?, ?, ?, ?)')
    .run(ident.id, ident.name, bet, mines, JSON.stringify(minePos), '[]');
  try { seasonIncQuest(ident.id, 'games', 1); } catch {}

  const g = db.prepare('SELECT * FROM mines_games WHERE discord_id = ?').get(ident.id);
  res.json({ ok: true, balance: bal, ...minesStatePayload(g) });
});

app.post('/api/mines/reveal', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const g = db.prepare('SELECT * FROM mines_games WHERE discord_id = ?').get(ident.id);
  if (!g) return res.status(400).json({ error: 'Kein laufendes Spiel' });
  const tile = Math.floor(+req.body.tile);
  if (!Number.isInteger(tile) || tile < 0 || tile >= MINES_TILES) return res.status(400).json({ error: 'Ungültiges Feld' });
  const revealed = JSON.parse(g.revealed);
  if (revealed.includes(tile)) return res.status(400).json({ error: 'Feld schon aufgedeckt' });
  const minePos = JSON.parse(g.mine_pos);

  if (minePos.includes(tile)) {
    db.prepare('DELETE FROM mines_games WHERE discord_id = ?').run(ident.id);
    const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
    return res.json({ ok: true, mine: true, tile, minePositions: minePos, balance: bal, dailyNet: minesDailyNet(ident.id) });
  }

  revealed.push(tile);
  const safeTotal = MINES_TILES - g.mines;
  if (revealed.length >= safeTotal) {
    const mult = minesMultiplier(g.mines, safeTotal);
    const win = Math.min(Math.round(g.bet * mult), MINES_ABS_MAX_WIN);
    const bal = addCoins(ident.id, ident.name, win, 'mines:win', { bet: g.bet, mines: g.mines, x: mult });
    db.prepare('DELETE FROM mines_games WHERE discord_id = ?').run(ident.id);
    finishMinesScore(ident, win - g.bet);
    return res.json({ ok: true, mine: false, tile, revealed, cashedOut: true, multiplier: mult, win, balance: bal, minePositions: minePos });
  }
  db.prepare('UPDATE mines_games SET revealed = ? WHERE discord_id = ?').run(JSON.stringify(revealed), ident.id);
  res.json({ ok: true, mine: false, tile, revealed, picks: revealed.length, safeTotal,
    multiplier: minesMultiplier(g.mines, revealed.length),
    nextMultiplier: minesMultiplier(g.mines, revealed.length + 1) });
});

app.post('/api/mines/cashout', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const g = db.prepare('SELECT * FROM mines_games WHERE discord_id = ?').get(ident.id);
  if (!g) return res.status(400).json({ error: 'Kein laufendes Spiel' });
  const revealed = JSON.parse(g.revealed);
  if (revealed.length < 1) return res.status(400).json({ error: 'Erst mindestens ein Feld aufdecken' });
  const mult = minesMultiplier(g.mines, revealed.length);
  const win = Math.min(Math.round(g.bet * mult), MINES_ABS_MAX_WIN);
  const bal = addCoins(ident.id, ident.name, win, 'mines:win', { bet: g.bet, mines: g.mines, x: mult });
  db.prepare('DELETE FROM mines_games WHERE discord_id = ?').run(ident.id);
  finishMinesScore(ident, win - g.bet);
  res.json({ ok: true, win, multiplier: mult, balance: bal, minePositions: JSON.parse(g.mine_pos) });
});

// ════════════════════════════════════════════════════════════════
//  ACLS ROCKET (Crash) — Ziel-Multiplikator setzen, vor dem Absturz kassieren.
//  Crash-Punkt server-seitig: crash = RTP/(1-r). P(Crash ≥ m) = RTP/m
//  → EV = RTP × Einsatz für JEDES Ziel (fair, exploit-/disconnect-sicher).
// ════════════════════════════════════════════════════════════════
const ROCKET_MIN_BET = 5, ROCKET_MAX_BET = 250;
const ROCKET_DAILY_LOSS_LIMIT = 15000, ROCKET_ABS_MAX_WIN = 250000;
const ROCKET_RTP = 0.97, ROCKET_MAX_TARGET = 100;

function rocketDailyNet(did) {
  return db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM coin_transactions
    WHERE discord_id = ? AND reason LIKE 'rocket:%' AND date(created_at) = date('now')`).get(did).s;
}
function finishRocketScore(ident, netWin) {
  if (netWin <= 0) return;
  if (ident.user) {
    db.prepare(`INSERT INTO game_scores (user_id, game, score, updated_at) VALUES (?, 'rocket', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, game) DO UPDATE SET
        score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
        updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END`).run(ident.user.id, netWin);
    checkGameBadges(ident.user.id, ident.id);
  } else {
    db.prepare(`INSERT INTO visitor_game_scores (discord_id, username, game, score, updated_at) VALUES (?, ?, 'rocket', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(discord_id, game) DO UPDATE SET
        score = CASE WHEN excluded.score > score THEN excluded.score ELSE score END,
        updated_at = CASE WHEN excluded.score > score THEN CURRENT_TIMESTAMP ELSE updated_at END,
        username = excluded.username`).run(ident.id, ident.name, netWin);
  }
}

app.get('/api/rocket/state', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const bal = db.prepare('SELECT balance FROM coin_balances WHERE discord_id = ?').get(ident.id)?.balance ?? 0;
  const net = rocketDailyNet(ident.id);
  res.json({
    balance: bal, username: ident.name,
    minBet: ROCKET_MIN_BET, maxBet: ROCKET_MAX_BET, maxTarget: ROCKET_MAX_TARGET,
    dailyNet: net, dailyLossLimit: ROCKET_DAILY_LOSS_LIMIT,
    lossLeft: Math.max(0, ROCKET_DAILY_LOSS_LIMIT + Math.min(0, net)),
  });
});

app.post('/api/rocket/play', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (rateLimit(`rocket:${ident.id}`, 90, 60_000)) return res.status(429).json({ error: 'Zu schnell – kurz durchatmen' });
  const bet = Math.floor(+req.body.bet || 0);
  const target = Math.floor((+req.body.target || 0) * 100) / 100;
  if (!Number.isInteger(bet) || bet < ROCKET_MIN_BET || bet > ROCKET_MAX_BET)
    return res.status(400).json({ error: `Einsatz: ${ROCKET_MIN_BET}–${ROCKET_MAX_BET} Coins` });
  if (!isFinite(target) || target < 1.01 || target > ROCKET_MAX_TARGET)
    return res.status(400).json({ error: `Ziel-Multiplikator: 1.01×–${ROCKET_MAX_TARGET}×` });
  if (rocketDailyNet(ident.id) <= -ROCKET_DAILY_LOSS_LIMIT)
    return res.status(400).json({ error: `Tages-Verlustlimit erreicht (${ROCKET_DAILY_LOSS_LIMIT} Coins). Spielerschutz – morgen geht's weiter.` });

  const bal0 = addCoins(ident.id, ident.name, -bet, 'rocket:bet', { bet, target });
  if (bal0 === null) return res.status(400).json({ error: 'Nicht genug Coins' });

  const r = crypto.randomInt(1, 1_000_000_000) / 1_000_000_000; // (0,1)
  const crashPoint = Math.floor((ROCKET_RTP / (1 - r)) * 100) / 100; // kann < 1.00 sein → Sofort-Crash
  const won = crashPoint >= target;
  let win = 0, balance = bal0;
  if (won) { win = Math.min(Math.round(bet * target), ROCKET_ABS_MAX_WIN); balance = addCoins(ident.id, ident.name, win, 'rocket:win', { bet, x: target }); finishRocketScore(ident, win - bet); }
  try { seasonIncQuest(ident.id, 'games', 1); } catch {}

  res.json({ ok: true, crashPoint, target, won, win, balance, dailyNet: rocketDailyNet(ident.id) });
});

// Big Wins für die Spielbank-Lobby (Slot + Blackjack)
app.get('/api/casino/recent-wins', (req, res) => {
  const ident = coinIdent(req);
  if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
  const rows = db.prepare(`
    SELECT cb.username AS username, t.amount AS amount, t.reason AS reason, t.meta AS meta, t.created_at AS created_at
    FROM coin_transactions t LEFT JOIN coin_balances cb ON cb.discord_id = t.discord_id
    WHERE t.reason IN ('slot:win', 'blackjack:win', 'plinko:win', 'bigbass:win', 'mines:win', 'rocket:win') AND t.amount >= 250
    ORDER BY t.id DESC LIMIT 12`).all();
  res.json(rows.map(r => {
    let meta = {}; try { meta = JSON.parse(r.meta || '{}'); } catch {}
    return { username: r.username || 'Spieler', amount: r.amount, game: r.reason.split(':')[0], x: meta.x || null, at: r.created_at };
  }));
});

// ════════════════════════════════════════════════════════════════
//  UNIFIED GAME LEADERBOARD — alle Spiele, Top 3 je Spiel
// ════════════════════════════════════════════════════════════════
const ALL_GAMES = [
  { key: 'race',        label: 'Autorennen' },
  { key: 'brick',       label: 'Brick Breaker' },
  { key: 'deadzone',    label: 'Dead Zone' },
  { key: 'snake',       label: 'Snake' },
  { key: 'tetris',      label: 'Tetris' },
  { key: 'skycop',      label: 'Sky Cop' },
  { key: 'doodlejump',  label: 'Doodle Jump' },
  { key: '2048',        label: '2048' },
  { key: 'bookofra',    label: 'Book of Ra' },
  { key: 'towerdefense',label: 'Tower Defense' },
  { key: 'quiz',        label: 'Quiz Survival' },
  { key: 'tow',         label: 'Abschlepp-Sim' },
  { key: 'memory',      label: 'Memory' },
  { key: 'blackjack',   label: 'Blackjack' },
  { key: 'idle',        label: 'Idle Werkstatt' },
  { key: 'rpg',         label: 'Dungeon RPG' },
  { key: 'reaction',    label: 'Reaktionstest' },
  { key: 'hangman',    label: 'Hangman' },
];

app.get('/api/game-leaderboard', (req, res) => {
  const result = ALL_GAMES.map(g => {
    const top = db.prepare(`
      SELECT u.username, u.avatar, u.discord_id,
             cb.equipped_namecolor, cb.equipped_title, cb.equipped_deco,
             gs.score
      FROM game_scores gs
      JOIN users u ON u.id = gs.user_id
      LEFT JOIN coin_balances cb ON cb.discord_id = u.discord_id
      WHERE gs.game = ? AND gs.score > 0
      ORDER BY gs.score DESC LIMIT 3
    `).all(g.key);
    const topV = db.prepare(`
      SELECT vgs.username, vgs.discord_id, vgs.score
      FROM visitor_game_scores vgs
      WHERE vgs.game = ? AND vgs.score > 0
        AND vgs.discord_id NOT IN (SELECT discord_id FROM users WHERE is_active = 1)
      ORDER BY vgs.score DESC LIMIT 3
    `).all(g.key);
    const combined = [...top, ...topV].sort((a, b) => b.score - a.score).slice(0, 3);
    return { game: g.key, label: g.label, top: combined };
  });
  res.json(result);
});

// ════════════════════════════════════════════════════════════════
//  NEUE FEATURE-ROUTES (modular)
// ════════════════════════════════════════════════════════════════
const sharedDeps = { db, requireAdmin, coinIdent, addCoins, rateLimit, queueNotification, auditLog, SHOP_ITEMS };
app.use(require('./routes/blackmarket')({ ...sharedDeps }));
app.use(require('./routes/feedback')({ ...sharedDeps }));
app.use(require('./routes/roulette')({ ...sharedDeps }));
app.use(require('./routes/questions-admin')({ ...sharedDeps }));
app.use(require('./routes/dashboard-config')({ ...sharedDeps }));
app.use(require('./routes/complaints-ext')({ ...sharedDeps }));
app.use(require('./routes/hilo')({ ...sharedDeps }));
app.use(require('./routes/hangman')({ ...sharedDeps }));
app.use(require('./routes/bets')({ ...sharedDeps }));

app.get('/profil/:id', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'profil.html'));
});
// ── Benachrichtigungszentrale ────────────────────────────────────
app.get('/api/notifications', requireAnySession, (req, res) => {
  const did = coinIdent(req)?.id;
  if (!did) return res.status(401).json({ error: 'Nicht angemeldet' });
  const rows = db.prepare(
    'SELECT id, type, data, is_read, created_at FROM notifications WHERE discord_id = ? ORDER BY created_at DESC LIMIT 30'
  ).all(did);
  const unread = rows.filter(r => !r.is_read).length;
  res.json({ unread, notifications: rows.map(r => ({ ...r, data: JSON.parse(r.data) })) });
});

app.post('/api/notifications/read', requireAnySession, (req, res) => {
  const did = coinIdent(req)?.id;
  if (!did) return res.status(401).json({ error: 'Nicht angemeldet' });
  db.prepare('UPDATE notifications SET is_read = 1 WHERE discord_id = ?').run(did);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  DIREKTNACHRICHTEN
// ════════════════════════════════════════════════════════════════
app.get('/api/dm/unread', requireAuth, (req, res) => {
  const me = req.session.userId ? db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id : null;
  if (!me) return res.status(401).json({ error: 'Nicht angemeldet' });
  const count = db.prepare("SELECT COUNT(*) AS c FROM direct_messages WHERE receiver_id = ? AND read_at IS NULL").get(me)?.c ?? 0;
  res.json({ count });
});

app.get('/api/dm/inbox', requireAuth, (req, res) => {
  const me = db.prepare('SELECT discord_id, username FROM users WHERE id = ?').get(req.session.userId);
  if (!me) return res.status(401).json({ error: 'Nicht angemeldet' });
  const rows = db.prepare(`
    SELECT other_id, other_name, MAX(created_at) AS last_at,
           SUM(CASE WHEN receiver_id = ? AND read_at IS NULL THEN 1 ELSE 0 END) AS unread,
           (SELECT content FROM direct_messages m2
            WHERE (m2.sender_id = dm.other_id AND m2.receiver_id = ?)
               OR (m2.sender_id = ? AND m2.receiver_id = dm.other_id)
            ORDER BY m2.created_at DESC LIMIT 1) AS last_msg
    FROM (
      SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_id,
             CASE WHEN sender_id = ? THEN receiver_name ELSE sender_name END AS other_name,
             receiver_id, read_at, created_at
      FROM direct_messages WHERE sender_id = ? OR receiver_id = ?
    ) dm
    GROUP BY other_id ORDER BY last_at DESC LIMIT 50
  `).all(me.discord_id, me.discord_id, me.discord_id, me.discord_id, me.discord_id, me.discord_id, me.discord_id);
  res.json(rows);
});

app.get('/api/dm/history/:did', requireAuth, (req, res) => {
  if (rateLimit('dm:hist:' + req.session.userId, 30, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
  const me = db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id;
  if (!me) return res.status(401).json({ error: 'Nicht angemeldet' });
  const other = req.params.did;
  const rows = db.prepare(`
    SELECT id, sender_id, sender_name, receiver_id, receiver_name, content, read_at, created_at
    FROM direct_messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC LIMIT 100
  `).all(me, other, other, me);
  db.prepare("UPDATE direct_messages SET read_at = datetime('now') WHERE receiver_id = ? AND sender_id = ? AND read_at IS NULL").run(me, other);
  res.json(rows);
});

app.post('/api/dm/send', requireAuth, (req, res) => {
  if (rateLimit('dm:send:' + req.session.userId, 20, 60_000)) return res.status(429).json({ error: 'Zu schnell' });
  const sender = db.prepare('SELECT discord_id, username FROM users WHERE id = ?').get(req.session.userId);
  if (!sender) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { to, message } = req.body;
  if (!to || !message?.trim()) return res.status(400).json({ error: 'Empfänger und Nachricht erforderlich' });
  if (message.length > 1000) return res.status(400).json({ error: 'Nachricht zu lang (max 1000 Zeichen)' });
  const receiver = db.prepare('SELECT discord_id, username FROM users WHERE discord_id = ?').get(to);
  if (!receiver) return res.status(404).json({ error: 'Empfänger nicht gefunden' });
  if (receiver.discord_id === sender.discord_id) return res.status(400).json({ error: 'Kannst du dir nicht selbst schreiben' });
  const row = db.prepare(`INSERT INTO direct_messages (sender_id, sender_name, receiver_id, receiver_name, content) VALUES (?,?,?,?,?)`)
    .run(sender.discord_id, sender.username, receiver.discord_id, receiver.username, message.trim());
  sseEmit('dm', { from: sender.discord_id, fromName: sender.username, preview: message.trim().slice(0, 60), id: row.lastInsertRowid }, receiver.discord_id);
  createNotif(receiver.discord_id, 'dm', { from: sender.username, preview: message.trim().slice(0, 60) });
  res.json({ ok: true, id: row.lastInsertRowid });
});

// ════════════════════════════════════════════════════════════════
//  INVENTAR-MARKTPLATZ
// ════════════════════════════════════════════════════════════════
app.get('/api/market', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM item_market WHERE sold_at IS NULL ORDER BY created_at DESC LIMIT 100`).all();
  res.json(rows);
});

app.get('/api/market/my', requireAuth, (req, res) => {
  const me = db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id;
  if (!me) return res.status(401).json({ error: 'Nicht angemeldet' });
  res.json(db.prepare(`SELECT * FROM item_market WHERE seller_id = ? AND sold_at IS NULL`).all(me));
});

app.get('/api/shop/owned', requireAuth, (req, res) => {
  const me = db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id;
  if (!me) return res.status(401).json({ error: 'Nicht angemeldet' });
  const rows = db.prepare('SELECT item_id FROM shop_purchases WHERE discord_id = ?').all(me);
  res.json(rows.map(r => r.item_id));
});

app.post('/api/market/list', requireAuth, (req, res) => {
  const me = db.prepare('SELECT discord_id, username FROM users WHERE id = ?').get(req.session.userId);
  if (!me) return res.status(401).json({ error: 'Nicht angemeldet' });
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

app.post('/api/market/buy/:id', requireAuth, (req, res) => {
  const buyer = db.prepare('SELECT discord_id, username FROM users WHERE id = ?').get(req.session.userId);
  if (!buyer) return res.status(401).json({ error: 'Nicht angemeldet' });
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

app.delete('/api/market/:id', requireAuth, (req, res) => {
  const me = db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id;
  if (!me) return res.status(401).json({ error: 'Nicht angemeldet' });
  const listing = db.prepare('SELECT * FROM item_market WHERE id = ? AND sold_at IS NULL AND seller_id = ?').get(+req.params.id, me);
  if (!listing) return res.status(404).json({ error: 'Listing nicht gefunden' });
  db.prepare('DELETE FROM item_market WHERE id = ?').run(listing.id);
  res.json({ ok: true });
});

app.get('/team', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'team.html'));
});
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`[ACLS] Server läuft auf http://localhost:${PORT}`));
