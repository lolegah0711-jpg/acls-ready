// Smoke-Test für Papierkram-Suite + Karriere: Dokumente, Fahrzeugakten,
// Bürgerakte, Punkte-Register, Gutscheine, Ränge, Tagesaufgaben.
// Treibt die echten Route-Handler mit gestubbten Deps gegen eine Wegwerf-DB.
// Lauf: node test/smoke-papierkram.js   (kein Framework, nur assert)
const assert = require('assert');
const os = require('os'), path = require('path'), fs = require('fs');
const express = require('express');
const { initDb } = require('../database');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acls-')), 'test.db');
const db = initDb();

// Test-User anlegen (documents.created_by / registry.examiner_id referenzieren users.id)
db.prepare("INSERT INTO users (discord_id, username, role, is_active) VALUES ('TESTER1', 'Tester', 'admin', 1)").run();
const USER = db.prepare("SELECT * FROM users WHERE discord_id = 'TESTER1'").get();

const getUser = () => USER;
const coinIdent = () => ({ id: USER.discord_id, name: USER.username, user: USER });
function addCoins(did, name, amt) {
  const cur = db.prepare('SELECT balance FROM coin_balances WHERE discord_id=?').get(did)?.balance ?? 0;
  if (amt < 0 && cur + amt < 0) return null;
  db.prepare(`INSERT INTO coin_balances (discord_id, username, balance) VALUES (?,?,?)
    ON CONFLICT(discord_id) DO UPDATE SET balance = balance + excluded.balance`).run(did, name, amt);
  return db.prepare('SELECT balance FROM coin_balances WHERE discord_id=?').get(did).balance;
}
const pass = (req, res, next) => next();
const deps = { db, requireAuth: pass, requireAdmin: pass, requireLogin: pass,
  getUser, coinIdent, addCoins, rateLimit: () => false, auditLog: () => {} };

const app = express();
app.use(express.json());
app.use(require('../routes/papierkram')(deps));
app.use(require('../routes/karriere')(deps));

