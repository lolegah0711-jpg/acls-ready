require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const path     = require('path');
const cron     = require('node-cron');
const fetch    = require('node-fetch');
const { initDb } = require('./database');

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore(db),
  secret: process.env.SESSION_SECRET || 'acls-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 Tage
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
  },
}));
app.use(express.static(path.join(__dirname, 'public')));

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

function requireAdmin(req, res, next) {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (u.role !== 'admin') return res.status(403).json({ error: 'Kein Zugriff' });
  req.adminUser = u;
  next();
}

// ── Helpers ─────────────────────────────────────────────────────
function weekKey() {
  const d = new Date();
  // ISO week: Mon=start, Sun=end → Sonntag gehört zur selben Woche wie Mo-Sa
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const day = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // z.B. "2026-05-18" für Mo 18.05 – So 24.05
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
  if (!winner) { console.log(`[EoW] ${wk}: keine Stimmen`); return null; }
  db.prepare('INSERT OR REPLACE INTO eow_winners (user_id, week, vote_count) VALUES (?, ?, ?)')
    .run(winner.nominee_id, wk, winner.votes);
  checkAndAwardBadges(winner.nominee_id);
  console.log(`[EoW] ${wk}: user #${winner.nominee_id} (${winner.votes} Stimmen)`);
  const winnerUser = db.prepare('SELECT discord_id, username FROM users WHERE id = ?').get(winner.nominee_id);
  if (winnerUser) queueNotification('eow', winnerUser.discord_id, { username: winnerUser.username, votes: winner.votes, week: wk });
  return winner;
}

// ════════════════════════════════════════════════════════════════
//  DISCORD OAUTH
// ════════════════════════════════════════════════════════════════
app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.DISCORD_CLIENT_ID,
    redirect_uri:  process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope:         'identify',
  });
  res.redirect(`${DISCORD_AUTH_URL}?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');

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
      // Non-whitelisted user → voter-only session
      req.session.voterDiscordId  = dUser.id;
      req.session.voterUsername   = dUser.username;
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
    db.prepare('UPDATE users SET username = ?, avatar = ? WHERE id = ?').run(displayName, avatarHash, dbUser.id);

    req.session.userId = dbUser.id;
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
    if (u.role === 'citizen') return res.json({ voter: true, discord_id: u.discord_id, username: u.username, avatar: u.avatar });
    return res.json({ id: u.id, discord_id: u.discord_id, username: u.username, avatar: u.avatar, role: u.role });
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
app.get('/api/users', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, discord_id, username, avatar, role, rank, is_active, created_at FROM users WHERE is_active = 1 ORDER BY username').all());
});

app.post('/api/users', (req, res) => {
  const requester  = getUser(req);
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (totalUsers > 0 && (!requester || requester.role !== 'admin')) {
    return res.status(403).json({ error: 'Nur Admins können Nutzer anlegen' });
  }
  const { discord_id, username, role } = req.body;
  if (!discord_id || !username) return res.status(400).json({ error: 'Fehlende Felder' });
  try {
    const r = db.prepare('INSERT INTO users (discord_id, username, role, added_by) VALUES (?, ?, ?, ?)')
      .run(discord_id, username, role || 'member', requester?.id || null);
    res.json({ id: r.lastInsertRowid });
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
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  EMPLOYEE OF THE WEEK
// ════════════════════════════════════════════════════════════════
app.get('/api/eow', requireAuth, (req, res) => {
  const wk   = weekKey();
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

  const voterNamesQuery = db.prepare(`
    SELECT u.username FROM eow_votes v JOIN users u ON u.id = v.voter_id
    WHERE v.week = ? AND v.nominee_id = ? ORDER BY v.id ASC
  `);
  standings.forEach(s => {
    s.voters = voterNamesQuery.all(wk, s.id).map(r => r.username);
  });

  const history = db.prepare(`
    SELECT w.week, w.vote_count, u.username, u.avatar, u.discord_id FROM eow_winners w
    JOIN users u ON u.id = w.user_id ORDER BY w.announced_at DESC LIMIT 10
  `).all();

  const myVote = db.prepare('SELECT nominee_id FROM eow_votes WHERE voter_id = ? AND week = ?').get(user.id, wk);

  const citizenVotes = db.prepare(`
    SELECT nominee_id, COUNT(*) as votes FROM citizen_votes WHERE week = ? GROUP BY nominee_id
  `).all(wk);

  const citizenVoterNames = db.prepare(`
    SELECT nominee_id, voter_username FROM citizen_votes WHERE week = ? ORDER BY rowid ASC
  `).all(wk);

  res.json({ week: wk, currentWinner: winner, displayWinner: lastWinner, standings, history, myVoteFor: myVote?.nominee_id || null, citizenVotes, citizenVoterNames });
});

app.post('/api/eow/reset', requireAdmin, (req, res) => {
  const wk = weekKey();
  db.prepare('DELETE FROM eow_votes WHERE week = ?').run(wk);
  db.prepare('DELETE FROM citizen_votes WHERE week = ?').run(wk);
  res.json({ ok: true });
});

app.post('/api/eow/vote', requireAuth, (req, res) => {
  const wk   = weekKey();
  const user = getUser(req);
  const { nominee_id } = req.body;
  if (+nominee_id === user.id) return res.status(400).json({ error: 'Keine Selbstnominierung' });
  try {
    db.prepare('INSERT INTO eow_votes (voter_id, nominee_id, week) VALUES (?, ?, ?)').run(user.id, nominee_id, wk);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Diese Woche bereits abgestimmt' });
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
app.get('/api/exam-categories', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT ec.*, (SELECT COUNT(*) FROM exam_questions WHERE category_id = ec.id AND is_active = 1) as question_count
    FROM exam_categories ec
  `).all());
});

