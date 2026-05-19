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

  // Migration: is_ko Spalte
  try { db.exec('ALTER TABLE exam_questions ADD COLUMN is_ko INTEGER DEFAULT 0'); } catch(e) {}

  if (db.prepare('SELECT COUNT(*) as c FROM exam_questions').get().c === 0) {
    const cats = {};
    db.prepare('SELECT id, name FROM exam_categories').all().forEach(c => { cats[c.name] = c.id; });
    const sq = db.prepare(
      'INSERT INTO exam_questions (category_id,question,option_a,option_b,option_c,option_d,correct_answer,is_ko) VALUES (?,?,?,?,?,?,?,?)'
    );
    db.transaction(() => {
      const pkw = cats['PKW'], moto = cats['Motorrad'], boot = cats['Boot'], lkw = cats['LKW'], flug = cats['Flugschein'];

      // ── PKW ─────────────────────────────────────────────────────
      sq.run(pkw,'Welche Höchstgeschwindigkeit gilt innerorts (ColdRP STVO §4)?','50 km/h','70 km/h','100 km/h','130 km/h',2,0);
      sq.run(pkw,'Welche Höchstgeschwindigkeit gilt außerorts (ColdRP STVO §4)?','100 km/h','120 km/h','150 km/h','200 km/h',2,0);
      sq.run(pkw,'Welche Höchstgeschwindigkeit gilt auf der Autobahn (ColdRP STVO §4)?','130 km/h','160 km/h','200 km/h','Keine Begrenzung',3,0);
      sq.run(pkw,'Wie groß ist der Mindest-Sicherheitsabstand bei 100 km/h?','25 Meter','50 Meter','75 Meter','100 Meter',1,0);
      sq.run(pkw,'Ab welchem Promillewert gilt relatives Fahrverbot?','0,3 Promille','0,5 Promille','0,8 Promille','1,0 Promille',1,0);
      sq.run(pkw,'Ab welchem Promillewert gilt absolutes Fahrverbot?','0,8 Promille','1,0 Promille','1,3 Promille','1,6 Promille',3,0);
      sq.run(pkw,'Was bedeutet ein weißes Dreieck auf der Fahrbahn?','Haltepunkt','Vorfahrt gewähren','Wendebereich','Fußgängerzone',1,0);
      sq.run(pkw,'Wie lange darf man im absoluten Halteverbot stehen?','Gar nicht','3 Minuten','5 Minuten','10 Minuten',0,0);
      sq.run(pkw,'Wann muss die Warnblinkanlage eingeschaltet werden?','Immer beim Parken','Bei Panne oder Unfall','Beim Rückwärtsfahren','Nie',1,0);
      sq.run(pkw,'Wie groß ist der Mindestabstand beim Parken vor einer Kreuzung?','3 Meter','5 Meter','8 Meter','10 Meter',1,0);
      sq.run(pkw,'Was gilt am Zebrastreifen?','Autos haben Vorfahrt','Fußgänger haben immer Vorrang','Nachts haben Autos Vorrang','Niemand hat Vorrang',1,0);
      sq.run(pkw,'Was bedeutet eine durchgezogene weiße Mittellinie?','Überholen erlaubt','Spurwechsel erlaubt','Überholen und Spurwechsel verboten','Sonderfahrspur',2,0);
      sq.run(pkw,'Was gilt laut ColdRP STVO §3 für Ampeln (Lichtsignalanlagen)?','Absolut bindend für alle','Richtlinie – nicht rechtsverbindlich','Nur für LKW bindend','Nur nachts bindend',1,0);
      sq.run(pkw,'Wie verhält man sich bei einem Unfall?','Weiterfahren','Anhalten, Warnblinkanlage, Absichern, Notruf','Nur fotografieren','Warten',1,0);
      sq.run(pkw,'Was bedeutet ein Stoppschild?','Vorfahrt gewähren','An der Linie anhalten und Vorfahrt gewähren','Einfahrt verboten','Parken verboten',1,0);
      sq.run(pkw,'Wo ist Parken grundsätzlich verboten?','Auf breiten Straßen','Auf Gehwegen und Radwegen','In Gewerbegebieten','Auf Parkplätzen',1,0);
      sq.run(pkw,'Wann gilt Rechts-vor-Links?','Immer','Wenn kein anderes Zeichen vorhanden ist','Nur auf Nebenstraßen','Nur nachts',1,0);
      sq.run(pkw,'Ab wann muss man das Licht einschalten?','Erst ab Dunkelheit','Ab Dämmerung und bei schlechter Sicht','Nur nachts','Nur bei Regen',1,0);
      sq.run(pkw,'Wer muss den Sicherheitsgurt tragen?','Nur der Fahrer','Alle Insassen','Nur Fahrer und Beifahrer','Niemand ist verpflichtet',1,0);
      sq.run(pkw,'Wie weit darf man rückwärts fahren?','Beliebig weit','Nur so weit wie nötig, um wieder vorwärts zu fahren','Nicht rückwärts fahren','Bis 50 Meter',1,0);
      // PKW K.O.
      sq.run(pkw,'Du rammst absichtlich ein anderes Fahrzeug im Verkehr. Was droht?','Verwarnung','Kleines Bußgeld','Sofortiger Führerscheinentzug und Strafanzeige','Nichts beim ersten Mal',2,1);
      sq.run(pkw,'Du fährst auf der falschen Fahrspur entgegen des Verkehrs. Was tust du?','Weiterfahren','Beschleunigen','Sofort anhalten und umkehren','Hupen',2,1);
      sq.run(pkw,'Ein Polizeibeamter gibt dir ein Stopsignal. Du ignorierst es. Was droht?','Nichts','Kleines Bußgeld','Sofortige Festnahme und Führerscheinabnahme','Verwarnung',2,1);
      sq.run(pkw,'Du hast 1,7 Promille Alkohol. Darfst du ein Fahrzeug führen?','Ja, auf kurzen Strecken','Ja, wenn jemand neben dir sitzt','Nein, absolutes Fahrverbot','Nur außerorts',2,1);
      sq.run(pkw,'Du gefährdest absichtlich andere Verkehrsteilnehmer. Was passiert?','Verwarnung','Bußgeld','Sofortiger Führerscheinentzug und Strafanzeige','Nichts bei erstem Mal',2,1);

      // ── Motorrad ────────────────────────────────────────────────
      sq.run(moto,'Welchen Helm muss ein Motorradfahrer tragen?','Fahrradhelm','ECE-zugelassener Schutzhelm','Kein Helm nötig','Bauhelm',1,0);
      sq.run(moto,'Was muss beim Überholen mit dem Motorrad beachtet werden?','Nichts Besonderes','Ausreichender Seitenabstand','Hupen ist Pflicht','Nur links überholen',1,0);
      sq.run(moto,'Welches Licht ist bei Motorrädern tagsüber Pflicht?','Kein Licht','Abblendlicht','Fernlicht','Tagfahrlicht',1,0);
      sq.run(moto,'Was muss vor jeder Fahrt am Motorrad geprüft werden?','Lackfarbe','Reifendruck und Bremsen','Radio','Sitzpolster',1,0);
      sq.run(moto,'Wie bremst man auf einem Motorrad am effektivsten?','Nur Hinterradbremse','Nur Vorderradbremse','Beide Bremsen gleichzeitig','Gas wegnehmen reicht',2,0);
      sq.run(moto,'Was ist beim Fahren im Regen zu beachten?','Schneller fahren','Abstand vergrößern','Licht ausschalten','Nichts ändern',1,0);
      sq.run(moto,'Was versteht man unter Nebeneinanderfahren?','Mehrspuriges Fahren','Zwei Motorräder auf einer Spur nebeneinander','Kolonnenfahren','Überholen',1,0);
      sq.run(moto,'Ist Nebeneinanderfahren auf einer Fahrspur erlaubt?','Ja, immer','Ja, bei langsamer Fahrt','Nein, verboten','Nur auf der Autobahn',2,0);
      sq.run(moto,'Was bedeutet ABS beim Motorrad?','Automatisches Bremssystem','Anti-Blockier-System','Außen-Brems-Sensor','Aluminiumbremsscheibe',1,0);
      sq.run(moto,'Darf man mit dem Motorrad auf dem Gehweg fahren?','Ja, bei wenig Fußgängern','Ja, bis 10 km/h','Nein, Gehwege sind für Fußgänger','Ja, bei schmalem Fahrweg',2,0);
      sq.run(moto,'Was ist bei der Kurvenfahrt auf nasser Straße besonders wichtig?','Beschleunigen','Geschwindigkeit vor der Kurve reduzieren','Schräglage erhöhen','Innen enger fahren',1,0);
      sq.run(moto,'Wie groß ist der empfohlene Mindestabstand bei 80 km/h?','20 Meter','40 Meter','80 Meter','100 Meter',1,0);
      sq.run(moto,'Was gilt für Motorrad-Sozius?','Kein Helm nötig','Benötigt zugelassenen Helm','Darf ohne Sitzplatz mitfahren','Ab 14 Jahren erlaubt',1,0);
      sq.run(moto,'Wann muss der Seitenständer eingeklappt sein?','Nie','Immer während der Fahrt','Nur auf der Autobahn','Nur bei hohen Geschwindigkeiten',1,0);
      sq.run(moto,'Darf man zwischen stehenden Fahrzeugkolonnen hindurchfahren?','Ja, immer erlaubt','Ja, bis 30 km/h','Nein, verboten und gefährlich','Nur auf der Autobahn',2,0);
      // Motorrad K.O.
      sq.run(moto,'Du willst Motorrad fahren, hast aber keinen Helm. Was tust du?','Trotzdem fahren','Langsam fahren','Das Motorrad stehen lassen','Fahrradhelm nehmen',2,1);
      sq.run(moto,'Dein Sozius hat keinen genehmigten Schutzhelm. Was tust du?','Trotzdem mitfahren','Langsam fahren','Den Sozius nicht mitnehmen','Kurze Strecken sind ok',2,1);
      sq.run(moto,'Du fährst Schlangenlinien auf der Straße. Was droht?','Nichts','Kleines Bußgeld','Sofortiger Führerscheinentzug wegen Fahruntüchtigkeit','Verwarnung',2,1);
      sq.run(moto,'Deine Bremsen sind defekt. Darfst du losfahren?','Ja, auf kurzen Strecken','Ja, langsam fahren','Nein, Fahrzeug ist nicht verkehrssicher','Nur auf ruhigen Straßen',2,1);
      sq.run(moto,'Du fährst ohne gültige Fahrerlaubnis. Was passiert?','Verwarnung','Bußgeld','Sofortige Festnahme und Strafanzeige','Nichts, wenn kein Unfall',2,1);

      // ── Boot ────────────────────────────────────────────────────
      sq.run(boot,'Welche Seite des Bootes ist Backbord?','Rechte Seite','Linke Seite','Vorderteil','Hinterteil',1,0);
      sq.run(boot,'Welche Farbe hat das Backbordlicht?','Grün','Rot','Weiß','Blau',1,0);
      sq.run(boot,'Welche Farbe hat das Steuerbordlicht?','Rot','Grün','Weiß','Blau',1,0);
      sq.run(boot,'Wie schnell darf man in Hafengebieten fahren?','5 Knoten','10 Knoten','15 Knoten','20 Knoten',0,0);
      sq.run(boot,'Was bedeutet 5 kurze Töne auf dem Schiffshorn?','Überholmanöver','Gefahrensignal','Ankerwerfen','Grüßen',1,0);
      sq.run(boot,'Was versteht man unter Steuerbord?','Linke Seite','Rechte Seite','Vorderteil','Hinterteil',1,0);
      sq.run(boot,'Was muss an Bord eines Bootes für jeden Insassen vorhanden sein?','Taucherausrüstung','Rettungsweste','Erste-Hilfe-Kasten','Werkzeug',1,0);
      sq.run(boot,'Welche Farbe hat das Hecklicht eines Bootes?','Rot','Grün','Weiß','Blau',2,0);
      sq.run(boot,'Was bedeutet ein langer Ton auf dem Schiffshorn?','Steuerbord abbiegen','Backbord abbiegen','Ich fahre vorwärts','Notsignal',2,0);
      sq.run(boot,'Welche Fahrzeuge haben auf dem Wasser generell Vorfahrt vor Motorbooten?','Schnellboote','Segelboote','Kleinboote','Jetskis',1,0);
      sq.run(boot,'Was versteht man unter einem Ankerball?','Ein Spielzeug','Rundes schwarzes Signal beim Ankern am Bug','Ein Schwimmkörper','Ein Fisch',1,0);
      sq.run(boot,'Was ist bei Nebel auf dem Wasser zu beachten?','Geschwindigkeit erhöhen','Geschwindigkeit reduzieren und Signalhorn benutzen','Licht ausschalten','Nichts ändern',1,0);
      sq.run(boot,'Darf man in einer Fahrrinne ankern?','Ja, kurzzeitig','Nur nachts','Nein, verboten','Bei ruhigem Wetter',2,0);
      sq.run(boot,'Welche Seite weichen zwei aufeinander zufahrende Motorboote aus?','Beide nach Backbord','Beide nach Steuerbord','Das kleinere Boot','Das langsamere Boot',1,0);
      sq.run(boot,'Wann muss nachts das Navigationslicht eingeschaltet sein?','Nur auf Hoher See','Immer während der Fahrt','Nur bei schlechter Sicht','Nur im Hafen',1,0);
      // Boot K.O.
      sq.run(boot,'Dein Boot sinkt. Was ist der erste Schritt?','Fotos machen','MAYDAY-Notruf absetzen und Insassen sichern','Cargo abwerfen','Weiterschwimmen',1,1);
      sq.run(boot,'Ein Polizeiboot fordert dich per Blaulicht auf anzuhalten. Du ignorierst es. Was passiert?','Nichts','Geldstrafe','Sofortige Festnahme und Bootsschein-Entzug','Verwarnung',2,1);
      sq.run(boot,'Du führst das Boot mit 2,0 Promille Alkohol. Was droht?','Nur Verwarnung','Bußgeld','Sofortiger Bootsschein-Entzug und Strafanzeige','Nichts auf dem Wasser',2,1);
      sq.run(boot,'Du fährst ohne Rettungswesten an Bord. Was passiert?','Nichts','Verwarnung','Sofortige Fahrtunterbrechung und Beanstandung','Kleines Bußgeld',2,1);
      sq.run(boot,'Du lenkst das Boot absichtlich auf ein anderes Fahrzeug zu. Was ist das?','Überholen','Ordnungswidrigkeit','Gefährdung – sofortige Festnahme','Warnung',2,1);

      // ── LKW ─────────────────────────────────────────────────────
      sq.run(lkw,'Welche Höchstgeschwindigkeit gilt auf der Autobahn (ColdRP STVO §4)?','100 km/h','130 km/h','150 km/h','Keine Begrenzung',3,0);
      sq.run(lkw,'Welche Höchstgeschwindigkeit gilt außerorts (ColdRP STVO §4)?','100 km/h','120 km/h','150 km/h','200 km/h',2,0);
      sq.run(lkw,'Was muss bei der Ladungssicherung beachtet werden?','Nichts','Ladung muss rutschsicher gesichert sein','Nur bei langen Fahrten','Optional',1,0);
      sq.run(lkw,'Nach wie vielen Stunden Fahrt muss ein LKW-Fahrer Pause machen?','Nach 3 Stunden','Nach 4,5 Stunden','Nach 6 Stunden','Nach 8 Stunden',1,0);
      sq.run(lkw,'Was ist die zulässige Gesamtmasse eines LKW?','20 Tonnen','40 Tonnen','50 Tonnen','60 Tonnen',1,0);
      sq.run(lkw,'Welche Pflichtausrüstung muss im LKW vorhanden sein?','Nur Verbandskasten','Verbandskasten, Warndreieck, Feuerlöscher','Nur Warndreieck','Keine Pflicht',1,0);
      sq.run(lkw,'Wie weit muss das Warndreieck bei einer Panne aufgestellt werden?','10 Meter','30 Meter','100 Meter','200 Meter',2,0);
      sq.run(lkw,'Was prüft der Fahrer vor der Abfahrt?','Nichts','Licht, Bremsen, Bereifung, Ladung','Nur den Tank','Farbe des Fahrzeugs',1,0);
      sq.run(lkw,'Was bedeutet ADR beim Gütertransport?','Automatisches Dieselregelsystem','Vorschrift für Gefahrguttransporte','Allgemeines Druckreglersystem','Arbeitstag-Regelung',1,0);
      sq.run(lkw,'Was gilt bei Rückwärtsfahren mit LKW bei eingeschränkter Sicht?','Immer ohne Hilfe','Einweiser ist erforderlich','Nur Spiegel benutzen','Verboten',1,0);
      sq.run(pkw,'Welche Höchstgeschwindigkeit gilt auf einem Parkplatz (ColdRP STVO §4)?','20 km/h','30 km/h','40 km/h','50 km/h',2,0);
      sq.run(lkw,'Was ist bei Winterbedingungen für LKW vorgeschrieben?','Nichts Besonderes','Winterreifen oder M+S-Reifen','Kettenpflicht immer','Fahrverbot',1,0);
      sq.run(lkw,'Welches Schild zeigt ein Überholverbot für LKW?','Rotes Dreieck','Weißes Dreieck','Rundes Schild mit LKW und rotem Strich','Blaues Schild',2,0);
      sq.run(lkw,'Ab welchem Gewicht ist ein Fahrtenschreiber Pflicht?','Über 2 Tonnen','Über 3,5 Tonnen Gesamtgewicht','Ab 5 Tonnen','Immer',1,0);
      sq.run(lkw,'Wie lang darf ein LKW maximal sein?','14 Meter','16,5 Meter','18 Meter','22 Meter',1,0);
      // LKW K.O.
      sq.run(lkw,'Du lädst einen LKW. Die Ladung ist ungesichert. Darfst du losfahren?','Ja, Kurzstrecke','Ja, langsam','Nein, erst Ladung sichern, sonst Fahrtverbot','Nur auf Privatgelände',2,1);
      sq.run(lkw,'Du hast 10 Stunden ununterbrochen LKW gefahren. Darfst du weitersfahren?','Ja, wenn du dich fit fühlst','Ja, noch 2 Stunden','Nein, Lenkzeit überschritten','Ja, auf der Autobahn',2,1);
      sq.run(lkw,'Deine Bremswarnanlage leuchtet auf. Was tust du?','Weiterfahren','Geschwindigkeit reduzieren','Sofort anhalten und LKW prüfen lassen','Warnanlage ignorieren',2,1);
      sq.run(lkw,'Deine Ladung fällt auf die Straße. Was tust du ZUERST?','Weiterfahren','Fotos machen','Straße absichern und Polizei rufen','Warten',2,1);
      sq.run(lkw,'Du fährst mit dem LKW durch ein ausgewiesenes Sperrgebiet. Was droht?','Kleines Bußgeld','Verwarnung','Sofortige Fahrtunterbrechung und Strafanzeige','Nichts',2,1);

      // ── Flugschein ───────────────────────────────────────────────
      sq.run(flug,'Was bedeutet VFR?','Very Fast Route','Visual Flight Rules','Vertical Fly Regulation','Vehicle Flight Record',1,0);
      sq.run(flug,'Was bedeutet IFR?','Intelligent Flight Regulation','Instrument Flight Rules','Internal Fuel Reserve','Infrared Flight Range',1,0);
      sq.run(flug,'Was prüft man im Pre-Flight Check zuerst?','Innenausstattung','Kraftstoff und Öl','Farbe des Flugzeugs','Sitzkomfort',1,0);
      sq.run(flug,'Welche Mindesthöhe gilt über bewohntem Gebiet?','100 Meter','150 Meter','300 Meter','500 Meter',2,0);
      sq.run(flug,'In welcher Richtung dreht die Standard-Platzrunde?','Rechts','Links','Gerade','Variabel',1,0);
      sq.run(flug,'Was ist die QNH-Einstellung?','Geschwindigkeit','Luftdruck bezogen auf Meeresspiegel','Kursangabe','Kraftstoffmenge',1,0);
      sq.run(flug,'Welches Licht hat ein Flugzeug auf der linken Seite (Backbord)?','Grün','Rot','Weiß','Blau',1,0);
      sq.run(flug,'Was bedeutet MAYDAY?','Schönes Wetter','Höchster Notruf – Lebensgefahr','Freie Landebahn','Routine-Meldung',1,0);
      sq.run(flug,'Was bedeutet Transponder-Code 7500?','Notfall','Funk ausgefallen','Flugzeugentführung','Alles normal',2,0);
      sq.run(flug,'Was bedeutet Transponder-Code 7600?','Notfall','Funk ausgefallen','Entführung','Alles normal',1,0);
      sq.run(flug,'Was bedeutet ATC?','Automatic Thrust Control','Air Traffic Control – Flugsicherung','Aircraft Training Certificate','Altitude Tracking Computer',1,0);
      sq.run(flug,'Welches Licht leuchtet am Heck eines Flugzeugs?','Rot','Grün','Weiß','Blau',2,0);
      sq.run(flug,'Was ist QFE?','Kurs zum Zielflugplatz','Luftdruck am Flugplatz-Niveau','Kraftstoffverbrauch','Flughöhe',1,0);
      sq.run(flug,'Wann werden Bremsklappen (Spoiler) gesetzt?','Beim Start','Beim Landeanflug zur Geschwindigkeitsreduzierung','Im Reiseflug','Nie',1,0);
      sq.run(flug,'Wie viel Kraftstoff-Reserve ist bei VFR-Flügen einzuplanen?','15 Minuten','30 Minuten','45 Minuten','1 Stunde',1,0);
      // Flugschein K.O.
      sq.run(flug,'Du hast Triebwerksausfall. Was ist der erste Schritt?','Gas geben','MAYDAY senden und Notlandeplatz suchen','Höhe erhöhen','Warten',1,1);
      sq.run(flug,'Du fliegst in ein ausgewiesenes Sperrgebiet. Was ist die Konsequenz?','Verwarnung','Kleines Bußgeld','Sofortiger Lizenzentzug und Strafverfolgung','Nichts, wenn kurz',2,1);
      sq.run(flug,'Du startest ohne Pre-Flight Check. Was ist das Risiko?','Kein Risiko','Kleines Risiko','Lebensgefahr und drohender Lizenzentzug','Nur bei langen Strecken',2,1);
      sq.run(flug,'Du hörst MAYDAY dreifach auf dem Funk. Was tust du?','Weiterfliegen','Frequenz wechseln','Funkstille halten – Notruf hat Priorität','Lautstärke reduzieren',2,1);
      sq.run(flug,'Dein Kraftstoff reicht nur noch 10 Minuten. Minimum ist 30 Min Reserve. Was tust du?','Weiterfliegen','Höhe erhöhen','Sofort nächsten Flugplatz anfliegen','Warten auf Wetterbesserung',2,1);
    })();
  }

  return db;
}

module.exports = { initDb };
