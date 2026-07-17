const express = require('express');

/**
 * Papierkram-Suite: Werkstattaufträge, Kostenvoranschläge, Rechnungen,
 * TÜV-Berichte, Zertifikate, Führerschein-Karten + Fahrzeugakten + Punkte-Register.
 *
 * Generisches Dokument-Modell: `type` bestimmt das Formular,
 * `payload` (JSON) trägt die Felder, `doc_no` ist die amtliche Nummer.
 */
module.exports = function makePapierkramRouter({ db, requireAuth, requireAdmin, getUser, rateLimit, auditLog }) {
  const router = express.Router();

  // Typ → Präfix für die Dokumentnummer
  const DOC_TYPES = {
    auftrag:      'WA',   // Werkstattauftrag
    kv:           'KV',   // Kostenvoranschlag
    rechnung:     'RE',   // Rechnung
    tuev:         'TP',   // TÜV-/Prüfbericht
    zertifikat:   'ZERT', // Prüfungs-Zertifikat
    fuehrerschein:'FS',   // Führerschein-Karte
    wartung:      'WH',   // Wartungsheft-Eintrag
    gutachten:    'SG',   // Schadensgutachten
  };
  // Werkstatt-Auftragsablauf (Kanban): offen → in_arbeit → wartet_auf_teile →
  // fertig → abgeholt; storniert ist der Abbruch-Zustand. Andere Dokumenttypen
  // (Rechnung, TÜV …) nutzen faktisch nur offen/in_arbeit/fertig/storniert.
  const DOC_STATUS = ['offen', 'in_arbeit', 'wartet_auf_teile', 'fertig', 'abgeholt', 'storniert'];

  function nextDocNo(type) {
    const year = new Date().getFullYear();
    const cnt = db.prepare(
      "SELECT COUNT(*) AS c FROM documents WHERE type = ? AND strftime('%Y', created_at) = ?"
    ).get(type, String(year)).c;
    return `${DOC_TYPES[type]}-${year}-${String(cnt + 1).padStart(4, '0')}`;
  }

  // ── Dokumente ───────────────────────────────────────────────────

  // Liste (gefiltert): ?type=&q=&kennzeichen=&citizen=&limit=
  router.get('/api/documents', requireAuth, (req, res) => {
    const conds = [], args = [];
    if (req.query.type && DOC_TYPES[req.query.type]) { conds.push('type = ?'); args.push(req.query.type); }
    if (req.query.kennzeichen) { conds.push('UPPER(kennzeichen) = UPPER(?)'); args.push(String(req.query.kennzeichen)); }
    if (req.query.citizen)     { conds.push('LOWER(citizen_name) = LOWER(?)'); args.push(String(req.query.citizen)); }
    if (req.query.q) {
      conds.push('(doc_no LIKE ? OR title LIKE ? OR citizen_name LIKE ? OR kennzeichen LIKE ?)');
      const like = `%${String(req.query.q).trim()}%`;
      args.push(like, like, like, like);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 300);
    const rows = db.prepare(`
      SELECT id, type, doc_no, kennzeichen, citizen_name, title, status, creator_name, created_at, updated_at
      FROM documents ${where} ORDER BY created_at DESC LIMIT ${limit}
    `).all(...args);
    res.json(rows);
  });

  // Einzelnes Dokument (inkl. payload)
  router.get('/api/documents/:id', requireAuth, (req, res) => {
    const d = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Dokument nicht gefunden' });
    try { d.payload = JSON.parse(d.payload); } catch { d.payload = {}; }
    res.json(d);
  });

  // Neues Dokument
  router.post('/api/documents', requireAuth, (req, res) => {
    const u = getUser(req);
    if (rateLimit(`doc:${u.id}`, 30, 10 * 60_000)) return res.status(429).json({ error: 'Zu viele Dokumente – bitte kurz warten' });

    const type = String(req.body.type || '');
    if (!DOC_TYPES[type]) return res.status(400).json({ error: 'Ungültiger Dokument-Typ' });

    const kennzeichen  = String(req.body.kennzeichen || '').trim().toUpperCase().slice(0, 12) || null;
    const citizen_name = String(req.body.citizen_name || '').trim().slice(0, 60) || null;
    const title        = String(req.body.title || '').trim().slice(0, 120) || null;
    const status       = DOC_STATUS.includes(req.body.status) ? req.body.status : 'offen';
    let payload = req.body.payload;
    if (typeof payload !== 'object' || payload === null) payload = {};
    const payloadStr = JSON.stringify(payload);
    if (payloadStr.length > 40_000) return res.status(400).json({ error: 'Dokument zu groß' });

    const doc_no = nextDocNo(type);
    const r = db.prepare(`
      INSERT INTO documents (type, doc_no, kennzeichen, citizen_name, title, payload, status, created_by, creator_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(type, doc_no, kennzeichen, citizen_name, title, payloadStr, status, u.id, u.username);

    // Fahrzeugakte automatisch anlegen, wenn ein Kennzeichen dranhängt
    if (kennzeichen) {
      db.prepare(`
        INSERT INTO vehicle_files (kennzeichen, owner_name, created_by)
        VALUES (?, ?, ?)
        ON CONFLICT(kennzeichen) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      `).run(kennzeichen, citizen_name, u.id);
    }

    auditLog(req, 'document:create', `${doc_no} (${type})${kennzeichen ? ' · ' + kennzeichen : ''}`);
    res.json({ ok: true, id: r.lastInsertRowid, doc_no });
  });

  // Dokument aktualisieren (payload/status/title)
  router.put('/api/documents/:id', requireAuth, (req, res) => {
    const d = db.prepare('SELECT id, doc_no FROM documents WHERE id = ?').get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Dokument nicht gefunden' });

    const sets = [], args = [];
    if (req.body.status && DOC_STATUS.includes(req.body.status)) { sets.push('status = ?'); args.push(req.body.status); }
    if (req.body.title !== undefined) { sets.push('title = ?'); args.push(String(req.body.title).trim().slice(0, 120) || null); }
    if (typeof req.body.payload === 'object' && req.body.payload !== null) {
      const p = JSON.stringify(req.body.payload);
      if (p.length > 40_000) return res.status(400).json({ error: 'Dokument zu groß' });
      sets.push('payload = ?'); args.push(p);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nichts zu ändern' });
    sets.push("updated_at = CURRENT_TIMESTAMP");
    db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).run(...args, d.id);
    auditLog(req, 'document:update', d.doc_no);
    res.json({ ok: true });
  });

  // Löschen: nur Admin
  router.delete('/api/documents/:id', requireAdmin, (req, res) => {
    const d = db.prepare('SELECT doc_no FROM documents WHERE id = ?').get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Dokument nicht gefunden' });
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    auditLog(req, 'document:delete', d.doc_no);
    res.json({ ok: true });
  });

  // ── Fahrzeugakten ───────────────────────────────────────────────

  router.get('/api/vehicles', requireAuth, (req, res) => {
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = q
      ? db.prepare(`SELECT * FROM vehicle_files WHERE kennzeichen LIKE ? OR owner_name LIKE ? OR marke LIKE ? OR modell LIKE ? ORDER BY updated_at DESC LIMIT 100`).all(like, like, like, like)
      : db.prepare('SELECT * FROM vehicle_files ORDER BY updated_at DESC LIMIT 100').all();
    res.json(rows);
  });

  // Komplette Akte: Stammdaten + alle Dokumente zum Kennzeichen
  router.get('/api/vehicles/:kz/file', requireAuth, (req, res) => {
    const kz = String(req.params.kz).toUpperCase();
    const vehicle = db.prepare('SELECT * FROM vehicle_files WHERE UPPER(kennzeichen) = ?').get(kz);
    if (!vehicle) return res.status(404).json({ error: 'Keine Akte zu diesem Kennzeichen' });
    const docs = db.prepare(`
      SELECT id, type, doc_no, title, status, creator_name, created_at
      FROM documents WHERE UPPER(kennzeichen) = ? ORDER BY created_at DESC
    `).all(kz);
    res.json({ vehicle, documents: docs });
  });

  router.post('/api/vehicles', requireAuth, (req, res) => {
    const u = getUser(req);
    const kz = String(req.body.kennzeichen || '').trim().toUpperCase().slice(0, 12);
    if (!kz) return res.status(400).json({ error: 'Kennzeichen erforderlich' });
    if (rateLimit(`veh:${u.id}`, 30, 10 * 60_000)) return res.status(429).json({ error: 'Zu schnell' });

    const f = k => String(req.body[k] || '').trim().slice(0, 60) || null;
    db.prepare(`
      INSERT INTO vehicle_files (kennzeichen, marke, modell, farbe, owner_name, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kennzeichen) DO UPDATE SET
        marke = COALESCE(excluded.marke, marke), modell = COALESCE(excluded.modell, modell),
        farbe = COALESCE(excluded.farbe, farbe), owner_name = COALESCE(excluded.owner_name, owner_name),
        notes = COALESCE(excluded.notes, notes), updated_at = CURRENT_TIMESTAMP
    `).run(kz, f('marke'), f('modell'), f('farbe'), f('owner_name'), String(req.body.notes || '').trim().slice(0, 2000) || null, u.id);
    auditLog(req, 'vehicle:upsert', kz);
    res.json({ ok: true, kennzeichen: kz });
  });

  router.delete('/api/vehicles/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM vehicle_files WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ── Bürgerakte: alles zu einem Namen gebündelt ──────────────────
  // id (citizen_id) ist optional und disambiguiert namensgleiche Bürger –
  // nur registry/citizen_notes tragen eine citizen_id, bans/points/documents
  // werden weiterhin per Name gebündelt (wie schon vor der Bürgerakte).
  router.get('/api/citizen-file', requireAuth, (req, res) => {
    const name = String(req.query.name || '').trim();
    const id = String(req.query.id || '').trim();
    if (!name) return res.status(400).json({ error: 'Name erforderlich' });

    const registry = db.prepare(`
      SELECT r.*, ec.name AS category_name, u.username AS examiner_name
      FROM registry r
      LEFT JOIN exam_categories ec ON ec.id = r.category_id
      LEFT JOIN users u ON u.id = r.examiner_id
      WHERE LOWER(r.citizen_name) = LOWER(?) ${id ? 'AND r.citizen_id = ?' : ''}
      ORDER BY r.registered_at DESC
    `).all(...(id ? [name, id] : [name]));
    const notes = db.prepare(`
      SELECT cn.*, u.username AS author FROM citizen_notes cn
      JOIN users u ON u.id = cn.created_by
      WHERE LOWER(cn.citizen_name) = LOWER(?) ${id ? 'AND cn.citizen_id = ?' : ''}
      ORDER BY cn.created_at DESC
    `).all(...(id ? [name, id] : [name]));
    const bans = db.prepare(`
      SELECT * FROM bans WHERE LOWER(person_name) = LOWER(?) ORDER BY issued_at DESC
    `).all(name);
    const points = db.prepare(`
      SELECT cp.*, (cp.expires_at IS NOT NULL AND cp.expires_at < datetime('now')) AS expired
      FROM citizen_points cp WHERE LOWER(citizen_name) = LOWER(?) ORDER BY created_at DESC
    `).all(name);
    const documents = db.prepare(`
      SELECT id, type, doc_no, kennzeichen, title, status, creator_name, created_at
      FROM documents WHERE LOWER(citizen_name) = LOWER(?) ORDER BY created_at DESC
    `).all(name);
    const activePoints = points.filter(p => !p.expired).reduce((s, p) => s + p.points, 0);

    res.json({ name, id, registry, notes, bans, points, activePoints, documents });
  });

  // ── Punkte-Register ─────────────────────────────────────────────

  router.post('/api/points', requireAuth, (req, res) => {
    const u = getUser(req);
    const citizen = String(req.body.citizen_name || '').trim().slice(0, 60);
    const reason  = String(req.body.reason || '').trim().slice(0, 200);
    const fine    = String(req.body.fine || '').trim().slice(0, 40) || null;
    const points  = Math.min(Math.max(parseInt(req.body.points, 10) || 1, 1), 8);
    const months  = Math.min(Math.max(parseInt(req.body.expires_months, 10) || 12, 1), 60);
    if (!citizen || !reason) return res.status(400).json({ error: 'Bürger und Grund erforderlich' });
    if (rateLimit(`pts:${u.id}`, 20, 10 * 60_000)) return res.status(429).json({ error: 'Zu schnell' });

    db.prepare(`
      INSERT INTO citizen_points (citizen_name, points, reason, fine, issued_by, issuer_name, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+' || ? || ' months'))
    `).run(citizen, points, reason, fine, u.id, u.username, months);
    auditLog(req, 'points:add', `${citizen}: ${points} Punkte (${reason})`);
    res.json({ ok: true });
  });

  router.delete('/api/points/:id', requireAdmin, (req, res) => {
    const p = db.prepare('SELECT citizen_name, points FROM citizen_points WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    db.prepare('DELETE FROM citizen_points WHERE id = ?').run(req.params.id);
    auditLog(req, 'points:delete', `${p.citizen_name}: ${p.points} Punkte entfernt`);
    res.json({ ok: true });
  });

  return router;
};
