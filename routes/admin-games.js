const express = require('express');

// Admin-Werkzeug: einzelne Nutzer aus den Minigame-Ranglisten entfernen
// (game_scores für Mitarbeiter/Bürger-Accounts, visitor_game_scores für
// anonyme Discord-OAuth-"Voter") — z.B. bei Cheat-Verdacht oder Unfug-Scores.
module.exports = function makeAdminGamesRouter({ db, requireAdmin, auditLog, ALL_GAMES }) {
  const router = express.Router();

  router.get('/api/admin/games-list', requireAdmin, (req, res) => {
    res.json(ALL_GAMES);
  });

  router.get('/api/admin/game-scores/:game', requireAdmin, (req, res) => {
    const game = req.params.game;
    const staff = db.prepare(`
      SELECT u.id AS user_id, u.username, u.avatar, u.discord_id, gs.score, gs.updated_at
      FROM game_scores gs JOIN users u ON u.id = gs.user_id
      WHERE gs.game = ?
    `).all(game);
    const visitors = db.prepare(`
      SELECT NULL AS user_id, vgs.username, NULL AS avatar, vgs.discord_id, vgs.score, vgs.updated_at
      FROM visitor_game_scores vgs WHERE vgs.game = ?
    `).all(game);
    const staffIds = new Set(staff.map(r => r.discord_id));
    const merged = [...staff, ...visitors.filter(v => !staffIds.has(v.discord_id))];
    merged.sort((a, b) => b.score - a.score);
    res.json(merged);
  });

  router.delete('/api/admin/game-scores/:game/:discordId', requireAdmin, (req, res) => {
    const { game, discordId } = req.params;
    const user = db.prepare('SELECT id, username FROM users WHERE discord_id = ?').get(discordId);
    let changes = 0;
    if (user) changes += db.prepare('DELETE FROM game_scores WHERE user_id = ? AND game = ?').run(user.id, game).changes;
    changes += db.prepare('DELETE FROM visitor_game_scores WHERE discord_id = ? AND game = ?').run(discordId, game).changes;
    if (!changes) return res.status(404).json({ error: 'Kein Eintrag gefunden' });
    auditLog(req, 'game_score_removed', `game=${game} discord_id=${discordId} username=${user?.username || ''}`);
    res.json({ ok: true });
  });

  return router;
};
