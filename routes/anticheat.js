const express = require('express');

// Anti-Cheat Admin-Dashboard: XP-Verlauf pro Nutzer + geflaggte Anomalien.
// Geloggt wird in addSeasonXp() → logXpGain() (server.js). > 5000 XP/Std = flag.
module.exports = function({ db, requireAdmin }) {
  const router = express.Router();

  // Geflaggte Nutzer der letzten 7 Tage (Anomalien zuerst)
  router.get('/api/admin/xp-flags', requireAdmin, (req, res) => {
    const rows = db.prepare(`
      SELECT discord_id,
             MAX(username) AS username,
             COUNT(*) AS flags,
             SUM(amount) AS flagged_xp,
             MAX(created_at) AS last_flag
      FROM xp_log
      WHERE flagged = 1 AND created_at > datetime('now','-7 days')
      GROUP BY discord_id
      ORDER BY last_flag DESC
    `).all();
    res.json(rows);
  });

  // Top XP-Verdiener der letzten 24h (zum Aufspüren verdächtiger Spitzen)
  router.get('/api/admin/xp-overview', requireAdmin, (req, res) => {
    const rows = db.prepare(`
      SELECT discord_id,
             MAX(username) AS username,
             SUM(amount) AS xp_24h,
             COUNT(*) AS gains,
             SUM(flagged) AS flags
      FROM xp_log
      WHERE created_at > datetime('now','-24 hours')
      GROUP BY discord_id
      ORDER BY xp_24h DESC
      LIMIT 50
    `).all();
    res.json(rows);
  });

  // XP-Verlauf eines einzelnen Nutzers
  router.get('/api/admin/xp-log/:discordId', requireAdmin, (req, res) => {
    const did = String(req.params.discordId);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const log = db.prepare(
      'SELECT amount, source, flagged, created_at FROM xp_log WHERE discord_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(did, limit);
    const hour = db.prepare(
      "SELECT COALESCE(SUM(amount),0) AS s FROM xp_log WHERE discord_id = ? AND created_at > datetime('now','-1 hour')"
    ).get(did).s;
    const day = db.prepare(
      "SELECT COALESCE(SUM(amount),0) AS s FROM xp_log WHERE discord_id = ? AND created_at > datetime('now','-24 hours')"
    ).get(did).s;
    const bySource = db.prepare(
      "SELECT source, SUM(amount) AS xp, COUNT(*) AS n FROM xp_log WHERE discord_id = ? GROUP BY source ORDER BY xp DESC"
    ).all(did);
    res.json({ discord_id: did, xp_last_hour: hour, xp_last_24h: day, by_source: bySource, log });
  });

  return router;
};
