# ACLS Automobil-Club Website

Dies ist ein statisches Website-Design für einen Automobil-Club mit folgenden Funktionen:

- Discord-basierte Anmeldung (Mock-Login via Discord-ID)
- Wöchentliche Wahl des "Mitarbeiters der Woche"
- Prüfungsmodul mit regulären und Blitztests
- Bürgerregister für absolvierte Führerschein-Prüfungen
- Interaktive Karte mit GTA-Abschleppspots
- Fraktionsfarben-Datenbank
- Admin-Panel zur Verwaltung von Benutzern, Prüfungsfragen und Hausverboten
- Benutzerprofil mit Statistiken

## Dateien

- `index.html` - Die Website-Oberfläche
- `styles.css` - Layout und Styling
- `script.js` - Interaktive Logik, Datenverwaltung und Admin-Funktionen

## Nutzung

1. Öffne `index.html` im Browser.
2. Klicke auf "Discord anmelden", um dich anzumelden.
3. Als Admin kannst du im Admin-Bereich Benutzer und Prüfungsfragen verwalten.
4. Starte Prüfungen im Abschnitt "Prüfungen".

## Hinweis

Diese Version läuft vollständig im Browser und verwendet `localStorage` für die Speicherung der Daten. Für eine echte Produktion müsste die Discord-Authentifizierung durch OAuth und eine serverseitige Datenbank ergänzt werden.
