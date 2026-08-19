// Smoke-Test für das Bewerbungs-/Ticket-System (/api/bot/tickets).
// Startet den echten Server als Kindprozess gegen eine Wegwerf-DB und prüft
// den kompletten Lifecycle über HTTP, wie es der Bot auch tun würde.
// Lauf: node test/smoke-tickets.js   (kein Framework, nur assert)
const assert = require('assert');
const os = require('os'), path = require('path'), fs = require('fs');
const { spawn } = require('child_process');

const PORT = 4013;
const SECRET = 'smoke-test-secret';
const B = `http://localhost:${PORT}`;
const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acls-')), 'test.db');

const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: dbPath, BOT_API_SECRET: SECRET, NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let bootLog = '';
child.stdout.on('data', d => bootLog += d);
child.stderr.on('data', d => bootLog += d);

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { await fetch(B + '/api/bot/tickets/999999', { headers: { 'x-bot-secret': SECRET } }); return; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  throw new Error('Server nicht rechtzeitig gestartet:\n' + bootLog);
}

const call = async (method, p, body) => {
  const r = await fetch(B + p, {
    method, headers: { 'Content-Type': 'application/json', 'x-bot-secret': SECRET },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

(async () => {
  await waitForServer();

  // ── Ticket anlegen ───────────────────────────────────────────
  const create = await call('POST', '/api/bot/tickets', { type: 'bewerbung', discord_id: '111', discord_username: 'Test#0001' });
  assert.equal(create.status, 200, 'Ticket anlegen ok');
  const ticketId = create.json.id;
  assert.ok(ticketId, 'Ticket-ID zurückgegeben');

  // ── Doppeltes offenes Ticket wird verhindert ────────────────
  const dup = await call('POST', '/api/bot/tickets', { type: 'bewerbung', discord_id: '111', discord_username: 'Test#0001' });
  assert.equal(dup.status, 409, 'Doppeltes offenes Ticket wird abgelehnt');

  // Anderer Typ für denselben User bleibt trotzdem möglich
  const otherType = await call('POST', '/api/bot/tickets', { type: 'sonstiges', discord_id: '111', discord_username: 'Test#0001' });
  assert.equal(otherType.status, 200, 'Anderer Ticket-Typ für denselben User erlaubt');

  // Unbekannter Typ wird abgelehnt
  const badType = await call('POST', '/api/bot/tickets', { type: 'quatsch', discord_id: '111' });
  assert.equal(badType.status, 400, 'Unbekannter Ticket-Typ wird abgelehnt');

  // ── Channel-ID nachtragen (wie bot.js es nach Kanal-Erstellung tut) ──
  const patchChannel = await call('PATCH', `/api/bot/tickets/${ticketId}`, { channel_id: '999888' });
  assert.equal(patchChannel.status, 200, 'Channel-ID nachtragen ok');
  const afterChannel = await call('GET', `/api/bot/tickets/${ticketId}`);
  assert.equal(afterChannel.json.channel_id, '999888', 'Channel-ID wurde gespeichert');
  assert.equal(afterChannel.json.status, 'open', 'Ticket ist noch offen');

  // ── Annehmen ─────────────────────────────────────────────────
  const accept = await call('PATCH', `/api/bot/tickets/${ticketId}`, { status: 'accepted', closed_by: 'Leader#1' });
  assert.equal(accept.status, 200, 'Annehmen ok');
  const afterAccept = await call('GET', `/api/bot/tickets/${ticketId}`);
  assert.equal(afterAccept.json.status, 'accepted', 'Status auf accepted');
  assert.equal(afterAccept.json.closed_by, 'Leader#1', 'closed_by gesetzt');
  assert.ok(afterAccept.json.closed_at, 'closed_at gesetzt');

  // Nach Entscheidung kann derselbe User erneut ein Bewerbungs-Ticket öffnen
  const reopen = await call('POST', '/api/bot/tickets', { type: 'bewerbung', discord_id: '111', discord_username: 'Test#0001' });
  assert.equal(reopen.status, 200, 'Nach Entscheidung erneutes Ticket möglich');

  // ── Ungültiger Status wird abgelehnt ────────────────────────
  const badStatus = await call('PATCH', `/api/bot/tickets/${reopen.json.id}`, { status: 'quatsch' });
  assert.equal(badStatus.status, 400, 'Ungültiger Status wird abgelehnt');

  // ── Nicht existierendes Ticket ───────────────────────────────
  const notFound = await call('GET', '/api/bot/tickets/999999');
  assert.equal(notFound.status, 404, 'Nicht existierendes Ticket → 404');

  // ── Ohne/mit falschem Secret → 401 ───────────────────────────
  const noSecret = await (await fetch(B + `/api/bot/tickets/${ticketId}`)).status;
  assert.equal(noSecret, 401, 'Ohne Secret → 401');

  console.log('✓ Alle Ticket-Smoke-Tests bestanden');
  finish(0);
})().catch(e => { console.error('✗ Test fehlgeschlagen:', e.message); finish(1); });

function finish(code) {
  process.exitCode = code;
  child.kill();
}
