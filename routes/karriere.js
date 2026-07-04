const express = require('express');

/**
 * Karriere & RP-Gamification:
 *  - Werkstatt-Ränge aus ECHTEN Aktionen (Prüfungen, Dokumente, IC-Zeit)
 *  - Zertifikate aus den Themen-Minispielen
 *  - RP-Tagesaufgaben (aus echten Aktionen, nicht aus Arcade-Grinding)
 *  - Prüfer-Bestenliste + Absolventen-Wall
 *  - Rabatt-Gutscheine: Coins → echter RP-Nutzen
 */
module.exports = function makeKarriereRouter({ db, requireAuth, requireLogin, getUser, coinIdent, addCoins, rateLimit, auditLog }) {
  const router = express.Router();

  // ── Werkstatt-Ränge ─────────────────────────────────────────────
  // Rang-Punkte: Prüfung abgenommen = 10, Dokument = 5, IC-Stunde = 2
  const RANKS = [
    { name: 'Azubi',        min: 0,    icon: 'fa-user-graduate' },
    { name: 'Geselle',      min: 100,  icon: 'fa-wrench' },
    { name: 'Mechaniker',   min: 300,  icon: 'fa-cogs' },
    { name: 'Meister',      min: 800,  icon: 'fa-medal' },
    { name: 'Werkmeister',  min: 1800, icon: 'fa-crown' },
    { name: 'Legende',      min: 4000, icon: 'fa-star' },
  ];

  function rankStats(userId) {
    const exams = db.prepare('SELECT COUNT(*) AS c FROM registry WHERE examiner_id = ?').get(userId).c;
    const docs  = db.prepare('SELECT COUNT(*) AS c FROM documents WHERE created_by = ?').get(userId).c;
    const icH   = db.prepare('SELECT COALESCE(SUM(hours),0) AS h FROM ic_log WHERE user_id = ?').get(userId).h;
    const score = exams * 10 + docs * 5 + Math.round(icH) * 2;
    let rank = RANKS[0], next = null;
    for (let i = 0; i < RANKS.length; i++) {
      if (score >= RANKS[i].min) { rank = RANKS[i]; next = RANKS[i + 1] || null; }
    }
    return { exams, docs, icHours: Math.round(icH * 10) / 10, score, rank, next };
  }

  router.get('/api/karriere/me', requireAuth, (req, res) => {
    const u = getUser(req);
    res.json({ ...rankStats(u.id), ranks: RANKS });
  });

  // Team-Übersicht: Rang aller aktiven Mitarbeiter
  router.get('/api/karriere/team', requireAuth, (req, res) => {
    const users = db.prepare("SELECT id, username, avatar, discord_id FROM users WHERE is_active = 1 AND role != 'citizen'").all();
    const rows = users.map(u => {
      const s = rankStats(u.id);
      return { id: u.id, username: u.username, avatar: u.avatar, discord_id: u.discord_id, score: s.score, rank: s.rank.name, icon: s.rank.icon };
    }).sort((a, b) => b.score - a.score);
    res.json(rows);
  });

  // ── Zertifikate aus Themen-Minispielen ──────────────────────────
  const CERTS = [
    { id: 'cert_tire',    game: 'tirechange', minScore: 15000, name: 'Reifen-Spezialist',   icon: 'fa-circle-notch', desc: 'Reifenwechsel: 15.000+ Punkte' },
    { id: 'cert_diag',    game: 'obd',        minScore: 10000, name: 'Diagnose-Techniker',  icon: 'fa-microchip',    desc: 'Fehlerdiagnose: 10.000+ Punkte' },
    { id: 'cert_signs',   game: 'signs',      minScore: 8000,  name: 'Verkehrs-Experte',    icon: 'fa-traffic-light',desc: 'Verkehrszeichen: 8.000+ Punkte' },
    { id: 'cert_park',    game: 'parking',    minScore: 20000, name: 'Rangier-Profi',       icon: 'fa-parking',      desc: 'Einparken: 20.000+ Punkte' },
    { id: 'cert_assembly',game: 'assembly',   minScore: 30000, name: 'Montage-Meister',     icon: 'fa-industry',     desc: 'Fließband: 30.000+ Punkte' },
  ];

  router.get('/api/karriere/zertifikate', requireLogin, (req, res) => {
    const u = getUser(req);
    const certs = CERTS.map(c => {
      const row = db.prepare('SELECT score FROM game_scores WHERE user_id = ? AND game = ?').get(u.id, c.game);
      const best = row?.score || 0;
      return { ...c, best, earned: best >= c.minScore, progress: Math.min(1, best / c.minScore) };
    });
    res.json(certs);
  });

  // ── RP-Tagesaufgaben ────────────────────────────────────────────
  // Fortschritt wird live aus echten Aktionen des Tages berechnet.
  const TASK_POOL = [
    { id: 'exam1', label: 'Nimm 1 Prüfung ab',            goal: 1, reward: 20,
      count: u => db.prepare("SELECT COUNT(*) c FROM registry WHERE examiner_id = ? AND date(registered_at) = date('now')").get(u.id).c },
    { id: 'doc1',  label: 'Erstelle 1 Dokument',           goal: 1, reward: 15,
      count: u => db.prepare("SELECT COUNT(*) c FROM documents WHERE created_by = ? AND date(created_at) = date('now')").get(u.id).c },
    { id: 'doc2',  label: 'Erstelle 2 Dokumente',          goal: 2, reward: 25,
      count: u => db.prepare("SELECT COUNT(*) c FROM documents WHERE created_by = ? AND date(created_at) = date('now')").get(u.id).c },
    { id: 'note1', label: 'Hinterlege 1 Bürger-Notiz',     goal: 1, reward: 10,
      count: u => db.prepare("SELECT COUNT(*) c FROM citizen_notes WHERE created_by = ? AND date(created_at) = date('now')").get(u.id).c },
    { id: 'veh1',  label: 'Lege 1 Fahrzeugakte an',        goal: 1, reward: 10,
      count: u => db.prepare("SELECT COUNT(*) c FROM vehicle_files WHERE created_by = ? AND date(created_at) = date('now')").get(u.id).c },
    { id: 'game1', label: 'Spiele 1 Werkstatt-Minispiel',  goal: 1, reward: 10,
      count: u => db.prepare("SELECT COUNT(*) c FROM game_scores WHERE user_id = ? AND game IN ('tirechange','obd','signs','parking','assembly') AND date(updated_at) = date('now')").get(u.id).c },
  ];

  function todayKey() { return new Date().toISOString().slice(0, 10); }

  // Deterministische Tages-Auswahl: 3 Aufgaben, rotieren mit dem Datum
  function todaysTasks() {
    const day = todayKey();
    let seed = 0;
    for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = [...TASK_POOL];
    const picked = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      picked.push(pool.splice(seed % pool.length, 1)[0]);
    }
    return picked;
  }

  router.get('/api/karriere/tagesaufgaben', requireAuth, (req, res) => {
    const u = getUser(req);
    const day = todayKey();
    const claimed = new Set(db.prepare('SELECT task_id FROM rp_task_claims WHERE discord_id = ? AND day = ?').all(u.discord_id, day).map(r => r.task_id));
    const tasks = todaysTasks().map(t => {
      const progress = Math.min(t.count(u), t.goal);
      return { id: t.id, label: t.label, goal: t.goal, reward: t.reward, progress, done: progress >= t.goal, claimed: claimed.has(t.id) };
    });
    res.json({ day, tasks });
  });

  router.post('/api/karriere/tagesaufgaben/:taskId/claim', requireAuth, (req, res) => {
    const u = getUser(req);
    const day = todayKey();
    const task = todaysTasks().find(t => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Aufgabe heute nicht aktiv' });
    if (task.count(u) < task.goal) return res.status(400).json({ error: 'Aufgabe noch nicht erfüllt' });

    try {
      db.prepare('INSERT INTO rp_task_claims (discord_id, day, task_id) VALUES (?, ?, ?)').run(u.discord_id, day, task.id);
    } catch {
      return res.status(400).json({ error: 'Bereits abgeholt' });
    }
    const bal = addCoins(u.discord_id, u.username, task.reward, 'rp-task:' + task.id, { day });
    res.json({ ok: true, reward: task.reward, balance: bal });
  });

  // ── Prüfer-Bestenliste + Absolventen-Wall ───────────────────────

  router.get('/api/karriere/pruefer-top', requireAuth, (req, res) => {
    const rows = db.prepare(`
      SELECT u.id, u.username, u.avatar, u.discord_id,
             COUNT(*) AS total,
             SUM(CASE WHEN r.passed = 1 THEN 1 ELSE 0 END) AS passed,
             SUM(CASE WHEN r.registered_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS last30
      FROM registry r JOIN users u ON u.id = r.examiner_id
      GROUP BY r.examiner_id ORDER BY total DESC LIMIT 20
    `).all();
    res.json(rows.map(r => ({ ...r, passRate: r.total ? Math.round(r.passed / r.total * 100) : 0 })));
  });

  // Absolventen-Wall: frisch bestandene Prüfungen (auch für Bürger sichtbar)
  router.get('/api/karriere/absolventen', requireLogin, (req, res) => {
    const rows = db.prepare(`
      SELECT r.citizen_name, r.exam_type, r.registered_at, ec.name AS category, u.username AS examiner
      FROM registry r
      LEFT JOIN exam_categories ec ON ec.id = r.category_id
      LEFT JOIN users u ON u.id = r.examiner_id
      WHERE r.passed = 1 ORDER BY r.registered_at DESC LIMIT 24
    `).all();
    res.json(rows);
  });

  // ── Rabatt-Gutscheine (Coins → RP-Nutzen) ───────────────────────
  const VOUCHER_KINDS = {
    rabatt10:  { label: '10% Rabatt auf einen Werkstatt-Auftrag', cost: 150 },
    rabatt25:  { label: '25% Rabatt auf einen Werkstatt-Auftrag', cost: 350 },
    pflege:    { label: 'Gratis Fahrzeugpflege innen & außen',    cost: 100 },
    abschlepp: { label: '1× kostenloser Abschlepp-Einsatz',       cost: 400 },
    fahrstunde:{ label: '1 Fahrstunde gratis',                    cost: 250 },
  };

  function voucherCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = 'ACLS-';
    for (let i = 0; i < 8; i++) {
      c += chars[Math.floor(Math.random() * chars.length)];
      if (i === 3) c += '-';
    }
    return c;
  }

  router.get('/api/vouchers/catalog', (req, res) => {
    res.json(Object.entries(VOUCHER_KINDS).map(([kind, v]) => ({ kind, ...v })));
  });

  router.get('/api/vouchers/mine', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const rows = db.prepare('SELECT code, kind, label, cost_coins, redeemed_at, redeemed_by, created_at FROM vouchers WHERE discord_id = ? ORDER BY created_at DESC LIMIT 50').all(ident.id);
    res.json(rows);
  });

  router.post('/api/vouchers/buy', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`vbuy:${ident.id}`, 10, 10 * 60_000)) return res.status(429).json({ error: 'Zu schnell' });

    const kind = String(req.body.kind || '');
    const v = VOUCHER_KINDS[kind];
    if (!v) return res.status(400).json({ error: 'Unbekannter Gutschein' });

    const bal = addCoins(ident.id, ident.name, -v.cost, 'voucher:' + kind);
    if (bal === null) return res.status(400).json({ error: 'Nicht genug Coins' });

    let code;
    for (let i = 0; i < 5; i++) {
      code = voucherCode();
      try {
        db.prepare('INSERT INTO vouchers (code, discord_id, owner_name, kind, label, cost_coins) VALUES (?, ?, ?, ?, ?, ?)')
          .run(code, ident.id, ident.name, kind, v.label, v.cost);
        break;
      } catch { code = null; }
    }
    if (!code) return res.status(500).json({ error: 'Code-Erzeugung fehlgeschlagen' });
    res.json({ ok: true, code, label: v.label, balance: bal });
  });

  // Mitarbeiter: Gutschein prüfen (ohne einzulösen)
  router.get('/api/vouchers/lookup/:code', requireAuth, (req, res) => {
    const v = db.prepare('SELECT code, owner_name, kind, label, redeemed_at, redeemed_by, created_at FROM vouchers WHERE code = ?')
      .get(String(req.params.code).trim().toUpperCase());
    if (!v) return res.status(404).json({ error: 'Gutschein nicht gefunden' });
    res.json(v);
  });

  // Mitarbeiter: Gutschein einlösen
  router.post('/api/vouchers/redeem', requireAuth, (req, res) => {
    const u = getUser(req);
    const code = String(req.body.code || '').trim().toUpperCase();
    const v = db.prepare('SELECT * FROM vouchers WHERE code = ?').get(code);
    if (!v) return res.status(404).json({ error: 'Gutschein nicht gefunden' });
    if (v.redeemed_at) return res.status(400).json({ error: `Bereits eingelöst am ${v.redeemed_at} von ${v.redeemed_by}` });

    db.prepare("UPDATE vouchers SET redeemed_at = datetime('now'), redeemed_by = ? WHERE code = ?").run(u.username, code);
    auditLog(req, 'voucher:redeem', `${code} (${v.label}) von ${v.owner_name}`);
    res.json({ ok: true, label: v.label, owner: v.owner_name });
  });

  return router;
};
