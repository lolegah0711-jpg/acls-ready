window.GameAuth = {
  _token: null,
  _ts: null,
  async init(game) {
    try {
      const r = await fetch('/api/game-token/' + game);
      if (r.ok) { const d = await r.json(); this._token = d.token; this._ts = d.ts; }
    } catch {}
  },
  body(score) {
    return { score: score, token: this._token, ts: this._ts };
  },
};
