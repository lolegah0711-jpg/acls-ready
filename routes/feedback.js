const express = require('express');

module.exports = function makeFeedbackRouter({ db, requireAdmin, coinIdent, rateLimit }) {
  const router = express.Router();

  const MAX_TITLE = 80;
  const MAX_DESC  = 500;

  // GET /api/feedback — alle Ideen (sortiert nach Votes)
  router.get('/api/feedback', (req, res) => {
    const ident = coinIdent(req);
    const ideas = db.prepare(`
      SELECT id, username, title, description, status, votes, created_at
      FROM feedback_ideas
      ORDER BY votes DESC, created_at DESC
      LIMIT 100
    `).all();

    const voted = ident
      ? new Set(db.prepare('SELECT idea_id FROM feedback_votes WHERE discord_id = ?').all(ident.id).map(r => r.idea_id))
      : new Set();

    res.json({ ideas: ideas.map(i => ({ ...i, my_vote: voted.has(i.id) })) });
  });

  // POST /api/feedback — neue Idee einreichen
  router.post('/api/feedback', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`fb:${ident.id}`, 5, 10 * 60_000)) return res.status(429).json({ error: 'Bitte warte, bevor du eine weitere Idee einreichst' });

    const title = String(req.body.title || '').trim();
    const desc  = String(req.body.description || '').trim();
    if (!title || title.length > MAX_TITLE) return res.status(400).json({ error: `Titel erforderlich (max ${MAX_TITLE} Zeichen)` });
    if (desc.length > MAX_DESC) return res.status(400).json({ error: `Beschreibung zu lang (max ${MAX_DESC} Zeichen)` });

    const r = db.prepare('INSERT INTO feedback_ideas (discord_id, username, title, description) VALUES (?, ?, ?, ?)')
      .run(ident.id, ident.name, title, desc || null);

    res.json({ ok: true, id: r.lastInsertRowid });
  });

  // POST /api/feedback/:id/vote — upvoten / un-voten (toggle)
  router.post('/api/feedback/:id/vote', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`fv:${ident.id}`, 30, 60_000)) return res.status(429).json({ error: 'Zu schnell' });

    const id   = parseInt(req.params.id, 10);
    const idea = db.prepare('SELECT id, votes FROM feedback_ideas WHERE id = ?').get(id);
    if (!idea) return res.status(404).json({ error: 'Idee nicht gefunden' });

    const existing = db.prepare('SELECT 1 FROM feedback_votes WHERE idea_id = ? AND discord_id = ?').get(id, ident.id);
    if (existing) {
      // Bereits gevotet → entfernen
      db.prepare('DELETE FROM feedback_votes WHERE idea_id = ? AND discord_id = ?').run(id, ident.id);
      db.prepare('UPDATE feedback_ideas SET votes = MAX(0, votes - 1) WHERE id = ?').run(id);
      return res.json({ ok: true, voted: false, votes: Math.max(0, idea.votes - 1) });
    } else {
      db.prepare('INSERT INTO feedback_votes (idea_id, discord_id) VALUES (?, ?)').run(id, ident.id);
      db.prepare('UPDATE feedback_ideas SET votes = votes + 1 WHERE id = ?').run(id);
      return res.json({ ok: true, voted: true, votes: idea.votes + 1 });
    }
  });

  // PATCH /api/feedback/:id/status — Admin: Status ändern
  router.patch('/api/feedback/:id/status', requireAdmin, (req, res) => {
    const id     = parseInt(req.params.id, 10);
    const status = String(req.body.status || '').trim();
    const VALID  = ['offen', 'in_prüfung', 'umgesetzt', 'abgelehnt'];
    if (!VALID.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });

    const rows = db.prepare('UPDATE feedback_ideas SET status = ? WHERE id = ?').run(status, id);
    if (!rows.changes) return res.status(404).json({ error: 'Idee nicht gefunden' });
    res.json({ ok: true });
  });

  // DELETE /api/feedback/:id — Admin: Idee löschen
  router.delete('/api/feedback/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM feedback_ideas WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