const server = app.listen(4012);
const B = 'http://localhost:4012';
const get = async (p) => (await fetch(B + p)).json();
const req = async (method, p, body) => {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

(async () => {
  const year = new Date().getFullYear();

  // ── Dokumente ─────────────────────────────────────────────────
  const create = await req('POST', '/api/documents', {
    type: 'auftrag', kennzeichen: 'ls-ab 123', citizen_name: 'Max Muster',
    title: 'Werkstattauftrag – Max Muster',
    payload: { citizen_name: 'Max Muster', items: [{ bez: 'Ölwechsel', preis: '350' }] },
  });
  assert.equal(create.status, 200, 'Dokument erstellen ok');
  assert.equal(create.json.doc_no, `WA-${year}-0001`, 'Dokumentnummer fortlaufend');
  const docId = create.json.id;

  const badType = await req('POST', '/api/documents', { type: 'quatsch', payload: {} });
  assert.equal(badType.status, 400, 'Ungültiger Typ wird abgelehnt');

  const list = await get('/api/documents?type=auftrag');
  assert.equal(list.length, 1, 'Liste enthält 1 Auftrag');
  assert.equal(list[0].kennzeichen, 'LS-AB 123', 'Kennzeichen normalisiert (Großschreibung)');

  const single = await get('/api/documents/' + docId);
  assert.equal(single.payload.items[0].bez, 'Ölwechsel', 'Payload kommt geparst zurück');

  const upd = await req('PUT', '/api/documents/' + docId, { status: 'fertig' });
  assert.equal(upd.status, 200, 'Status-Update ok');
  assert.equal((await get('/api/documents/' + docId)).status, 'fertig', 'Status gespeichert');

  // ── Kanban-Auftragsablauf: alle Werkstatt-Status akzeptiert ───
  for (const st of ['offen', 'in_arbeit', 'wartet_auf_teile', 'abgeholt', 'storniert']) {
    const r = await req('PUT', '/api/documents/' + docId, { status: st });
    assert.equal(r.status, 200, `Kanban-Status '${st}' akzeptiert`);
    assert.equal((await get('/api/documents/' + docId)).status, st, `Kanban-Status '${st}' gespeichert`);
  }
  const badStatus = await req('PUT', '/api/documents/' + docId, { status: 'quatsch' });
  assert.equal(badStatus.status, 400, 'Ungültiger Status abgelehnt (keine Änderung)');
  await req('PUT', '/api/documents/' + docId, { status: 'fertig' }); // Ausgangszustand für Folgetests
  assert.equal((await get('/api/documents/' + docId)).status, 'fertig', 'docId wieder auf fertig gesetzt');

  // Zweites Dokument → Nummer zählt hoch
  const c2 = await req('POST', '/api/documents', { type: 'auftrag', payload: {} });
  assert.equal(c2.json.doc_no, `WA-${year}-0002`, 'Zweite Nummer = 0002');

  // ── Fahrzeugakte (auto-angelegt durch Kennzeichen) ────────────
  const vehicles = await get('/api/vehicles');
  assert.equal(vehicles.length, 1, 'Fahrzeugakte automatisch angelegt');
  const file = await get('/api/vehicles/LS-AB%20123/file');
  assert.equal(file.vehicle.kennzeichen, 'LS-AB 123', 'Akte per Kennzeichen abrufbar');
  assert.equal(file.documents.length, 1, 'Dokument hängt an der Akte');

  const vUp = await req('POST', '/api/vehicles', { kennzeichen: 'LS-AB 123', marke: 'Bravado', modell: 'Banshee' });
  assert.equal(vUp.status, 200, 'Akte aktualisieren ok');
  assert.equal((await get('/api/vehicles/LS-AB%20123/file')).vehicle.marke, 'Bravado', 'Marke gespeichert');

  // ── Punkte-Register + Bürgerakte ──────────────────────────────
  const pts = await req('POST', '/api/points', { citizen_name: 'Max Muster', points: 3, reason: 'Rotlichtverstoß', expires_months: 12 });
  assert.equal(pts.status, 200, 'Punkte eintragen ok');
  const cf = await get('/api/citizen-file?name=max%20muster');
  assert.equal(cf.activePoints, 3, 'Bürgerakte: 3 aktive Punkte (case-insensitive)');
  assert.equal(cf.documents.length, 1, 'Bürgerakte: Dokument verknüpft');

  // ── Regressionstest QA-1: Disambiguierung namensgleicher Bürger per citizen_id ──
  // (public/js/acls-plus.js überschrieb window.showCitizenHistory früher mit einer
  // 1-Parameter-Version und verlor dabei die citizen_id aus der registry-Seite)
  const catId = db.prepare('SELECT id FROM exam_categories LIMIT 1').get().id;
  db.prepare(`INSERT INTO registry (citizen_name, citizen_id, category_id, examiner_id, passed)
    VALUES ('Max Muster', 'CID-1', ?, ?, 1)`).run(catId, USER.id);
  db.prepare(`INSERT INTO registry (citizen_name, citizen_id, category_id, examiner_id, passed)
    VALUES ('Max Muster', 'CID-2', ?, ?, 0)`).run(catId, USER.id);

  const cfAll = await get('/api/citizen-file?name=max%20muster');
  assert.equal(cfAll.registry.length, 2, 'Ohne id: beide namensgleichen Bürger gemischt');

  const cfById1 = await get('/api/citizen-file?name=max%20muster&id=CID-1');
  assert.equal(cfById1.registry.length, 1, 'Mit id=CID-1: nur der eine Bürger gefiltert');
  assert.equal(cfById1.registry[0].citizen_id, 'CID-1', 'Gefilterter Eintrag hat korrekte citizen_id');

  const cfById2 = await get('/api/citizen-file?name=max%20muster&id=CID-2');
  assert.equal(cfById2.registry.length, 1, 'Mit id=CID-2: nur der andere Bürger gefiltert');
  assert.equal(cfById2.registry[0].passed, 0, 'CID-2 ist der nicht-bestandene Eintrag');

  // ── Gutscheine ────────────────────────────────────────────────
  addCoins(USER.discord_id, USER.username, 500, 'seed');
  const buy = await req('POST', '/api/vouchers/buy', { kind: 'rabatt10' });
  assert.equal(buy.status, 200, 'Gutschein kaufen ok');
  assert.ok(/^ACLS-/.test(buy.json.code), 'Code hat ACLS-Format');
  assert.equal(buy.json.balance, 350, 'Coins abgezogen (500-150)');

  const broke = await req('POST', '/api/vouchers/buy', { kind: 'abschlepp' });
  assert.equal(broke.status, 400, 'Kauf ohne Deckung abgelehnt');

  const redeem = await req('POST', '/api/vouchers/redeem', { code: buy.json.code });
  assert.equal(redeem.status, 200, 'Einlösen ok');
  const twice = await req('POST', '/api/vouchers/redeem', { code: buy.json.code });
  assert.equal(twice.status, 400, 'Doppelt einlösen abgelehnt');

  // ── Karriere: Rang + Tagesaufgaben + Zertifikate ──────────────
  const me = await get('/api/karriere/me');
  assert.equal(me.docs, 2, 'Rang zählt 2 Dokumente');
  assert.equal(me.rank.name, 'Azubi', 'Startrang Azubi');

  const tasks = await get('/api/karriere/tagesaufgaben');
  assert.equal(tasks.tasks.length, 3, '3 Tagesaufgaben aktiv');

  // Zertifikat: Score über Schwelle seeden
  db.prepare("INSERT INTO game_scores (user_id, game, score) VALUES (?, 'signs', 9000)").run(USER.id);
  const certs = await get('/api/karriere/zertifikate');
  const signCert = certs.find(c => c.game === 'signs');
  assert.equal(signCert.earned, true, 'Verkehrs-Zertifikat freigeschaltet (9000 ≥ 8000)');
  assert.equal(certs.find(c => c.game === 'obd').earned, false, 'OBD-Zertifikat noch gesperrt');

  // ── Betriebs-Dashboard-Aggregat ───────────────────────────────
  // Bestand an Aufträgen an dieser Stelle: docId (fertig) + c2 (offen).
  await req('POST', '/api/documents', {
    type: 'rechnung', citizen_name: 'Max Muster',
    payload: { items: [{ bez: 'Ölwechsel', menge: '2', preis: '100' }, { bez: 'Filter', menge: '1', preis: '50' }], rabatt: '10' },
  });
  const dash = await get('/api/werkstatt/dashboard');
  assert.equal(dash.revenueWeek, 225, 'Wochenumsatz aus Rechnung: (2·100 + 1·50)·0,9 = 225');
  assert.equal(dash.revenueByDay.length, 7, '7-Tage-Umsatzreihe');
  assert.equal(dash.revenueByDay[6].total, 225, 'Heutiger Umsatz = 225');
  assert.equal(dash.pipeline.offen, 1, 'Pipeline: 1 offener Auftrag');
  assert.equal(dash.pipeline.fertig, 1, 'Pipeline: 1 fertiger Auftrag');
  assert.equal(dash.activeOrders, 1, 'Aktive Aufträge = 1');
  assert.equal(dash.ready, 1, 'Abholbereit = 1');

  console.log('✓ Alle Papierkram/Karriere-Smoke-Tests bestanden (52 Assertions, inkl. Kanban + Betriebs-Dashboard)');
  server.close();
  db.close();
  process.exitCode = 0;
})().catch(e => { console.error('✗ FEHLER:', e.message); server.close(); db.close(); process.exitCode = 1; });
