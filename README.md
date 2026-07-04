# ACLS – Automobil-Club Los Santos

RP-Begleitplattform für einen GTA 5 Roleplay-Server (ColdRP): fiktive **KFZ-Werkstatt** + **Führerscheinstelle**.
Node.js/Express-Backend mit SQLite, Discord-OAuth-Login, Vanilla-JS-Frontend (kein Framework).
**Keine Verbindung zum GTA-Server** – alle Daten entstehen auf der Website oder durch manuelle Eingabe.

## Setup

```bash
npm install
npm run server         # Website auf http://localhost:3000
npm run bot            # optional: Discord-Bot (Voice-Tracking, Notifications)
npm start              # startet Server + Bot zusammen (start.js)
npm test               # Smoke-Tests (Wegwerf-DB, keine Seiteneffekte)
```

Wichtige ENV-Variablen: `PORT`, `DB_PATH`, `SESSION_SECRET`, `DISCORD_CLIENT_ID`,
`DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `BOT_API_SECRET`, `BASE_URL`.

## Deploy

Per SSH auf den Server, dort läuft die App unter **pm2** als `acls`:
`git pull && pm2 restart acls`

## Architektur

```
server.js            Haupt-App: Express-Setup, Auth-Session, Kern-Routen
database.js          SQLite-Schema (CREATE TABLE IF NOT EXISTS, idempotent)
bot.js               Discord-Bot (Voice-Sessions → IC-Zeit, Benachrichtigungen)
lib/
  auth.js            EINZIGE Quelle für Auth-Middleware (getUser, requireAuth, …)
  game-config.js     Zentrale Spiel-Limits & Coin-Umrechnung (Anti-Cheat)
routes/              Feature-Module (Factory-Muster: module.exports = deps => router)
  papierkram.js      Dokumente, Fahrzeugakten, Bürgerakte, Punkte-Register
  karriere.js        Werkstatt-Ränge, Zertifikate, Tagesaufgaben, Gutscheine
  …                  blackmarket, feedback, roulette, bets, clubs, automarkt, …
public/
  index.html         SPA-Shell (Sidebar-Navigation, Seiten via script.js)
  script.js          Kern-Frontend (Seiten-Renderer, api(), esc(), html``-Helper)
  js/social.js       Zusatz-Modul: DMs, Marktplatz, Freunde
  js/acls-plus.js    Zusatz-Modul: Dokumente-Suite, Akten, Karriere (window.ACLSPlusPages)
  gameN.html         Minispiele (eigenständige Seiten, Score via Game-Token-API)
test/                Smoke-Tests gegen echte Route-Handler mit Wegwerf-DB
```

### Muster für neue Features

1. **Route-Modul** in `routes/` anlegen (Factory bekommt `sharedDeps` aus server.js).
2. In server.js bei den anderen Mounts einhängen: `app.use(require('./routes/xyz')({ ...sharedDeps }))`.
3. Neue Tabellen in `database.js` ergänzen (idempotentes `CREATE TABLE IF NOT EXISTS`).
4. Frontend-Seiten in `public/js/acls-plus.js` (oder eigenem Modul) registrieren:
   `window.ACLSPlusPages.meineSeite = fn` + PAGES-Eintrag in script.js + Nav-Item in index.html.
5. Smoke-Test in `test/` ergänzen.

### Sicherheit / Anti-Cheat

- Auth: Discord OAuth → Session; Rollen `admin` / `ausbilder` / Mitarbeiter / `citizen`.
- XSS: überall `esc()` bzw. das `html``-Tagged-Template (auto-escaping) verwenden.
- Minispiele: Game-Token (`/api/game-token/:game`) + serverseitige Validierung
  (Mindest-Spielzeit, Max-Score, Tages-Coin-Cap) über `lib/game-config.js`.
- Rate-Limits in-memory (`rateLimit(key, max, windowMs)` in server.js).

### Caching

- HTML: `no-store` (Einstiegspunkte)
- JS/CSS: 1 h – **bei Änderungen den `?v=`-Parameter in index.html bumpen!**
- Bilder/Fonts: 7 Tage immutable. Große Bilder als WebP (Originale: `backups/img-original/`).

## Minispiele

20+ Arcade-Spiele plus Themen-Spiele Werkstatt/Fahrschule:
Reifenwechsel (game26), OBD-Fehlerdiagnose (game27), Verkehrszeichen-Quiz (game28),
Einpark-Challenge (game29), Fließband-Montage (game30). Neue Spiele brauchen einen
Eintrag in `lib/game-config.js` (Limits + Coin-Divisor + ALL_GAMES), eine Route in
server.js und einen Katalog-Eintrag (GAME_CATALOG in script.js).
