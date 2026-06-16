const express = require('express');
const crypto  = require('crypto');

// Strecken-Editor + Ghost-Rennen für das Autorennen (game.html).
// Eine "Strecke" ist ein fester Spawn-Plan (Zeitpunkt + Spur) statt der
// zufälligen Endlos-Spawns — dadurch können mehrere Spieler exakt denselben
// Lauf fahren und sich an einem Ghost (der bisher besten Aufnahme) messen.
module.exports = function makeTracksRouter({ db, coinIdent, rateLimit, makeGameToken, getUser }) {
  const router = express.Router();

  const MIN_DURATION = 20_000;
  const MAX_DURATION = 120_000;
  const MAX_OBSTACLES = 200;
  const MAX_RECORDING = 3000;

  function validPattern(pattern, durationMs) {
    if (!Array.isArray(pattern) || !pattern.length || pattern.length > MAX_OBSTACLES) return false;
    return pattern.every(p => p && Number.isFinite(p.t) && p.t >= 0 && p.t <= durationMs
      && Number.isInteger(p.lane) && p.lane >= 0 && p.lane <= 2);
  }

  function bestRunRow(trackId) {
    return db.prepare(`
      SELECT * FROM ghost_runs WHERE track_id = ?
      ORDER BY (finish_ms IS NULL) ASC, finish_ms ASC, crash_progress_ms DESC
      LIMIT 1
    `).get(trackId);
  }

  function isBetter(existing, finishMs, crashProgressMs) {
    if (!existing) return true;
    if (finishMs != null) {
      return existing.finish_ms == null || finishMs < existing.finish_ms;
    }
    return existing.finish_ms == null && (crashProgressMs || 0) > (existing.crash_progress_ms || 0);
  }

  // GET /api/tracks — veröffentlichte Strecken auflisten
  router.get('/api/tracks', (req, res) => {
    const rows = db.prepare(`
      SELECT t.id, t.name, t.author_name, t.duration_ms, t.plays, t.created_at,
        (SELECT MIN(finish_ms) FROM ghost_runs WHERE track_id = t.id AND finish_ms IS NOT NULL) AS best_time_ms,
        (SELECT COUNT(*) FROM ghost_runs WHERE track_id = t.id) AS racers
      FROM custom_tracks t
      ORDER BY t.created_at DESC
      LIMIT 50
    `).all();
    res.json(rows);
  });

  // POST /api/tracks — neue Strecke veröffentlichen
  router.post('/api/tracks', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (rateLimit(`track_pub:${ident.id}`, 5, 3_600_000))
      return res.status(429).json({ error: 'Zu viele Strecken veröffentlicht — bitte später erneut versuchen' });

    const name = String(req.body.name || '').trim();
    const durationMs = Math.round(Number(req.body.durationMs));
    const pattern = req.body.pattern;

    if (!name || name.length > 40) return res.status(400).json({ error: 'Name erforderlich (max 40 Zeichen)' });
    if (!Number.isFinite(durationMs) || durationMs < MIN_DURATION || durationMs > MAX_DURATION)
      return res.status(400).json({ error: `Streckendauer muss zwischen ${MIN_DURATION/1000}s und ${MAX_DURATION/1000}s liegen` });
    if (!validPattern(pattern, durationMs)) return res.status(400).json({ error: 'Ungültiges Streckenmuster' });

    const r = db.prepare(`
      INSERT INTO custom_tracks (author_did, author_name, name, pattern, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(ident.id, ident.name, name, JSON.stringify(pattern), durationMs);

    res.json({ ok: true, id: r.lastInsertRowid });
  });

  // GET /api/tracks/:id — Streckendetails inkl. Muster + bester Ghost-Aufnahme
  router.get('/api/tracks/:id', (req, res) => {
    const track = db.prepare('SELECT * FROM custom_tracks WHERE id = ?').get(req.params.id);
    if (!track) return res.status(404).json({ error: 'Strecke nicht gefunden' });
    const best = bestRunRow(track.id);
    res.json({
      id: track.id, name: track.name, authorName: track.author_name,
      durationMs: track.duration_ms, plays: track.plays,
      pattern: JSON.parse(track.pattern),
      ghost: best ? {
        username: best.username, finishMs: best.finish_ms,
        crashProgressMs: best.crash_progress_ms, recording: JSON.parse(best.recording),
      } : null,
    });
  });

  // GET /api/tracks/:id/leaderboard
  router.get('/api/tracks/:id/leaderboard', (req, res) => {
    const rows = db.prepare(`
      SELECT gr.username, gr.finish_ms, gr.crash_progress_ms, gr.discord_id, u.avatar
      FROM ghost_runs gr LEFT JOIN users u ON u.discord_id = gr.discord_id
      WHERE gr.track_id = ?
      ORDER BY (gr.finish_ms IS NULL) ASC, gr.finish_ms ASC, gr.crash_progress_ms DESC
      LIMIT 15
    `).all(req.params.id);
    res.json(rows);
  });

  // POST /api/tracks/:id/run — Lauf einreichen (Token-validiert wie /api/game-scores/:game)
  router.post('/api/tracks/:id/run', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    if (rateLimit(`track_run:${ip}`, 20, 60_000)) return res.status(429).json({ error: 'Zu viele Anfragen' });

    const track = db.prepare('SELECT id, duration_ms FROM custom_tracks WHERE id = ?').get(req.params.id);
    if (!track) return res.status(404).json({ error: 'Strecke nicht gefunden' });

    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });

    const { token, ts, finishMs, crashProgressMs, recording } = req.body;
    if (!token || typeof ts !== 'number') return res.status(400).json({ error: 'Kein Spieltoken' });
    const user = getUser(req);
    const uid  = user ? `u:${user.id}` : `v:${ident.id}`;
    const expected = makeGameToken(uid, `track_${track.id}`, ts);
    if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)))
      return res.status(403).json({ error: 'Ungültiges Token' });

    const elapsedSec = (Date.now() - ts) / 1000;
    if (elapsedSec < 4) return res.status(400).json({ error: 'Spielzeit zu kurz' });
    if (elapsedSec > 86400) return res.status(400).json({ error: 'Token abgelaufen' });

    const hasFinish = finishMs != null;
    const hasCrash  = crashProgressMs != null;
    if (!hasFinish && !hasCrash) return res.status(400).json({ error: 'Kein Ergebnis übermittelt' });
    if (hasFinish && (!Number.isFinite(finishMs) || finishMs < 0 || finishMs > track.duration_ms + 2000))
      return res.status(400).json({ error: 'Ungültige Zielzeit' });
    if (hasCrash && (!Number.isFinite(crashProgressMs) || crashProgressMs < 0 || crashProgressMs > track.duration_ms))
      return res.status(400).json({ error: 'Ungültiger Fortschritt' });
    if (!Array.isArray(recording) || recording.length > MAX_RECORDING
      || !recording.every(p => p && Number.isFinite(p.t) && Number.isInteger(p.lane) && p.lane >= 0 && p.lane <= 2))
      return res.status(400).json({ error: 'Ungültige Aufnahme' });

    db.prepare('UPDATE custom_tracks SET plays = plays + 1 WHERE id = ?').run(track.id);

    const existing = db.prepare('SELECT * FROM ghost_runs WHERE track_id = ? AND discord_id = ?').get(track.id, ident.id);
    const better = isBetter(existing, hasFinish ? finishMs : null, hasCrash ? crashProgressMs : null);
    if (better) {
      db.prepare(`
        INSERT INTO ghost_runs (track_id, discord_id, username, finish_ms, crash_progress_ms, recording)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(track_id, discord_id) DO UPDATE SET
          username=excluded.username, finish_ms=excluded.finish_ms,
          crash_progress_ms=excluded.crash_progress_ms, recording=excluded.recording,
          created_at=datetime('now')
      `).run(track.id, ident.id, ident.name, hasFinish ? finishMs : null, hasCrash ? crashProgressMs : null, JSON.stringify(recording));
    }
    res.json({ ok: true, newBest: better });
  });

  // DELETE /api/tracks/:id — Autor oder Admin
  router.delete('/api/tracks/:id', (req, res) => {
    const ident = coinIdent(req);
    if (!ident) return res.status(401).json({ error: 'Nicht angemeldet' });
    const track = db.prepare('SELECT author_did FROM custom_tracks WHERE id = ?').get(req.params.id);
    if (!track) return res.status(404).json({ error: 'Strecke nicht gefunden' });
    const user = getUser(req);
    if (track.author_did !== ident.id && user?.role !== 'admin')
      return res.status(403).json({ error: 'Kein Zugriff' });
    db.prepare('DELETE FROM ghost_runs WHERE track_id = ?').run(req.params.id);
    db.prepare('DELETE FROM custom_tracks WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
