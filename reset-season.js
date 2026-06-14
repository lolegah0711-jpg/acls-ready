// ════════════════════════════════════════════════════════════════
//  Einmaliges Reset-Tool für den Saison-Pass.
//  Setzt den XP-Stand (und die abgeholten Belohnungen) der AKTUELLEN
//  Saison zurück – nötig nach dem Prestige-XP-Bug, der auf Max-Level sprang.
//
//  Nutzung auf dem Server (im App-Verzeichnis, z. B. /var/www/acls):
//    node reset-season.js                → listet die aktuellen Saison-Einträge
//    node reset-season.js "DeinName"     → setzt diesen Spieler zurück
//    node reset-season.js 272345772190…  → per Discord-ID zurücksetzen
//    node reset-season.js --all          → ALLE Spieler dieser Saison zurücksetzen
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'acls.db');
const db = new Database(dbPath);

// Aktueller Saison-Schlüssel = Berliner "YYYY-MM" (identisch zu server.js seasonKey)
function seasonKey() {
  const p = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const y = p.find(x => x.type === 'year').value;
  const m = p.find(x => x.type === 'month').value;
  return `${y}-${m}`;
}

const season = seasonKey();
const arg = process.argv[2];

const all = db.prepare('SELECT discord_id, username, xp, claimed FROM season_pass WHERE season = ? ORDER BY xp DESC').all(season);

if (!arg) {
  console.log(`\nAktuelle Saison: ${season}   (DB: ${dbPath})`);
  if (!all.length) { console.log('Keine Saison-Einträge vorhanden.'); process.exit(0); }
  console.log('Einträge:');
  for (const r of all) console.log(`  ${String(r.xp).padStart(6)} XP  |  ${r.username || '—'}  |  ${r.discord_id}`);
  console.log('\nZum Zurücksetzen:  node reset-season.js "Name"   |   node reset-season.js <discord_id>   |   node reset-season.js --all\n');
  process.exit(0);
}

let targets;
if (arg === '--all') {
  targets = all;
} else {
  const lc = arg.toLowerCase();
  targets = all.filter(r => r.discord_id === arg || (r.username || '').toLowerCase() === lc);
}

if (!targets.length) {
  console.log(`Kein passender Eintrag für "${arg}" in Saison ${season} gefunden.`);
  console.log('Tipp: ohne Argument ausführen, um alle Einträge zu sehen.');
  process.exit(1);
}

const reset = db.prepare(`UPDATE season_pass SET xp = 0, claimed = '[]', updated_at = CURRENT_TIMESTAMP WHERE season = ? AND discord_id = ?`);
const tx = db.transaction(() => { for (const t of targets) reset.run(season, t.discord_id); });
tx();

console.log(`\n✅ Saison ${season} zurückgesetzt (XP → 0, Belohnungen entsperrt):`);
for (const t of targets) console.log(`  ${t.username || t.discord_id}  (vorher ${t.xp} XP)`);
console.log('\nFertig. Der Spieler startet diese Saison wieder bei Stufe 0.\n');
db.close();
