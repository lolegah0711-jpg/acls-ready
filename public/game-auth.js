/**
 * ACLS Game Auth & Session System
 * 
 * Sichert Minispiele gegen Client-seitige Manipulation (F12-Konsole).
 * 
 * Funktionsweise:
 * 1. Game startet → Session wird serverseitig registriert (mit Startzeit)
 * 2. Während des Spiels → Heartbeats mit aggregierten Stats (Kills, Wellen, Zeit)
 * 3. Score-Einreichung → Server validiert Score gegen gemeldete Stats + Spielzeit
 * 
 * So wird verhindert:
 *   - Score-Manipulation via Console (z.B. score=999999)
 *   - Submitting ohne tatsächlich gespielt zu haben
 *   - Unverhältnismäßige Scores (z.B. 500k Score bei 0 Kills)
 */
(function() {
  'use strict';

  // ── Privater Scope – von außen (Console) nicht manipulierbar ──
  let _sessionId = null;
  let _startTs = 0;
  let _game = '';
  let _secret = null; // zufälliger clientseitiger Secret für Session-Token
  let _token = null;
  let _tokenTs = 0;

  // Akkumulierte Statistiken (vom Game während des Spiels gesetzt)
  let _stats = {
    kills: 0,
    waves: 0,
    maxWave: 0,
    timeElapsed: 0, // in Sekunden (wird vom Game gesetzt)
    score: 0,
    extra: {},      // spielspezifische Daten (z.B. { levels: 5 } für Idle)
  };

  // Lock-Flag: Nach submitScore() kann kein weiterer Score gesendet werden
  let _submitted = false;

  // ── Öffentliche API ────────────────────────────────────────────
  window.GameAuth = {
    /**
     * Initialisiert die Game-Auth-Session.
     * Muss VOR Spielbeginn aufgerufen werden.
     * @param {string} game - Spiel-Key (z.B. 'towerdefense')
     */
    async init(game) {
      _game = game;
      _submitted = false;
      _stats = { kills: 0, waves: 0, maxWave: 0, timeElapsed: 0, score: 0, extra: {} };
      
      // 1. Session starten
      try {
        const r = await fetch('/api/game-session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game }),
        });
        if (r.ok) {
          const d = await r.json();
          _sessionId = d.sessionId;
          _startTs = Date.now();
          _secret = d.secret || null;
        }
      } catch {}

      // 2. Score-Token holen (Fallback falls Session fehlschlägt)
      try {
        const r = await fetch('/api/game-token/' + game);
        if (r.ok) { const d = await r.json(); _token = d.token; _tokenTs = d.ts; }
      } catch {}
    },

    /**
     * Setzt die aktuellen Spiel-Statistiken.
     * Sollte in der Game-Loop regelmäßig aufgerufen werden.
     * @param {Object} s - Statistik-Update
     * @param {number} [s.kills] - Aktuelle Kill-Anzahl
     * @param {number} [s.waves] - Aktuelle Wellen/Level/Runden
     * @param {number} [s.maxWave] - Höchste erreichte Welle/Level
     * @param {number} [s.timeElapsed] - Bisherige Spielzeit in Sekunden
     * @param {number} [s.score] - Aktueller Score
     * @param {Object} [s.extra] - Spielspezifische Daten
     */
    setStats(s) {
      if (_submitted) return;
      if (s.kills !== undefined && s.kills > _stats.kills) _stats.kills = s.kills;
      if (s.waves !== undefined && s.waves > _stats.waves) _stats.waves = s.waves;
      if (s.maxWave !== undefined && s.maxWave > _stats.maxWave) _stats.maxWave = s.maxWave;
      if (s.timeElapsed !== undefined && s.timeElapsed > _stats.timeElapsed) _stats.timeElapsed = s.timeElapsed;
      if (s.score !== undefined && s.score > _stats.score) _stats.score = Math.floor(s.score);
      if (s.extra) Object.assign(_stats.extra, s.extra);
    },

    /**
     * Sendet einen Heartbeat mit aktuellen Stats an den Server.
     * Dient als zusätzliche Absicherung (Score muss zu gesendeten Stats passen).
     * Sollte etwa alle 5–10 Sekunden aufgerufen werden.
     */
    async heartbeat() {
      if (_submitted || !_sessionId || !_game) return;
      const elapsed = Math.floor((Date.now() - _startTs) / 1000);
      try {
        // Fire-and-forget – Fehler ignorieren
        fetch('/api/game-session/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: _sessionId,
            game: _game,
            kills: _stats.kills,
            waves: _stats.waves,
            maxWave: _stats.maxWave,
            score: _stats.score,
            timeElapsed: Math.max(elapsed, _stats.timeElapsed),
            extra: _stats.extra,
          }),
        }).catch(() => {});
      } catch {}
    },

    /**
     * Erzeugt den Request-Body für die Score-Übermittlung.
     * Enthält Token + Session-Daten für serverseitige Validierung.
     * @param {number} score - Endgültiger Score
     * @returns {Object} Body für fetch POST
     */
    body(score) {
      if (_submitted) return { score: 0 };
      _submitted = true;
      const elapsed = Math.floor((Date.now() - _startTs) / 1000);
      const finalTime = Math.max(elapsed, _stats.timeElapsed);

      return {
        score: Math.floor(score),
        token: _token,
        ts: _tokenTs,
        // Session-Validierungsdaten
        sessionId: _sessionId,
        _st: {  // '_st' = submited stats (minimiert, kein klarer Name)
          k: _stats.kills,
          w: _stats.waves,
          mw: _stats.maxWave,
          t: finalTime,
          s: Math.floor(score),
        },
      };
    },

    /**
     * Gibt die aktuelle Session-ID zurück (für Debug-Zwecke).
     */
    get sessionId() { return _sessionId; },
    get game() { return _game; },
    get submitted() { return _submitted; },
  };
})();