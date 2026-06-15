const express = require('express');

const DEFAULT_WIDGETS = ['stats', 'eow', 'iczeit', 'turnier', 'leaderboard', 'announcements'];
const VALID_WIDGETS   = new Set(['stats', 'eow', 'iczeit', 'turnier', 'leaderboard', 'announcements', 'coins', 'badges', 'friends']);

module.exports = function makeDashboardConfigRouter({ db, coinIdent }) {
  const router = express.Router();

  // GET /api/dashboard-config
  router.get('/api/dashboard-config', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.json({ widgets: DEFAULT_WIDGETS });
    const row = db.prepare('SELECT widgets FROM dashboard_widget_config WHERE discord_id = ?').get(ident.id);
    let widgets = DEFAULT_WIDGETS;
    if (row) {
      try { widgets = JSON.parse(row.widgets); } catch {}
    }
    res.json({ widgets });
  });

  // PUT /api/dashboard-config
  router.put('/api/dashboard-config', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    let widgets = req.body.widgets;
    if (!Array.isArray(widgets)) return res.status(400).json({ error: 'widgets muss ein Array sein' });
    widgets = widgets.filter(w => VALID_WIDGETS.has(w));
    db.prepare(`
      INSERT INTO dashboard_widget_config (discord_id, widgets, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(discord_id) DO UPDATE SET widgets = excluded.widgets, updated_at = excluded.updated_at
    `).run(ident.id, JSON.stringify(widgets));
    res.json({ ok: true, widgets });
  });

  return router;
};