app.get('/api/exam-questions/:catId', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM exam_questions WHERE category_id = ? AND is_active = 1 ORDER BY id DESC').all(req.params.catId));
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
  const questions = db.prepare(`SELECT id, correct_answer FROM exam_questions WHERE id IN (${placeholders})`).all(...exam.question_ids);

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

  let registryId = null;
  const category = db.prepare('SELECT name FROM exam_categories WHERE id = ?').get(exam.category_id);
  if (passed && exam.citizenName) {
    const r = db.prepare(`INSERT INTO registry (citizen_name, citizen_id, category_id, examiner_id, exam_type, passed)
      VALUES (?, ?, ?, ?, 'Theorie', 1)`)
      .run(exam.citizenName, exam.citizenId || null, exam.category_id, user.id);
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
  const { citizen_name, citizen_id, category_id } = req.body;
  const user = getUser(req);
  const category = db.prepare('SELECT name FROM exam_categories WHERE id = ?').get(+category_id);
  let banId = null;
  if (citizen_name) {
    db.prepare(`INSERT INTO registry (citizen_name, citizen_id, category_id, examiner_id, exam_type, passed) VALUES (?, ?, ?, ?, 'Theorie', 0)`)
      .run(citizen_name, citizen_id || null, +category_id, user.id);
    banId = createBan(db, citizen_name, citizen_id, `K.O.-Frage falsch – ${category?.name || ''}`, user.id);
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
  const { search, category } = req.query;
  let sql = `
    SELECT r.*, ec.name as category_name, ec.icon, u.username as examiner_name
    FROM registry r JOIN exam_categories ec ON ec.id = r.category_id JOIN users u ON u.id = r.examiner_id WHERE 1=1`;
  const params = [];
  if (search)   { sql += ' AND (r.citizen_name LIKE ? OR r.citizen_id LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
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

app.post('/api/factions', requireAuth, (req, res) => {
  const { name, primary_color, secondary_color, pearl_color, notes } = req.body;
  const user = getUser(req);
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const r = db.prepare('INSERT INTO factions (name, primary_color, secondary_color, pearl_color, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, primary_color || null, secondary_color || null, pearl_color || null, notes || null, user.id);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/factions/:id', requireAuth, (req, res) => {
  const { name, primary_color, secondary_color, pearl_color, notes } = req.body;
  db.prepare('UPDATE factions SET name=?, primary_color=?, secondary_color=?, pearl_color=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name, primary_color || null, secondary_color || null, pearl_color || null, notes || null, req.params.id);
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
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/bans/:id/lift', requireAuth, (req, res) => {
  const user = getUser(req);
  db.prepare('UPDATE bans SET is_active=0, lifted_by=?, lifted_at=CURRENT_TIMESTAMP WHERE id=?').run(user.id, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/bans/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM bans WHERE id = ?').run(req.params.id);
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

app.get('/api/ic-stats', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.username, u.avatar, u.discord_id,
      COALESCE(SUM(l.hours), 0) as total,
      COALESCE(SUM(CASE WHEN l.date >= date('now', 'weekday 0', '-7 days') THEN l.hours ELSE 0 END), 0) as week,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', l.date) = strftime('%Y-%m', 'now') THEN l.hours ELSE 0 END), 0) as month
    FROM users u LEFT JOIN ic_log l ON l.user_id = u.id
    WHERE u.is_active = 1 GROUP BY u.id ORDER BY week DESC
  `).all());
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
    db.prepare("DELETE FROM ic_log WHERE date >= date('now','weekday 0','-7 days')").run();
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
  const wk = weekKey();
  const counts = db.prepare('SELECT nominee_id, COUNT(*) as votes FROM citizen_votes WHERE week = ? GROUP BY nominee_id').all(wk);
  const discordId = req.session.voterDiscordId || (req.session.userId ? db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id : null);
  const myVote = discordId ? db.prepare('SELECT nominee_id FROM citizen_votes WHERE voter_discord_id = ? AND week = ?').get(discordId, wk) : null;
  res.json({ counts, myVoteFor: myVote?.nominee_id || null });
});

app.post('/api/citizen-vote', (req, res) => {
  const discordId = req.session.voterDiscordId || (req.session.userId ? db.prepare('SELECT discord_id FROM users WHERE id = ?').get(req.session.userId)?.discord_id : null);
  const username  = req.session.voterUsername  || (req.session.userId ? db.prepare('SELECT username FROM users WHERE id = ?').get(req.session.userId)?.username : null);
  if (!discordId) return res.status(401).json({ error: 'Nicht angemeldet' });

  const { nominee_id } = req.body;
  if (!nominee_id) return res.status(400).json({ error: 'Fehlende Felder' });

  try {
    db.prepare('INSERT INTO citizen_votes (voter_discord_id, voter_username, nominee_id, week) VALUES (?, ?, ?, ?)')
      .run(discordId, username, +nominee_id, weekKey());
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Diese Woche bereits abgestimmt' });
    res.status(500).json({ error: 'Fehler' });
  }
});

app.get('/api/users/public', (req, res) => {
  res.json(db.prepare('SELECT id, username, avatar, discord_id FROM users WHERE is_active = 1 ORDER BY username').all());
});

// Vom Bot aufgerufen wenn Server-Nickname sich ändert
app.post('/api/sync-member', (req, res) => {
  const { bot_secret, discord_id, username, avatar } = req.body;
  if (bot_secret !== (process.env.BOT_API_SECRET || 'acls-bot-secret')) return res.status(403).end();
  const user = db.prepare('SELECT id FROM users WHERE discord_id = ? AND is_active = 1').get(discord_id);
  if (user) {
    if (username) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, user.id);
    if (avatar !== undefined) db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, user.id);
  }
  res.json({ ok: true });
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
  if (bot_secret !== (process.env.BOT_API_SECRET || 'acls-bot-secret')) return res.status(403).end();
  if (joined_at) {
    db.prepare('INSERT OR REPLACE INTO active_bot_sessions (discord_id, username, channel_name, joined_at) VALUES (?, ?, ?, ?)')
      .run(discord_id, username || discord_id, channel_name, joined_at);
  } else {
    db.prepare('DELETE FROM active_bot_sessions WHERE discord_id = ?').run(discord_id);
  }
  res.json({ ok: true });
});

app.get('/api/active-sessions', requireAuth, (req, res) => {
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
  if (bot_secret !== (process.env.BOT_API_SECRET || 'acls-bot-secret')) {
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

  const wk         = weekKey();
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
//  RANKS
// ════════════════════════════════════════════════════════════════
app.patch('/api/users/:id/rank', requireAdmin, (req, res) => {
  const { rank } = req.body;
  const valid = ['Azubi', 'Mitarbeiter', 'Senior', 'Führungskraft'];
  if (!valid.includes(rank)) return res.status(400).json({ error: 'Ungültiger Rang' });
  db.prepare('UPDATE users SET rank = ? WHERE id = ?').run(rank, req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  BADGES
// ════════════════════════════════════════════════════════════════
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
    if (user) queueNotification('badge', user.discord_id, { badgeType, username: user.username });
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
  res.json({ badges, stats: { conducted, eowWins, icTotal: +icTotal } });
});

app.get('/api/badges/:userId', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT badge_type, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at ASC').all(req.params.userId));
});

// ════════════════════════════════════════════════════════════════
//  COMPLAINTS
// ════════════════════════════════════════════════════════════════
app.post('/api/complaints', (req, res) => {
  const { citizen_name, citizen_discord_id, subject, message } = req.body;
  if (!citizen_name?.trim() || !subject?.trim() || !message?.trim()) return res.status(400).json({ error: 'Pflichtfelder fehlen' });
  db.prepare('INSERT INTO complaints (citizen_name, citizen_discord_id, subject, message) VALUES (?, ?, ?, ?)').run(citizen_name.trim(), citizen_discord_id || null, subject.trim(), message.trim());
  res.json({ ok: true });
});

app.get('/api/complaints', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM complaints ORDER BY created_at DESC').all());
});

app.patch('/api/complaints/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE complaints SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  PROFILE
// ════════════════════════════════════════════════════════════════
app.get('/api/profile/:id', requireAuth, (req, res) => {
  const u = db.prepare('SELECT id, discord_id, username, avatar, role, rank, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Nicht gefunden' });
  const examStats   = db.prepare('SELECT COUNT(*) as total, COALESCE(SUM(passed),0) as passed FROM exam_sessions WHERE user_id=?').get(u.id);
  const conducted   = db.prepare('SELECT COUNT(*) as c FROM registry WHERE examiner_id=?').get(u.id).c;
  const eowWins     = db.prepare('SELECT COUNT(*) as c FROM eow_winners WHERE user_id=?').get(u.id).c;
  const icTotal     = db.prepare('SELECT COALESCE(SUM(hours),0) as h FROM ic_log WHERE user_id=?').get(u.id)?.h || 0;
  const icWeek      = db.prepare("SELECT COALESCE(SUM(hours),0) as h FROM ic_log WHERE user_id=? AND date>=date('now','-7 days')").get(u.id)?.h || 0;
  const recentExams = db.prepare(`SELECT s.*, ec.name as category_name FROM exam_sessions s JOIN exam_categories ec ON ec.id=s.category_id WHERE s.user_id=? ORDER BY s.taken_at DESC LIMIT 5`).all(u.id);
  const badges      = db.prepare('SELECT badge_type, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at ASC').all(u.id);
  res.json({ user: u, stats: { total_exams: examStats.total, passed_exams: examStats.passed, conducted, eow_wins: eowWins, ic_total: +icTotal.toFixed(2), ic_week: +icWeek.toFixed(2) }, recentExams, badges });
});

// ════════════════════════════════════════════════════════════════
//  CRON: Sunday 20:00 — auto-count EoW
// ════════════════════════════════════════════════════════════════
// Abgelaufene Sperren stündlich deaktivieren
cron.schedule('0 * * * *', () => {
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
  req.session.rankExamCode = exam.join_code;
  const ids = JSON.parse(exam.question_ids || '[]');
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
  if (req.body.current_module !== undefined) { fields.push('current_module=?'); vals.push(req.body.current_module); }
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
    current_module: exam.current_module || 'm1',
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

  const date = new Date(exam.taken_at).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' });
  const typeFull = exam.exam_type === 'meister' ? 'Meisterprüfung' : 'Gesellenprüfung';
  const typeTitle = exam.exam_type === 'meister' ? 'MEISTERZEUGNIS' : 'GESELLENZEUGNIS';
  const m3_ratings = JSON.parse(exam.m3_data || '{}').ratings || [];
  const m3avg = m3_ratings.length ? (m3_ratings.reduce((a,b)=>a+b,0)/m3_ratings.length).toFixed(1) : '–';
  const examiners = [exam.examiner_name, exam.examiner2_name].filter(Boolean).join(' & ');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Zertifikat – ${exam.examinee_name}</title>
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
    <div class="name">${exam.examinee_name}</div>
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
app.get('/api/bot-notifications', (req, res) => {
  if (req.headers['x-bot-secret'] !== (process.env.BOT_API_SECRET || 'acls-bot-secret')) return res.status(401).end();
  res.json(db.prepare('SELECT * FROM bot_notifications WHERE sent = 0 ORDER BY created_at ASC').all());
});

app.post('/api/bot-notifications/:id/sent', (req, res) => {
  if (req.headers['x-bot-secret'] !== (process.env.BOT_API_SECRET || 'acls-bot-secret')) return res.status(401).end();
  db.prepare('UPDATE bot_notifications SET sent = 1 WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  SPA fallback
// ════════════════════════════════════════════════════════════════
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`[ACLS] Server läuft auf http://localhost:${PORT}`));
