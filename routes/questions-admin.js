const express = require('express');

module.exports = function makeQuestionsAdminRouter({ db, requireAdmin }) {
  const router = express.Router();

  // GET /api/admin/questions?catId=X — alle Fragen einer Kategorie (inkl. is_seeded)
  router.get('/api/admin/questions', requireAdmin, (req, res) => {
    const catId = parseInt(req.query.catId, 10);
    if (isNaN(catId)) return res.status(400).json({ error: 'catId erforderlich' });
    const rows = db.prepare(`
      SELECT id, question, option_a, option_b, option_c, option_d,
             correct_answer, is_ko, is_seeded, created_at
      FROM exam_questions WHERE category_id = ? ORDER BY id
    `).all(catId);
    res.json(rows);
  });

  // POST /api/admin/questions — neue eigene Frage anlegen (is_seeded = 0)
  router.post('/api/admin/questions', requireAdmin, (req, res) => {
    const { category_id, question, option_a, option_b, option_c, option_d, correct_answer, is_ko } = req.body;
    if (!category_id || !question?.trim() || !option_a?.trim() || correct_answer === undefined) {
      return res.status(400).json({ error: 'category_id, question, option_a und correct_answer sind Pflichtfelder' });
    }
    const r = db.prepare(`
      INSERT INTO exam_questions (category_id, question, option_a, option_b, option_c, option_d, correct_answer, is_ko, is_seeded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      category_id,
      question.trim(),
      option_a.trim(),
      (option_b || '').trim(),
      (option_c || '').trim(),
      (option_d || '').trim(),
      parseInt(correct_answer, 10),
      is_ko ? 1 : 0,
    );
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  // PUT /api/admin/questions/:id — Frage bearbeiten (nur eigene, is_seeded = 0)
  router.put('/api/admin/questions/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const row = db.prepare('SELECT is_seeded FROM exam_questions WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Frage nicht gefunden' });
    if (row.is_seeded) return res.status(403).json({ error: 'Seed-Fragen können nicht bearbeitet werden — bitte direkt in der Codebase ändern' });

    const { question, option_a, option_b, option_c, option_d, correct_answer, is_ko } = req.body;
    db.prepare(`
      UPDATE exam_questions
      SET question = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_answer = ?, is_ko = ?
      WHERE id = ?
    `).run(
      question?.trim() || row.question,
      (option_a || '').trim(),
      (option_b || '').trim(),
      (option_c || '').trim(),
      (option_d || '').trim(),
      parseInt(correct_answer, 10),
      is_ko ? 1 : 0,
      id,
    );
    res.json({ ok: true });
  });

  // DELETE /api/admin/questions/:id — Frage löschen (nur eigene)
  router.delete('/api/admin/questions/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const row = db.prepare('SELECT is_seeded FROM exam_questions WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Frage nicht gefunden' });
    if (row.is_seeded) return res.status(403).json({ error: 'Seed-Fragen können nicht gelöscht werden' });
    db.prepare('DELETE FROM exam_questions WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // GET /api/admin/questions/stats — Übersicht je Kategorie
  router.get('/api/admin/questions/stats', requireAdmin, (req, res) => {
    const rows = db.prepare(`
      SELECT ec.id, ec.name, ec.icon,
             COUNT(eq.id)                                       AS total,
             SUM(CASE WHEN eq.is_seeded = 0 THEN 1 ELSE 0 END) AS custom,
             SUM(CASE WHEN eq.is_ko = 1 THEN 1 ELSE 0 END)     AS ko_questions
      FROM exam_categories ec
      LEFT JOIN exam_questions eq ON eq.category_id = ec.id
      GROUP BY ec.id ORDER BY ec.id
    `).all();
    res.json(rows);
  });

  return router;
};
