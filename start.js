// Startet server.js und (falls DISCORD_BOT_TOKEN gesetzt) bot.js
// Railway läuft dieses Script als einzigen Prozess
const { spawn } = require('child_process');

function run(label, file) {
  const proc = spawn('node', [file], { stdio: 'inherit', env: process.env });
  proc.on('exit', (code) => {
    console.log(`[${label}] Prozess beendet (Code ${code}) – Neustart in 5s`);
    setTimeout(() => run(label, file), 5000);
  });
}

run('Server', 'server.js');

if (process.env.DISCORD_BOT_TOKEN) {
  run('Bot', 'bot.js');
} else {
  console.log('[Bot] DISCORD_BOT_TOKEN nicht gesetzt – Bot wird nicht gestartet');
}
