const Database = require('better-sqlite3');
const path = require('path');

function initDb() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'acls.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id    TEXT UNIQUE NOT NULL,
      username      TEXT NOT NULL,
      avatar        TEXT,
      role          TEXT DEFAULT 'member',
      added_by      INTEGER REFERENCES users(id),
      is_active     INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS eow_votes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id    INTEGER NOT NULL REFERENCES users(id),
      nominee_id  INTEGER NOT NULL REFERENCES users(id),
      week        TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(voter_id, week)
    );

    CREATE TABLE IF NOT EXISTS eow_winners (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      week          TEXT NOT NULL UNIQUE,
      vote_count    INTEGER DEFAULT 0,
      announced_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exam_categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      icon        TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS exam_questions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id     INTEGER NOT NULL REFERENCES exam_categories(id),
      question        TEXT NOT NULL,
      option_a        TEXT NOT NULL,
      option_b        TEXT NOT NULL,
      option_c        TEXT NOT NULL,
      option_d        TEXT NOT NULL,
      correct_answer  INTEGER NOT NULL,
      is_active       INTEGER DEFAULT 1,
      created_by      INTEGER REFERENCES users(id),
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      category_id INTEGER NOT NULL REFERENCES exam_categories(id),
      mode        TEXT DEFAULT 'full',
      score       INTEGER DEFAULT 0,
      total       INTEGER DEFAULT 0,
      passed      INTEGER DEFAULT 0,
      taken_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS registry (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      citizen_name  TEXT NOT NULL,
      citizen_id    TEXT,
      category_id   INTEGER NOT NULL REFERENCES exam_categories(id),
      examiner_id   INTEGER NOT NULL REFERENCES users(id),
      exam_type     TEXT DEFAULT 'Theorie',
      passed        INTEGER DEFAULT 1,
      notes         TEXT,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS factions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      primary_color   TEXT,
      secondary_color TEXT,
      pearl_color     TEXT,
      notes           TEXT,
      created_by      INTEGER REFERENCES users(id),
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS map_spots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT,
      x_pos       REAL NOT NULL,
      y_pos       REAL NOT NULL,
      spot_type   TEXT DEFAULT 'tow',
      created_by  INTEGER REFERENCES users(id),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bans (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      person_name   TEXT NOT NULL,
      person_id     TEXT,
      reason        TEXT NOT NULL,
      issued_by     INTEGER NOT NULL REFERENCES users(id),
      duration_days INTEGER,
      expires_at    DATETIME,
      is_active     INTEGER DEFAULT 1,
      lifted_by     INTEGER REFERENCES users(id),
      lifted_at     DATETIME,
      issued_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ic_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      hours       REAL NOT NULL,
      date        TEXT NOT NULL,
      notes       TEXT,
      logged_by   INTEGER REFERENCES users(id),
      auto        INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS voice_sessions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id        TEXT NOT NULL,
      channel_id        TEXT NOT NULL,
      channel_name      TEXT,
      joined_at         DATETIME NOT NULL,
      left_at           DATETIME,
      duration_minutes  INTEGER
    );

    CREATE TABLE IF NOT EXISTS citizen_votes (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_discord_id  TEXT NOT NULL,
      voter_username    TEXT,
      nominee_id        INTEGER NOT NULL REFERENCES users(id),
      week              TEXT NOT NULL,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(voter_discord_id, week)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_by  INTEGER NOT NULL REFERENCES users(id),
      is_pinned   INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      badge_type  TEXT NOT NULL,
      earned_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, badge_type)
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      citizen_name        TEXT NOT NULL,
      citizen_discord_id  TEXT,
      subject             TEXT NOT NULL,
      message             TEXT NOT NULL,
      status              TEXT DEFAULT 'offen',
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rank_questions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_type      TEXT NOT NULL DEFAULT 'both',
      question       TEXT NOT NULL,
      option_a       TEXT NOT NULL,
      option_b       TEXT NOT NULL,
      option_c       TEXT,
      option_d       TEXT,
      correct_answer INTEGER NOT NULL DEFAULT 0,
      is_active      INTEGER DEFAULT 1,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rank_exams (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_type     TEXT NOT NULL,
      examinee_name TEXT NOT NULL,
      examinee_id   TEXT,
      examiner_id   INTEGER NOT NULL REFERENCES users(id),
      m1_data       TEXT,
      m1_score      INTEGER,
      m1_max        INTEGER,
      m1_passed     INTEGER,
      m2_score      INTEGER,
      m2_total      INTEGER,
      m2_passed     INTEGER,
      m3_data       TEXT,
      m3_score      REAL,
      m3_passed     INTEGER,
      passed        INTEGER DEFAULT 0,
      notes         TEXT,
      taken_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS active_rank_exams (
      join_code     TEXT PRIMARY KEY,
      exam_type     TEXT NOT NULL,
      examinee_name TEXT NOT NULL,
      examinee_id   TEXT,
      examiner1_id  INTEGER NOT NULL REFERENCES users(id),
      examiner2_id  INTEGER REFERENCES users(id),
      question_ids  TEXT NOT NULL,
      m1_locations  TEXT NOT NULL DEFAULT '[]',
      m1_data       TEXT,
      m2_answers    TEXT DEFAULT '{}',
      m3_ratings    TEXT DEFAULT '[0,0,0,0,0,0]',
      m3_notes      TEXT DEFAULT '',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bot_notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,
      discord_id  TEXT,
      payload     TEXT NOT NULL,
      sent        INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed admin users from env vars on first start (Railway: set ADMIN_DISCORD_IDS and ADMIN_USERNAMES)
  const adminIds  = (process.env.ADMIN_DISCORD_IDS  || '').split(',').map(s => s.trim()).filter(Boolean);
  const adminNames = (process.env.ADMIN_USERNAMES   || '').split(',').map(s => s.trim()).filter(Boolean);
  adminIds.forEach((discordId, i) => {
    const username = adminNames[i] || discordId;
    const existing = db.prepare('SELECT id FROM users WHERE discord_id = ?').get(discordId);
    if (!existing) {
      db.prepare('INSERT INTO users (discord_id, username, role, is_active) VALUES (?, ?, ?, 1)')
        .run(discordId, username, 'admin');
      console.log(`[seed] Admin user created: ${username} (${discordId})`);
    } else {
      db.prepare('UPDATE users SET role = ?, is_active = 1 WHERE discord_id = ?').run('admin', discordId);
    }
  });

  if (db.prepare('SELECT COUNT(*) as c FROM exam_categories').get().c === 0) {
    const ins = db.prepare('INSERT INTO exam_categories (name, icon, description) VALUES (?, ?, ?)');
    ins.run('PKW',        'fa-car',        'Führerschein Klasse B');
    ins.run('Motorrad',   'fa-motorcycle', 'Führerschein Klasse A');
    ins.run('Boot',       'fa-ship',       'Bootsführerschein');
    ins.run('LKW',        'fa-truck',      'Führerschein Klasse C');
    ins.run('Flugschein', 'fa-plane',      'Pilotenlizenz');
  }

  // Migrations
  try { db.exec('ALTER TABLE exam_questions ADD COLUMN is_ko INTEGER DEFAULT 0'); } catch(e) {}
  try { db.exec("ALTER TABLE users ADD COLUMN rank TEXT DEFAULT 'Mitarbeiter'"); } catch(e) {}
  try { db.exec('ALTER TABLE rank_exams ADD COLUMN examiner2_id INTEGER REFERENCES users(id)'); } catch(e) {}

  // Always re-seed rank questions (uses old schema columns as fallback for servers with SQLite < 3.35)
  db.prepare('DELETE FROM rank_questions').run();
  {
    // Detect whether old columns still exist
    const cols = db.prepare("PRAGMA table_info(rank_questions)").all().map(c => c.name);
    const hasOldCols = cols.includes('option_b');
    const rq = hasOldCols
      ? db.prepare("INSERT INTO rank_questions (exam_type, question, option_a, option_b, correct_answer) VALUES (?, ?, ?, '', 0)")
      : db.prepare("INSERT INTO rank_questions (exam_type, question, option_a) VALUES (?, ?, ?)");
    // Geselle
    rq.run('gesellen', 'Was ist bei der Anmeldung eines Fahrzeuges zu berücksichtigen?', 'Auf das Kennzeichen soll keine Beleidigung, Familiennamen und keine verwerflichen Zeichen oder Namen (zB. 88 oder so).');
    rq.run('gesellen', 'Wie verhalten Sie sich wenn fremde Personen auf dem ACLS-Gelände unbefugt rumlaufen?', 'Auf die fremde Person zugehen und höflich mitteilen, dass dies nicht erlaubt oder gewünscht ist.');
    rq.run('gesellen', 'Ab wann kann man ein Hausverbot aussprechen? Und für wie lange?', 'Wenn der Kunde dich beleidigt oder dich schwer verletzt.');
    rq.run('gesellen', 'Ein Kunde im Foyer fragt wer sein Auto abgeschleppt hat – wie gehst du vor?', 'Ich gebe ihm keine Auskunft und verweise darauf, nächstes Mal sein KFZ richtig zu parken.');
    rq.run('gesellen', 'Wann ist ein PKW ordnungsgemäß geparkt?', 'Wenn es in Fahrtrichtung geparkt ist, nicht auf rotem Bordstein steht und eine Radreihe auf dem Bordstein ist – oder wenn es in einer gekennzeichneten Parkfläche steht.');
    rq.run('gesellen', 'Was ist bei einer Wasserbergung mit dem Cargobob zu beachten?', 'Das Fahrzeug darf nicht zu tief im Wasser sein.');
    rq.run('gesellen', 'Sie haben einen Dispatch im SG bekommen. Können Sie diesen mit einem Cargo anfliegen?', 'Nein.');
    rq.run('gesellen', 'Wann wird der Cargo verwendet?', 'Immer, außer die Last ist zu schwer (zB. LKW).');
    rq.run('gesellen', 'Wie verhalten Sie sich, wenn ein Dispatch mit „Tank ist leer" reinkommt?', 'Zur Tanke bringen und fragen ob er tanken kann.');
    // Meister
    rq.run('meister', 'Was machen Sie wenn jemand Hausverbot hat?', 'Den Dispatch direkt schließen, ohne ihn vorher anzunehmen.');
    rq.run('meister', 'Was machen Sie wenn Sie der Meinung sind, dass ein Exekutivmitarbeiter sich respektlos benimmt oder Sie sich ungerecht behandelt fühlen?', 'Ich lasse mir die Dienstnummer geben und sage meiner Leitungsebene Bescheid.');
    rq.run('meister', 'Jemand hat eine Beschwerde – hören Sie sich diese an?', 'Nein, für Beschwerden muss ein Dispatch gemacht werden. Nur Ausbilder und höher können sich dessen annehmen.');
    rq.run('meister', 'Du siehst wie ein Arbeitskollege gerade entführt wird – beschreibe deine Vorgehensweise.', 'Selbst in Sicherheit bringen und Dispatch ans PD im Funk Bescheid sagen.');
    rq.run('meister', 'Du bist in Davis unterwegs und siehst einen lilanen Lowrider mitten auf dem Bordstein. Schleppst du diesen ab?', 'Nein, da farblich passende Lowrider in den Gebieten der Gangs nicht abgeschleppt werden.');
    rq.run('meister', 'Wo kannst du überall Abschleppfahrzeuge ausparken?', 'HQ.');
    rq.run('meister', 'Was muss bei der Dokumentation nicht zwangsläufig angegeben werden?', 'Der Grund, sofern der Abschleppgrund auf dem Beweisfoto ersichtlich ist.');
    rq.run('meister', 'Sie merken, dass ein Kunde unzufrieden ist mit dem Tuning – wie verhältst du dich?', 'Ich versuche dem Kunden Alternativen zu zeigen. Falls ich in der Situation überfordert bin, hole ich mir einen Kollegen zur Hilfe.');
    console.log('[seed] Rank questions re-seeded (17 questions)');
  }

  // Always re-seed questions so law changes take effect on restart
  db.prepare('DELETE FROM exam_questions').run();
  {
    const cats = {};
    db.prepare('SELECT id, name FROM exam_categories').all().forEach(c => { cats[c.name] = c.id; });
    const sq = db.prepare(
      'INSERT INTO exam_questions (category_id,question,option_a,option_b,option_c,option_d,correct_answer,is_ko) VALUES (?,?,?,?,?,?,?,?)'
    );
    db.transaction(() => {
      const pkw = cats['PKW'], moto = cats['Motorrad'], boot = cats['Boot'], lkw = cats['LKW'], flug = cats['Flugschein'];

      // ── PKW ─────────────────────────────────────────────────────
      sq.run(pkw,'Was gilt laut §1 an Fußgängerüberwegen?','PKW haben immer Vorfahrt','Geschwindigkeit reduzieren und Fußgängern Vorrang gewähren','Fußgänger müssen warten','',1,0);
      sq.run(pkw,'Was ist laut §1 Abs. 4 verboten?','Langsam fahren','Nachts fahren','Burnouts und übermäßiges Hupen','',2,0);
      sq.run(pkw,'Was muss laut §1 Abs. 5 im Fahrzeug mitgeführt werden?','Nur ein Warndreieck','Verbandskasten und Reparaturkit','Nichts – das ist freiwillig','',1,0);
      sq.run(pkw,'Wer ist laut §1 Abs. 7 für die Fahrtauglichkeit des Fahrzeugs verantwortlich?','Der Fahrzeughersteller','Der Fahrzeugführer','Die Polizei','',1,0);
      sq.run(pkw,'Was gilt laut §2 für den Seitenstreifen?','Darf als Fahrspur genutzt werden','Gehört nicht zur Fahrbahn','Nur für LKW verboten','',1,0);
      sq.run(pkw,'Sind Rennen auf öffentlichen Straßen laut §2 erlaubt?','Ja, mit Genehmigung','Nein, verboten','Nur außerorts erlaubt','',1,0);
      sq.run(pkw,'Was muss laut §3 an einem Stoppschild getan werden?','Langsam durchfahren','Nur hupen','Vollständig anhalten und Vorfahrt gewähren','',2,0);
      sq.run(pkw,'Was gilt laut §3 für Ampeln (Lichtsignalanlagen)?','Absolut bindend','Nicht zu beachten','Nur für LKW bindend','',1,0);
      sq.run(pkw,'Welche Höchstgeschwindigkeit gilt laut §4 innerorts?','50 km/h','80 km/h','100 km/h','',2,0);
      sq.run(pkw,'Welche Höchstgeschwindigkeit gilt laut §4 außerorts?','100 km/h','130 km/h','150 km/h','',2,0);
      sq.run(pkw,'Welche Höchstgeschwindigkeit gilt laut §4 auf Autobahnen?','130 km/h','200 km/h','Keine Begrenzung','',2,0);
      sq.run(pkw,'Welche Höchstgeschwindigkeit gilt laut §4 auf Parkplätzen?','20 km/h','30 km/h','40 km/h','',2,0);
      sq.run(pkw,'Welche Mindestgeschwindigkeit gilt laut §4 auf Autobahnen?','60 km/h','80 km/h','100 km/h','',1,0);
      sq.run(pkw,'Wie groß muss laut §5 der Abstand zum Vordermann sein?','Immer mindestens 10 Meter','Hälfte der Geschwindigkeit in Metern','So groß, dass bei plötzlichem Bremsen ein Unfall vermieden wird','',2,0);
      sq.run(pkw,'Auf welcher Seite wird laut §6 überholt?','Rechts','Links','Beliebig je nach Verkehr','',1,0);
      sq.run(pkw,'Was gilt laut §7 wenn eine Straße mehr Fahrstreifen hat als eine andere?','Die schmalere Straße hat Vorfahrt','Die Fahrbahn mit mehr Fahrstreifen hat Vorfahrt','Immer rechts vor links','',1,0);
      sq.run(pkw,'Ab wann gilt ein Fahrzeug laut §8 als geparkt?','Sofort beim Stehen','Ab 5 Minuten oder wenn der Fahrer sich entfernt','Ab 10 Minuten','',1,0);
      sq.run(pkw,'Wo ist laut §8 Parken verboten?','Auf allen Seitenstreifen','An rot markierten Bordsteinen und vor Toren/Zufahrten','Auf allen Parkflächen','',1,0);
      sq.run(pkw,'Wann muss laut §9 die Fahrzeugbeleuchtung eingeschaltet sein?','Nur bei Nacht','Nur bei Regen','Bei Dämmerung, Nacht oder schlechter Sicht','',2,0);
      sq.run(pkw,'Was wird laut §13 für die Führerscheinprüfung benötigt?','Nur ein Lichtbildausweis','Gültige Erste-Hilfe-Lizenz und eingetragener Wohnsitz','Mindestalter 18 Jahre','',1,0);
      // PKW K.O.
      sq.run(pkw,'Du fährst laut §12 unter Alkohol- oder Drogeneinfluss. Was gilt?','Kleine Mengen sind erlaubt','Nur auf Kurzstrecken erlaubt','Absolutes Fahrverbot','',2,1);
      sq.run(pkw,'Du fährst laut §1 Abs. 2 einen PKW ohne gültige Lizenz. Was droht?','Nur Verwarnung','Das Führen ohne Lizenz ist verboten und strafbar','Kleines Bußgeld','',1,1);
      sq.run(pkw,'Du veranstaltest laut §2 Abs. 4 ein Straßenrennen. Was gilt?','Erlaubt mit Genehmigung','Erlaubt nachts','Rennen auf öffentlichen Straßen sind verboten','',2,1);
      sq.run(pkw,'Du schädigst laut §1 Abs. 1 absichtlich andere Verkehrsteilnehmer. Was droht?','Nur eine Verwarnung','Kleines Bußgeld','Sofortiger Führerscheinentzug und Strafanzeige','',2,1);

      // ── Motorrad ────────────────────────────────────────────────
      sq.run(moto,'Für welche Fahrzeuge gilt laut §13 die Motorrad-Lizenz?','Fahrzeuge mit bis zu 4 Rädern','Fahrzeuge mit maximal 2 Rädern','Nur Motorräder über 125 ccm','',1,0);
      sq.run(moto,'Wie müssen laut §2 Abs. 6 einspurige Fahrzeuge fahren?','Nebeneinander','In beliebiger Formation','Hintereinander','',2,0);
      sq.run(moto,'Braucht ein Rollerfahrer laut §1 Abs. 6 eine Lizenz?','Ja, immer','Nein, für Roller ist keine Lizenz erforderlich','Nur außerorts','',1,0);
      sq.run(moto,'Auf welcher Seite überholt laut §6 ein Motorradfahrer?','Rechts','Links','Zwischen den Spuren','',1,0);
      sq.run(moto,'Wann muss laut §9 die Beleuchtung eines Motorrads eingeschaltet sein?','Nur bei Nacht','Bei Dämmerung, Nacht oder schlechter Sicht','Immer auch tagsüber','',1,0);
      sq.run(moto,'Was gilt laut §12 bei Alkohol am Steuer eines Motorrads?','Geringe Mengen erlaubt','Unter Alkohol- oder Drogeneinfluss darf kein Fahrzeug geführt werden','Gilt nur für PKW','',1,0);
      sq.run(moto,'Wie groß muss laut §5 der Abstand beim Motorrad sein?','Mindestens 5 Meter','Beliebig','So groß, dass bei plötzlichem Bremsen kein Unfall entsteht','',2,0);
      sq.run(moto,'Gilt laut §2 das Rechtsfahrgebot auch für Motorradfahrer?','Gilt nicht für Motorräder','Ja, auch für Motorradfahrer','Nur auf Autobahnen','',1,0);
      sq.run(moto,'Welche Höchstgeschwindigkeit gilt laut §4 innerorts?','80 km/h','100 km/h','120 km/h','',1,0);
      sq.run(moto,'Welche Höchstgeschwindigkeit gilt laut §4 auf der Autobahn?','130 km/h','160 km/h','Keine Begrenzung','',2,0);
      sq.run(moto,'Was gilt laut §11 für die Personenzahl auf dem Motorrad?','Keine Beschränkung','Die zulässige Personenzahl darf nicht überschritten werden','Gilt nur für PKW','',1,0);
      sq.run(moto,'Wer trägt laut §1 Abs. 7 die Verantwortung für die Fahrtauglichkeit des Motorrads?','Die Werkstatt','Der Fahrzeugführer','Der Hersteller','',1,0);
      sq.run(moto,'Darf ein Motorrad laut §2 auf dem Seitenstreifen fahren?','Ja, bei Stau','Nur bei langsamer Fahrt','Nein, Seitenstreifen gehört nicht zur Fahrbahn','',2,0);
      sq.run(moto,'Was gilt laut §3 für Stoppschilder?','Langsamer werden reicht','Nur nachts anhalten','Vollständig anhalten und Vorfahrt gewähren','',2,0);
      sq.run(moto,'Was gilt laut §14 für die Zulassung eines Motorrads?','Keine Zulassung nötig','Nur Versicherung ausreichend','DMV-Zulassung mit amtlichem Kennzeichen erforderlich','',2,0);
      // Motorrad K.O.
      sq.run(moto,'Du fährst laut §1 Abs. 2 ein Motorrad ohne gültige Lizenz. Was droht?','Nur Verwarnung','Das Führen ohne Lizenz ist verboten und strafbar','Kleines Bußgeld','',1,1);
      sq.run(moto,'Du fährst laut §12 fahruntüchtig unter Drogeneinfluss. Was gilt?','Nur auf Kurzstrecken erlaubt','Kleines Bußgeld','Absolutes Fahrverbot – Fahrzeugführung unter Drogen verboten','',2,1);
      sq.run(moto,'Dein Motorrad ist laut §2 Abs. 5 nicht fahrtüchtig. Darfst du es benutzen?','Ja, langsam fahren','Ja, auf kurzen Strecken','Nein, nur fahrtüchtige Fahrzeuge dürfen öffentliche Straßen nutzen','',2,1);

      // ── Boot ────────────────────────────────────────────────────
      sq.run(boot,'Für welche Fahrzeuge gilt laut §13 die Boots-Lizenz?','Nur für Segelboote','Fahrzeuge auf oder unter Wasser','Alle Wasserfahrzeuge über 5 Meter','',1,0);
      sq.run(boot,'Was gilt laut §12 beim Führen eines Bootes unter Alkohol?','Geringe Mengen erlaubt','Unter Alkohol- oder Drogeneinfluss darf kein Fahrzeug geführt werden','Gilt nur für Straßenfahrzeuge','',1,0);
      sq.run(boot,'Was muss laut §1 Abs. 5 auch im Boot mitgeführt werden?','Nur ein Rettungsring','Nichts – auf dem Wasser gelten andere Regeln','Verbandskasten und Reparaturkit','',2,0);
      sq.run(boot,'Wann muss laut §9 die Beleuchtung eingeschaltet sein?','Nur auf hoher See','Bei Dämmerung, Nacht oder schlechter Sicht','Nur bei Nebel','',1,0);
      sq.run(boot,'Was gilt laut §11 für Passagiere im Boot?','Stehen während der Fahrt erlaubt','Fahrer und Passagiere müssen sicher sitzen; Personenzahl darf nicht überschritten werden','Keine besonderen Regeln','',1,0);
      sq.run(boot,'Wie muss man sich laut §1 Abs. 1 gegenüber anderen Wasserfahrzeugen verhalten?','Nur eigene Sicherheit zählt','Niemanden schädigen, gefährden oder behindern','Das regelt die Küstenwache','',1,0);
      sq.run(boot,'Was gilt laut §4 Abs. 1 für die Geschwindigkeit beim Führen eines Bootes?','Immer Vollgas erlaubt','Fahrer muss Fahrzeug jederzeit kontrollieren und Fahrweise anpassen','Es gibt keine Beschränkungen auf Gewässern','',1,0);
      sq.run(boot,'Wie groß muss laut §5 der Abstand zum vorausfahrenden Boot sein?','Immer 20 Meter','So groß, dass bei plötzlichem Bremsen ein Unfall vermieden wird','Kein Abstand nötig auf Gewässern','',1,0);
      sq.run(boot,'Sind laut §2 Abs. 4 Rennen auf öffentlichen Gewässern erlaubt?','Ja, mit Genehmigung','Ja, außerhalb von Häfen','Nein, Rennen sind verboten','',2,0);
      sq.run(boot,'Was gilt laut §14 für die Zulassung eines Bootes?','Keine Zulassung nötig','Boote dürfen nur mit DMV-Zulassung betrieben werden','Nur eine Versicherung reicht','',1,0);
      sq.run(boot,'Auf welcher Seite wird laut §6 überholt?','Rechts','Links','Egal auf dem Wasser','',1,0);
      sq.run(boot,'Was gilt laut §2 Abs. 5 für Fahrzeuge auf öffentlichen Gewässern?','Alle Fahrzeuge dürfen fahren','Nur fahrtüchtige Fahrzeuge, die andere nicht behindern','Gilt nur für Straßen','',1,0);
      sq.run(boot,'Was wird laut §13 Abs. 5 für die Boots-Führerscheinprüfung benötigt?','Nur Lichtbildausweis','Mindestalter 21 Jahre','Gültige Erste-Hilfe-Lizenz und eingetragener Wohnsitz','',2,0);
      sq.run(boot,'Was gilt laut §1 Abs. 2 für das Führen eines Boots ohne gültige Lizenz?','Auf kleinen Gewässern erlaubt','Nur eine Verwarnung droht','Verboten und strafbar','',2,0);
      sq.run(boot,'Welche Höchstgeschwindigkeit gilt laut §4 in speziellen Bereichen wie Häfen?','50 km/h','80 km/h','100 km/h','',2,0);
      // Boot K.O.
      sq.run(boot,'Du führst laut §12 ein Boot mit 1,8 Promille Alkohol. Was gilt?','Nur Verwarnung','Kleines Bußgeld','Absolutes Fahrverbot – Fahren unter Alkohol verboten','',2,1);
      sq.run(boot,'Du fährst laut §1 Abs. 2 ohne Boots-Lizenz auf einem öffentlichen Gewässer. Was droht?','Nichts auf kleinen Gewässern','Nur Verwarnung','Das ist verboten und strafbar','',2,1);
      sq.run(boot,'Du gefährdest laut §1 Abs. 1 absichtlich andere Bootsfahrer. Was droht?','Nur Verwarnung','Kleines Bußgeld','Sofortiger Bootsschein-Entzug und Strafanzeige','',2,1);

      // ── LKW ─────────────────────────────────────────────────────
      sq.run(lkw,'Für welche Fahrzeuge gilt laut §13 die LKW-Lizenz?','Alle Fahrzeuge über 3,5 Tonnen','Lastkraftwagen mit über 4 Rädern und mehr als 200 kg Kofferraumvolumen','Nur Sattelzüge und Anhänger','',1,0);
      sq.run(lkw,'Welche Höchstgeschwindigkeit gilt laut §4 innerorts für LKW?','50 km/h','80 km/h','100 km/h','',2,0);
      sq.run(lkw,'Welche Höchstgeschwindigkeit gilt laut §4 außerorts für LKW?','100 km/h','120 km/h','150 km/h','',2,0);
      sq.run(lkw,'Gibt es laut §4 auf Autobahnen eine Höchstgeschwindigkeit für LKW?','Ja, 100 km/h','Ja, 130 km/h','Nein, keine Begrenzung','',2,0);
      sq.run(lkw,'Was muss laut §1 Abs. 5 auch im LKW mitgeführt werden?','Nur ein Verbandskasten','Nichts Besonderes','Verbandskasten und Reparaturkit','',2,0);
      sq.run(lkw,'Was gilt laut §5 für den Abstand beim LKW?','Mindestens 25 Meter immer','So groß, dass bei plötzlichem Bremsen kein Unfall entsteht','LKW brauchen keinen Abstand','',1,0);
      sq.run(lkw,'Gilt laut §2 das Rechtsfahrgebot auch für LKW?','Gilt nicht für LKW','Ja, es gilt das Rechtsfahrgebot','Nur auf Autobahnen','',1,0);
      sq.run(lkw,'Auf welcher Seite überholt laut §6 ein LKW?','Rechts','Links','LKW dürfen nicht überholen','',1,0);
      sq.run(lkw,'Was gilt laut §7 Abs. 2 an einer Kreuzung, wenn eine Straße mehr Fahrstreifen hat?','Die schmalere Straße hat Vorfahrt','Rechts vor links gilt immer','Die Fahrbahn mit mehr Fahrstreifen hat Vorfahrt','',2,0);
      sq.run(lkw,'Ab wann gilt ein LKW laut §8 als geparkt?','Sofort beim Stehen','Ab 5 Minuten oder wenn Fahrer sich entfernt hat','Ab 15 Minuten','',1,0);
      sq.run(lkw,'Wann muss laut §9 die LKW-Beleuchtung eingeschaltet sein?','Nur nachts','Bei Dämmerung, Nacht oder schlechter Sicht','Nur auf der Autobahn bei Nacht','',1,0);
      sq.run(lkw,'Was gilt laut §12 beim Führen eines LKW unter Alkohol?','Geringe Mengen für Kuriere erlaubt','Unter Alkohol- oder Drogeneinfluss darf kein Fahrzeug geführt werden','Gilt nur für PKW','',1,0);
      sq.run(lkw,'Was gilt laut §11 für Passagiere im LKW?','Beliebige Anzahl Mitfahrer','Zulässige Personenzahl darf nicht überschritten werden','Nur Beifahrer, keine weiteren Passagiere','',1,0);
      sq.run(lkw,'Was gilt laut §14 für die Zulassung eines LKW?','Keine Zulassung für LKW nötig','LKW dürfen nur mit DMV-Zulassung betrieben werden','Nur eine Versicherung reicht','',1,0);
      sq.run(lkw,'Welche Mindestgeschwindigkeit gilt laut §4 auf Autobahnen?','60 km/h','80 km/h','100 km/h','',1,0);
      // LKW K.O.
      sq.run(lkw,'Du fährst laut §1 Abs. 2 einen LKW ohne gültige LKW-Lizenz. Was droht?','Nur Verwarnung','Das Führen ohne Lizenz ist verboten und strafbar','Kleines Bußgeld','',1,1);
      sq.run(lkw,'Du fährst laut §12 einen LKW unter Drogeneinfluss. Was gilt?','Nur auf Kurzstrecken erlaubt','Kleines Bußgeld','Absolutes Fahrverbot – sofortige Fahrtunterbrechung','',2,1);
      sq.run(lkw,'Dein LKW hat laut §1 Abs. 7 defekte Bremsen. Du fährst trotzdem. Was gilt?','Erlaubt auf kurzen Strecken','Nur bei langsamer Fahrt erlaubt','Verboten – Fahrzeugführer trägt Verantwortung für Fahrtauglichkeit','',2,1);

      // ── Flugschein ───────────────────────────────────────────────
      sq.run(flug,'Welche Höchstgeschwindigkeit gilt laut §4 auf Flughäfen?','50 km/h','80 km/h','100 km/h','',2,0);
      sq.run(flug,'Was muss laut §1 Abs. 5 auch in Flugzeugen mitgeführt werden?','Nur ein Erste-Hilfe-Kasten','Verbandskasten und Reparaturkit','Nichts auf dem Flughafen','',1,0);
      sq.run(flug,'Was gilt laut §12 beim Führen eines Flugzeugs unter Alkohol?','Geringe Mengen erlaubt','Unter Alkohol- oder Drogeneinfluss darf kein Fahrzeug geführt werden','Gilt nicht für Piloten','',1,0);
      sq.run(flug,'Wann muss laut §9 die Beleuchtung am Flugzeug eingeschaltet sein?','Nur nachts','Bei Dämmerung, Nacht oder schlechter Sicht','Immer auch tagsüber','',1,0);
      sq.run(flug,'Was wird laut §13 Abs. 5 für die Piloten-Prüfung benötigt?','Nur Lichtbildausweis','Gültige Erste-Hilfe-Lizenz und eingetragener Wohnsitz','Mindestalter 21 Jahre','',1,0);
      sq.run(flug,'Was gilt laut §11 für Passagiere im Flugzeug?','Stehen erlaubt wenn festgehalten','Fahrer und Passagiere müssen sicher sitzen; Personenzahl darf nicht überschritten werden','Keine besonderen Regeln','',1,0);
      sq.run(flug,'Wie muss sich laut §1 Abs. 1 ein Pilot gegenüber anderen Luftfahrzeugen verhalten?','Eigene Sicherheit geht immer vor','Niemanden schädigen, gefährden oder behindern','Das regelt der Tower allein','',1,0);
      sq.run(flug,'Was gilt laut §14 für die Zulassung eines Flugzeugs?','Keine Zulassung für Flugzeuge','Flugzeuge dürfen nur mit DMV-Zulassung betrieben werden','Nur eine Versicherung reicht','',1,0);
      sq.run(flug,'Was gilt laut §1 Abs. 2 für das Führen eines Flugzeugs ohne Pilotenlizenz?','Auf kurzen Strecken erlaubt','Nur Verwarnung droht','Das Führen ohne Lizenz ist verboten und strafbar','',2,0);
      sq.run(flug,'Was gilt laut §4 Abs. 1 für die Anpassung der Geschwindigkeit?','Immer Vollgeschwindigkeit erlaubt','Fahrer muss Fahrzeug jederzeit kontrollieren und Fahrweise anpassen','Nur bei schlechtem Wetter','',1,0);
      sq.run(flug,'Was gilt laut §10 Abs. 6 für ACLS-Fahrzeuge?','Rotes Blinklicht verwenden','Normales Licht reicht','Gelbes Rundumlicht ist zu verwenden','',2,0);
      sq.run(flug,'Welche Fahrzeuge sind laut §10 Abs. 1 von der StVO befreit?','Alle Fahrzeuge mit Sirene','Fahrzeuge mit rot-blau Blinklicht (Sonderrechte)','Jedes Fahrzeug bei Eile','',1,0);
      sq.run(flug,'Was gilt laut §10 Abs. 4 für Fahrzeuge mit Sonder- und Wegerechten?','Andere Verkehrsteilnehmer müssen nicht reagieren','Unverzüglich freie Bahn schaffen','Nur bei eingeschaltetem Blaulicht reagieren','',1,0);
      sq.run(flug,'Welche Höchstgeschwindigkeit gilt laut §4 innerorts?','80 km/h','90 km/h','100 km/h','',2,0);
      sq.run(flug,'Woran erkennt man laut §15 eine Autobahn?','Grüne Straßenmarkierungen','Blaue Schilder','Rote Straßenmarkierungen','',2,0);
      // Flugschein K.O.
      sq.run(flug,'Du fliegst laut §1 Abs. 2 ohne Pilotenlizenz. Was droht?','Nur Verwarnung','Das ist verboten und strafbar','Kleines Bußgeld','',1,1);
      sq.run(flug,'Du bist laut §12 betrunken und willst fliegen. Was gilt?','Auf kurzen Strecken erlaubt','Nur tagsüber erlaubt','Absolutes Fahrverbot – Führen unter Alkohol verboten','',2,1);
      sq.run(flug,'Du gefährdest laut §1 Abs. 1 absichtlich andere Luftfahrzeuge. Was droht?','Nur Verwarnung','Kleines Bußgeld','Sofortiger Lizenzentzug und Strafanzeige','',2,1);
    })();
  }

  return db;
}

module.exports = { initDb };
