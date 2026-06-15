const express = require('express');

module.exports = function makeComplaintsExtRouter({ db, requireAdmin, coinIdent, auditLog, queueNotification }) {
  const router = express.Router();

  // PATCH /api/complaints/:id/assign — Admin weist Beschwerde zu
  router.patch('/api/complaints/:id/assign', requireAdmin, (req, res) => {
    const { assigned_to } = req.body;
    const id = parseInt(req.params.id, 10);
    if (!db.prepare('SELECT 1 FROM complaints WHERE id = ?').get(id)) return res.status(404).json({ error: 'Nicht gefunden' });
    db.prepare('UPDATE complaints SET assigned_to = ? WHERE id = ?').run(assigned_to || null, id);
    auditLog(req, 'complaint_assign', `id=${id} → user=${assigned_to}`);
    res.json({ ok: true });
  });

  // PATCH /api/complaints/:id/phase — Status-Flow: offen → bearbeitung → erledigt
  router.patch('/api/complaints/:id/phase', requireAdmin, (req, res) => {
    const VALID = ['offen', 'in_bearbeitung', 'erledigt', 'abgelehnt'];
    const { phase, admin_response } = req.body;
    const id = parseInt(req.params.id, 10);
    if (!VALID.includes(phase)) return res.status(400).json({ error: 'Ungültige Phase' });

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
    if (!complaint) return res.status(404).json({ error: 'Nicht gefunden' });

    db.prepare(`UPDATE complaints SET phase = ?, status = ?,
      admin_response = COALESCE(?, admin_response),
      admin_response_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE admin_response_at END
      WHERE id = ?`
    ).run(phase, phase, admin_response || null, admin_response || null, id);

    // Bürger benachrichtigen wenn Discord-ID vorhanden
    if (complaint.citizen_discord_id && (phase === 'erledigt' || phase === 'abgelehnt')) {
      try {
        queueNotification('complaint_update', complaint.citizen_discord_id, {
          subject: complaint.subject,
          phase,
          admin_response: admin_response || null,
        });
      } catch {}
    }

    auditLog(req, 'complaint_phase', `id=${id} phase=${phase}`);
    res.json({ ok: true });
  });

  // GET /api/complaints/kanban — Admin: Beschwerden nach Phase gruppiert
  router.get('/api/complaints/kanban', requireAdmin, (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, u.username AS assigned_name
      FROM complaints c
      LEFT JOIN users u ON u.id = c.assigned_to
      ORDER BY c.created_at DESC
    `).all();

    const kanban = { offen: [], in_bearbeitung: [], erledigt: [], abgelehnt: [] };
    for (const r of rows) {
      const key = r.phase || r.status || 'offen';
      if (kanban[key]) kanban[key].push(r);
      else kanban.offen.push(r);
    }
    res.json(kanban);
  });

  return router;
};
