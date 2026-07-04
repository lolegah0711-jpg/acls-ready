/* ================================================================
   ACLS Frontend SPA — communicates with Express backend via fetch
   ================================================================ */

// Gibt die ISO-Kalenderwoche als zweistellige Zahl zurück.
// Unterstützt beide Formate: '2026-W21' und '2026-05-18' (Monday-Datum).
function isoWeek(weekStr) {
  if (!weekStr) return '';
  if (weekStr.includes('-W')) return weekStr.split('-W')[1];
  const d = new Date(weekStr + 'T12:00:00');
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startW1 = new Date(jan4);
  startW1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return String(Math.round((d - startW1) / 604800000) + 1).padStart(2, '0');
}

// ── Badge Definitionen ───────────────────────────────────────────
const BADGE_DEFS = {
  ic_10:          { icon: 'fa-clock',          color: '#cd7f32', label: '10h IC-Zeit',       desc: '10 Stunden ingame',          progress: s => ({ cur: s.icTotal,    max: 10  }) },
  ic_50:          { icon: 'fa-hourglass-half', color: '#a8a9ad', label: '50h IC-Zeit',       desc: '50 Stunden ingame',          progress: s => ({ cur: s.icTotal,    max: 50  }) },
  ic_100:         { icon: 'fa-hourglass-end',  color: '#ffd700', label: '100h IC-Zeit',      desc: '100 Stunden ingame',         progress: s => ({ cur: s.icTotal,    max: 100 }) },
  ic_250:         { icon: 'fa-star',           color: '#f97316', label: '250h IC-Zeit',      desc: '250 Stunden ingame',         progress: s => ({ cur: s.icTotal,    max: 250 }) },
  ic_500:         { icon: 'fa-crown',          color: '#00f5ff', label: '500h IC-Zeit',      desc: '500 Stunden ingame',         progress: s => ({ cur: s.icTotal,    max: 500 }) },
  cat_pkw:        { icon: 'fa-car',            color: '#f97316', label: 'PKW-Prüfer',        desc: 'PKW-Prüfung abgenommen',     progress: null },
  cat_motorrad:   { icon: 'fa-motorcycle',     color: '#ef4444', label: 'Motorrad-Prüfer',   desc: 'Motorrad-Prüfung abgenommen',progress: null },
  cat_boot:       { icon: 'fa-ship',           color: '#3b82f6', label: 'Boot-Prüfer',       desc: 'Boot-Prüfung abgenommen',    progress: null },
  cat_lkw:        { icon: 'fa-truck',          color: '#22c55e', label: 'LKW-Prüfer',        desc: 'LKW-Prüfung abgenommen',     progress: null },
  cat_flugschein: { icon: 'fa-plane',          color: '#a855f7', label: 'Pilot-Prüfer',      desc: 'Flugschein-Prüfung abgenommen',progress: null },
  exams_10:       { icon: 'fa-clipboard-check',color: '#cd7f32', label: '10 Prüfungen',      desc: '10 Prüfungen abgenommen',    progress: s => ({ cur: s.conducted,  max: 10  }) },
  exams_50:       { icon: 'fa-clipboard-check',color: '#a8a9ad', label: '50 Prüfungen',      desc: '50 Prüfungen abgenommen',    progress: s => ({ cur: s.conducted,  max: 50  }) },
  exams_100:      { icon: 'fa-clipboard-check',color: '#ffd700', label: '100 Prüfungen',     desc: '100 Prüfungen abgenommen',   progress: s => ({ cur: s.conducted,  max: 100 }) },
  eow_1:          { icon: 'fa-trophy',         color: '#cd7f32', label: 'MdW-Sieger',        desc: '1× Mitarbeiter der Woche',   progress: s => ({ cur: s.eowWins,    max: 1   }) },
  eow_3:          { icon: 'fa-trophy',         color: '#a8a9ad', label: 'Dreifach-Sieger',   desc: '3× Mitarbeiter der Woche',   progress: s => ({ cur: s.eowWins,    max: 3   }) },
  eow_5:          { icon: 'fa-trophy',         color: '#ffd700', label: 'Legende',           desc: '5× Mitarbeiter der Woche',   progress: s => ({ cur: s.eowWins,    max: 5   }) },
  game_3:         { icon: 'fa-gamepad',        color: '#cd7f32', label: 'Spieler',           desc: '3 verschiedene Minispiele gespielt',  progress: s => ({ cur: s.distinctGames || 0, max: 3  }) },
  game_10:        { icon: 'fa-gamepad',        color: '#ffd700', label: 'Zocker',            desc: '10 verschiedene Minispiele gespielt', progress: s => ({ cur: s.distinctGames || 0, max: 10 }) },
  duel_5:         { icon: 'fa-bolt',           color: '#f472b6', label: 'Duellant',          desc: '5 Quiz-Duelle gewonnen',     progress: s => ({ cur: s.duelWins || 0,    max: 5    }) },
  duel_25:        { icon: 'fa-bolt',           color: '#ffd700', label: 'Duell-Meister',     desc: '25 Quiz-Duelle gewonnen',    progress: s => ({ cur: s.duelWins || 0,    max: 25   }) },
  tow_pro:        { icon: 'fa-truck-pickup',   color: '#fb923c', label: 'Abschlepp-Profi',   desc: '1.000+ Punkte im Simulator', progress: s => ({ cur: s.towBest || 0,     max: 1000 }) },
  bj_500:         { icon: 'fa-heart',          color: '#ef4444', label: 'High Roller',       desc: '500+ Coins in einer Blackjack-Hand', progress: s => ({ cur: s.bjBest || 0, max: 500 }) },
  coins_1k:       { icon: 'fa-coins',          color: '#cd7f32', label: 'Sparer',            desc: '1.000 Coins verdient',       progress: s => ({ cur: s.coinsEarned || 0, max: 1000  }) },
  coins_10k:      { icon: 'fa-coins',          color: '#ffd700', label: 'Krösus',            desc: '10.000 Coins verdient',      progress: s => ({ cur: s.coinsEarned || 0, max: 10000 }) },
  streak_7:       { icon: 'fa-fire',           color: '#fb923c', label: '7-Tage-Serie',      desc: '7 Tage in Folge Tagesbonus abgeholt',  progress: s => ({ cur: s.bestStreak || 0, max: 7  }) },
  streak_30:      { icon: 'fa-fire',           color: '#ffd700', label: '30-Tage-Serie',     desc: '30 Tage in Folge Tagesbonus abgeholt', progress: s => ({ cur: s.bestStreak || 0, max: 30 }) },
  // Geheime Abzeichen – werden nicht angezeigt bis sie freigeschaltet sind
  secret_wheel_first:  { icon: 'fa-dharmachakra', color: '#c084fc', label: 'Erstes Drehen',    desc: 'Das Daily Wheel zum ersten Mal gedreht', progress: null, secret: true },
  secret_dm_first:     { icon: 'fa-paper-plane',  color: '#60a5fa', label: 'Erstes Wort',      desc: 'Die erste Direktnachricht gesendet',     progress: null, secret: true },
  secret_friend_first: { icon: 'fa-handshake',    color: '#4ade80', label: 'Erste Verbindung', desc: 'Den ersten Freund hinzugefügt',          progress: null, secret: true },
  secret_coins_50k:    { icon: 'fa-piggy-bank',   color: '#ffd700', label: 'Goldreserve',      desc: '50.000 Coins insgesamt verdient',        progress: null, secret: true },
  secret_games_15:     { icon: 'fa-dice',         color: '#f472b6', label: 'Vollständig',      desc: '15 verschiedene Minispiele gespielt',    progress: null, secret: true },
};

function renderBadge(key, b, earned, isNext, date, stats) {
  // Geheime Badges: vor dem Freischalten nur als Fragezeichen anzeigen
  if (b.secret && !earned) {
    return `<div title="Geheimes Abzeichen – durch eine besondere Aktion freischalten" style="display:flex;flex-direction:column;align-items:center;gap:.3rem;width:74px;opacity:.18">
      <div style="position:relative;width:48px;height:48px"><svg viewBox="0 0 44 44" style="position:absolute;inset:0;width:100%;height:100%"><circle cx="22" cy="22" r="19" fill="none" stroke="var(--border)" stroke-width="2.5"/></svg><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--surface2);border-radius:50%;font-size:1.1rem;color:var(--muted)">?</div></div>
      <span style="font-size:.65rem;text-align:center;color:var(--muted)">Geheim</span>
    </div>`;
  }
  const circ    = 119.38; // 2π × r19
  const pData   = b.progress ? b.progress(stats) : null;
  const pct     = earned ? 1 : pData ? Math.min(pData.cur / pData.max, 1) : (earned ? 1 : 0);
  const color   = earned ? '#22c55e' : b.color;
  const opacity = earned ? '1' : isNext ? '0.75' : pct > 0 ? '0.55' : '0.22';
  const tip     = `${b.desc}${pData && !earned ? ` (${pData.cur % 1 === 0 ? pData.cur : pData.cur.toFixed(1)} / ${pData.max})` : ''}${date ? ' · ' + date : ''}`;
  return `<div title="${tip}" style="display:flex;flex-direction:column;align-items:center;gap:.3rem;width:74px;opacity:${opacity}">
    <div style="position:relative;width:48px;height:48px">
      <svg viewBox="0 0 44 44" style="position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)">
        <circle cx="22" cy="22" r="19" fill="none" stroke="var(--border)" stroke-width="2.5"/>
        <circle class="bpr" cx="22" cy="22" r="19" fill="none"
          stroke="${color}" stroke-width="2.5" stroke-linecap="round"
          stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
          data-offset="${(circ * (1 - pct)).toFixed(2)}"
          style="transition:stroke-dashoffset 1.1s ease"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:${earned ? '#22c55e18' : pct > 0 ? b.color + '15' : 'var(--surface2)'};border-radius:50%">
        <i class="fas ${b.icon}" style="color:${color};font-size:.85rem"></i>
      </div>
    </div>
    <span style="font-size:.65rem;text-align:center;line-height:1.2;color:${earned ? 'var(--text)' : 'var(--muted)'};font-weight:${earned ? '600' : '400'}">${b.label}</span>
    ${pData && !earned ? `<span style="font-size:.58rem;color:${b.color};font-weight:600">${pData.cur % 1 === 0 ? pData.cur : pData.cur.toFixed(1)}/${pData.max}</span>` : ''}
  </div>`;
}

function animateBadgeRings() {
  document.querySelectorAll('.bpr').forEach(el => {
    el.style.strokeDashoffset = el.dataset.offset;
  });
}

// ── Theme ────────────────────────────────────────────────────────
function applyTheme(name) {
  const t = name || 'dunkel';
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('.theme-dot').forEach(b => b.classList.toggle('active', b.id === 't' + t));
}
window.setTheme = name => { localStorage.setItem('acls-theme', name); applyTheme(name); };
applyTheme(localStorage.getItem('acls-theme'));

// ── Count-up animation ───────────────────────────────────────────
function countUp(el, target, suffix = '', ms = 680) {
  const isFloat = !Number.isInteger(target);
  const t0 = performance.now();
  const tick = t => {
    const p = Math.min((t - t0) / ms, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = (isFloat ? (ease * target).toFixed(1) : Math.round(ease * target)) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function animateCountUps() {
  document.querySelectorAll('[data-countup]').forEach(el => {
    countUp(el, parseFloat(el.dataset.countup), el.dataset.suffix || '');
  });
}

// ── Sidebar collapse ─────────────────────────────────────────────
window.toggleSidebar = () => {
  const s = document.querySelector('.sidebar');
  const collapsed = s.classList.toggle('collapsed');
  localStorage.setItem('acls-sidebar', collapsed ? '1' : '0');
};

// ── Nav group toggle ─────────────────────────────────────────────
window.toggleNavGroup = function(name) {
  const grp = document.querySelector(`.nav-group[data-group="${name}"]`);
  if (!grp) return;
  const items = grp.querySelector('.nav-group-items');
  const chev  = grp.querySelector('.nav-group-chev');
  const willCollapse = !grp.classList.contains('collapsed');
  grp.classList.toggle('collapsed', willCollapse);
  if (items) items.style.maxHeight = willCollapse ? '0' : '1400px';
  if (chev)  chev.style.transform  = willCollapse ? 'rotate(-90deg)' : '';
  localStorage.setItem(`nav-grp-${name}`, willCollapse ? '0' : '1');
};

function initNavGroups() {
  // Kerngeschäft offen, Rest eingeklappt – weniger kognitive Last für neue Nutzer
  const defaults = { werkstatt: true, 'mein-acls': true, fahrschule: true, community: false, wirtschaft: false, info: false, freizeit: false };
  document.querySelectorAll('.nav-group').forEach(grp => {
    const name  = grp.dataset.group;
    const saved = localStorage.getItem(`nav-grp-${name}`);
    const open  = saved !== null ? saved === '1' : (defaults[name] !== false);
    const items = grp.querySelector('.nav-group-items');
    const chev  = grp.querySelector('.nav-group-chev');
    if (items) { items.style.overflow = 'hidden'; items.style.transition = 'max-height .25s ease'; items.style.maxHeight = open ? '1400px' : '0'; }
    if (chev)  chev.style.transform = open ? '' : 'rotate(-90deg)';
    if (!open) grp.classList.add('collapsed');
  });
}

// ── Sidebar anpassen: Einträge ein-/ausblenden ───────────────────
// Jeder Nav-Eintrag bekommt einen stabilen Schlüssel (data-page oder href).
// Versteckte Schlüssel liegen in localStorage – rein clientseitig.
function _navKey(el) {
  return el.dataset.page ? `page:${el.dataset.page}` : (el.getAttribute('href') ? `href:${el.getAttribute('href')}` : null);
}
function _navHiddenSet() {
  try { return new Set(JSON.parse(localStorage.getItem('acls-nav-hidden') || '[]')); }
  catch { return new Set(); }
}
function applyNavPrefs() {
  const hidden = _navHiddenSet();
  document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
    const key = _navKey(el);
    if (!key || key === 'page:dashboard') return;           // Dashboard ist fix
    el.style.display = hidden.has(key) ? 'none' : '';
  });
  // Gruppen ausblenden, wenn alle Einträge darin versteckt sind
  document.querySelectorAll('#sidebarNav .nav-group').forEach(grp => {
    const items = [...grp.querySelectorAll('.nav-item')];
    const allHidden = items.length && items.every(el => el.style.display === 'none');
    grp.style.display = allHidden ? 'none' : '';
  });
}
window.openNavSettings = function() {
  const hidden = _navHiddenSet();
  const groups = [...document.querySelectorAll('#sidebarNav .nav-group')].map(grp => ({
    name: grp.querySelector('.nav-group-header span:nth-child(2)')?.textContent || '',
    items: [...grp.querySelectorAll('.nav-item')].map(el => ({
      key: _navKey(el),
      label: el.querySelector('span')?.textContent?.trim() || '',
      icon: el.querySelector('i')?.className || 'fas fa-circle',
    })).filter(i => i.key),
  }));
  openModal(`
    <div class="modal-head"><div class="modal-title"><i class="fas fa-sliders-h" style="color:var(--orange);margin-right:.45rem"></i>Sidebar anpassen</div>
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:.9rem">Wähle, welche Einträge in deiner Navigation sichtbar sind. Das Dashboard bleibt immer sichtbar.</div>
    <div style="max-height:55vh;overflow-y:auto;padding-right:.3rem">
      ${groups.map(g => `
        <div style="margin-bottom:.9rem">
          <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:.4rem">${esc(g.name)}</div>
          ${g.items.map(i => `
            <label style="display:flex;align-items:center;gap:.65rem;padding:.4rem .2rem;border-bottom:1px solid var(--border);cursor:pointer">
              <i class="${esc(i.icon)}" style="width:15px;text-align:center;font-size:.78rem;color:var(--muted)"></i>
              <span style="flex:1;font-size:.84rem">${esc(i.label)}</span>
              <input type="checkbox" ${hidden.has(i.key) ? '' : 'checked'} onchange="toggleNavItem('${i.key.replace(/'/g, "\\'")}', this.checked)" style="accent-color:var(--orange)">
            </label>`).join('')}
        </div>`).join('')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost btn-sm" onclick="resetNavPrefs()"><i class="fas fa-undo"></i> Zurücksetzen</button>
      <button class="btn btn-primary btn-sm" onclick="closeModal()">Fertig</button>
    </div>`);
};
window.toggleNavItem = function(key, visible) {
  const hidden = _navHiddenSet();
  if (visible) hidden.delete(key); else hidden.add(key);
  localStorage.setItem('acls-nav-hidden', JSON.stringify([...hidden]));
  applyNavPrefs();
};
window.resetNavPrefs = function() {
  localStorage.removeItem('acls-nav-hidden');
  applyNavPrefs();
  closeModal();
  toast('Sidebar zurückgesetzt', 'ok');
};

// ── Mobile sidebar ───────────────────────────────────────────────
window.toggleMobileMenu = () => {
  const s = document.querySelector('.sidebar');
  const o = document.getElementById('mobileOverlay');
  const open = s.classList.toggle('mobile-open');
  o.classList.toggle('active', open);
};
window.closeMobileMenu = () => {
  document.querySelector('.sidebar')?.classList.remove('mobile-open');
  document.getElementById('mobileOverlay')?.classList.remove('active');
};
function initSidebar() {
  if (localStorage.getItem('acls-sidebar') === '1')
    document.querySelector('.sidebar').classList.add('collapsed');
  initNavGroups();
}

// ── Globals ─────────────────────────────────────────────────────
let currentUser = null;
let leafletMap  = null;   // active Leaflet instance
let activeQuiz  = null;

const $ = id => document.getElementById(id);
const PAGES = {
  dashboard:    { title: 'Dashboard',              sub: 'Willkommen zurück' },
  werkstatt:    { title: 'Werkstatt-Hub',          sub: 'Leistungen, Standort, Dienst-Status & Aufträge' },
  arcade:       { title: 'Arcade',                 sub: 'Alle Minispiele an einem Ort · Spiel der Woche' },
  activity:     { title: 'Aktivität',              sub: 'Letzte Ereignisse' },
  eow:          { title: 'Mitarbeiter der Woche',  sub: 'Wöchentliche Abstimmung' },
  exams:        { title: 'Prüfung starten',        sub: 'Theorie & Praxis' },
  registry:     { title: 'Bürgerregister',         sub: 'Alle Führerschein-Inhaber' },
  factions:     { title: 'Fraktionsfarben',        sub: 'Fahrzeugfarben der Fraktionen' },
  map:          { title: 'Abschlepphöfe',          sub: 'Interaktive GTA V Karte' },
  iczeit:       { title: 'IC-Zeit Tracking',       sub: 'Discord Voice-Kanal Anwesenheit' },
  prices:       { title: 'Preisliste',             sub: 'Fahrschule & Servicepreise' },
  carmarket:    { title: 'Fahrzeugmarkt',          sub: 'Private Fahrzeuginserate' },
  organigramm:  { title: 'Unser Team',             sub: 'Klicke auf einen Mitarbeiter für den Steckbrief' },
  applications: { title: 'Bewerbungen',            sub: 'Eingehende Bewerbungen verwalten' },
  admin:        { title: 'Admin-Panel',            sub: 'Verwaltung & Kontrolle' },
  ausbildung:   { title: 'Ausbildung',             sub: 'Gesellen- & Meisterprüfungen' },
  bans:         { title: 'Aktive Sperren',         sub: 'Hausverbot-Verwaltung' },
  search:       { title: 'Globale Suche',          sub: 'Seiten, Sperren, Mitarbeiter & Register durchsuchen' },
  faq:          { title: 'FAQ',                    sub: 'Häufig gestellte Fragen verwalten' },
  auditlog:     { title: 'Audit-Log',             sub: 'Wer hat was wann geändert' },
  turnier:      { title: 'Wochenturnier',         sub: 'Jede Woche ein anderes Spiel – Coins für die Top 3' },
  duell:        { title: 'Quiz-Duell',            sub: '1-gegen-1 live · Mitarbeiter & Bürger' },
  shop:         { title: 'Coin-Shop',             sub: 'ACLS-Coins verdienen & ausgeben' },
  saison:       { title: 'Saison-Pass',           sub: 'Wochen-Quests, XP & Belohnungen' },
  freunde:      { title: 'Freunde',               sub: 'Freundesliste & Statistik-Vergleich' },
  schwarzmarkt: { title: 'Schwarzmarkt',          sub: 'Tägliche Sonderangebote – nur 24h verfügbar' },
  feedback:     { title: 'Feedback & Ideen',      sub: 'Vorschläge einreichen & abstimmen' },
  frageneditor: { title: 'Fragen-Editor',         sub: 'Prüfungsfragen verwalten (Admin)' },
  beschwerden:  { title: 'Beschwerde-Kanban',     sub: 'Beschwerden verwalten (Admin)' },
  nachrichten:  { title: 'Direktnachrichten',     sub: 'Private Nachrichten zwischen Mitarbeitern' },
  marktplatz:   { title: 'Marktplatz',            sub: 'Kosmetika kaufen & verkaufen' },
  wetten:       { title: 'Coin-Wetten',           sub: 'Wette gegen andere Spieler & Bürger' },
  tickets:      { title: 'Support-Tickets',       sub: 'Fragen, Bugs & Beschwerden einreichen' },
  statistiken:  { title: 'Statistik-Trends',      sub: 'Prüfungen, IC-Zeit & Coins – letzte 12 Wochen' },
  team_vorstellung: { title: 'Mitarbeiter-Vorstellung', sub: 'Lerne das ACLS-Team kennen' },
  level:        { title: 'Level & Prestige',      sub: 'Globales XP-System · Prestige-Rangliste' },
  wheel:        { title: 'Daily Wheel',           sub: 'Täglich drehen & Belohnungen sichern' },
  milestones:   { title: 'Meilensteine',          sub: 'Lebenslange Ziele & besondere Belohnungen' },
  changelog:    { title: 'Changelog',             sub: 'Was ist neu im ACLS-Portal?' },
  trivia:       { title: 'Trivia-Team',           sub: 'Team-Quiz in Echtzeit · 2 Teams gegeneinander' },
  onboarding:   { title: 'Onboarding-Wizard',     sub: 'Deine Einarbeitungs-Checkliste' },
  profil:       { title: 'Mein Profil',           sub: 'Profilbild, Bio & Kosmetika' },
  meinacls:     { title: 'Mein ACLS',             sub: 'Dein persönlicher Hub – Fortschritt, Aufgaben & mehr' },
  finanzen:     { title: 'Meine Finanzen',        sub: 'Kontostand, Einnahmen & Ausgaben im Überblick' },
  dokumente:    { title: 'Dokumente',             sub: 'Werkstattaufträge, Rechnungen, TÜV-Berichte & Zertifikate' },
  fahrzeugakte: { title: 'Fahrzeugakten',         sub: 'Fahrzeug-Historie, Wartungsheft & Dokumente pro Kennzeichen' },
  karriere:     { title: 'Karriere',              sub: 'Werkstatt-Rang, Zertifikate, Tagesaufgaben & Gutscheine' },
};

// ── API helper ──────────────────────────────────────────────────
async function api(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (res.status === 401) { showLogin(); return null; }
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Fehler', 'err'); return null; }
    return data;
  } catch (e) {
    toast('Netzwerkfehler', 'err');
    return null;
  }
}

// ── Lazy-Loader für externe Bibliotheken ────────────────────────
// index.html lädt Leaflet/Chart.js/jsPDF nicht mehr beim Start –
// diese Funktion lädt sie erst, wenn eine Seite sie wirklich braucht.
const _libPromises = {};
const LIBS = {
  leaflet: { js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', ready: () => window.L },
  chart:   { js: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', ready: () => window.Chart },
  jspdf:   { js: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',    ready: () => window.jspdf },
};
function loadLib(name) {
  const lib = LIBS[name];
  if (!lib) return Promise.reject(new Error('Unbekannte Bibliothek: ' + name));
  if (lib.ready()) return Promise.resolve();
  if (_libPromises[name]) return _libPromises[name];
  _libPromises[name] = new Promise((resolve, reject) => {
    if (lib.css && !document.querySelector(`link[href="${lib.css}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = lib.css;
      document.head.appendChild(l);
    }
    const s = document.createElement('script');
    s.src = lib.js;
    s.onload  = () => resolve();
    s.onerror = () => { delete _libPromises[name]; reject(new Error(name + ' konnte nicht geladen werden')); };
    document.head.appendChild(s);
  });
  return _libPromises[name];
}

// ── Update-Check ────────────────────────────────────────────────
// version.json wird beim Start gemerkt und periodisch verglichen.
// Steigt die Version (neuer Deploy), erscheint ein Reload-Hinweis.
let _appVersion = null;
let _updateShown = false;
async function checkAppVersion() {
  try {
    const v = (await (await fetch('/version.json', { cache: 'no-store' })).json()).version;
    if (_appVersion === null) { _appVersion = v; return; }
    if (v !== _appVersion && !_updateShown) showUpdateBanner();
  } catch {}
}
function showUpdateBanner() {
  _updateShown = true;
  const el = document.createElement('div');
  el.id = 'updateBanner';
  el.innerHTML = `
    <i class="fas fa-arrow-rotate-right" style="color:#4ade80"></i>
    <span>Neue Version verfügbar!</span>
    <button onclick="location.reload()">Jetzt neu laden</button>
    <button class="dismiss" onclick="this.parentElement.remove()" title="Später" aria-label="Später">✕</button>`;
  document.body.appendChild(el);
}
setInterval(checkAppVersion, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAppVersion(); });
checkAppVersion();

// ════════════════════════════════════════════════════════════════
//  ONBOARDING-TOUR — Spotlight-Rundgang beim ersten Login
// ════════════════════════════════════════════════════════════════
const TOUR_STEPS = [
  { sel: '#sidebarNav',                      title: 'Navigation',         text: 'Alle Bereiche der Website, thematisch gruppiert. Gruppen lassen sich per Klick ein- und ausklappen.' },
  { sel: '.nav-item[data-page="meinacls"]',  title: 'Mein Hub',           text: 'Dein persönlicher Startpunkt: Level, tägliche Aufgaben, Streak und dein Fortschritt.' },
  { sel: '.nav-item[data-page="werkstatt"]', title: 'Werkstatt-Hub',      text: 'Leistungen, Standort und Live-Dienststatus der Werkstatt – das Kerngeschäft.' },
  { sel: '.nav-item[data-page="arcade"]',    title: 'Arcade',             text: 'Alle Minispiele an einem Ort – hier verdienst du Coins und XP.' },
  { sel: '#searchBtn',                       title: 'Globale Suche',      text: 'Findet Seiten, Mitarbeiter, Sperren und mehr. Tipp: Strg+K funktioniert von überall.' },
  { sel: '#notifBell',                       title: 'Benachrichtigungen', text: 'Neuigkeiten und Hinweise landen hier – der rote Punkt zeigt Ungelesenes.' },
  { sel: '.theme-switcher-float',            title: 'Design',             text: '15 Themes zur Auswahl – von „Los Santos bei Nacht" bis „Katzen". Probier dich aus!' },
];
let _tourIdx = 0;

window.startTour = function() {
  if ($('tourOverlay')) return;
  _tourIdx = 0;
  const ov = document.createElement('div');
  ov.id = 'tourOverlay';
  ov.innerHTML = '<div id="tourSpot"></div><div id="tourCard"></div>';
  document.body.appendChild(ov);
  showTourStep();
};

window.endTour = function() {
  localStorage.setItem('acls-tour-done', '1');
  $('tourOverlay')?.remove();
  if (window.innerWidth <= 640) closeMobileMenu();
};

function showTourStep() {
  while (_tourIdx < TOUR_STEPS.length && !document.querySelector(TOUR_STEPS[_tourIdx].sel)) _tourIdx++;
  if (_tourIdx >= TOUR_STEPS.length) { endTour(); return; }
  const step   = TOUR_STEPS[_tourIdx];
  const target = document.querySelector(step.sel);

  // Mobile: Sidebar für Sidebar-Schritte öffnen, sonst schließen (Animation abwarten)
  let delay = 0;
  if (window.innerWidth <= 640) {
    const sb = document.querySelector('.sidebar');
    const needsSidebar = !!target.closest('.sidebar');
    if (needsSidebar !== sb.classList.contains('mobile-open')) {
      sb.classList.toggle('mobile-open', needsSidebar);
      delay = 300;
    }
  }

  setTimeout(() => {
    target.scrollIntoView({ block: 'nearest' });
    const r = target.getBoundingClientRect();
    const pad = 6;
    const spot = $('tourSpot');
    if (!spot) return;
    spot.style.top    = (r.top - pad) + 'px';
    spot.style.left   = (r.left - pad) + 'px';
    spot.style.width  = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';

    const card = $('tourCard');
    card.innerHTML = `
      <div class="tour-step-num">${_tourIdx + 1} / ${TOUR_STEPS.length}</div>
      <div class="tour-title">${step.title}</div>
      <div class="tour-text">${step.text}</div>
      <div class="tour-btns">
        <button class="btn btn-ghost btn-sm" onclick="endTour()">Überspringen</button>
        <button class="btn btn-primary btn-sm" onclick="nextTourStep()">${_tourIdx === TOUR_STEPS.length - 1 ? 'Fertig ✓' : 'Weiter →'}</button>
      </div>`;
    requestAnimationFrame(() => {
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let top = r.bottom + 14;
      if (top + ch > innerHeight - 10) top = Math.max(10, r.top - ch - 14);
      const left = Math.min(Math.max(10, r.left), innerWidth - cw - 10);
      card.style.top  = top + 'px';
      card.style.left = left + 'px';
    });
  }, delay);
}
window.nextTourStep = () => { _tourIdx++; showTourStep(); };

// ════════════════════════════════════════════════════════════════
//  FAVORITEN — Seiten anpinnen, erscheinen oben in der Sidebar
// ════════════════════════════════════════════════════════════════
function getFavPages() {
  try { return JSON.parse(localStorage.getItem('acls-fav-pages') || '[]'); } catch { return []; }
}
window.toggleFavPage = function(page) {
  let favs = getFavPages();
  if (favs.includes(page)) favs = favs.filter(p => p !== page);
  else {
    if (favs.length >= 8) { toast('Maximal 8 Favoriten', 'err'); return; }
    favs.push(page);
  }
  localStorage.setItem('acls-fav-pages', JSON.stringify(favs));
  renderFavorites();
};

function initFavToggles() {
  document.querySelectorAll('#sidebarNav .nav-group-items .nav-item[data-page]').forEach(el => {
    if (el.querySelector('.fav-toggle')) return;
    const btn = document.createElement('i');
    btn.className = 'fas fa-star fav-toggle';
    btn.title = 'Als Favorit anpinnen';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      toggleFavPage(el.dataset.page);
    });
    el.appendChild(btn);
  });
  renderFavorites();
}

function renderFavorites() {
  const favs = getFavPages();
  document.querySelectorAll('#sidebarNav .fav-toggle').forEach(b => {
    b.classList.toggle('active', favs.includes(b.parentElement.dataset.page));
    b.title = favs.includes(b.parentElement.dataset.page) ? 'Favorit entfernen' : 'Als Favorit anpinnen';
  });
  let box = $('favNav');
  if (!favs.length) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'favNav';
    const dash = document.querySelector('#sidebarNav > .nav-item[data-page="dashboard"]');
    (dash || $('sidebarNav').firstElementChild).after(box);
  }
  box.innerHTML = `<div class="nav-group-header" style="cursor:default"><span class="nav-group-dot" style="background:#fbbf24"></span><span>Favoriten</span></div>` +
    favs.map(p => {
      const src   = document.querySelector(`#sidebarNav .nav-group-items .nav-item[data-page="${p}"]`);
      const icon  = src?.querySelector('i')?.className.replace(' fav-toggle', '') || 'fas fa-star';
      const label = src?.querySelector('span')?.childNodes[0]?.textContent?.trim() || p;
      return `<a class="nav-item" data-page="${esc(p)}"><i class="${esc(icon)}" style="color:#fbbf24"></i><span>${esc(label)}</span></a>`;
    }).join('');
  box.querySelectorAll('.nav-item').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page); }));
}

// ── Toast ────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icon = type === 'ok' ? 'fa-check-circle' : type === 'err' ? 'fa-times-circle' : 'fa-info-circle';
  t.innerHTML = `<i class="fas ${icon}"></i>${msg}`;
  $('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3400);
}

// ── Modal ────────────────────────────────────────────────────────
function openModal(html) {
  $('modalBox').style.maxWidth = '';
  $('modalBox').style.padding = '';
  $('modalBox').innerHTML = html;
  $('modalOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // BATCH 3.1: Scroll-Lock
}
function closeModal() { $('modalOverlay').classList.add('hidden'); window._listingImg = null; document.body.style.overflow = ''; } // BATCH 3.1
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Helpers ──────────────────────────────────────────────────────
const isAdmin      = () => currentUser?.role === 'admin';
const isAusbilder  = () => currentUser?.role === 'ausbilder' || currentUser?.role === 'admin';
const initials = n => ((n || '?').split(/[_\s]/).map(p => p[0]).join('').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase().slice(0, 2) || '?');
// XSS-Schutz: alle DB-Werte vor innerHTML-Einbettung escapen
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// Tagged-Template mit Auto-Escaping: html`<b>${userInput}</b>` escapt automatisch.
// Bereits sicheres HTML mit html.raw(x) einfügen. Arrays werden gejoint.
function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v && v.__rawHtml !== undefined) out += v.__rawHtml;
    else if (Array.isArray(v)) out += v.map(x => (x && x.__rawHtml !== undefined) ? x.__rawHtml : esc(x)).join('');
    else out += esc(v);
    out += strings[i + 1];
  }
  return out;
}
html.raw = s => ({ __rawHtml: String(s ?? '') });
const fmt = dt => new Date(dt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtTime = dt => new Date(dt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const ago = dt => {
  // SQLite gibt 'YYYY-MM-DD HH:MM:SS' ohne Timezone zurück → als UTC parsen
  const d = typeof dt === 'string' && !dt.endsWith('Z') && !dt.includes('+')
    ? new Date(dt.replace(' ', 'T') + 'Z')
    : new Date(dt);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60)    return 'gerade eben';
  if (s < 3600)  return `vor ${Math.floor(s / 60)} Min`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std`;
  return `vor ${Math.floor(s / 86400)} Tagen`;
};
// ── Image helpers ────────────────────────────────────────────────
function compressImage(file, maxW, quality, cb) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
// Globale Variable – kein DOM-Lookup nötig
window._listingImg = null;

window.previewListingImage = (inputId, thumbId, wrapId, clearId) => {
  const file = document.getElementById(inputId)?.files?.[0];
  if (!file) return;
  compressImage(file, 480, 0.6, b64 => {
    if (b64.length > 700000) { toast('Bild zu groß – bitte kleineres Foto wählen.', 'err'); return; }
    window._listingImg = b64;
    const t = document.getElementById(thumbId);
    const w = document.getElementById(wrapId);
    const c = document.getElementById(clearId);
    if (t) t.src = b64;
    if (w) w.style.display = 'block';
    if (c) c.style.display = '';
    const kb = Math.round(b64.length * 0.75 / 1024);
    toast(`Foto bereit (${kb} KB)`, 'ok');
  });
};
window.clearListingImage = (inputId, thumbId, wrapId, clearId) => {
  window._listingImg = null;
  const inp = document.getElementById(inputId);
  const w   = document.getElementById(wrapId);
  const c   = document.getElementById(clearId);
  if (inp) inp.value = '';
  if (w) w.style.display = 'none';
  if (c) c.style.display = 'none';
};

const avatarUrl = u => u?.avatar_custom
  ? u.avatar_custom
  : (u?.avatar && u?.discord_id)
  ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=64`
  : null;
function avatarEl(u, size = 36, cls = '') {
  const url = avatarUrl(u);
  if (url) return `<img src="${url}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover${cls?';'+cls:''}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--orange);display:none;align-items:center;justify-content:center;font-weight:700;font-size:${size*0.35}px;flex-shrink:0">${initials(u.username)}</div>`;
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${size*0.35}px;flex-shrink:0">${initials(u.username)}</div>`;
}
// Skeleton-Loader: wirkt deutlich schneller als ein Spinner
const loading = () => `<div class="skel-page">
  <div class="skel skel-header"></div>
  <div class="skel-grid">
    <div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card"></div>
  </div>
  <div class="skel skel-block"></div>
  <div class="skel skel-line"></div><div class="skel skel-line" style="width:82%"></div><div class="skel skel-line" style="width:65%"></div>
</div>`;

// Einheitlicher Fehler-Zustand mit Retry-Button (Stil wie runSearch()'s Fehleranzeige).
// `retryCall` ist ein JS-Code-String fürs onclick-Attribut (Konvention wie im Rest der App),
// kein Funktionsobjekt. Wird zentral von navigate() genutzt, wenn eine Seite hängen bleibt.
const errorState = (msg, retryCall) => `<div style="display:flex;align-items:center;gap:.6rem;color:var(--red);font-size:.9rem;padding:1.1rem 1.2rem;background:var(--red-dim);border:1px solid rgba(239,68,68,.3);border-radius:var(--rl,12px);margin:1rem 0">
  <i class="fas fa-exclamation-triangle"></i>
  <div style="flex:1">${esc(msg)}</div>
  <button class="btn btn-ghost btn-sm" onclick="${retryCall}">Erneut versuchen</button>
</div>`;

// ── Export für Zusatz-Module (js/acls-plus.js etc.) ──────────────
// const/let-Helper sind nicht automatisch auf window – hier gebündelt freigeben.
window.ACLSCore = {
  $, esc, fmt, loading, errorState,
  get user() { return currentUser; },
  isAdmin: () => currentUser?.role === 'admin',
};

// ── Init ─────────────────────────────────────────────────────────
async function init() {
  // Check URL params
  const params = new URLSearchParams(location.search);
  history.replaceState({}, '', '/');
  const err = params.get('error');
  if (err) {
    const msgs = { unauthorized: 'Deine Discord-ID ist nicht registriert. Bitte einen Admin kontaktieren.', oauth_failed: 'Discord-Login fehlgeschlagen.', token_failed: 'Token-Austausch fehlgeschlagen.' };
    showLogin(msgs[err] || `Fehler: ${err}`);
    return;
  }

  currentUser = await api('/auth/me');
  if (!currentUser) { showLogin(); return; }
  if (currentUser.voter) { bootVoterApp(); return; }
  bootApp();
}

function showLogin(errMsg = '') {
  $('loginScreen').classList.remove('hidden');
  $('app').classList.add('hidden');
  $('voterScreen').classList.add('hidden');
  if (errMsg) {
    const el = $('loginError');
    el.textContent = errMsg;
    el.classList.remove('hidden');
  }
  loadLandingStatus();
}

// Live-Status + Kontaktdaten für das Login-Schaufenster (öffentlich, ohne Auth)
async function loadLandingStatus() {
  try {
    const s = await fetch('/api/public/status').then(r => r.json());
    const chip = $('landingStatus'), txt = $('landingStatusText');
    if (chip && txt) {
      chip.classList.remove('duty-unknown', 'duty-open', 'duty-closed');
      if (s.onDuty > 0) {
        chip.classList.add('duty-open');
        txt.textContent = `Jetzt geöffnet · ${s.onDuty} Mitarbeiter im Dienst`;
      } else {
        chip.classList.add('duty-closed');
        txt.textContent = 'Gerade niemand im Dienst – Anfragen jederzeit möglich';
      }
    }
    if ($('landingHq')    && s.hqText)       $('landingHq').textContent    = s.hqText;
    if ($('landingPhone') && s.icPhone)      $('landingPhone').textContent = s.icPhone;
    if ($('landingHours') && s.dienstzeiten) $('landingHours').textContent = 'Dienstzeiten: ' + s.dienstzeiten;
    const d = $('landingDiscord');
    if (d && s.discordInvite) { d.href = s.discordInvite; d.style.display = ''; }
  } catch { /* Schaufenster funktioniert auch ohne Status */ }
}

async function bootVoterApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.add('hidden');
  $('voterScreen').classList.remove('hidden');
  renderVoterScreen();
}

const _voterPageMeta = {
  werkstatt: { title: 'Werkstatt',        sub: 'Reparatur, Tuning & Abschleppdienst – Auftrag anfragen' },
  price:     { title: 'Preisliste',       sub: 'Aktuelle Fahrschul- & Servicepreise' },
  vote:      { title: 'MdW-Abstimmung',   sub: 'Mitarbeiter der Woche wählen' },
  ticketpub: { title: 'Support-Ticket',   sub: 'Fragen, Bugs & Beschwerden einreichen' },
  market:    { title: 'Fahrzeugmarkt',    sub: 'Private Fahrzeuginserate von Bürgern' },
  team:      { title: 'Unser Team',       sub: 'ACLS Mitarbeiter & Organigramm' },
  apply:     { title: 'Bewerben',         sub: 'Bewirb dich beim ACLS Automobil-Club' },
  faq:       { title: 'FAQ',              sub: 'Häufig gestellte Fragen' },
  duel:      { title: 'Quiz-Duell',       sub: '1-gegen-1 live · Sieger bekommt 150 Coins' },
  friends:   { title: 'Freunde',          sub: 'Deine Freunde, Rang & Vergleich' },
  saison:    { title: 'Saison-Pass',      sub: 'Wochen-Quests, XP & Belohnungen' },
  arcade:    { title: 'Arcade',           sub: 'Alle Minispiele an einem Ort · Spiel der Woche' },
};

async function renderVoterScreen() {
  const [users, cv] = await Promise.all([
    fetch('/api/users/public').then(r => r.json()),
    fetch('/api/citizen-votes').then(r => r.json()),
  ]);
  const myVote       = cv.myVoteFor;
  const myHasChanged = cv.myHasChanged;
  const canChange    = myVote && !myHasChanged;
  const tally  = {};
  cv.counts.forEach(c => { tally[c.nominee_id] = c.votes; });

  const avUrl = (currentUser.avatar && currentUser.discord_id)
    ? `https://cdn.discordapp.com/avatars/${currentUser.discord_id}/${currentUser.avatar}.png?size=64`
    : null;

  $('voterScreen').innerHTML = `
  <div class="app">

    <!-- ===== SIDEBAR ===== -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-label">Navigation</span>
      </div>
      <nav class="sidebar-nav">
        <a class="nav-item active" id="vnWerkstatt" onclick="voterTab('werkstatt')" style="cursor:pointer"><i class="fas fa-wrench" style="color:#f97316"></i><span>Werkstatt</span></a>
        <a class="nav-item"        id="vnPrice"     onclick="voterTab('price')"    style="cursor:pointer"><i class="fas fa-tags"></i><span>Preisliste</span></a>
        <a class="nav-item"        id="vnVote"      onclick="voterTab('vote')"     style="cursor:pointer"><i class="fas fa-trophy"></i><span>MdW-Abstimmung</span></a>
        <a class="nav-item"        id="vnTicketPub" onclick="voterTab('ticketpub')" style="cursor:pointer"><i class="fas fa-ticket-alt"></i><span>Support-Ticket</span></a>
        <a class="nav-item"        id="vnMarket"    onclick="voterTab('market')"   style="cursor:pointer"><i class="fas fa-car-side" style="color:#f97316"></i><span>Fahrzeugmarkt</span></a>
        <a class="nav-item" href="/quiz" target="_blank" style="color:#22c55e"><i class="fas fa-graduation-cap" style="color:#22c55e"></i><span>Prüfungsvorbereitung</span></a>
        <a class="nav-item"        id="vnTeam"      onclick="voterTab('team')"     style="cursor:pointer"><i class="fas fa-users"></i><span>Unser Team</span></a>
        <a class="nav-item"        id="vnApply"     onclick="voterTab('apply')"    style="cursor:pointer"><i class="fas fa-file-alt" style="color:#a78bfa"></i><span style="color:#a78bfa">Bewerben</span></a>
        <a class="nav-item"        id="vnFaq"       onclick="voterTab('faq')"      style="cursor:pointer"><i class="fas fa-question-circle" style="color:#38bdf8"></i><span style="color:#38bdf8">FAQ</span></a>
        <a class="nav-item"        id="vnDuel"      onclick="voterTab('duel')"     style="cursor:pointer"><i class="fas fa-bolt" style="color:#f472b6"></i><span style="color:#f472b6">Quiz-Duell</span></a>
        <a class="nav-item"        id="vnSaison"    onclick="voterTab('saison')"   style="cursor:pointer"><i class="fas fa-star" style="color:#a855f7"></i><span style="color:#a855f7">Saison-Pass</span></a>
        ${currentUser.id ? `<a class="nav-item" id="vnFriends" onclick="voterTab('friends')" style="cursor:pointer"><i class="fas fa-user-friends" style="color:#fbbf24"></i><span style="color:#fbbf24">Freunde</span></a>` : ''}
        <a class="nav-item" onclick="openQuestionSuggestModal()" style="cursor:pointer"><i class="fas fa-lightbulb" style="color:#fbbf24"></i><span style="color:#fbbf24">Frage vorschlagen</span></a>

        <!-- Freizeit -->
        <div style="margin:.6rem .8rem .15rem;font-size:.6rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.08em;user-select:none">Freizeit</div>
        <a class="nav-item" id="vnArcade" onclick="voterTab('arcade')" style="cursor:pointer"><i class="fas fa-gamepad" style="color:#ec4899"></i><span>Arcade</span></a>
        <a class="nav-item" href="/spielbank" target="_blank"><i class="fas fa-dice" style="color:#ec4899"></i><span>Spielbank</span></a>
      </nav>
      <div class="sidebar-bottom">
        <a class="nav-item" onclick="voterLogout()" style="cursor:pointer"><i class="fas fa-sign-out-alt"></i><span>Abmelden</span></a>
      </div>
    </aside>

    <!-- Raketenschorle-Button (fixed, bottom-right) -->
    <a href="https://raketenschorle.de" target="_blank" rel="noopener" style="
      position:fixed;bottom:18px;right:18px;z-index:9999;
      display:flex;align-items:center;gap:7px;
      background:linear-gradient(135deg,#0f172a,#1e293b);
      border:1px solid rgba(249,115,22,.35);
      color:#f97316;
      padding:7px 13px 7px 10px;
      border-radius:999px;
      font-size:12px;font-weight:700;font-family:'Inter',sans-serif;
      text-decoration:none;
      box-shadow:0 2px 12px rgba(249,115,22,.2);
      backdrop-filter:blur(6px);
      transition:border-color .15s,box-shadow .15s,transform .1s;
    "
    onmouseover="this.style.borderColor='rgba(249,115,22,.7)';this.style.boxShadow='0 4px 20px rgba(249,115,22,.35)';this.style.transform='translateY(-1px)'"
    onmouseout="this.style.borderColor='rgba(249,115,22,.35)';this.style.boxShadow='0 2px 12px rgba(249,115,22,.2)';this.style.transform=''"
    title="Raketenschorle.de">
      <img src="https://raketenschorle.de/favicon.ico" onerror="this.style.display='none'" style="width:14px;height:14px;border-radius:3px;flex-shrink:0">
      <span>Raketenschorle.de</span>
      <i class="fas fa-external-link-alt" style="font-size:9px;opacity:.7"></i>
    </a>

    <!-- ===== MAIN ===== -->
    <div class="main-wrapper">
      <header class="topbar">
        <div>
          <h1 id="vPageTitle">Werkstatt</h1>
          <p id="vPageSubtitle">Reparatur, Tuning & Abschleppdienst – Auftrag anfragen</p>
        </div>
        <div class="user-widget">
          ${avUrl
            ? `<img class="u-avatar" src="${avUrl}" style="object-fit:cover" onerror="this.outerHTML='<div class=u-avatar>${(currentUser.username||'?')[0].toUpperCase()}</div>'">`
            : `<div class="u-avatar">${(currentUser.username||'?')[0].toUpperCase()}</div>`}
          <div class="u-info">
            <div class="u-name" id="vUserName">${esc(currentUser.username)} <i class="fas fa-pen" onclick="openVoterRename()" title="Namen ändern" style="font-size:.62rem;color:var(--muted);cursor:pointer;margin-left:.2rem"></i></div>
            <div class="u-role">Bürger</div>
          </div>
        </div>
      </header>

      <div id="twitch-widget" style="padding:.6rem 1.5rem;border-bottom:1px solid var(--border);background:var(--surface);display:none">
      </div>

      <main id="voterPageContent">

        <!-- Werkstatt (Kerngeschäft – Standard-Tab) -->
        <div id="werkstattSection">
          <div id="voterWerkstatt"><div style="text-align:center;padding:2rem;color:var(--muted)">Wird geladen…</div></div>
        </div>

        <!-- Preisliste -->
        <div id="priceSection" style="display:none">
          <div style="margin-bottom:1.25rem">
            <div id="vPollWidget"></div>
          </div>
          <div id="voterPrices"><div style="text-align:center;padding:2rem;color:var(--muted)">Wird geladen…</div></div>
        </div>

        <!-- MdW-Abstimmung -->
        <div id="voteSection" style="display:none">
          <p style="color:var(--muted);font-size:.85rem;margin-bottom:1.25rem">
            ${!myVote
              ? 'Wähle einen ACLS-Mitarbeiter dieser Woche.'
              : canChange
                ? '<i class="fas fa-info-circle" style="margin-right:.35rem;color:var(--orange)"></i>Du hast bereits abgestimmt. Du kannst deine Stimme noch <strong>einmalig</strong> ändern.'
                : '<i class="fas fa-lock" style="margin-right:.35rem;color:var(--muted)"></i>Du hast deine Stimme bereits geändert. Keine weitere Änderung möglich.'}
          </p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.75rem">
          ${(users || []).map(u => {
            const av = u.avatar_custom || (u.avatar && u.discord_id ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=128` : null);
            const voted    = myVote === u.id;
            const clickable = !myVote || canChange;
            const votes    = tally[u.id] || 0;
            return `<div ${clickable ? `onclick="castCitizenVote(${u.id})"` : ''}
              style="display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1rem .75rem;
                     background:${voted?'var(--orange-dim)':'var(--input)'};
                     border:1px solid ${voted?'rgba(249,115,22,.4)':'var(--border)'};
                     border-radius:var(--r);text-align:center;
                     cursor:${clickable?'pointer':'default'};
                     transition:background .15s,border-color .15s,transform .1s"
              ${clickable?'onmouseenter="this.style.transform=\'scale(1.03)\'" onmouseleave="this.style.transform=\'\'"':''}>
              <div style="position:relative">
                ${av
                  ? `<img src="${av}" style="width:52px;height:52px;border-radius:50%;object-fit:cover" onerror="this.outerHTML='<div style=&quot;width:52px;height:52px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700&quot;>${(u.username||'?')[0].toUpperCase()}</div>'">`
                  : `<div style="width:52px;height:52px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700">${(u.username||'?')[0].toUpperCase()}</div>`}
                ${voted ? '<div style="position:absolute;bottom:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center"><i class="fas fa-check" style="font-size:.6rem;color:#fff"></i></div>' : ''}
              </div>
              <div style="font-weight:700;font-size:.88rem;word-break:break-word">${esc(u.username)}</div>
              ${votes ? `<div style="font-size:.7rem;color:var(--muted)">${votes} Stimme${votes!==1?'n':''}</div>` : ''}
              ${voted ? `<div style="font-size:.72rem;font-weight:600;color:var(--orange)"><i class="fas fa-check-circle"></i> ${canChange?'Aktuelle Wahl':'Gewählt'}</div>` : ''}
            </div>`;
          }).join('')}
          </div>
        </div>

        <!-- Support-Ticket (Bürger) -->
        <div id="ticketpubSection" style="display:none">
          <div style="max-width:640px">
            <div class="card" style="margin-bottom:1.25rem">
              <div class="card-head"><div class="card-head-icon" style="background:rgba(251,191,36,.12)"><i class="fas fa-ticket-alt" style="color:#fbbf24"></i></div><div><div class="card-title">Support-Ticket erstellen</div><div class="card-sub">Fragen, Bugs & Beschwerden direkt an unser Team</div></div></div>
              <form onsubmit="submitPublicTicketForm(event)">
                <div class="form-group"><label>Dein Name (IC)</label><input class="form-control" id="ptName" value="${esc(currentUser.username||'')}" required></div>
                <div class="form-group"><label>Kategorie</label>
                  <select class="form-control" id="ptCategory" required>
                    <option value="">— Bitte wählen —</option>
                    <option value="Werkstatt-Auftrag">Werkstatt-Auftrag</option>
                    <option value="Abschleppdienst">Abschleppdienst</option>
                    <option value="Bug">Bug / Fehler</option>
                    <option value="Frage">Frage</option>
                    <option value="Beschwerde">Beschwerde</option>
                    <option value="Feature-Wunsch">Feature-Wunsch</option>
                    <option value="Sonstiges">Sonstiges</option>
                  </select>
                </div>
                <div class="form-group"><label>Betreff</label><input class="form-control" id="ptTitle" placeholder="Kurze Zusammenfassung" required></div>
                <div class="form-group"><label>Nachricht</label><textarea class="form-control" id="ptBody" rows="5" placeholder="Beschreibe dein Anliegen ausführlich…" required style="resize:vertical"></textarea></div>
                <button type="submit" class="btn btn-primary" style="width:100%"><i class="fas fa-paper-plane"></i> Ticket absenden</button>
              </form>
            </div>
            <div style="font-size:.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.75rem">Meine Tickets</div>
            <div id="my-public-tickets-list"><div style="color:var(--muted);font-size:.85rem">Wird geladen…</div></div>
          </div>
        </div>

        <!-- Team / Organigramm -->
        <div id="teamSection" style="display:none">
          <div id="voterTeamContent"><div style="text-align:center;padding:2rem;color:var(--muted)">Wird geladen…</div></div>
        </div>

        <!-- Bewerben -->
        <div id="applySection" style="display:none">
          <div id="voterApplyContent"><div style="text-align:center;padding:2rem;color:var(--muted)">Wird geladen…</div></div>
        </div>

        <!-- Fahrzeugmarkt -->
        <div id="marketSection" style="display:none">
          <div class="pg-header">
            <div class="pg-header-left">
              <h2 class="pg-title">Fahrzeugmarkt</h2>
              <p class="pg-sub">Fahrzeuge kaufen & vermieten</p>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openAddListing()"><i class="fas fa-plus"></i> Inserat erstellen</button>
          </div>
          <div id="voterListings" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem">
            <div style="text-align:center;padding:2rem;color:var(--muted)">Wird geladen…</div>
          </div>
        </div>

        <!-- FAQ -->
        <div id="faqSection" style="display:none">
          <div id="voterFaqContent"><div style="text-align:center;padding:2rem;color:var(--muted)">Wird geladen…</div></div>
        </div>

        <!-- Quiz-Duell -->
        <div id="duelSection" style="display:none"></div>

        <!-- Freunde -->
        <div id="friendsSection" style="display:none"><div style="text-align:center;padding:2rem;color:var(--muted)">Wird geladen…</div></div>

        <!-- Saison-Pass -->
        <div id="saisonSection" style="display:none"></div>

        <!-- Arcade -->
        <div id="arcadeSection" style="display:none">
          <div id="voterArcade"><div style="text-align:center;padding:2rem;color:var(--muted)">Wird geladen…</div></div>
        </div>

      </main>
    </div><!-- /main-wrapper -->
  </div>`;

  loadVoterWerkstatt();
  loadVoterPrices();
  loadTwitchWidget();
  loadVoterTeam();
  loadVoterApply();
  loadPollWidget('vPollWidget');
  connectSSE();
}

// ── Bürger: Werkstatt-Tab (Leistungen, Live-Status, Auftrag anfragen) ──
async function loadVoterWerkstatt() {
  const el = document.getElementById('voterWerkstatt');
  if (!el || el.dataset.loaded) return;   // nicht neu rendern – sonst gehen Formulareingaben verloren
  el.dataset.loaded = '1';
  const pub = await fetch('/api/public/status').then(r => r.json()).catch(() => null);
  const dutyChip = pub && pub.onDuty > 0
    ? `<span class="duty-chip duty-open"><span class="duty-dot"></span>Jetzt geöffnet · ${pub.onDuty} Mitarbeiter im Dienst</span>`
    : `<span class="duty-chip duty-closed"><span class="duty-dot"></span>Gerade niemand im Dienst – Anfragen jederzeit möglich</span>`;

  el.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="width:46px;height:46px;border-radius:12px;background:rgba(249,115,22,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fas fa-wrench" style="color:#f97316;font-size:1.1rem"></i>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:800;font-size:1.1rem">Deine Werkstatt in Los Santos</div>
          <div style="font-size:.8rem;color:var(--muted);margin-top:.15rem">Reparatur, Tuning &amp; Abschleppdienst – Anfrage stellen, wir melden uns IC.</div>
        </div>
        ${dutyChip}
      </div>
    </div>

    <div class="svc-grid" style="margin-bottom:1.2rem">
      ${WERKSTATT_SERVICES.map(s => `
        <div class="svc-card">
          <div class="landing-svc-ico" style="background:${s.color}1f;color:${s.color}"><i class="fas ${s.icon}"></i></div>
          <div><div class="landing-svc-name">${s.name}</div><div class="landing-svc-desc">${s.desc}</div></div>
        </div>`).join('')}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem;align-items:start">
      <div class="card" style="margin:0">
        <div class="card-head"><div class="card-head-icon orange"><i class="fas fa-paper-plane"></i></div>
          <div><div class="card-title">Auftrag anfragen</div><div class="card-sub">Wir melden uns schnellstmöglich IC bei dir</div></div>
        </div>
        <form onsubmit="submitWerkstattRequest(event)">
          <div class="form-group"><label>Dein Name (IC)</label><input class="form-control" id="wrName" value="${esc(currentUser?.username || '')}" required maxlength="100"></div>
          <div class="form-group"><label>Fahrzeug</label><input class="form-control" id="wrVehicle" placeholder="z. B. Sultan RS, Kennzeichen LS-1234" required maxlength="100"></div>
          <div class="form-group"><label>Leistung</label>
            <select class="form-control" id="wrService" required>
              <option value="">— Bitte wählen —</option>
              <option>Reparatur & Wartung</option>
              <option>Tuning & Performance</option>
              <option>Lackierung & Optik</option>
              <option>Abschleppdienst</option>
              <option>Inspektion & Check</option>
              <option>Sonstiges</option>
            </select>
          </div>
          <div class="form-group"><label>Beschreibung</label><textarea class="form-control" id="wrDesc" rows="4" placeholder="Was ist zu tun? Was ist passiert?" required style="resize:vertical" maxlength="1500"></textarea></div>
          <div class="form-group"><label>IC-Erreichbarkeit</label><input class="form-control" id="wrContact" placeholder="z. B. Handy 555-0123 oder heute ab 20 Uhr online" maxlength="200"></div>
          <button type="submit" class="btn btn-primary" style="width:100%"><i class="fas fa-paper-plane"></i> Anfrage absenden</button>
        </form>
      </div>

      <div class="card" style="margin:0">
        <div class="card-head"><div class="card-head-icon" style="background:rgba(201,162,39,.15)"><i class="fas fa-map-marker-alt" style="color:#c9a227"></i></div>
          <div><div class="card-title">Standort &amp; Kontakt</div><div class="card-sub">So erreichst du uns IC</div></div>
        </div>
        <div class="landing-contact">
          <div class="landing-contact-item"><i class="fas fa-map-marker-alt" style="color:#f97316"></i><span>${esc(pub?.hqText || 'ACLS Hauptquartier, Los Santos')}</span></div>
          <div class="landing-contact-item"><i class="fas fa-phone" style="color:#22c55e"></i><span>${esc(pub?.icPhone || 'Im LS-Telefonbuch unter „ACLS“')}</span></div>
          <div class="landing-contact-item"><i class="fas fa-clock" style="color:#38bdf8"></i><span>${esc(pub?.dienstzeiten || 'Dienstzeiten: siehe Live-Status')}</span></div>
          ${pub?.discordInvite ? `<div class="landing-contact-item"><i class="fab fa-discord" style="color:#5865f2"></i><a href="${esc(pub.discordInvite)}" target="_blank" rel="noopener" style="color:var(--orange)">Discord-Server beitreten</a></div>` : ''}
        </div>
        <div style="font-size:.76rem;color:var(--muted);margin-top:.9rem;padding-top:.9rem;border-top:1px solid var(--border)">
          <i class="fas fa-graduation-cap" style="color:#22c55e;margin-right:.35rem"></i>
          Übrigens: Führerscheine (Theorie &amp; Praxis) gibt&rsquo;s auch bei uns –
          <a href="/quiz" target="_blank" style="color:var(--orange)">hier kostenlos für die Prüfung üben</a>.
        </div>
      </div>
    </div>`;
}

window.submitWerkstattRequest = async e => {
  e.preventDefault();
  const service = $('wrService').value;
  const contact = $('wrContact').value.trim();
  const body = [
    `Fahrzeug: ${$('wrVehicle').value.trim()}`,
    `Leistung: ${service}`,
    '',
    $('wrDesc').value.trim(),
    contact ? `\nIC-Erreichbarkeit: ${contact}` : '',
  ].join('\n');
  const res = await fetch('/api/tickets/public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: $('wrName').value.trim(),
      category: service === 'Abschleppdienst' ? 'Abschleppdienst' : 'Werkstatt-Auftrag',
      title: `${service}: ${$('wrVehicle').value.trim()}`,
      body,
    }),
  }).then(r => r.json()).catch(() => null);
  if (res?.id) {
    toast('Anfrage eingegangen! Wir melden uns IC bei dir.', 'ok');
    e.target.reset();
    if ($('wrName')) $('wrName').value = currentUser?.username || '';
  } else {
    toast(res?.error || 'Fehler beim Senden', 'err');
  }
};

// ── Bürger: Arcade-Tab ──────────────────────────────────────────
async function loadVoterArcade() {
  const el = document.getElementById('voterArcade');
  if (!el || el.dataset.loaded) return;
  el.dataset.loaded = '1';
  const t = await fetch('/api/tournament').then(r => r.ok ? r.json() : null).catch(() => null);
  renderArcadeInto(el, { voter: true, tournament: t });
}

async function loadVoterTeam() {
  const el = document.getElementById('voterTeamContent');
  if (!el) return;
  const staff = await fetch('/api/organigramm').then(r => r.json()).catch(() => []);
  const leitung    = staff.filter(u => u.rank === 'Rang 12');
  const leitIds    = new Set(leitung.map(u => u.id));
  const admins     = staff.filter(u => u.role === 'admin'     && !leitIds.has(u.id));
  const ausbilder  = staff.filter(u => u.role === 'ausbilder' && !leitIds.has(u.id));
  const mitarbeiter = staff.filter(u => u.role !== 'admin' && u.role !== 'ausbilder' && !leitIds.has(u.id));
  function av(u, isL) {
    const sz = isL ? 68 : 56;
    const glow = frameGlow(u.equipped_frame);
    const src = u.avatar_custom || (u.avatar && u.discord_id ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=128` : null);
    return src
      ? `<img src="${src}" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;${glow}${isL?'border:2px solid #c9a227':''}" onerror="this.outerHTML='<div style=&quot;width:${sz}px;height:${sz}px;border-radius:50%;background:${isL?'#c9a227':'var(--orange)'};display:flex;align-items:center;justify-content:center;font-size:${isL?'1.5':'1.3'}rem;font-weight:700&quot;>${(u.username||'?')[0].toUpperCase()}</div>'">`
      : `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${isL?'#c9a227':'var(--orange)'};display:flex;align-items:center;justify-content:center;font-size:${isL?'1.5':'1.3'}rem;font-weight:700;${glow}">${(u.username||'?')[0].toUpperCase()}</div>`;
  }
  function card(u, isL = false) {
    const rc = isL?'#c9a227':u.role==='admin'?'#f97316':u.role==='ausbilder'?'#60a5fa':'var(--muted)';
    const rn = isL?'Rang 12':u.role==='admin'?'Administration':u.role==='ausbilder'?'Ausbilder':'Mitarbeiter';
    const rb = isL?'rgba(201,162,39,.18)':u.role==='admin'?'rgba(249,115,22,.15)':u.role==='ausbilder'?'rgba(96,165,250,.12)':'rgba(255,255,255,.06)';
    const bc = isL?'rgba(201,162,39,.45)':u.role==='admin'?'rgba(249,115,22,.3)':u.role==='ausbilder'?'rgba(96,165,250,.2)':'var(--border)';
    window._gbNames = window._gbNames || {};
    window._gbNames[u.id] = u.username;
    return `<div onclick="openSteckbrief(${u.id})" title="Steckbrief öffnen" style="cursor:pointer;background:var(--surface);border:1px solid ${bc};border-radius:var(--r);padding:1rem .85rem;display:flex;flex-direction:column;align-items:center;gap:.5rem;text-align:center;transition:transform .12s${isL?';box-shadow:0 0 14px rgba(201,162,39,.15)':''}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      ${isL?'<i class="fas fa-crown" style="color:#c9a227;font-size:.8rem"></i>':''}
      ${av(u, isL)}
      <div style="font-weight:700;font-size:.9rem;${nameColorCss(u.equipped_namecolor)}">${decoEmoji(u.equipped_deco)}${esc(u.username)}</div>
      ${titleLine(u.equipped_title)}
      <span style="font-size:.68rem;font-weight:700;padding:.15rem .5rem;border-radius:20px;background:${rb};color:${rc}">${rn}</span>
      ${(u.honorary_titles||[]).length?`<div style="display:flex;flex-wrap:wrap;gap:.25rem;justify-content:center">${(u.honorary_titles).map(t=>`<span style="font-size:.6rem;font-weight:600;padding:.1rem .4rem;border-radius:10px;background:${t.color||'#fbbf24'}22;color:${t.color||'#fbbf24'};border:1px solid ${t.color||'#fbbf24'}44">${t.icon||'⭐'} ${esc(t.title)}</span>`).join('')}</div>`:''}
      <span style="font-size:.62rem;color:var(--muted)"><i class="fas fa-id-card" style="margin-right:.25rem"></i>Steckbrief</span>
    </div>`;
  }
  function tier(label, icon, color, members, isL = false) {
    if (!members.length) return '';
    return `<div style="margin-bottom:1.75rem">
      <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${color};margin-bottom:.75rem;display:flex;align-items:center;gap:.5rem">
        <i class="fas ${icon}"></i>${label}<div style="flex:1;height:1px;background:${isL?'rgba(201,162,39,.3)':'var(--border)'}"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.75rem">${members.map(u=>card(u,isL)).join('')}</div>
    </div>`;
  }
  el.innerHTML = (staff.length ? '' : '<div style="text-align:center;padding:2rem;color:var(--muted)">Keine Mitarbeiter gefunden.</div>')
    + tier('Leitung','fa-crown','#c9a227',leitung,true)
    + tier('Administration','fa-shield-alt','#f97316',admins)
    + tier('Ausbilder','fa-graduation-cap','#60a5fa',ausbilder)
    + tier('Mitarbeiter','fa-users','var(--muted)',mitarbeiter);
}

// ── Gästebuch-Modal („Unser Team" – für Bürger & Mitarbeiter) ────
window.openGuestbookModal = async userId => {
  const name = window._gbNames?.[userId] || 'Mitarbeiter';
  openModal(`
    <div class="modal-head">
      <div class="modal-title">📖 Gästebuch – ${esc(name)}</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="display:flex;gap:.5rem;margin:.6rem 0 1rem;align-items:flex-start">
      <textarea id="gbModalInput" maxlength="300" rows="2" placeholder="Hinterlasse ${esc(name)} eine Nachricht…"
        class="form-control" style="flex:1;resize:vertical;font-size:.85rem"></textarea>
      <button class="btn btn-primary btn-sm" onclick="gbModalPost(${userId})">Senden</button>
    </div>
    <div id="gbModalList" style="max-height:320px;overflow-y:auto"><div style="color:var(--muted);font-size:.8rem;padding:.5rem 0">Wird geladen…</div></div>`);
  loadGuestbookModal(userId);
};

async function loadGuestbookModal(userId) {
  const el = $('gbModalList');
  if (!el) return;
  try {
    const res = await fetch('/api/guestbook/' + userId);
    if (!res.ok) { el.innerHTML = '<div style="color:var(--muted);font-size:.8rem">Kein Zugriff.</div>'; return; }
    const entries = await res.json();
    if (!entries.length) { el.innerHTML = '<div style="color:var(--muted);font-size:.8rem;padding:.5rem 0">Noch keine Einträge – sei der Erste! ✍️</div>'; return; }
    el.innerHTML = entries.map(e => {
      const av = e.author_avatar && e.author_discord_id
        ? `<img src="https://cdn.discordapp.com/avatars/${e.author_discord_id}/${e.author_avatar}.png" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`
        : `<div style="width:28px;height:28px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;flex-shrink:0">${esc((e.author_name||'?').slice(0,2).toUpperCase())}</div>`;
      const mine    = currentUser?.discord_id && e.author_discord_id === currentUser.discord_id;
      const isOwner = currentUser?.id && currentUser.id === +userId;
      const canDel  = mine || isOwner || currentUser?.role === 'admin';
      return `<div style="display:flex;gap:.6rem;padding:.55rem 0;border-bottom:1px solid var(--border)">
        ${av}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:.5rem">
            <span style="font-weight:700;font-size:.8rem">${esc(e.author_name)}</span>
            <span style="font-size:.66rem;color:var(--muted)">${ago(e.created_at)}</span>
            ${canDel ? `<button onclick="gbModalDelete(${e.id}, ${userId})" title="Löschen" style="margin-left:auto;background:none;border:none;color:var(--muted);cursor:pointer;font-size:.72rem"><i class="fas fa-trash"></i></button>` : ''}
          </div>
          <div style="font-size:.82rem;margin-top:.1rem;white-space:pre-wrap;word-break:break-word">${esc(e.message)}</div>
        </div>
      </div>`;
    }).join('');
  } catch { el.innerHTML = '<div style="color:#ef4444;font-size:.8rem">Fehler beim Laden.</div>'; }
}

window.gbModalPost = async userId => {
  const input = $('gbModalInput');
  const message = input?.value.trim();
  if (!message || message.length < 2) { toast('Bitte eine Nachricht eingeben (min. 2 Zeichen)', 'err'); return; }
  const r = await api('/api/guestbook/' + userId, { method: 'POST', body: { message } });
  if (r) { input.value = ''; toast('Eintrag gespeichert! ✍️', 'ok'); loadGuestbookModal(userId); }
};

window.gbModalDelete = async (entryId, userId) => {
  const r = await api('/api/guestbook/' + entryId, { method: 'DELETE' });
  if (r) { toast('Eintrag gelöscht', ''); loadGuestbookModal(userId); }
};

// ── Bürger: Namen ändern ─────────────────────────────────────────
window.openVoterRename = () => {
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-pen" style="color:var(--orange);margin-right:.4rem"></i>Namen ändern</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="font-size:.78rem;color:var(--muted);margin:.4rem 0 .8rem">Dein Anzeigename auf der Website (Abstimmung, Ranglisten, Gästebuch). Max. 3 Änderungen pro Stunde.</div>
    <input class="form-control" id="voterNameInput" maxlength="32" value="${esc(currentUser?.username || '')}" style="margin-bottom:.8rem">
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveVoterName()">Speichern</button>
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`);
  setTimeout(() => $('voterNameInput')?.focus(), 50);
};

window.saveVoterName = async () => {
  const username = $('voterNameInput')?.value.trim();
  if (!username || username.length < 2) { toast('Name muss mindestens 2 Zeichen haben', 'err'); return; }
  const r = await api('/api/voter/name', { method: 'POST', body: { username } });
  if (r) {
    currentUser.username = r.username;
    const nameEl = document.getElementById('vUserName');
    if (nameEl) nameEl.childNodes[0].textContent = r.username + ' ';
    closeModal();
    toast(`Name geändert: ${esc(r.username)} ✓`, 'ok');
  }
};

async function loadVoterApply() {
  const el = document.getElementById('voterApplyContent');
  if (!el) return;
  const app = await fetch('/api/applications/mine').then(r => r.json()).catch(() => null);

  if (app?.status === 'pending') {
    el.innerHTML = `<div class="card" style="max-width:540px">
      <div style="text-align:center;padding:1rem 0">
        <i class="fas fa-clock" style="font-size:2rem;color:#fbbf24;display:block;margin-bottom:.75rem"></i>
        <div style="font-weight:700;font-size:1.1rem;margin-bottom:.35rem">Bewerbung ausstehend</div>
        <div style="color:var(--muted);font-size:.85rem">Deine Bewerbung wird aktuell geprüft. Du wirst über Discord informiert.</div>
        <div style="margin-top:1rem;font-size:.75rem;color:var(--muted)">Eingereicht: ${new Date(app.created_at).toLocaleDateString('de-DE')}</div>
      </div>
    </div>`;
    return;
  }
  if (app?.status === 'accepted') {
    el.innerHTML = `<div class="card" style="max-width:540px">
      <div style="text-align:center;padding:1rem 0">
        <i class="fas fa-check-circle" style="font-size:2rem;color:#22c55e;display:block;margin-bottom:.75rem"></i>
        <div style="font-weight:700;font-size:1.1rem;margin-bottom:.35rem">Bewerbung angenommen!</div>
        <div style="color:var(--muted);font-size:.85rem">Herzlichen Glückwunsch! Du wurdest in das ACLS-Team aufgenommen.</div>
        ${app.admin_note ? `<div style="margin-top:.75rem;padding:.5rem .75rem;background:var(--surface2);border-radius:6px;font-size:.82rem;text-align:left"><b>Nachricht:</b> ${esc(app.admin_note)}</div>` : ''}
      </div>
    </div>`;
    return;
  }
  if (app?.status === 'rejected') {
    el.innerHTML = `<div class="card" style="max-width:540px">
      <div style="text-align:center;padding:1rem 0">
        <i class="fas fa-times-circle" style="font-size:2rem;color:#ef4444;display:block;margin-bottom:.75rem"></i>
        <div style="font-weight:700;font-size:1.1rem;margin-bottom:.35rem">Bewerbung abgelehnt</div>
        <div style="color:var(--muted);font-size:.85rem">Leider wurde deine Bewerbung diesmal nicht angenommen.</div>
        ${app.admin_note ? `<div style="margin-top:.75rem;padding:.5rem .75rem;background:var(--surface2);border-radius:6px;font-size:.82rem;text-align:left"><b>Begründung:</b> ${esc(app.admin_note)}</div>` : ''}
      </div>
    </div>`;
    return;
  }

  // Kein Antrag → Formular anzeigen
  el.innerHTML = `<div class="card" style="max-width:560px">
    <div style="margin-bottom:1.25rem">
      <div style="font-weight:700;font-size:1rem;margin-bottom:.25rem">Bewerbung beim ACLS</div>
      <div style="font-size:.82rem;color:var(--muted)">Fülle alle Felder aus. Wir melden uns über Discord.</div>
    </div>
    <form onsubmit="submitVoterApplication(event)">
      <div class="form-row">
        <div class="form-group"><label>IC-Name *</label><input class="form-control" id="appIcName" placeholder="Dein Name im Spiel" required></div>
        <div class="form-group"><label>IC-Alter</label><input class="form-control" id="appIcAge" placeholder="z.B. 28"></div>
      </div>
      <div class="form-group">
        <label>Vorerfahrung *</label>
        <textarea class="form-control" id="appExperience" rows="3" placeholder="Was weißt du über Fahrzeuge, Verkehrsregeln, Roleplay?" required style="resize:vertical"></textarea>
      </div>
      <div class="form-group">
        <label>Motivation *</label>
        <textarea class="form-control" id="appMotivation" rows="3" placeholder="Warum möchtest du Teil des ACLS werden?" required style="resize:vertical"></textarea>
      </div>
      <div class="form-group">
        <label>Verfügbarkeit *</label>
        <input class="form-control" id="appAvailability" placeholder="z.B. Mo–Fr abends, Wochenende" required>
      </div>
      <div class="modal-footer" style="padding:0;margin-top:1rem">
        <button type="submit" class="btn btn-primary" style="width:100%"><i class="fas fa-paper-plane"></i> Bewerbung absenden</button>
      </div>
    </form>
  </div>`;
}

window.submitVoterApplication = async e => {
  e.preventDefault();
  const r = await fetch('/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ic_name:      document.getElementById('appIcName').value.trim(),
      ic_age:       document.getElementById('appIcAge').value.trim(),
      experience:   document.getElementById('appExperience').value.trim(),
      motivation:   document.getElementById('appMotivation').value.trim(),
      availability: document.getElementById('appAvailability').value.trim(),
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.ok) { toast('Bewerbung eingereicht!', 'ok'); loadVoterApply(); }
  else toast(data.error || 'Fehler', 'err');
};

// ── UMFRAGE-WIDGET ────────────────────────────────────────────────
// BATCH 8: Poll-Widget — verarbeitet jetzt Array von bis zu 5 aktiven Polls
async function loadPollWidget(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const polls = await fetch('/api/poll/active').then(r => r.json()).catch(() => null);
  if (!polls || !polls.length) { el.style.display = 'none'; return; }
  el.style.display = '';

  function renderPoll(poll) {
    const options = Array.isArray(poll.options) ? poll.options : [];
    const votes = Array.isArray(poll.votes) ? poll.votes : [];
    const totalVotes = votes.reduce((s, v) => s + v.count, 0);
    const voted = poll.myVote !== null && poll.myVote !== undefined;

    const hdr = `<div style="display:flex;align-items:center;gap:.65rem;margin-bottom:.9rem">
      <div style="width:28px;height:28px;border-radius:7px;background:rgba(99,102,241,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fas fa-poll" style="color:#818cf8;font-size:.82rem"></i>
      </div>
      <div>
        <div style="font-weight:700;font-size:.9rem">Frage der Woche</div>
        <div style="font-size:.7rem;color:var(--muted)">${totalVotes} Stimme${totalVotes !== 1 ? 'n' : ''} abgegeben</div>
      </div>
    </div>
    <div style="font-size:.88rem;font-weight:600;margin-bottom:.85rem;line-height:1.4">${esc(poll.question)}</div>`;

    if (voted) {
      return `<div class="card" style="box-sizing:border-box;margin-bottom:.75rem">${hdr}
        ${options.map((label, i) => {
          const voteRow = votes.find(v => v.option_idx === i);
          const cnt = voteRow?.count || 0;
          const pct = totalVotes ? Math.round(cnt / totalVotes * 100) : 0;
          const mine = poll.myVote === i;
          return `<div style="margin-bottom:.6rem">
            <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.25rem">
              <span style="font-weight:${mine?'700':'500'};color:${mine?'#818cf8':'var(--text)'}">
                ${mine?'<i class="fas fa-check" style="margin-right:.3rem;color:#818cf8"></i>':''}${esc(label)}
              </span>
              <span style="color:var(--muted);font-weight:600">${pct}%</span>
            </div>
            <div style="height:6px;background:var(--input);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${mine?'#818cf8':'var(--border)'};border-radius:3px;transition:width .5s ease"></div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    } else {
      return `<div class="card" style="box-sizing:border-box;margin-bottom:.75rem">${hdr}
        <div style="display:flex;flex-direction:column;gap:.4rem">
          ${options.map((label, i) => `
          <button onclick="castPollVote(${poll.id},${i},'${containerId}')"
            style="width:100%;text-align:left;padding:.55rem .75rem;border:1px solid var(--border);border-radius:8px;background:var(--input);color:var(--text);cursor:pointer;font-size:.82rem;font-family:inherit;font-weight:500;transition:border-color .15s,background .15s"
            onmouseover="this.style.borderColor='#818cf8';this.style.background='rgba(99,102,241,.06)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--input)'">${esc(label)}</button>`).join('')}
        </div>
      </div>`;
    }
  }

  el.innerHTML = polls.map(p => renderPoll(p)).join('');
}

window.castPollVote = async (pollId, optionIdx, containerId) => {
  const r = await fetch('/api/poll/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poll_id: pollId, option_idx: optionIdx }) });
  const data = await r.json().catch(() => ({}));
  if (r.ok) {
    toast('Stimme abgegeben!', 'ok');
    const cid = containerId || (document.getElementById('vPollWidget') ? 'vPollWidget' : 'staffPollWidget');
    loadPollWidget(cid);
  } else toast(data.error || 'Fehler', 'err');
};

// ── CHALLENGES-WIDGET ─────────────────────────────────────────────
async function loadChallengesWidget(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const challenges = await fetch('/api/challenges').then(r => r.json()).catch(() => []);
  if (!challenges?.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `<div class="card" style="height:100%;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:.65rem;margin-bottom:.9rem">
      <div style="width:28px;height:28px;border-radius:7px;background:rgba(249,115,22,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fas fa-star" style="color:var(--orange);font-size:.82rem"></i>
      </div>
      <div>
        <div style="font-weight:700;font-size:.9rem">Wöchentliche Challenges</div>
        <div style="font-size:.7rem;color:var(--muted)">Diese Woche · Setzt sich jeden Montag zurück</div>
      </div>
    </div>
    ${challenges.map(c => {
      const done = c.progress >= c.target;
      const pct  = Math.min(100, Math.round(c.progress / c.target * 100));
      return `<div style="margin-bottom:.85rem">
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem">
          <div style="width:24px;height:24px;border-radius:6px;background:${done?'rgba(34,197,94,.2)':'rgba(255,255,255,.06)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fas ${done?'fa-check':c.icon}" style="color:${done?'#22c55e':'var(--muted)'};font-size:.72rem"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.82rem;font-weight:600;${done?'color:#22c55e':''}">${c.title}</div>
            <div style="font-size:.7rem;color:var(--muted)">${c.desc}</div>
          </div>
          <div style="font-size:.72rem;font-weight:700;color:${done?'#22c55e':'var(--muted)'};flex-shrink:0">${c.progress}/${c.target}</div>
        </div>
        <div style="height:4px;background:var(--input);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${done?'#22c55e':'var(--orange)'};border-radius:2px;transition:width .4s ease"></div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

window.voterTab = tab => {
  ['werkstatt','price','vote','ticketpub','market','team','apply','faq','duel','friends','saison','arcade'].forEach(t => {
    const sec = document.getElementById(t + 'Section');
    if (sec) sec.style.display = t === tab ? '' : 'none';
    const nav = document.getElementById('vn' + t.charAt(0).toUpperCase() + t.slice(1));
    if (nav) nav.classList.toggle('active', t === tab);
  });
  const p = _voterPageMeta[tab];
  if (p) {
    const tEl = document.getElementById('vPageTitle');
    const sEl = document.getElementById('vPageSubtitle');
    if (tEl) tEl.textContent = p.title;
    if (sEl) sEl.textContent = p.sub;
  }
  // Quiz-Duell rendert in eigene Section (statt ins Staff-pageContent)
  window._duelActive = tab === 'duel';
  if (tab !== 'duel' && window._duelTimer) { clearInterval(window._duelTimer); window._duelTimer = null; }
  if (tab === 'duel') { window._duelContainer = 'duelSection'; duell(); }
  if (tab === 'werkstatt') loadVoterWerkstatt();
  if (tab === 'market')    loadVoterMarket();
  if (tab === 'price')     { loadVoterPrices(); loadPollWidget('vPollWidget'); }
  if (tab === 'ticketpub') loadMyPublicTickets();
  if (tab === 'faq')       loadVoterFaq();
  if (tab === 'friends')   loadVoterFriends();
  if (tab === 'saison')    saison();
  if (tab === 'arcade')    loadVoterArcade();
};

async function loadVoterFaq() {
  const el = document.getElementById('voterFaqContent');
  if (!el || el.dataset.loaded) return;
  const rows = await fetch('/api/faq').then(r => r.json()).catch(() => []);
  el.dataset.loaded = '1';
  if (!rows.length) { el.innerHTML = '<div class="empty"><i class="fas fa-question-circle"></i><p>Noch keine FAQ-Einträge vorhanden.</p></div>'; return; }
  const cats = [...new Set(rows.map(r => r.category))];
  el.innerHTML = `<div style="max-width:720px">${cats.map(cat => `
    <div style="margin-bottom:1.5rem">
      <div style="font-size:.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">${cat}</div>
      ${rows.filter(r => r.category === cat).map(f => `
        <div class="card" style="margin-bottom:.5rem;cursor:pointer" onclick="this.querySelector('.faq-ans').classList.toggle('hidden')">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem">
            <div style="font-weight:600;font-size:.92rem"><i class="fas fa-question-circle" style="color:#38bdf8;margin-right:.45rem;font-size:.8rem"></i>${esc(f.question)}</div>
            <i class="fas fa-chevron-down" style="color:var(--muted);font-size:.7rem;flex-shrink:0"></i>
          </div>
          <div class="faq-ans hidden" style="margin-top:.65rem;padding-top:.65rem;border-top:1px solid var(--border);font-size:.88rem;color:var(--muted);line-height:1.6;white-space:pre-wrap">${esc(f.answer)}</div>
        </div>`).join('')}
    </div>`).join('')}</div>`;
}

async function loadVoterPrices() {
  const el = document.getElementById('voterPrices');
  if (!el || el.dataset.loaded) return;
  const rows = await fetch('/api/prices').then(r => r.json()).catch(() => []);
  if (!rows.length) { el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)">Keine Preise hinterlegt.</div>'; return; }

  const CAT_META = {
    'Werkstatt':    { icon: 'fa-wrench', col: '#f97316', sub: 'Reparatur, Tuning & Abschleppdienst' },
    'Fahrschule':   { icon: 'fa-graduation-cap', col: '#22c55e', sub: 'Automatischer Kontoabzug' },
    'Kundenpreise': { icon: 'fa-hand-holding-usd', col: '#38bdf8', sub: 'Bar auf Hand' },
  };
  const cats = {};
  rows.forEach(r => { if (!cats[r.category]) cats[r.category] = []; cats[r.category].push(r); });

  el.innerHTML = Object.entries(cats).map(([cat, items]) => {
    const m = CAT_META[cat] || { icon: 'fa-tag', col: '#6b7280', sub: '' };
    return `
    <div style="background:var(--surface2);border-radius:10px;padding:.85rem;margin-bottom:.75rem">
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.65rem;padding-bottom:.55rem;border-bottom:1px solid var(--border)">
        <div style="width:30px;height:30px;border-radius:8px;background:${m.col}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fas ${m.icon}" style="color:${m.col};font-size:.85rem"></i>
        </div>
        <div>
          <div style="font-weight:700;font-size:.9rem">${cat}</div>
          ${m.sub ? `<div style="font-size:.68rem;color:var(--muted)">${m.sub}</div>` : ''}
        </div>
      </div>
      ${items.map(item => `
      <div style="display:flex;align-items:center;gap:.5rem;padding:.35rem 0;${items.indexOf(item) < items.length-1 ? 'border-bottom:1px solid var(--border)' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-size:.83rem;font-weight:600">${esc(item.name)}</div>
          ${item.notes ? `<div style="font-size:.7rem;color:var(--muted)">${esc(item.notes)}</div>` : ''}
        </div>
        <div style="font-size:.88rem;font-weight:800;color:${m.col};white-space:nowrap">${item.price}</div>
      </div>`).join('')}
    </div>`;
  }).join('');
  el.dataset.loaded = '1';
}

async function loadVoterMarket() {
  const el = document.getElementById('voterListings');
  if (!el) return;
  const rows = await fetch('/api/car-listings').then(r => r.json()).catch(() => []);
  window._listingsCache = new Map(rows.map(l => [l.id, l]));
  if (!rows.length) {
    el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted)"><i class="fas fa-car-side" style="font-size:2rem;display:block;margin-bottom:.75rem;opacity:.3"></i>Noch keine Inserate vorhanden.</div>';
    return;
  }
  el.innerHTML = rows.map(l => {
    const isOwner = currentUser?.discord_id === l.owner_discord_id;
    const canDel  = isOwner || currentUser?.role === 'admin';
    const isRent  = l.listing_type === 'vermietung';
    const dur     = l.duration === '7_tage' ? '7 Tage' : l.duration === '1_monat' ? '1 Monat' : '';
    return `
    <div class="card" onclick="openListingDetail(${l.id})" style="display:flex;flex-direction:column;gap:0;padding:0;overflow:hidden;cursor:pointer;transition:transform .12s,box-shadow .12s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 24px rgba(0,0,0,.18)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      ${l.image_data
        ? `<div class="listing-img-wrap"><img class="listing-img" src="${l.image_data}" alt="${esc(l.car)}" loading="lazy"></div>`
        : `<div class="listing-no-img"><i class="fas fa-${isRent ? 'key' : 'car-side'}" style="color:var(--orange);font-size:1.6rem;opacity:.5"></i></div>`}
      <div style="padding:.85rem;display:flex;flex-direction:column;gap:.4rem;flex:1">
        <div>
          <div style="font-weight:800;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(l.car)}">${esc(l.car)}</div>
          <div style="font-size:1.05rem;font-weight:800;color:#f97316">${esc(l.price)}$${isRent && dur ? `<span style="font-size:.72rem;font-weight:600;color:var(--muted);margin-left:.35rem">/ ${dur}</span>` : ''}</div>
        </div>
        <div>${listingTypeBadge(l)}</div>
        <div style="font-size:.8rem;color:var(--muted);display:flex;flex-direction:column;gap:.2rem">
          <div><i class="fas fa-user" style="width:14px;text-align:center;margin-right:.35rem"></i>${esc(l.name)}</div>
          <div><i class="fas fa-phone" style="width:14px;text-align:center;margin-right:.35rem"></i>${esc(l.phone)}</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:.5rem;border-top:1px solid var(--border)">
          <div style="font-size:.7rem;color:var(--muted)">${ago(l.created_at)}</div>
          ${canDel ? `<div onclick="event.stopPropagation()"><button class="btn btn-danger btn-sm" onclick="voterDeleteListing(${l.id})" title="Löschen"><i class="fas fa-trash" style="font-size:.7rem"></i></button></div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

window.voterDeleteListing = async id => {
  if (!confirm('Inserat löschen?')) return;
  const r = await fetch(`/api/car-listings/${id}`, { method: 'DELETE' });
  if (r.ok) { toast('Inserat gelöscht.', 'ok'); loadVoterMarket(); }
  else toast('Fehler', 'err');
};

window.submitPublicTicketForm = async e => {
  e.preventDefault();
  const name = $('ptName')?.value.trim();
  const category = $('ptCategory')?.value;
  const title = $('ptTitle')?.value.trim();
  const body = $('ptBody')?.value.trim();
  if (!name || !category || !title || !body) { toast('Bitte alle Felder ausfüllen', 'err'); return; }
  const r = await fetch('/api/tickets/public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, discord_id: currentUser.discord_id || null, category, title, body }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.ok) {
    toast(`Ticket #${data.id} wurde eingereicht!`, 'ok');
    $('ptTitle').value = '';
    $('ptBody').value = '';
    $('ptCategory').value = '';
    loadMyPublicTickets();
  } else toast(data.error || 'Fehler beim Senden', 'err');
};

async function loadMyPublicTickets() {
  const el = document.getElementById('my-public-tickets-list');
  if (!el) return;
  try {
    const data = await (await fetch('/api/tickets/public/mine')).json();
    if (!data.length) { el.innerHTML = '<div style="color:var(--muted);font-size:.85rem">Noch keine Tickets eingereicht.</div>'; return; }
    const statusColor = s => s === 'offen' ? '#f59e0b' : s === 'in_bearbeitung' ? '#3b82f6' : s === 'geschlossen' ? '#22c55e' : '#f59e0b';
    const statusLabel = s => s === 'offen' ? 'Offen' : s === 'in_bearbeitung' ? 'In Bearbeitung' : s === 'geschlossen' ? 'Geschlossen' : s;
    const catColor = { 'Werkstatt-Auftrag': '#f97316', 'Abschleppdienst': '#fbbf24', Bug: '#ef4444', Frage: '#3b82f6', Beschwerde: '#f97316', 'Feature-Wunsch': '#a855f7', Sonstiges: '#6b7280' };
    el.innerHTML = data.map(t => `
      <div style="border:1px solid var(--border);border-radius:var(--r);padding:.75rem 1rem;margin-bottom:.5rem">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;margin-bottom:.25rem">
          <span style="font-weight:700;font-size:.88rem">${esc(t.title)}</span>
          <div style="display:flex;gap:.35rem;flex-shrink:0">
            <span style="font-size:.68rem;font-weight:700;padding:.1rem .4rem;border-radius:20px;background:${(catColor[t.category]||'#6b7280')}22;color:${catColor[t.category]||'#6b7280'}">${esc(t.category)}</span>
            <span style="font-size:.68rem;font-weight:700;padding:.1rem .4rem;border-radius:20px;background:${statusColor(t.status)}22;color:${statusColor(t.status)}">${statusLabel(t.status)}</span>
          </div>
        </div>
        <div style="font-size:.72rem;color:var(--muted)">Ticket #${t.id} · ${new Date(t.created_at).toLocaleDateString('de-DE')}</div>
      </div>`).join('');
  } catch { el.innerHTML = '<div style="color:var(--muted);font-size:.85rem">Fehler beim Laden.</div>'; }
}

window.castCitizenVote = async nominee_id => {
  const r = await fetch('/api/citizen-vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nominee_id }),
  });
  const data = await r.json();
  if (r.ok) {
    toast(data.changed ? 'Stimme geändert!' : 'Stimme abgegeben!', 'ok');
    await renderVoterScreen();
    voterTab('vote');
  } else toast(data.error || 'Fehler', 'err');
};

window.voterLogout = async () => {
  await fetch('/auth/logout', { method: 'POST' });
  location.reload();
};

let _activePage = 'dashboard';

function bootApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  initSidebar();
  applyNavPrefs();
  renderUserWidget();
  $('adminNavItem').style.display        = isAdmin()     ? '' : 'none';
  $('auditlogNavItem').style.display     = isAdmin()     ? '' : 'none';
  { const x=$('xpwatchNavItem'); if(x) x.style.display = isAdmin() ? '' : 'none'; }
  $('ausbildungNavItem').style.display   = isAusbilder() ? '' : 'none';
  $('applicationsNavItem').style.display = isAdmin()     ? '' : 'none';
  $('frageneditorNavItem').style.display = isAdmin()     ? '' : 'none';
  $('beschwerdenNavItem').style.display  = isAdmin()     ? '' : 'none';
  if (isAdmin() || isAusbilder()) $('admin-toggle').style.display = 'flex';
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      if (!el.dataset.page) return; // externe Links & Buttons (z. B. Tour) unverändert lassen
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });
  initFavToggles();
  // Onboarding-Tour beim allerersten Login automatisch starten
  if (!localStorage.getItem('acls-tour-done')) setTimeout(startTour, 900);
  // PWA-Shortcuts (/?page=shop etc.) direkt auf die gewünschte Seite springen
  const startPage = new URLSearchParams(location.search).get('page');
  navigate(startPage && PAGES[startPage] ? startPage : 'dashboard');
  // Abzeichen alle 30 Minuten neu laden wenn Dashboard aktiv
  setInterval(() => { if (_activePage === 'dashboard') dashboard(); }, 30 * 60 * 1000);
  loadNotifCount();
  updateDMBadge();
  setInterval(updateDMBadge, 60_000);
}

function renderUserWidget() {
  const u = currentUser;
  const url = avatarUrl(u);
  $('userWidget').innerHTML = `
    <button onclick="navigate('shop')" title="ACLS-Coins – zum Shop" style="display:flex;align-items:center;gap:.35rem;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);color:#fbbf24;padding:.35rem .7rem;border-radius:999px;font-weight:800;font-size:.78rem;cursor:pointer;font-family:inherit;white-space:nowrap">
      🪙 <span id="coinChipVal">…</span>
    </button>
    <div class="u-avatar" id="uAvatarBox" style="cursor:pointer;${url ? 'background:transparent;padding:0' : ''}" onclick="navigate('profil')" title="Mein Profil / Profilbild hochladen">
      ${url ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentElement.textContent='${initials(u.username)}'">` : initials(u.username)}
    </div>
    <div class="u-info" style="cursor:pointer" onclick="navigate('profil')" title="Mein Profil">
      <div class="u-name">${esc(u.username)}</div>
      <div class="u-role" id="uRoleLine">${u.role === 'admin' ? 'Administrator' : 'Mitarbeiter'}</div>
    </div>
    <button class="icon-btn" onclick="openProfileModal(${u.id})" title="Profil-Details"><i class="fas fa-chevron-down"></i></button>
    <button class="icon-btn" onclick="logout()" title="Abmelden"><i class="fas fa-sign-out-alt"></i></button>`;
  loadCoins();
}

// ── ACLS-Coins Widget ────────────────────────────────────────────
const SHOP_TITLE_NAMES = {
  title_rennfahrer: '🏎️ Rennfahrer',   title_blitz:    '⚡ Blitzschnell',
  title_schrauber: '🔧 Meisterschrauber', title_casino: '🎰 Casino-Hai',
  title_abschlepp: '🚛 Abschleppkönig', title_champion: '🏆 Turnier-Champion',
  title_legende:   '👑 ACLS-Legende',
  title_pilot: '✈️ Fluglehrer', title_kapitan: '⚓ Kapitän', title_drift: '🏁 Drift-King',
  title_nacht: '🌙 Nachtschicht', title_glueck: '🍀 Glückspilz', title_veteran: '🎖️ Veteran',
  title_millionaer: '💰 Millionär',
};
const SHOP_FRAME_COLORS = {
  frame_gold: '#ffd700', frame_neon: '#00f5ff', frame_feuer: '#f97316',
  frame_lila: '#a855f7', frame_regenbogen: 'rainbow',
  frame_smaragd: '#10b981', frame_rubin: '#e11d48', frame_eis: '#7dd3fc', frame_pink: '#ec4899',
};

const BANNER_CSS = {
  banner_sunset:  'linear-gradient(135deg,#7c2d12,#f97316 45%,#fbbf24)',
  banner_skyline: 'linear-gradient(180deg,#0c1830,#1e3a8a 60%,#0ea5e9)',
  banner_neon:    'linear-gradient(135deg,#0f0524,#7c3aed 50%,#00f5ff)',
  banner_carbon:  'linear-gradient(135deg,#0a0a0a,#262626 50%,#404040)',
  banner_galaxy:  'linear-gradient(160deg,#0b0220,#4c1d95 55%,#7c3aed)',
  banner_gold:    'linear-gradient(135deg,#3a2c00,#b8860b 50%,#fbbf24)',
  banner_matrix:  'linear-gradient(180deg,#001a00,#003d1a 55%,#00ff66)',
};
const DECO_EMOJI  = { deco_crown: '👑', deco_wrench: '🔧', deco_blitz: '⚡', deco_halo: '😇',
  deco_fire: '🔥', deco_star: '⭐', deco_diamond: '💎', deco_rocket: '🚀', deco_clover: '🍀', deco_skull: '💀' };
const NAME_COLORS = { namecolor_gold: '#ffd700',
  namecolor_cyan: '#22d3ee', namecolor_pink: '#f472b6', namecolor_green: '#4ade80', namecolor_red: '#f87171' };
const DECK_CSS = {
  deck_gold:   'repeating-linear-gradient(45deg,#7a5800,#7a5800 6px,#b8860b 6px,#b8860b 12px)',
  deck_carbon: 'repeating-linear-gradient(135deg,#0d0d0d,#0d0d0d 4px,#2e2e2e 4px,#2e2e2e 8px)',
  deck_neon:   'repeating-linear-gradient(45deg,#1a0033,#1a0033 5px,#7c3aed 5px,#7c3aed 10px)',
  deck_ocean:  'repeating-linear-gradient(135deg,#012a4a,#012a4a 5px,#2a6f97 5px,#2a6f97 10px)',
  deck_rot:    'repeating-linear-gradient(45deg,#4a0404,#4a0404 5px,#b91c1c 5px,#b91c1c 10px)',
};
const decoEmoji    = id => DECO_EMOJI[id] ? DECO_EMOJI[id] + ' ' : '';
const nameColorCss = id => NAME_COLORS[id] ? `color:${NAME_COLORS[id]};` : '';

function ensureRainbowStyle() {
  if (document.getElementById('rainbowGlowStyle')) return;
  const st = document.createElement('style');
  st.id = 'rainbowGlowStyle';
  st.textContent = '@keyframes rainbowGlow{0%{box-shadow:0 0 10px 2px #ef4444}25%{box-shadow:0 0 10px 2px #fbbf24}50%{box-shadow:0 0 10px 2px #4ade80}75%{box-shadow:0 0 10px 2px #38bdf8}100%{box-shadow:0 0 10px 2px #ef4444}}';
  document.head.appendChild(st);
}

// CSS für gekauften Avatar-Rahmen (überall einsetzbar)
function frameGlow(frameId) {
  const c = SHOP_FRAME_COLORS[frameId];
  if (!c) return '';
  if (c === 'rainbow') { ensureRainbowStyle(); return 'box-shadow:0 0 10px 2px #f97316;animation:rainbowGlow 3s linear infinite;'; }
  // BATCH 2.1: Sanitize CSS value — nur sichere Zeichen erlaubt
  const safe = String(c).replace(/[^a-zA-Z0-9#., ()%\-]/g, '');
  return safe ? `box-shadow:0 0 10px 2px ${safe};` : '';
}

// Gekaufter Titel als kleine goldene Zeile unter dem Namen (inkl. Wunsch-Titel)
function titleLine(titleId, size = '.66rem') {
  if (!titleId) return '';
  const n = titleId.startsWith('custom:') ? '✨ ' + titleId.slice(7) : SHOP_TITLE_NAMES[titleId];
  return n ? `<div style="font-size:${size};font-weight:700;color:#fbbf24">${esc(n)}</div>` : '';
}

function updateCoinChip(balance) {
  const el = $('coinChipVal');
  if (el) el.textContent = (+balance).toLocaleString('de-DE');
}

async function loadCoins() {
  try {
    const r = await fetch('/api/coins/me');
    if (!r.ok) return;
    const d = await r.json();
    window._coinInfo = d;
    updateCoinChip(d.balance);
    // Ausgerüsteter Titel ersetzt die Rollen-Zeile
    const tName = d.equippedTitle?.startsWith('custom:') ? '✨ ' + d.equippedTitle.slice(7) : SHOP_TITLE_NAMES[d.equippedTitle];
    if (tName) {
      const role = $('uRoleLine');
      if (role) { role.textContent = tName; role.style.color = '#fbbf24'; }
    }
    // Namensfarbe + Deko im Topbar-Widget
    const nameEl = document.querySelector('#userWidget .u-name');
    if (nameEl) {
      if (!nameEl.dataset.base) nameEl.dataset.base = nameEl.textContent;
      nameEl.textContent = decoEmoji(d.equippedDeco) + nameEl.dataset.base;
      nameEl.style.color = NAME_COLORS[d.equippedNamecolor] || '';
    }
    // Avatar-Rahmen
    const av = $('uAvatarBox');
    if (av && d.equippedFrame) {
      const c = SHOP_FRAME_COLORS[d.equippedFrame];
      if (c === 'rainbow') {
        av.style.boxShadow = '0 0 10px 2px #f97316';
        av.style.animation = 'rainbowGlow 3s linear infinite';
        if (!document.getElementById('rainbowGlowStyle')) {
          const st = document.createElement('style');
          st.id = 'rainbowGlowStyle';
          st.textContent = '@keyframes rainbowGlow{0%{box-shadow:0 0 10px 2px #ef4444}25%{box-shadow:0 0 10px 2px #fbbf24}50%{box-shadow:0 0 10px 2px #4ade80}75%{box-shadow:0 0 10px 2px #38bdf8}100%{box-shadow:0 0 10px 2px #ef4444}}';
          document.head.appendChild(st);
        }
      } else if (c) {
        av.style.boxShadow = `0 0 10px 2px ${c}`;
      }
    }
  } catch {}
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  location.reload();
}

// ── Router ────────────────────────────────────────────────────────
// Tages-Aufgaben: Seitenbesuche client-seitig merken (Checkliste im Mein-Hub)
function _todayKey() { return new Date().toISOString().slice(0, 10); }
function trackPageVisit(page) {
  try {
    const key = 'acls-visits-' + _todayKey();
    // alte Besuchs-Keys aufräumen
    Object.keys(localStorage).forEach(k => { if (k.startsWith('acls-visits-') && k !== key) localStorage.removeItem(k); });
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    if (!v.includes(page)) { v.push(page); localStorage.setItem(key, JSON.stringify(v)); }
  } catch {}
}
function getTodayVisits() {
  try { return JSON.parse(localStorage.getItem('acls-visits-' + _todayKey()) || '[]'); } catch { return []; }
}

async function navigate(page) {
  if (page === 'admin'     && !isAdmin())     { toast('Kein Zugriff', 'err'); return; }
  if (page === 'ausbildung' && !isAusbilder()) { toast('Kein Zugriff', 'err'); return; }
  closeModal();
  closeMobileMenu();
  _activePage = page;
  trackPageVisit(page);
  if (leafletMap && page !== 'map') { leafletMap.remove(); leafletMap = null; }

  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  const p = PAGES[page] || PAGES.dashboard;
  $('pageTitle').textContent    = p.title;
  $('pageSubtitle').textContent = p.sub;
  $('pageContent').innerHTML    = loading();

  if (window._duelTimer) { clearInterval(window._duelTimer); window._duelTimer = null; }
  const renders = { dashboard, werkstatt, arcade, activity, eow, exams, registry, factions, map, iczeit, prices, carmarket, organigramm, applications, admin, ausbildung, bans, search, faq, auditlog, turnier, duell, shop, saison, freunde, schwarzmarkt, feedback, frageneditor, beschwerden, nachrichten, marktplatz, wetten, tickets, statistiken, team_vorstellung, level, wheel, milestones, changelog, trivia, onboarding, profil, meinacls, finanzen };
  // Zusatz-Module (js/acls-plus.js) registrieren ihre Seiten hier
  if (window.ACLSPlusPages) Object.assign(renders, window.ACLSPlusPages);
  const renderFn = renders[page] || dashboard;

  try {
    await renderFn();
  } catch (e) {
    console.error('[navigate]', page, e);
  }

  // Manche Render-Funktionen brechen bei einem API-Fehler früh ab (`if (!data) return`)
  // und überschreiben dabei nie den Skeleton-Loader von oben. Statt dass die Seite dann
  // für immer im Ladezustand hängen bleibt, zeigen wir einen Fehler mit Retry-Button.
  // Nur eingreifen, wenn der Nutzer währenddessen nicht schon weitergeklickt hat.
  if (_activePage === page && $('pageContent')?.querySelector('.skel-page')) {
    $('pageContent').innerHTML = errorState('Seite konnte nicht geladen werden.', `navigate('${page}')`);
  }
}

// ════════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════════
async function loadTwitchWidget() {
  try {
    const t = await (await fetch('/api/twitch-status')).json();
    const el = document.getElementById('twitch-widget');
    if (!el) return;
    const channelUrl = `https://www.twitch.tv/${encodeURIComponent(t.channel || '')}`;
    el.style.display = t.live ? '' : 'none';
    if (t.live) {
      el.innerHTML = `<div class="twitch-card">
        <div class="twitch-live-dot"></div>
        ${t.thumbnail ? `<img class="twitch-thumb" src="${esc(t.thumbnail)}" alt="Stream">` : ''}
        <div class="twitch-info">
          <div style="margin-bottom:.25rem">
            <span class="twitch-badge-live">LIVE</span>
            <span style="font-weight:700;font-size:.95rem;color:#c084fc">${esc(t.channel)}</span>
          </div>
          <div style="font-size:.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px" title="${esc(t.title)}">${esc(t.title || '')}</div>
          <div style="font-size:.75rem;color:#9ca3af;margin-top:.2rem">
            ${t.game ? `<i class="fas fa-gamepad" style="margin-right:.3rem"></i>${esc(t.game)} &nbsp;·&nbsp; ` : ''}
            <i class="fas fa-eye" style="margin-right:.3rem"></i>${t.viewers?.toLocaleString('de-DE')} Zuschauer
          </div>
        </div>
        <a href="${channelUrl}" target="_blank" style="flex-shrink:0">
          <button class="btn btn-sm" style="background:linear-gradient(135deg,#6441a5,#9147ff);color:#fff;border:none;white-space:nowrap">
            <i class="fab fa-twitch"></i> Jetzt schauen
          </button>
        </a>
      </div>`;
    } else {
      el.innerHTML = `<div class="twitch-card">
        <div class="twitch-offline-dot"></div>
        <div class="twitch-info">
          <div style="margin-bottom:.2rem">
            <span class="twitch-badge-off">OFFLINE</span>
            <span style="font-weight:700;font-size:.9rem;color:#9ca3af">${esc(t.channel)}</span>
          </div>
          <div style="font-size:.78rem;color:#6b7280">Derzeit nicht live</div>
        </div>
        <a href="${channelUrl}" target="_blank" style="flex-shrink:0">
          <button class="btn btn-ghost btn-sm" style="white-space:nowrap">
            <i class="fab fa-twitch" style="color:#9147ff"></i> Kanal besuchen
          </button>
        </a>
      </div>`;
    }
  } catch {
    const el = document.getElementById('twitch-widget');
    if (el) el.style.display = 'none';
  }
}

// ══ ARCADE ══════════════════════════════════════════════════════
// Zentraler Spiele-Katalog – IDs entsprechen den Server-Game-Keys,
// damit das Wochenturnier-Spiel („Spiel der Woche“) markiert werden kann.
const GAME_CATALOG = [
  { id: 'race',         name: 'Autorennen',          url: '/game',   icon: 'fa-car',          color: '#f97316', desc: 'Rasante Rennen – auch auf eigenen Strecken', voter: true },
  { id: 'brick',        name: 'Brick Breaker',       url: '/game2',  icon: 'fa-th-large',     color: '#38bdf8', desc: 'Klassischer Blockbrecher mit Power-Ups',     voter: true },
  { id: 'deadzone',     name: 'Dead Zone',           url: '/game3',  icon: 'fa-biohazard',    color: '#ef4444', desc: 'Überlebe die Zombie-Wellen',                 voter: true },
  { id: 'snake',        name: 'Snake',               url: '/game4',  icon: 'fa-worm',         color: '#4ade80', desc: 'Der Klassiker – wie lang wird deine Schlange?', voter: true },
  { id: 'tetris',       name: 'Tetris',              url: '/game5',  icon: 'fa-cubes',        color: '#a855f7', desc: 'Stapeln, drehen, Reihen räumen',             voter: true },
  { id: 'skycop',       name: 'Sky Cop',             url: '/game7',  icon: 'fa-helicopter',   color: '#60a5fa', desc: 'Helikopter-Einsatz über Los Santos',         voter: true },
  { id: 'doodlejump',   name: 'Doodle Jump',         url: '/game8',  icon: 'fa-frog',         color: '#22c55e', desc: 'Springe so hoch wie möglich',                voter: true },
  { id: 'towerdefense', name: 'Tower Defense',       url: '/game9',  icon: 'fa-shield-alt',   color: '#f97316', desc: 'Verteidige den Abschlepphof',                voter: true },
  { id: '2048',         name: '2048',                url: '/game10', icon: 'fa-th',           color: '#f59e0b', desc: 'Zahlen schieben bis 2048',                   voter: true },
  { id: 'quiz',         name: 'Quiz Survival',       url: '/game11', icon: 'fa-brain',        color: '#c084fc', desc: 'Wie viele Fragen überlebst du?',             voter: true },
  { id: 'idle',         name: 'Werkstatt-Tycoon',    url: '/game12', icon: 'fa-wrench',       color: '#fb923c', desc: 'Mechaniker einstellen, forschen, aufsteigen', voter: true },
  { id: 'rpg',          name: 'Dungeon RPG',         url: '/game13', icon: 'fa-dungeon',      color: '#818cf8', desc: 'Loot, Level & Bosskämpfe',                   voter: true },
  { id: 'tow',          name: 'Abschlepp-Simulator', url: '/game14', icon: 'fa-truck-pickup', color: '#fbbf24', desc: 'Fahrzeuge bergen wie ein Profi',             voter: true },
  { id: 'memory',       name: 'Memory',              url: '/game16', icon: 'fa-clone',        color: '#22d3ee', desc: 'Kartenpaare finden auf Zeit',                voter: false },
  { id: 'reaction',     name: 'Reaktionstest',       url: '/game24', icon: 'fa-bolt',         color: '#facc15', desc: 'Wie schnell sind deine Reflexe?',            voter: false },
  // ── Themen-Spiele: Werkstatt & Fahrschule ──
  { id: 'tirechange',   name: 'Reifenwechsel',       url: '/game26', icon: 'fa-circle-notch', color: '#f97316', desc: 'Muttern im Sternmuster – gegen die Uhr',     voter: true },
  { id: 'obd',          name: 'Fehlerdiagnose',      url: '/game27', icon: 'fa-microchip',    color: '#38bdf8', desc: 'Symptome lesen, Fehler finden',              voter: true },
  { id: 'signs',        name: 'Verkehrszeichen',     url: '/game28', icon: 'fa-traffic-light',color: '#22c55e', desc: 'Schilder erkennen – prüfungsrelevant!',      voter: true },
  { id: 'parking',      name: 'Einpark-Challenge',   url: '/game29', icon: 'fa-parking',      color: '#a855f7', desc: 'Rangiere in die Lücke ohne Blechschaden',    voter: true },
  { id: 'assembly',     name: 'Fließband-Montage',   url: '/game30', icon: 'fa-industry',     color: '#fbbf24', desc: 'Teile montieren, bevor das Band sie holt',   voter: true },
];
const FREIZEIT_CATALOG = [
  { id: 'spielbank', name: 'Spielbank',    url: '/spielbank',      icon: 'fa-dice',     color: '#fbbf24', desc: 'Slots, Blackjack, Roulette, Mines & mehr', voter: true },
  { id: 'automarkt', name: 'AutoMarkt Pro', url: '/automarkt.html', icon: 'fa-car-side', color: '#f97316', desc: 'Handeln, verhandeln, Sammlung aufbauen',   voter: false },
  { id: 'empire',    name: 'Auto Empire',   url: '/empire.html',    icon: 'fa-industry', color: '#94a3b8', desc: 'Baue dein Werkstatt-Imperium auf',         voter: false },
];

function arcadeTile(g, isTournament) {
  return `<a class="arcade-tile" href="${g.url}" target="_blank" rel="noopener">
    ${isTournament ? '<span class="arcade-badge"><i class="fas fa-crown"></i> Spiel der Woche</span>' : ''}
    <div class="arcade-ico" style="background:${g.color}22;color:${g.color}"><i class="fas ${g.icon}"></i></div>
    <div class="arcade-name">${esc(g.name)}</div>
    <div class="arcade-desc">${esc(g.desc)}</div>
  </a>`;
}

// Gemeinsamer Renderer für Mitarbeiter-Seite und Bürger-Tab
function renderArcadeInto(el, { voter = false, tournament = null } = {}) {
  if (!el) return;
  const games    = GAME_CATALOG.filter(g => !voter || g.voter);
  const freizeit = FREIZEIT_CATALOG.filter(g => !voter || g.voter);
  const t = tournament && !tournament.error ? tournament : null;

  const heroHTML = t ? `
    <div class="card" style="border-color:rgba(250,204,21,.35);margin-bottom:1.2rem">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="width:46px;height:46px;border-radius:12px;background:rgba(250,204,21,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fas fa-crown" style="color:#facc15;font-size:1.1rem"></i>
        </div>
        <div style="flex:1;min-width:180px">
          <div style="font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#facc15">Spiel der Woche · Wochenturnier</div>
          <div style="font-weight:800;font-size:1.15rem;margin-top:.1rem">${esc(t.gameName)}</div>
          <div style="font-size:.76rem;color:var(--muted);margin-top:.15rem">Top 3 gewinnen ${ (t.prizes||[]).join(' / ') } Coins · Auswertung Sonntag${t.myScore != null ? ` · Dein Bestwert: <strong style="color:var(--text)">${t.myScore.toLocaleString('de-DE')}</strong>` : ''}</div>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          ${(t.leaderboard || []).slice(0, 3).map((r, i) => `
            <div style="display:flex;align-items:center;gap:.45rem;background:var(--input);border:1px solid var(--border);border-radius:99px;padding:.25rem .7rem .25rem .35rem">
              <div class="rank-badge${i === 0 ? '' : i === 1 ? ' r2' : ' r3'}" style="width:20px;height:20px;font-size:.62rem">${i + 1}</div>
              <span style="font-size:.75rem;font-weight:600">${esc(r.username)}</span>
              <span style="font-size:.72rem;color:var(--muted)">${(+r.score).toLocaleString('de-DE')}</span>
            </div>`).join('') || '<span style="font-size:.78rem;color:var(--muted)">Noch keine Scores – sei der Erste!</span>'}
        </div>
        <a class="btn btn-primary" href="${t.gameUrl}" target="_blank" rel="noopener" style="flex-shrink:0"><i class="fas fa-play"></i> Jetzt mitspielen</a>
      </div>
    </div>` : '';

  el.innerHTML = `
    ${heroHTML}
    <div class="arcade-section-label" style="margin-top:0"><i class="fas fa-gamepad" style="margin-right:.4rem"></i>Minispiele</div>
    <div class="arcade-grid">${games.map(g => arcadeTile(g, t && t.game === g.id)).join('')}</div>
    ${freizeit.length ? `
      <div class="arcade-section-label"><i class="fas fa-dice" style="margin-right:.4rem"></i>Spielbank &amp; Wirtschaft</div>
      <div class="arcade-grid">${freizeit.map(g => arcadeTile(g, false)).join('')}</div>` : ''}`;
}

async function arcade() {
  $('pageContent').innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  const t = await api('/api/tournament');
  $('pageContent').innerHTML = '<div id="arcadeWrap"></div>';
  renderArcadeInto($('arcadeWrap'), { voter: false, tournament: t });
}

// ══ WERKSTATT-HUB ═══════════════════════════════════════════════
const WERKSTATT_SERVICES = [
  { icon: 'fa-wrench',       color: '#f97316', name: 'Reparatur & Wartung',   desc: 'Motor, Bremsen, Karosserie – wir bringen jedes Fahrzeug wieder auf die Straße.' },
  { icon: 'fa-gauge-high',   color: '#ef4444', name: 'Tuning & Performance',  desc: 'Leistungssteigerung, Fahrwerk & Individualisierung nach Wunsch.' },
  { icon: 'fa-spray-can',    color: '#a855f7', name: 'Lackierung & Optik',    desc: 'Lack, Folierung und Felgen – dein Auto, dein Stil.' },
  { icon: 'fa-truck-pickup', color: '#fbbf24', name: 'Abschleppdienst',       desc: 'Bergung & Transport in ganz Los Santos – schnell vor Ort.' },
  { icon: 'fa-graduation-cap', color: '#22c55e', name: 'Führerscheine',       desc: 'Theorie & Praxis für alle Klassen – inklusive Prüfungsvorbereitung.' },
  { icon: 'fa-clipboard-check', color: '#38bdf8', name: 'Inspektion & Check', desc: 'Durchsicht vor dem Kauf oder nach dem Crash – ehrliche Einschätzung.' },
];

async function werkstatt() {
  const [pub, sessions, tickets, spots] = await Promise.all([
    fetch('/api/public/status').then(r => r.json()).catch(() => null),
    api('/api/active-sessions'),
    api('/api/tickets'),
    api('/api/map-spots'),
  ]);

  const onDuty  = Array.isArray(sessions) ? sessions : [];
  const orders  = (Array.isArray(tickets) ? tickets : []).filter(t =>
    ['Werkstatt-Auftrag', 'Abschleppdienst'].includes(t.category) && t.status === 'open');
  const hqSpots = (Array.isArray(spots) ? spots : []).filter(s => s.spot_type === 'hq');

  const dutyChip = onDuty.length
    ? `<span class="duty-chip duty-open"><span class="duty-dot"></span>Jetzt geöffnet · ${onDuty.length} im Dienst</span>`
    : `<span class="duty-chip duty-closed"><span class="duty-dot"></span>Gerade niemand im Dienst</span>`;

  $('pageContent').innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="width:46px;height:46px;border-radius:12px;background:rgba(249,115,22,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fas fa-wrench" style="color:#f97316;font-size:1.1rem"></i>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:800;font-size:1.15rem">ACLS Werkstatt – unser Kerngeschäft</div>
          <div style="font-size:.8rem;color:var(--muted);margin-top:.15rem">Reparatur, Tuning &amp; Abschleppdienst in Los Santos. Führerscheine gibt&rsquo;s gleich dazu.</div>
        </div>
        ${dutyChip}
      </div>
      ${onDuty.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.85rem;padding-top:.85rem;border-top:1px solid var(--border)">
          ${onDuty.map(s => `<span style="display:inline-flex;align-items:center;gap:.4rem;background:var(--input);border:1px solid var(--border);border-radius:99px;padding:.22rem .65rem;font-size:.74rem">
            <i class="fas fa-headset" style="color:#22c55e;font-size:.68rem"></i>${esc(s.username)}
            <span style="color:var(--muted)">· ${esc(s.channelName || 'Dienst')} · ${s.minutesSince} Min</span>
          </span>`).join('')}
        </div>` : ''}
    </div>

    <div class="arcade-section-label" style="margin-top:0">Unsere Leistungen</div>
    <div class="svc-grid" style="margin-bottom:1.2rem">
      ${WERKSTATT_SERVICES.map(s => `
        <div class="svc-card">
          <div class="landing-svc-ico" style="background:${s.color}1f;color:${s.color}"><i class="fas ${s.icon}"></i></div>
          <div><div class="landing-svc-name">${s.name}</div><div class="landing-svc-desc">${s.desc}</div></div>
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-bottom:1.4rem">
      <button class="btn btn-primary" onclick="navigate('prices')"><i class="fas fa-tags"></i> Preisliste ansehen</button>
      <button class="btn btn-ghost" onclick="navigate('tickets')"><i class="fas fa-ticket-alt"></i> Aufträge &amp; Tickets</button>
      <button class="btn btn-ghost" onclick="navigate('map')"><i class="fas fa-map-marked-alt"></i> Abschlepphöfe</button>
    </div>

    <div class="dash-bottom">
      <div class="card">
        <div class="card-head"><div class="card-head-icon orange"><i class="fas fa-clipboard-list"></i></div>
          <div><div class="card-title">Offene Werkstatt-Aufträge</div><div class="card-sub">${orders.length} offen (Kategorien Werkstatt-Auftrag &amp; Abschleppdienst)</div></div>
          <button class="btn btn-ghost btn-sm" onclick="navigate('tickets')" style="margin-left:auto">Alle anzeigen</button>
        </div>
        ${orders.length ? orders.slice(0, 6).map(t => `
          <div class="re-item">
            <div class="re-ico" style="background:rgba(249,115,22,.12);color:#f97316"><i class="fas ${t.category === 'Abschleppdienst' ? 'fa-truck-pickup' : 'fa-wrench'}"></i></div>
            <div class="re-info">
              <div class="re-name">${esc(t.title)}</div>
              <div class="re-meta">${esc(t.creator_name)}<span class="sep"></span>${esc(t.category)}</div>
            </div>
            <div class="re-time">${ago(t.created_at)}</div>
          </div>`).join('') : '<div class="empty"><i class="fas fa-check-circle"></i><p>Keine offenen Aufträge – alles abgearbeitet!</p></div>'}
      </div>

      <div class="card">
        <div class="card-head"><div class="card-head-icon" style="background:rgba(201,162,39,.15)"><i class="fas fa-map-marker-alt" style="color:#c9a227"></i></div>
          <div><div class="card-title">Standort &amp; Kontakt</div><div class="card-sub">So erreichst du uns IC</div></div>
        </div>
        <div id="werkstattMap" style="height:260px;border-radius:var(--r);overflow:hidden;margin-bottom:.9rem;${hqSpots.length ? '' : 'display:none'}"></div>
        ${hqSpots.length ? '' : `<div style="font-size:.78rem;color:var(--muted);margin-bottom:.9rem;padding:.7rem;background:var(--input);border-radius:var(--r)"><i class="fas fa-info-circle" style="margin-right:.35rem"></i>Noch kein HQ-Pin gesetzt${isAdmin() ? ' – lege ihn unter „Abschlepphöfe“ mit Typ <strong>hq</strong> an.' : '.'}</div>`}
        <div class="landing-contact">
          <div class="landing-contact-item"><i class="fas fa-map-marker-alt" style="color:#f97316"></i><span>${esc(pub?.hqText || 'ACLS Hauptquartier, Los Santos')}</span></div>
          <div class="landing-contact-item"><i class="fas fa-phone" style="color:#22c55e"></i><span>${esc(pub?.icPhone || 'Im LS-Telefonbuch unter „ACLS“')}</span></div>
          <div class="landing-contact-item"><i class="fas fa-clock" style="color:#38bdf8"></i><span>${esc(pub?.dienstzeiten || 'Dienstzeiten: siehe Live-Status')}</span></div>
          ${pub?.discordInvite ? `<div class="landing-contact-item"><i class="fab fa-discord" style="color:#5865f2"></i><a href="${esc(pub.discordInvite)}" target="_blank" rel="noopener" style="color:var(--orange)">Discord-Server beitreten</a></div>` : ''}
        </div>
      </div>
    </div>`;

  if (hqSpots.length) initWerkstattMap(hqSpots);
}

// Kleine, schreibgeschützte Karte nur mit HQ-Pins
async function initWerkstattMap(hqSpots) {
  let el = document.getElementById('werkstattMap');
  if (!el) return;
  try { await loadLib('leaflet'); } catch { return; }
  // Nutzer könnte während des Ladens weiternavigiert haben
  el = document.getElementById('werkstattMap');
  if (!el || typeof L === 'undefined') return;
  const m = L.map(el, { crs: L.CRS.Simple, minZoom: -2, maxZoom: 2, attributionControl: false, zoomSnap: 0.1 });
  const bounds = [[0, 0], [GTA_SIZE, GTA_SIZE]];
  L.imageOverlay('/gta-map.webp', bounds, { opacity: 1 }).addTo(m);
  const pin = L.divIcon({ className: '', html: '<div style="width:16px;height:16px;background:#c9a227;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px #c9a227cc"></div>', iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10] });
  const markers = hqSpots.map(s => {
    const [lat, lng] = pctToLatLng(s.x_pos, s.y_pos);
    return L.marker([lat, lng], { icon: pin }).addTo(m)
      .bindPopup(`<div style="font-family:Inter,sans-serif"><strong>${esc(s.name)}</strong>${s.description ? `<div style="font-size:.8rem;color:#888">${esc(s.description)}</div>` : ''}</div>`, { closeButton: false });
  });
  if (markers.length === 1) { m.setView(markers[0].getLatLng(), 0.4); }
  else m.fitBounds(bounds, { padding: [4, 4] });
}

// Dashboard-Widget: Werkstatt-Status
async function loadWerkstattWidget(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const [sessions, tickets] = await Promise.all([api('/api/active-sessions'), api('/api/tickets')]);
  const onDuty = Array.isArray(sessions) ? sessions : [];
  const orders = (Array.isArray(tickets) ? tickets : []).filter(t =>
    ['Werkstatt-Auftrag', 'Abschleppdienst'].includes(t.category) && t.status === 'open');
  el.innerHTML = `
    <div class="card" style="margin:0">
      <div class="card-head">
        <div class="card-head-icon orange"><i class="fas fa-wrench"></i></div>
        <div><div class="card-title">Werkstatt</div><div class="card-sub">Live-Status &amp; Aufträge</div></div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('werkstatt')" style="margin-left:auto">Zum Hub</button>
      </div>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center">
        ${onDuty.length
          ? `<span class="duty-chip duty-open"><span class="duty-dot"></span>${onDuty.length} im Dienst</span>`
          : '<span class="duty-chip duty-closed"><span class="duty-dot"></span>Niemand im Dienst</span>'}
        <div style="display:flex;align-items:center;gap:.5rem;font-size:.84rem">
          <i class="fas fa-clipboard-list" style="color:#f97316"></i>
          <strong>${orders.length}</strong> offene Werkstatt-Aufträge
        </div>
        ${orders.length ? `<button class="btn btn-primary btn-sm" onclick="navigate('tickets')" style="margin-left:auto"><i class="fas fa-arrow-right"></i> Abarbeiten</button>` : ''}
      </div>
      ${onDuty.length ? `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.75rem">
        ${onDuty.slice(0, 6).map(s => `<span style="font-size:.72rem;background:var(--input);border:1px solid var(--border);border-radius:99px;padding:.18rem .6rem">${esc(s.username)}</span>`).join('')}
        ${onDuty.length > 6 ? `<span style="font-size:.72rem;color:var(--muted)">+${onDuty.length - 6} weitere</span>` : ''}
      </div>` : ''}
    </div>`;
}

const WIDGET_DEFS = [
  { id: 'eow',             label: 'Mitarbeiter der Woche',  icon: 'fa-trophy'          },
  { id: 'werkstatt',       label: 'Werkstatt-Status',       icon: 'fa-wrench'          },
  { id: 'stats',           label: 'Prüfungs-Statistiken',   icon: 'fa-chart-bar'       },
  { id: 'exams',           label: 'Zuletzt Prüfungen',      icon: 'fa-clipboard-check' },
  { id: 'rankings',        label: 'Top 5 & Rangliste',      icon: 'fa-medal'           },
  { id: 'badges',          label: 'Meine Abzeichen',        icon: 'fa-award'           },
  { id: 'iczeit',          label: 'IC-Zeit diese Woche',    icon: 'fa-clock'           },
  { id: 'gameLeaderboard', label: 'Spiele-Rangliste',       icon: 'fa-gamepad'         },
  { id: 'challenges',      label: 'Challenges',             icon: 'fa-tasks'           },
  { id: 'achievementFeed', label: 'Letzte Abzeichen',       icon: 'fa-award'           },
  { id: 'birthday',        label: 'Geburtstage',            icon: 'fa-birthday-cake'   },
  { id: 'poll',            label: 'Umfrage',                icon: 'fa-poll'            },
  { id: 'twitch',          label: 'Twitch Stream',          icon: 'fa-twitch'          },
  { id: 'onboarding',      label: 'Onboarding',             icon: 'fa-tasks'           },
  { id: 'streak',          label: 'Login-Serie',            icon: 'fa-fire'            },
  { id: 'friendFeed',      label: 'Freundes-Feed',          icon: 'fa-user-friends'    },
  { id: 'dms',             label: 'Direktnachrichten',      icon: 'fa-envelope'        },
  { id: 'market',          label: 'Meine Listings',         icon: 'fa-store'           },
  { id: 'quickActions',    label: 'Schnellaktionen',        icon: 'fa-bolt'            },
  { id: 'note',            label: 'Persönliche Notiz',      icon: 'fa-sticky-note'     },
  { id: 'coinHistory',     label: 'Coin-Verlauf',           icon: 'fa-coins'           },
];

let _dashLayout = []; // { id, visible }

function _dashWidget(id, html) {
  return `<div class="dash-widget" data-wid="${id}" draggable="true">
    <div class="dash-drag-handle" title="Verschieben"><i class="fas fa-grip-vertical"></i></div>
    ${html}
  </div>`;
}

function _initDashDrag() {
  let src = null;
  document.querySelectorAll('.dash-widget').forEach(el => {
    el.addEventListener('dragstart', e => {
      src = el; e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => el.classList.add('dragging'), 0);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.querySelectorAll('.dash-widget').forEach(w => w.classList.remove('drag-over'));
      _saveDashLayout();
    });
    el.addEventListener('dragover', e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      if (src && el !== src) {
        document.querySelectorAll('.dash-widget').forEach(w => w.classList.remove('drag-over'));
        el.classList.add('drag-over');
      }
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('drag-over');
      if (!src || src === el) return;
      const parent = el.parentNode;
      const all = [...parent.querySelectorAll('.dash-widget')];
      parent.insertBefore(src, all.indexOf(src) < all.indexOf(el) ? el.nextSibling : el);
    });
  });
}

function _saveDashLayout() {
  const visible = [...document.querySelectorAll('.dash-widget')].map(el => el.dataset.wid);
  const hiddenIds = _dashLayout.filter(w => !w.visible).map(w => w.id);
  const newLayout = [
    ...visible.map(id => ({ id, visible: true })),
    ...hiddenIds.map(id => ({ id, visible: false })),
  ];
  _dashLayout = newLayout;
  api('/api/dashboard/prefs', { method: 'POST', body: { layout: newLayout } });
}

function openDashSettings() {
  let panel = document.getElementById('dashSettingsPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'dashSettingsPanel';
    panel.style.cssText = 'position:fixed;top:0;right:0;height:100%;width:270px;background:var(--card-bg);border-left:1px solid var(--border);z-index:300;overflow-y:auto;padding:1.1rem;transform:translateX(100%);transition:transform .22s ease;box-shadow:-4px 0 20px rgba(0,0,0,.3)';
    document.body.appendChild(panel);
  }
  const hidden = new Set(_dashLayout.filter(w => !w.visible).map(w => w.id));
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem">
      <span style="font-weight:700;font-size:.92rem"><i class="fas fa-sliders-h" style="color:var(--orange);margin-right:.4rem"></i>Dashboard anpassen</span>
      <button class="btn btn-ghost btn-sm" onclick="closeDashSettings()"><i class="fas fa-times"></i></button>
    </div>
    <div style="font-size:.74rem;color:var(--muted);margin-bottom:.9rem">Reihenfolge per Drag &amp; Drop auf dem Dashboard ändern.</div>
    ${WIDGET_DEFS.map(w => `
      <label style="display:flex;align-items:center;gap:.7rem;padding:.5rem 0;border-bottom:1px solid var(--border);cursor:pointer">
        <i class="fas ${w.icon}" style="color:var(--orange);width:14px;text-align:center;font-size:.8rem"></i>
        <span style="flex:1;font-size:.84rem">${w.label}</span>
        <input type="checkbox" ${!hidden.has(w.id)?'checked':''} onchange="toggleDashWidget('${w.id}',this.checked)" style="accent-color:var(--orange)">
      </label>`).join('')}`;
  requestAnimationFrame(() => panel.style.transform = 'translateX(0)');
  panel._overlay = document.createElement('div');
  panel._overlay.style.cssText = 'position:fixed;inset:0;z-index:299;background:rgba(0,0,0,.3)';
  panel._overlay.onclick = closeDashSettings;
  document.body.appendChild(panel._overlay);
}

function closeDashSettings() {
  const panel = document.getElementById('dashSettingsPanel');
  if (!panel) return;
  panel.style.transform = 'translateX(100%)';
  panel._overlay?.remove();
  setTimeout(() => panel.remove(), 230);
}

async function toggleDashWidget(id, visible) {
  const el = document.querySelector(`.dash-widget[data-wid="${id}"]`);
  if (visible && !el) {
    // Re-render the whole dashboard to show the widget
    closeDashSettings();
    await dashboard();
    openDashSettings();
    return;
  }
  if (!visible && el) el.style.display = 'none';
  // Update local layout
  const idx = _dashLayout.findIndex(w => w.id === id);
  if (idx >= 0) _dashLayout[idx].visible = visible;
  else _dashLayout.push({ id, visible });
  _saveDashLayout();
}

async function dashboard() {
  const [d, announcements, myBadgesRes, myOnb, prefs, streakData, coinHist, noteData] = await Promise.all([
    api('/api/dashboard'), api('/api/announcements'), api('/api/my-badges'), api('/api/onboarding/mine'),
    api('/api/dashboard/prefs'), api('/api/dashboard/streak'), api('/api/dashboard/coin-history'), api('/api/dashboard/note'),
  ]);
  if (!d) return;

  // Layout
  const savedLayout = prefs?.layout || [];
  const hiddenSet   = new Set(savedLayout.filter(w => w.visible === false).map(w => w.id));
  const savedOrder  = savedLayout.filter(w => w.visible !== false).map(w => w.id);
  const allIds      = WIDGET_DEFS.map(w => w.id);
  const newIds      = allIds.filter(id => !savedLayout.find(w => w.id === id));
  const order       = [...savedOrder, ...newIds].filter(id => !hiddenSet.has(id));
  _dashLayout = [...order.map(id => ({ id, visible: true })), ...[...hiddenSet].map(id => ({ id, visible: false }))];

  // Data prep
  const myBadgesList = myBadgesRes?.badges || [];
  const badgeStats   = myBadgesRes?.stats  || { conducted: 0, eowWins: 0, icTotal: 0, distinctGames: 0, duelWins: 0, coinsEarned: 0, towBest: 0, bjBest: 0 };
  const earnedSet    = new Set(myBadgesList.map(b => b.badge_type));
  const badgeMap     = Object.fromEntries(myBadgesList.map(b => [b.badge_type, b.earned_at]));
  const eow      = d.eowWinner;
  const isCurWk  = d.isCurrentWeekWinner;
  const curWk    = d.currentWeek ? `KW ${isoWeek(d.currentWeek)}` : '';
  const top      = d.eowStandings?.[0];
  const rankBadge = i => `<div class="rank-badge${i===1?'':i===2?' r2':' r3'}"${i>3?' style="background:#2a2a2a;color:var(--muted)"':''}>${i}</div>`;

  // ── Widget HTML map ──────────────────────────────────────────
  const W = {};

  const winnerCard = eow
    ? `<div class="eow-banner" style="flex:1"><div class="eow-av">${avatarUrl(eow)?`<img src="${avatarUrl(eow)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:initials(eow.username)}</div><div class="eow-info"><div class="eow-label"><i class="fas fa-trophy" style="margin-right:.3rem"></i>Mitarbeiter der Woche · KW ${isoWeek(eow.week)}</div><div class="eow-name">${esc(eow.username)}</div><div style="font-size:.73rem;color:var(--muted);margin-top:.1rem">${eow.vote_count} Stimmen${isCurWk?' · Diese Woche':' · Letzte Woche'}</div></div><div class="eow-ml"><button class="btn btn-ghost btn-sm" onclick="navigate('eow')"><i class="fas fa-list"></i> Details</button></div></div>`
    : `<div class="eow-banner" style="flex:1"><div class="eow-av" style="background:var(--surface2);color:var(--muted);font-size:1.4rem"><i class="fas fa-trophy"></i></div><div class="eow-info"><div class="eow-label"><i class="fas fa-trophy" style="margin-right:.3rem"></i>Mitarbeiter der Woche</div><div class="eow-name" style="color:var(--muted)">Noch kein Gewinner</div></div></div>`;
  const voteLabel = isCurWk ? 'Nächste Abstimmung' : 'Abstimmung läuft';
  const voteCard = top
    ? `<div class="eow-banner" style="flex:1;border-color:rgba(249,115,22,.25)"><div class="eow-av" style="border-color:rgba(249,115,22,.4)">${avatarUrl(top)?`<img src="${avatarUrl(top)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:initials(top.username)}</div><div class="eow-info"><div class="eow-label"><i class="fas fa-vote-yea" style="margin-right:.3rem"></i>${voteLabel} · ${curWk}</div><div class="eow-name">${esc(top.username)} führt</div><div style="font-size:.73rem;color:var(--muted);margin-top:.1rem">${top.votes} Stimmen · Auszählung Sonntag 18:00</div></div><div class="eow-ml"><button class="btn btn-primary btn-sm" onclick="navigate('eow')"><i class="fas fa-vote-yea"></i> Abstimmen</button></div></div>`
    : `<div class="eow-banner" style="flex:1"><div class="eow-av" style="background:var(--surface2);color:var(--muted);font-size:1.4rem"><i class="fas fa-vote-yea"></i></div><div class="eow-info"><div class="eow-label"><i class="fas fa-vote-yea" style="margin-right:.3rem"></i>${voteLabel} · ${curWk}</div><div class="eow-name" style="color:var(--muted)">Noch keine Stimmen</div><div style="font-size:.73rem;color:var(--muted);margin-top:.1rem">Auszählung: Sonntag 18:00 Uhr</div></div><div class="eow-ml"><button class="btn btn-primary btn-sm" onclick="navigate('eow')"><i class="fas fa-vote-yea"></i> Jetzt abstimmen</button></div></div>`;
  W.eow = `<div style="display:flex;gap:1rem;flex-wrap:wrap">${winnerCard}${voteCard}</div>`;

  W.werkstatt = `<div id="dashWerkstattWidget"></div>`;

  W.onboarding = myOnb?.show ? `<div class="card" style="border-color:rgba(74,222,128,.3);margin:0"><div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap"><div style="width:36px;height:36px;border-radius:50%;background:rgba(74,222,128,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-tasks" style="color:#4ade80;font-size:.85rem"></i></div><div style="flex:1;min-width:200px"><div style="font-weight:700;font-size:.92rem">Dein Onboarding · ${myOnb.done}/${myOnb.total} erledigt</div><div style="height:6px;background:var(--input);border-radius:3px;overflow:hidden;margin-top:.35rem;max-width:340px"><div style="height:100%;width:${Math.round(myOnb.done/myOnb.total*100)}%;background:#4ade80"></div></div></div><div style="font-size:.74rem;color:var(--muted);max-width:320px">Noch offen: ${myOnb.items.filter(i=>!i.done).slice(0,3).map(i=>i.label).join(' · ')}${myOnb.items.filter(i=>!i.done).length>3?' …':''}</div></div></div>` : null;

  W.poll   = `<div id="staffPollWidget"></div>`;
  W.twitch = `<div id="twitch-widget"><div class="twitch-card"><div class="twitch-offline-dot"></div><div class="twitch-info"><div style="font-size:.8rem;color:#9ca3af">Wird geladen…</div></div></div></div>`;

  W.stats = `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-info"><div class="stat-lbl">Gesamt Prüfungen</div><div class="stat-val" data-countup="${d.total}">0</div></div><div class="stat-ico o"><i class="fas fa-clipboard-list"></i></div></div>
      <div class="stat-card"><div class="stat-info"><div class="stat-lbl">Bestanden</div><div class="stat-val g" data-countup="${d.passed}">0</div></div><div class="stat-ico g"><i class="fas fa-check-circle"></i></div></div>
      <div class="stat-card"><div class="stat-info"><div class="stat-lbl">Durchgefallen</div><div class="stat-val r" data-countup="${d.failed}">0</div></div><div class="stat-ico r"><i class="fas fa-times-circle"></i></div></div>
      <div class="stat-card"><div class="stat-info"><div class="stat-lbl">Erfolgsquote</div><div class="stat-val o" data-countup="${d.rate}" data-suffix="%">0%</div></div><div class="stat-ico b"><i class="fas fa-chart-line"></i></div></div>
    </div>
    <div class="time-row">
      <div class="time-card"><div class="time-lbl">Heute</div><div class="time-val" data-countup="${d.todayCount}">0</div></div>
      <div class="time-card"><div class="time-lbl">Diese Woche</div><div class="time-val" data-countup="${d.weekCount}">0</div></div>
      <div class="time-card"><div class="time-lbl">Dieser Monat</div><div class="time-val" data-countup="${d.monthCount}">0</div></div>
    </div>`;

  W.exams = d.lastExams.length ? `
    <div class="card last-exam-card" style="margin:0">
      <div class="card-head"><div class="card-head-icon orange"><i class="fas fa-clipboard-check"></i></div><div><div class="card-title">Zuletzt abgenommene Prüfungen</div><div class="card-sub">Die letzten 3 Prüfungen</div></div></div>
      ${d.lastExams.slice(0,3).map(ex=>`<div style="display:flex;align-items:center;gap:1rem;padding:.75rem 0;border-bottom:1px solid var(--border)"><span class="badge ${ex.passed?'badge-g':'badge-r'}" style="min-width:100px;text-align:center">${ex.passed?'✓ Bestanden':'✗ Nicht bestanden'}</span><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ex.citizen_name)}${ex.citizen_id?` <span style="font-size:.75rem;color:var(--muted);font-weight:400">${esc(ex.citizen_id)}</span>`:''}</div><div style="font-size:.78rem;color:var(--muted);margin-top:.1rem"><i class="fas ${ex.icon}" style="margin-right:.3rem"></i>${esc(ex.category_name)} – ${esc(ex.exam_type)} · Prüfer: ${esc(ex.examiner_name)}</div></div><div style="font-size:.78rem;color:var(--muted);white-space:nowrap">${ago(ex.registered_at)}</div></div>`).join('')}
    </div>` : null;

  W.rankings = `
    <div class="dash-bottom">
      <div class="card"><div class="card-head"><div class="card-head-icon green"><i class="fas fa-trophy"></i></div><div><div class="card-title">Top 5 Mitarbeiter</div><div class="card-sub">Meiste Prüfungen</div></div></div>
        ${d.top5.length?d.top5.map((e,i)=>`<div class="lb-item">${rankBadge(i+1)}<div style="display:flex;align-items:center;gap:.6rem;flex:1"><div style="width:30px;height:30px;flex-shrink:0">${avatarEl(e,30)}</div><div><div class="lb-name">${esc(e.username)}</div><div class="lb-sub">${e.count} Prüfungen</div></div></div><div class="lb-score"><i class="fas fa-fire"></i>${e.count}</div></div>`).join(''):'<div class="empty"><i class="fas fa-trophy"></i><p>Keine Einträge</p></div>'}
      </div>
      <div class="card"><div class="card-head"><div class="card-head-icon blue"><i class="fas fa-history"></i></div><div><div class="card-title">Letzte Prüfungen</div><div class="card-sub">Aktuelle Aktivität</div></div></div>
        ${d.lastExams.map(r=>`<div class="re-item"><div class="re-ico ${r.passed?'pass':'fail'}"><i class="fas ${r.passed?'fa-check':'fa-times'}"></i></div><div class="re-info"><div class="re-name">${esc(r.citizen_name)}</div><div class="re-meta"><i class="fas ${r.icon}" style="font-size:.65rem"></i> ${esc(r.exam_type)}<span class="sep"></span>${esc(r.category_name)}<span class="sep"></span>${esc(r.examiner_name)}</div></div><div class="re-time">${ago(r.registered_at)}</div></div>`).join('')||'<div class="empty"><i class="fas fa-history"></i><p>Keine Einträge</p></div>'}
      </div>
    </div>`;

  W.badges = `
    <div class="card" id="badgesCard" style="margin:0">
      <div class="card-head"><div class="card-head-icon" style="background:rgba(250,204,21,.15)"><i class="fas fa-medal" style="color:#facc15"></i></div><div><div class="card-title">Meine Abzeichen</div><div class="card-sub">${earnedSet.size} von ${Object.keys(BADGE_DEFS).length} freigeschaltet</div></div></div>
      ${[
        { label: 'Prüfungen', icon: 'fa-clipboard-check', color: '#f97316', keys: ['cat_pkw','cat_motorrad','cat_boot','cat_lkw','cat_flugschein','exams_10','exams_50','exams_100'] },
        { label: 'IC-Zeit',   icon: 'fa-clock',           color: '#22c55e', keys: ['ic_10','ic_50','ic_100','ic_250','ic_500'] },
        { label: 'Mitarbeiter der Woche', icon: 'fa-trophy', color: '#facc15', keys: ['eow_1','eow_3','eow_5'] },
        { label: 'Gaming',    icon: 'fa-gamepad',         color: '#f472b6', keys: ['game_3','game_10','duel_5','duel_25','tow_pro','bj_500','coins_1k','coins_10k','streak_7','streak_30'] },
        { label: 'Geheime Abzeichen', icon: 'fa-lock', color: '#c084fc', keys: ['secret_wheel_first','secret_dm_first','secret_friend_first','secret_coins_50k','secret_games_15'] },
      ].map(group=>{
        const nextGoalIdx=group.keys.findIndex(k=>!earnedSet.has(k));
        return `<div style="margin-bottom:1rem"><div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.65rem;padding-bottom:.4rem;border-bottom:1px solid var(--border)"><i class="fas ${group.icon}" style="color:${group.color};font-size:.8rem"></i><span style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)">${group.label}</span>${nextGoalIdx===-1?'<span style="margin-left:auto;font-size:.65rem;font-weight:700;color:#22c55e"><i class="fas fa-check-circle"></i> Alle freigeschaltet</span>':''}</div><div style="display:flex;flex-wrap:wrap;gap:.75rem">${group.keys.map((key,i)=>{const b=BADGE_DEFS[key];const earned=earnedSet.has(key);const isNext=i===nextGoalIdx;const date=badgeMap[key]?new Date(badgeMap[key]).toLocaleDateString('de-DE'):null;return renderBadge(key,b,earned,isNext,date,badgeStats);}).join('')}</div></div>`;
      }).join('')}
    </div>`;

  W.iczeit = d.icWeekTop?.some(u=>u.hours>0) ? `
    <div class="card" style="margin:0">
      <div class="card-head"><div class="card-head-icon orange"><i class="fas fa-clock"></i></div><div><div class="card-title">IC-Zeit diese Woche</div><div class="card-sub">Top Mitarbeiter</div></div><button class="btn btn-ghost btn-sm" onclick="navigate('iczeit')" style="margin-left:auto">Alle anzeigen</button></div>
      ${d.icWeekTop.filter(u=>u.hours>0).map((u,i)=>`<div class="lb-item"><div class="rank-badge${i===0?'':i===1?' r2':' r3'}">${i+1}</div><div style="display:flex;align-items:center;gap:.6rem;flex:1"><div style="width:30px;height:30px;flex-shrink:0">${avatarEl(u,30)}</div><div class="lb-name">${esc(u.username)}</div></div><div class="lb-score"><i class="fas fa-clock"></i>${(+u.hours).toFixed(1)}h</div></div>`).join('')}
    </div>` : null;

  W.challenges      = `<div id="staffChallengesWidget"></div>`;
  W.gameLeaderboard = `<div id="gameLeaderboardWidget"></div>`;
  W.achievementFeed = `<div id="achievementFeedWidget"></div>`;
  W.birthday        = `<div id="birthdayTodayWidget"></div>`;

  // ── Neue Widgets ─────────────────────────────────────────────
  const streak = streakData?.streak || 0;
  const bestStreak = streakData?.best_streak || 0;
  const streakPct = bestStreak > 0 ? Math.min(streak/bestStreak*100,100) : (streak>0?100:0);
  W.streak = `<div class="card" style="margin:0">
    <div class="card-head"><div class="card-head-icon" style="background:rgba(249,115,22,.15)"><i class="fas fa-fire" style="color:#f97316"></i></div><div><div class="card-title">Login-Serie</div><div class="card-sub">Tägliches Einloggen</div></div></div>
    <div style="display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap">
      <div style="text-align:center"><div style="font-size:2rem;font-weight:800;color:#f97316">${streak}</div><div style="font-size:.72rem;color:var(--muted)">Aktuell</div></div>
      <div style="flex:1;min-width:120px"><div style="display:flex;justify-content:space-between;font-size:.74rem;color:var(--muted);margin-bottom:.3rem"><span>Serie</span><span>Rekord: ${bestStreak}</span></div><div style="height:8px;background:var(--input);border-radius:4px;overflow:hidden"><div style="height:100%;width:${streakPct}%;background:linear-gradient(90deg,#f97316,#fb923c)"></div></div><div style="font-size:.72rem;color:var(--muted);margin-top:.35rem">${streak>=7?'<i class="fas fa-check-circle" style="color:#22c55e"></i> Streak-7 Abzeichen':'Noch '+Math.max(0,7-streak)+' Tage bis Streak-7 Abzeichen'}</div></div>
      <div style="text-align:center"><div style="font-size:2rem;font-weight:800;color:var(--muted)">${bestStreak}</div><div style="font-size:.72rem;color:var(--muted)">Rekord</div></div>
    </div>
  </div>`;

  W.dms        = `<div id="dashDmsWidget"></div>`;
  W.market     = `<div id="dashMarketWidget"></div>`;
  W.friendFeed = `<div id="dashFriendFeedWidget"></div>`;

  W.quickActions = `<div class="card" style="margin:0">
    <div class="card-head"><div class="card-head-icon" style="background:rgba(99,102,241,.15)"><i class="fas fa-bolt" style="color:#818cf8"></i></div><div><div class="card-title">Schnellaktionen</div><div class="card-sub">Häufig genutzte Funktionen</div></div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.5rem">
      <button class="btn btn-ghost" onclick="navigate('registrierung')" style="justify-content:flex-start;gap:.5rem;font-size:.82rem"><i class="fas fa-clipboard-check" style="color:var(--orange)"></i>Prüfung eintragen</button>
      <button class="btn btn-ghost" onclick="navigate('iczeit')" style="justify-content:flex-start;gap:.5rem;font-size:.82rem"><i class="fas fa-clock" style="color:#22c55e"></i>IC-Zeit eintragen</button>
      <button class="btn btn-ghost" onclick="navigate('eow')" style="justify-content:flex-start;gap:.5rem;font-size:.82rem"><i class="fas fa-vote-yea" style="color:#facc15"></i>Abstimmen</button>
      <button class="btn btn-ghost" onclick="navigate('werkstatt')" style="justify-content:flex-start;gap:.5rem;font-size:.82rem"><i class="fas fa-wrench" style="color:#f97316"></i>Werkstatt-Hub</button>
      <button class="btn btn-ghost" onclick="navigate('arcade')" style="justify-content:flex-start;gap:.5rem;font-size:.82rem"><i class="fas fa-gamepad" style="color:#f472b6"></i>Arcade</button>
      <button class="btn btn-ghost" onclick="navigate('nachrichten')" style="justify-content:flex-start;gap:.5rem;font-size:.82rem"><i class="fas fa-envelope" style="color:#60a5fa"></i>Nachrichten</button>
      <button class="btn btn-ghost" onclick="navigate('marktplatz')" style="justify-content:flex-start;gap:.5rem;font-size:.82rem"><i class="fas fa-store" style="color:#4ade80"></i>Marktplatz</button>
    </div>
  </div>`;

  W.note = `<div class="card" style="margin:0">
    <div class="card-head"><div class="card-head-icon" style="background:rgba(251,191,36,.15)"><i class="fas fa-sticky-note" style="color:#fbbf24"></i></div><div><div class="card-title">Persönliche Notiz</div><div class="card-sub">Nur für dich sichtbar — wird automatisch gespeichert</div></div></div>
    <textarea id="dashNoteArea" style="width:100%;min-height:80px;background:var(--input);border:1px solid var(--border);border-radius:var(--r);padding:.6rem .7rem;font-size:.84rem;color:var(--fg);resize:vertical;font-family:inherit;box-sizing:border-box" placeholder="Schreib dir etwas auf…">${esc(noteData?.content||'')}</textarea>
  </div>`;

  const hist = coinHist || [];
  const maxAbs = Math.max(1, ...hist.map(h => Math.abs(h.net)));
  W.coinHistory = `<div class="card" style="margin:0">
    <div class="card-head"><div class="card-head-icon" style="background:rgba(250,204,21,.15)"><i class="fas fa-coins" style="color:#facc15"></i></div><div><div class="card-title">Coin-Verlauf</div><div class="card-sub">Letzte 7 Tage</div></div></div>
    <div style="display:flex;align-items:flex-end;gap:3px;height:60px;margin-bottom:.3rem">
      ${hist.map(h=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%" title="${h.day}: ${h.net>=0?'+':''}${h.net}"><div style="width:100%;background:${h.net>=0?'#22c55e':'#ef4444'};border-radius:2px 2px 0 0;height:${Math.round(Math.abs(h.net)/maxAbs*100)}%;min-height:${h.net!==0?'4px':'1px'};opacity:.85"></div></div>`).join('')}
    </div>
    <div style="display:flex;gap:3px">
      ${hist.map(h=>`<div style="flex:1;font-size:.6rem;color:var(--muted);text-align:center">${new Date(h.day).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}).slice(0,5)}</div>`).join('')}
    </div>
    <div style="display:flex;gap:1.2rem;margin-top:.5rem">
      <span style="font-size:.75rem;color:#22c55e"><i class="fas fa-arrow-up"></i> +${hist.filter(h=>h.net>0).reduce((s,h)=>s+h.net,0)} Einnahmen</span>
      <span style="font-size:.75rem;color:#ef4444"><i class="fas fa-arrow-down"></i> ${hist.filter(h=>h.net<0).reduce((s,h)=>s+h.net,0)} Ausgaben</span>
    </div>
  </div>`;

  // ── Render ───────────────────────────────────────────────────
  const announcementsHTML = announcements?.length ? announcements.slice(0,3).map(a=>`
    <div style="display:flex;align-items:flex-start;gap:1rem;padding:1rem 1.1rem;border-radius:var(--r);margin-bottom:.6rem;background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(249,115,22,.04));border:1px solid rgba(249,115,22,.3);border-left:4px solid var(--orange)">
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(249,115,22,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:.1rem"><i class="fas ${a.is_pinned?'fa-thumbtack':'fa-bullhorn'}" style="color:var(--orange);font-size:.85rem"></i></div>
      <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem"><span style="font-weight:700;font-size:.95rem">${esc(a.title)}</span>${a.is_pinned?'<span style="font-size:.68rem;font-weight:700;padding:.1rem .4rem;border-radius:20px;background:rgba(249,115,22,.2);color:var(--orange);text-transform:uppercase;letter-spacing:.05em">Angeheftet</span>':''}<span style="font-size:.72rem;color:var(--muted);margin-left:auto">${esc(a.author)} · ${new Date(a.created_at).toLocaleDateString('de-DE')}</span></div><div style="font-size:.85rem;color:var(--fg);opacity:.85;white-space:pre-wrap;line-height:1.5">${esc(a.content)}</div></div>
      ${isAdmin()?`<button class="btn btn-ghost btn-sm" onclick="navigate('admin')" style="flex-shrink:0"><i class="fas fa-cog"></i></button>`:''}
    </div>`).join('') : '';

  const widgetsHTML = order.map(id => W[id] == null ? '' : _dashWidget(id, W[id])).join('');

  // Willkommens-Banner: 3 Tage ab erstem Sehen, für jeden der es noch nicht weggeklickt hat
  const welcomeDismissKey = `acls-welcome-dismissed-${currentUser?.id}`;
  const welcomeFirstKey   = `acls-welcome-first-${currentUser?.id}`;
  if (!localStorage.getItem(welcomeFirstKey)) localStorage.setItem(welcomeFirstKey, Date.now());
  const firstSeen = parseInt(localStorage.getItem(welcomeFirstKey));
  const showWelcome = !localStorage.getItem(welcomeDismissKey)
    && (Date.now() - firstSeen) < 3 * 24 * 60 * 60 * 1000;
  const welcomeHTML = showWelcome ? `
    <div id="welcomeBanner" style="background:linear-gradient(135deg,rgba(168,85,247,.18),rgba(99,102,241,.12));border:1px solid rgba(168,85,247,.35);border-radius:var(--r);padding:1.1rem 1.3rem;margin-bottom:1rem;position:relative">
      <button onclick="localStorage.setItem('${welcomeDismissKey}','1');document.getElementById('welcomeBanner').remove()" style="position:absolute;top:.6rem;right:.7rem;background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem" title="Schließen"><i class="fas fa-times"></i></button>
      <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem">
        <div style="font-size:1.6rem">👋</div>
        <div>
          <div style="font-weight:700;font-size:1rem">Willkommen bei ACLS, ${esc(currentUser.username)}!</div>
          <div style="font-size:.8rem;color:var(--muted);margin-top:.15rem">Starte jetzt durch – hier sind deine ersten Schritte:</div>
        </div>
      </div>
      <div style="display:flex;gap:.55rem;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="navigate('exams')" style="background:linear-gradient(135deg,#f97316,#fb923c);border:none"><i class="fas fa-play-circle"></i> Prüfung starten</button>
        <button class="btn btn-primary btn-sm" onclick="navigate('wheel')" style="background:linear-gradient(135deg,#a855f7,#c084fc);border:none"><i class="fas fa-dharmachakra"></i> Daily Wheel drehen</button>
        <button class="btn btn-primary btn-sm" onclick="navigate('freunde')" style="background:linear-gradient(135deg,#22c55e,#4ade80);border:none;color:#000"><i class="fas fa-user-friends"></i> Community entdecken</button>
      </div>
    </div>` : '';

  $('pageContent').innerHTML = `
    ${welcomeHTML}
    ${announcementsHTML}
    <div style="display:flex;justify-content:flex-end;margin-bottom:.6rem">
      <button class="btn btn-ghost btn-sm" onclick="openDashSettings()" style="font-size:.78rem"><i class="fas fa-sliders-h" style="margin-right:.35rem"></i>Personalisieren</button>
    </div>
    <div id="dashWidgets">${widgetsHTML}</div>`;

  animateCountUps();
  requestAnimationFrame(() => requestAnimationFrame(animateBadgeRings));
  loadTwitchWidget();
  clearInterval(dashboard._twitchPoll);
  dashboard._twitchPoll = setInterval(loadTwitchWidget, 2*60*1000);
  if (order.includes('werkstatt'))       loadWerkstattWidget('dashWerkstattWidget');
  if (order.includes('poll'))            loadPollWidget('staffPollWidget');
  if (order.includes('challenges'))      loadChallengesWidget('staffChallengesWidget');
  if (order.includes('gameLeaderboard')) loadGameLeaderboard('gameLeaderboardWidget');
  if (order.includes('achievementFeed')) loadAchievementFeed('achievementFeedWidget');
  if (order.includes('birthday'))        loadBirthdayTodayWidget('birthdayTodayWidget');
  if (order.includes('dms'))             _loadDashDMs();
  if (order.includes('market'))          _loadDashMarket();
  if (order.includes('friendFeed'))      _loadDashFriendFeed();

  const noteEl = document.getElementById('dashNoteArea');
  if (noteEl) {
    let _nt;
    noteEl.addEventListener('input', () => {
      clearTimeout(_nt);
      _nt = setTimeout(() => api('/api/dashboard/note', {method:'POST', body:{content:noteEl.value}}), 800);
    });
  }
  _initDashDrag();
  connectSSE();
}

async function _loadDashDMs() {
  const el = document.getElementById('dashDmsWidget');
  if (!el) return;
  const inbox = await api('/api/dm/inbox');
  if (!inbox?.length) { el.innerHTML = ''; return; }
  const totalUnread = inbox.reduce((s,m) => s + (m.unread||0), 0);
  el.innerHTML = `<div class="card" style="margin:0">
    <div class="card-head"><div class="card-head-icon blue"><i class="fas fa-envelope"></i></div><div><div class="card-title">Direktnachrichten</div><div class="card-sub">${totalUnread?totalUnread+' ungelesen':'Alle gelesen'}</div></div><button class="btn btn-ghost btn-sm" onclick="navigate('nachrichten')" style="margin-left:auto">Alle</button></div>
    ${inbox.slice(0,3).map(m=>`<div style="display:flex;align-items:center;gap:.6rem;padding:.4rem 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="navigate('nachrichten')"><div style="width:30px;height:30px;flex-shrink:0;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700">${esc((m.other_name||'?')[0].toUpperCase())}</div><div style="flex:1;min-width:0"><div style="font-weight:${m.unread>0?'700':'400'};font-size:.85rem">${esc(m.other_name||'Unbekannt')}</div><div style="font-size:.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((m.last_msg||'').slice(0,50))}</div></div>${m.unread>0?`<span class="badge badge-r" style="font-size:.65rem">${m.unread}</span>`:''}</div>`).join('')}
  </div>`;
}

async function _loadDashMarket() {
  const el = document.getElementById('dashMarketWidget');
  if (!el) return;
  const listings = await api('/api/market/my');
  const active = (listings||[]).filter(l => !l.sold_at);
  if (!active.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card" style="margin:0">
    <div class="card-head"><div class="card-head-icon green"><i class="fas fa-store"></i></div><div><div class="card-title">Meine Listings</div><div class="card-sub">${active.length} aktive Angebote</div></div><button class="btn btn-ghost btn-sm" onclick="navigate('marktplatz')" style="margin-left:auto">Alle</button></div>
    ${active.slice(0,3).map(l=>`<div style="display:flex;align-items:center;gap:.6rem;padding:.4rem 0;border-bottom:1px solid var(--border)"><div style="flex:1;font-size:.85rem;font-weight:600">${esc(l.item_name)}</div><div style="font-size:.84rem;color:#facc15;font-weight:700">${l.price.toLocaleString('de-DE')} <i class="fas fa-coins" style="font-size:.7rem"></i></div></div>`).join('')}
  </div>`;
}

async function _loadDashFriendFeed() {
  const el = document.getElementById('dashFriendFeedWidget');
  if (!el) return;
  const feed = await api('/api/friends/feed');
  if (!feed?.length) { el.innerHTML = ''; return; }
  const BADGE_ICONS = { ic_10:'fa-clock', ic_50:'fa-hourglass-half', ic_100:'fa-hourglass-end', exams_10:'fa-clipboard-check', eow_1:'fa-trophy', coins_1k:'fa-coins', streak_7:'fa-fire', duel_5:'fa-bolt', game_3:'fa-gamepad' };
  const GAME_LABELS = { blackjack:'Blackjack', slot:'Mega Spin', plinko:'Plinko', tow:'Abschlepp-Sim', mines:'Minesweeper', rocket:'Rocket', hilo:'Hi-Lo', hangman:'Galgenmännek', roulette:'Roulette' };
  el.innerHTML = `<div class="card" style="margin:0">
    <div class="card-head"><div class="card-head-icon" style="background:rgba(168,85,247,.15)"><i class="fas fa-user-friends" style="color:#a855f7"></i></div><div><div class="card-title">Freundes-Feed</div><div class="card-sub">Was deine Freunde zuletzt gemacht haben</div></div><button class="btn btn-ghost btn-sm" onclick="navigate('freunde')" style="margin-left:auto">Freunde</button></div>
    ${feed.map(f => {
      const av = avatarEl({ username: f.username, avatar: f.avatar, discord_id: f.discord_id }, 28);
      const timeStr = ago(f.ts);
      if (f.type === 'badge') {
        const bd = BADGE_DEFS[f.key];
        return `<div style="display:flex;align-items:center;gap:.6rem;padding:.45rem 0;border-bottom:1px solid var(--border)">${av}<div style="flex:1;min-width:0"><span style="font-weight:600;font-size:.82rem">${esc(f.username)}</span> <span style="font-size:.8rem;color:var(--muted)">hat Abzeichen erhalten:</span> <span style="color:#facc15;font-size:.8rem"><i class="fas ${bd?.icon||'fa-medal'}"></i> ${esc(bd?.label||f.key)}</span></div><span style="font-size:.7rem;color:var(--muted);white-space:nowrap">${timeStr}</span></div>`;
      } else {
        return `<div style="display:flex;align-items:center;gap:.6rem;padding:.45rem 0;border-bottom:1px solid var(--border)">${av}<div style="flex:1;min-width:0"><span style="font-weight:600;font-size:.82rem">${esc(f.username)}</span> <span style="font-size:.8rem;color:var(--muted)">Highscore in</span> <span style="color:#f472b6;font-size:.8rem">${esc(GAME_LABELS[f.key]||f.key)}</span><span style="font-size:.8rem;color:var(--muted)">: ${(+f.score).toLocaleString('de-DE')}</span></div><span style="font-size:.7rem;color:var(--muted);white-space:nowrap">${timeStr}</span></div>`;
      }
    }).join('')}
  </div>`;
}

// BATCH 4: Achievement-Feed laden
async function loadAchievementFeed(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const feed = await fetch('/api/achievement-feed').then(r => r.json()).catch(() => null);
  if (!feed?.length) { el.style.display = 'none'; return; }
  const BADGE_ICONS = { cat_pkw: 'fa-car', cat_motorrad: 'fa-motorcycle', cat_boot: 'fa-ship', cat_lkw: 'fa-truck', cat_flugschein: 'fa-plane', eow_1: 'fa-trophy', eow_3: 'fa-trophy', eow_5: 'fa-trophy', ic_10: 'fa-clock', ic_50: 'fa-clock', ic_100: 'fa-clock', game_3: 'fa-gamepad', game_10: 'fa-gamepad', duel_5: 'fa-swords', duel_25: 'fa-swords', coins_1k: 'fa-coins', coins_10k: 'fa-coins' };
  el.innerHTML = `<div class="card" style="margin-top:0">
    <div class="card-head">
      <div class="card-head-icon" style="background:rgba(250,204,21,.15)"><i class="fas fa-medal" style="color:#facc15"></i></div>
      <div><div class="card-title">Letzte Abzeichen</div><div class="card-sub">Freigeschaltete Abzeichen im Team</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem">
      ${feed.slice(0,10).map(f => {
        const icon = BADGE_ICONS[f.badge_type] || 'fa-medal';
        const av = f.avatar ? `<img src="https://cdn.discordapp.com/avatars/${esc(f.discord_id)}/${esc(f.avatar)}.png" style="width:28px;height:28px;border-radius:50%;object-fit:cover">` : `<div style="width:28px;height:28px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700">${esc((f.username||'?')[0].toUpperCase())}</div>`;
        const badgeName = (typeof BADGE_DEFS !== 'undefined' && BADGE_DEFS[f.badge_type]) ? BADGE_DEFS[f.badge_type].name : esc(f.badge_type);
        return `<div style="display:flex;align-items:center;gap:.6rem;padding:.4rem 0;border-bottom:1px solid var(--border)">
          ${av}
          <div style="flex:1;min-width:0">
            <span style="font-weight:600;font-size:.85rem">${esc(f.username)}</span>
            <span style="font-size:.8rem;color:var(--muted)"> hat </span>
            <span style="font-size:.82rem;color:#facc15;font-weight:600"><i class="fas ${icon}" style="margin-right:.2rem"></i>${typeof badgeName === 'string' ? badgeName : esc(f.badge_type)}</span>
            <span style="font-size:.8rem;color:var(--muted)"> freigeschaltet</span>
          </div>
          <span style="font-size:.7rem;color:var(--muted);white-space:nowrap">${ago(f.earned_at)}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// BATCH 6: Heutige Geburtstage Widget
async function loadBirthdayTodayWidget(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const bdays = await fetch('/api/birthdays/today').then(r => r.json()).catch(() => []);
  if (!bdays?.length) { el.style.display = 'none'; return; }
  el.innerHTML = `<div class="card">
    <div class="card-head">
      <div class="card-head-icon" style="background:rgba(249,115,22,.15)"><i class="fas fa-birthday-cake" style="color:var(--orange)"></i></div>
      <div><div class="card-title">Heute Geburtstag 🎂</div><div class="card-sub">${bdays.length} Mitarbeiter feiern heute</div></div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:.6rem">
      ${bdays.map(u => {
        const av = u.avatar ? `<img src="https://cdn.discordapp.com/avatars/${esc(u.discord_id)}/${esc(u.avatar)}.png" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : `<div style="width:32px;height:32px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:700">${esc((u.username||'?')[0].toUpperCase())}</div>`;
        return `<div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .65rem;background:var(--surface2);border-radius:8px;border:1px solid rgba(249,115,22,.2)">
          ${av}<span style="font-size:.85rem;font-weight:600">${esc(u.username)}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════
//  SSE — Echtzeit-Updates
// ════════════════════════════════════════════════════════════════
let _sseSource = null;
function connectSSE() {
  if (_sseSource) { _sseSource.close(); _sseSource = null; }
  try {
    _sseSource = new EventSource('/api/sse');
    _sseSource.addEventListener('exam', () => {
      // Zähler im Dashboard aktualisieren ohne full reload
      const el = document.querySelector('[data-countup]');
      if (el && _activePage === 'dashboard') dashboard();
    });
    _sseSource.addEventListener('eow_vote', () => {
      if (_activePage === 'eow') eow();
    });
    _sseSource.addEventListener('coins', e => {
      try {
        const d = JSON.parse(e.data);
        if (currentUser && d.discord_id === currentUser.discord_id) updateCoinChip(d.balance);
      } catch {}
    });
    _sseSource.addEventListener('tournament', () => {
      if (_activePage === 'turnier') turnier();
    });
    _sseSource.addEventListener('season', () => {
      if (_activePage === 'saison') saison();
    });
    _sseSource.addEventListener('duel', e => {
      try {
        const d = JSON.parse(e.data);
        if (duelVisible()) handleDuelEvent(d);
      } catch {}
    });
    _sseSource.addEventListener('bracket', () => {
      // Turnier-Updates: Lobby aktualisieren (nicht mitten im eigenen Match)
      if (duelVisible() && !_duel.code) duell();
    });
    _sseSource.addEventListener('notification', () => {
      loadNotifCount();
    });
    _sseSource.addEventListener('milestone', e => {
      try { const d = JSON.parse(e.data); toast(`🏆 Meilenstein: ${d.title} (+${d.reward} Coins)`, 'ok'); } catch {}
    });
    _sseSource.addEventListener('ticket_update', e => {
      try { if (_activePage === 'tickets') tickets(); } catch {}
    });
    _sseSource.addEventListener('trivia_lobby', e => {
      try { const d = JSON.parse(e.data); handleTriviaSSE('trivia_lobby', d); } catch {}
    });
    _sseSource.addEventListener('trivia_question', e => {
      try { const d = JSON.parse(e.data); handleTriviaSSE('trivia_question', d); } catch {}
    });
    _sseSource.addEventListener('trivia_reveal', e => {
      try { const d = JSON.parse(e.data); handleTriviaSSE('trivia_reveal', d); } catch {}
    });
    _sseSource.addEventListener('trivia_answer', e => {
      try { /* answerTracker handled inline */ } catch {}
    });
    _sseSource.addEventListener('trivia_end', e => {
      try { const d = JSON.parse(e.data); handleTriviaSSE('trivia_end', d); } catch {}
    });
    _sseSource.addEventListener('rank_exam_update', e => {
      try {
        const d = JSON.parse(e.data);
        if (!activeRankExam || d.join_code !== activeRankExam.join_code) return;
        if (d.m1_data    !== null)      activeRankExam.m1Data    = d.m1_data;
        if (d.m2_answers)               activeRankExam.m2Answers = d.m2_answers;
        if (d.m3_ratings)               activeRankExam.m3Ratings = d.m3_ratings;
        if (d.m3_notes   !== undefined) activeRankExam.m3Notes   = d.m3_notes;
        const serverM2Idx = d.current_m2_idx ?? currentRankM2Idx;
        if (d.current_module && d.current_module !== currentRankModule) {
          currentRankModule = d.current_module;
          if (d.current_module === 'm1') window.renderRankM1?.();
          if (d.current_module === 'm2') { currentRankM2Idx = serverM2Idx; window.renderRankM2?.(serverM2Idx); }
          if (d.current_module === 'm3') window.renderRankM3?.();
        } else {
          if (currentRankModule === 'm1') window.renderRankM1?.();
          if (currentRankModule === 'm2') { currentRankM2Idx = serverM2Idx; window.renderRankM2?.(serverM2Idx); }
          if (currentRankModule === 'm3') {
            const ta = document.getElementById('rM3Notes');
            if (ta && document.activeElement === ta) activeRankExam.m3Notes = ta.value;
            window.renderRankM3?.();
          }
        }
      } catch {}
    });
    _sseSource.addEventListener('rank_exam_done', e => {
      try {
        const d = JSON.parse(e.data);
        if (!activeRankExam || d.join_code !== activeRankExam.join_code) return;
        activeRankExam = null;
        closeModal();
        toast('Prüfung wurde abgeschlossen.', 'info');
      } catch {}
    });
    _sseSource.onerror = () => { _sseSource.close(); _sseSource = null; setTimeout(connectSSE, 30_000); };
  } catch {}
}

// ════════════════════════════════════════════════════════════════
//  BENACHRICHTIGUNGSZENTRALE
// ════════════════════════════════════════════════════════════════
let _notifPanel = null;

async function loadNotifCount() {
  try {
    const r = await fetch('/api/notifications');
    if (!r.ok) return;
    const d = await r.json();
    const badge = $('notifBadge');
    if (!badge) return;
    if (d.unread > 0) {
      badge.style.display = '';
      badge.textContent = d.unread > 9 ? '9+' : d.unread;
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}

function notifRelTime(isoStr) {
  const diff = Date.now() - new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z')).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tag(en)`;
}

window.toggleNotifPanel = async function() {
  if (_notifPanel && document.body.contains(_notifPanel)) {
    _notifPanel.remove(); _notifPanel = null; return;
  }
  const bell = $('notifBell');
  if (!bell) return;
  const rect = bell.getBoundingClientRect();

  let data = { unread: 0, notifications: [] };
  try {
    const r = await fetch('/api/notifications');
    if (r.ok) data = await r.json();
  } catch {}

  // Als gelesen markieren
  fetch('/api/notifications/read', { method: 'POST' }).catch(() => {});
  const badge = $('notifBadge');
  if (badge) badge.style.display = 'none';

  const ICONS = { badge: '🏅', transfer_in: '🪙', guestbook: '✏️' };

  const panel = document.createElement('div');
  panel.id = 'notifPanel';
  panel.style.cssText = `position:fixed;top:${rect.bottom + 8}px;right:${Math.max(8, window.innerWidth - rect.right)}px;width:320px;max-height:440px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:12px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.5)`;

  const notifs = data.notifications;
  if (!notifs.length) {
    panel.innerHTML = `<div style="padding:2.5rem 1rem;text-align:center;color:var(--muted);font-size:.85rem">
      <i class="fas fa-bell-slash" style="font-size:1.8rem;margin-bottom:.6rem;display:block;opacity:.4"></i>Keine Benachrichtigungen</div>`;
  } else {
    window._notifData = notifs;
    const items = notifs.map((n, i) => {
      const d = n.data;
      const time = notifRelTime(n.created_at);
      const icon = ICONS[n.type] || '🔔';
      let text = '';
      if (n.type === 'badge') {
        const bdef = BADGE_DEFS[d.badgeType];
        text = bdef
          ? `Badge erhalten: <b>${esc(bdef.label)}</b><div style="color:var(--muted);font-size:.74rem;margin-top:.12rem">Für: ${esc(bdef.desc)}</div>`
          : 'Neues Badge erhalten';
      } else if (n.type === 'transfer_in') {
        text = `<b>${esc(d.from)}</b> hat dir <b style="color:#fbbf24">${d.amount} Coins</b> überwiesen`;
      } else if (n.type === 'guestbook') {
        text = `<b>${esc(d.authorName)}</b> hat in dein Gästebuch geschrieben${d.preview ? `<div style="color:var(--muted);font-size:.74rem;margin-top:.12rem">„${esc(d.preview)}…"</div>` : ''}`;
      }
      const dot = n.is_read ? '' : `<span style="width:7px;height:7px;min-width:7px;border-radius:50%;background:#ef4444;margin-top:.3rem"></span>`;
      return `<div onclick="openNotif(${i})" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='${n.is_read ? 'transparent' : 'var(--surface2)'}'" style="display:flex;align-items:flex-start;gap:.65rem;padding:.75rem 1rem;border-bottom:1px solid var(--border);font-size:.82rem;cursor:pointer${n.is_read ? '' : ';background:var(--surface2)'}">
        <span style="font-size:1.1rem;margin-top:.05rem;flex-shrink:0">${icon}</span>
        <div style="flex:1;min-width:0">
          <div style="line-height:1.45">${text}</div>
          <div style="color:var(--muted);font-size:.72rem;margin-top:.2rem">${time}</div>
        </div>${dot}<i class="fas fa-chevron-right" style="color:var(--muted);font-size:.7rem;margin-top:.3rem;opacity:.6"></i></div>`;
    }).join('');
    panel.innerHTML = `<div style="padding:.65rem 1rem;border-bottom:1px solid var(--border);font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;justify-content:space-between">
      <span><i class="fas fa-bell" style="margin-right:.4rem"></i>Benachrichtigungen</span>
      <span style="color:var(--muted);font-weight:400">${notifs.length} Einträge</span>
    </div>${items}`;
  }

  document.body.appendChild(panel);
  _notifPanel = panel;

  setTimeout(() => {
    function outside(e) {
      if (!panel.contains(e.target) && e.target !== bell && !bell.contains(e.target)) {
        panel.remove(); _notifPanel = null;
        document.removeEventListener('click', outside);
      }
    }
    document.addEventListener('click', outside);
  }, 10);
};

// Klick auf eine Benachrichtigung → zum passenden Ort springen
window.openNotif = function(i) {
  const n = (window._notifData || [])[i];
  if (_notifPanel) { _notifPanel.remove(); _notifPanel = null; }
  if (!n) return;
  if (n.type === 'badge') {
    navigate('dashboard');
    setTimeout(() => {
      const c = $('badgesCard');
      if (!c) return;
      c.scrollIntoView({ behavior: 'smooth', block: 'center' });
      c.style.transition = 'box-shadow .3s';
      c.style.boxShadow = '0 0 0 2px var(--orange)';
      setTimeout(() => { c.style.boxShadow = ''; }, 1800);
    }, 400);
  } else if (n.type === 'transfer_in') {
    navigate('shop');
  } else if (n.type === 'guestbook') {
    if (currentUser && currentUser.id) openProfileModal(currentUser.id);
    else navigate('dashboard');
  }
};

// ════════════════════════════════════════════════════════════════
//  GLOBALE SUCHE
// ════════════════════════════════════════════════════════════════

// Seiten-Index: alle Bereiche der Website inkl. Synonyme (Command-Palette)
const SEARCH_PAGES = [
  { page: 'dashboard',    label: 'Dashboard',               icon: 'fa-th-large',       kw: 'übersicht start home' },
  { page: 'werkstatt',    label: 'Werkstatt-Hub',           icon: 'fa-wrench',         kw: 'reparatur tuning service aufträge auftrag' },
  { page: 'prices',       label: 'Preisliste',              icon: 'fa-tags',           kw: 'preise kosten tarife' },
  { page: 'map',          label: 'Abschlepphöfe',           icon: 'fa-map-marked-alt', kw: 'karte map abschleppen bergung standorte' },
  { page: 'meinacls',     label: 'Mein Hub',                icon: 'fa-home',           kw: 'mein acls persönlich' },
  { page: 'profil',       label: 'Mein Profil',             icon: 'fa-user-circle',    kw: 'steckbrief account konto einstellungen avatar' },
  { page: 'nachrichten',  label: 'Nachrichten',             icon: 'fa-envelope',       kw: 'dm direktnachricht chat post' },
  { page: 'level',        label: 'Level & Prestige',        icon: 'fa-star',           kw: 'xp erfahrung rang aufstieg prestige' },
  { page: 'milestones',   label: 'Meilensteine',            icon: 'fa-flag-checkered', kw: 'achievements erfolge abzeichen' },
  { page: 'wheel',        label: 'Daily Wheel',             icon: 'fa-dharmachakra',   kw: 'glücksrad täglich belohnung reward drehen' },
  { page: 'saison',       label: 'Saison-Pass',             icon: 'fa-medal',          kw: 'battle pass season belohnungen' },
  { page: 'freunde',      label: 'Freunde',                 icon: 'fa-user-friends',   kw: 'freundschaft social kontakte' },
  { page: 'activity',     label: 'Aktivitäts-Log',          icon: 'fa-chart-line',     kw: 'verlauf historie aktionen log' },
  { page: 'exams',        label: 'Prüfung starten',         icon: 'fa-play-circle',    kw: 'fahrprüfung führerschein theorie praxis test' },
  { page: 'registry',     label: 'Bürgerregister',          icon: 'fa-id-card',        kw: 'bürger register personen einwohner' },
  { page: 'iczeit',       label: 'IC-Zeit',                 icon: 'fa-clock',          kw: 'ingame zeit uhrzeit ic' },
  { page: 'statistiken',  label: 'Statistiken',             icon: 'fa-chart-bar',      kw: 'stats zahlen diagramme auswertung' },
  { page: 'onboarding',   label: 'Onboarding',              icon: 'fa-tasks',          kw: 'einführung neu start checkliste tutorial' },
  { page: 'eow',          label: 'Mitarbeiter der Woche',   icon: 'fa-trophy',         kw: 'voting abstimmung wahl eow gewinner' },
  { page: 'organigramm',  label: 'Unser Team',              icon: 'fa-users',          kw: 'organigramm mitarbeiter struktur hierarchie' },
  { page: 'team_vorstellung', label: 'Mitarbeiter-Vorstellung', icon: 'fa-id-badge',   kw: 'vorstellung steckbriefe team' },
  { page: 'tickets',      label: 'Support-Tickets',         icon: 'fa-ticket-alt',     kw: 'hilfe support beschwerde anliegen' },
  { page: 'feedback',     label: 'Feedback & Ideen',        icon: 'fa-lightbulb',      kw: 'vorschläge ideen wünsche verbesserung' },
  { page: 'faq',          label: 'FAQ',                     icon: 'fa-question-circle',kw: 'fragen antworten hilfe howto' },
  { page: 'changelog',    label: 'Changelog',               icon: 'fa-code-branch',    kw: 'updates neuigkeiten versionen news' },
  { page: 'turnier',      label: 'Wochenturnier',           icon: 'fa-crown',          kw: 'turnier wettbewerb competition' },
  { page: 'duell',        label: 'Quiz-Duell',              icon: 'fa-bolt',           kw: 'duell pvp herausforderung quiz' },
  { page: 'trivia',       label: 'Trivia-Team',             icon: 'fa-users-cog',      kw: 'trivia team quiz gruppe' },
  { page: 'shop',         label: 'Coin-Shop',               icon: 'fa-coins',          kw: 'shop kaufen coins münzen items' },
  { page: 'finanzen',     label: 'Meine Finanzen',          icon: 'fa-wallet',         kw: 'geld coins kontostand einnahmen ausgaben bilanz cashflow transaktionen' },
  { page: 'marktplatz',   label: 'Marktplatz',              icon: 'fa-exchange-alt',   kw: 'handel trading verkaufen inserate' },
  { page: 'wetten',       label: 'Coin-Wetten',             icon: 'fa-handshake',      kw: 'wette gambling einsatz' },
  { page: 'schwarzmarkt', label: 'Schwarzmarkt',            icon: 'fa-store-slash',    kw: 'illegal markt geheim untergrund' },
  { page: 'carmarket',    label: 'Fahrzeugmarkt',           icon: 'fa-car-side',       kw: 'autos fahrzeuge kaufen verkaufen automarkt' },
  { page: 'factions',     label: 'Fraktionsfarben',         icon: 'fa-palette',        kw: 'farben fraktionen gangs codes' },
  { page: 'arcade',       label: 'Arcade',                  icon: 'fa-gamepad',        kw: 'spiele games minigames zocken' },
  { href: '/quiz',           label: 'Prüfungsvorbereitung (Quiz)', icon: 'fa-graduation-cap', kw: 'üben lernen theorie quiz vorbereitung' },
  { href: '/spielbank',      label: 'Spielbank',            icon: 'fa-dice',           kw: 'casino blackjack roulette poker slots' },
  { href: '/clubs.html',     label: 'Clubs & Gilden',       icon: 'fa-shield-alt',     kw: 'club gilde verein gruppe kasse' },
  { href: '/automarkt.html', label: 'AutoMarkt Pro',        icon: 'fa-car-side',       kw: 'automarkt handel fahrzeuge' },
  { href: '/empire.html',    label: 'Auto Empire',          icon: 'fa-industry',       kw: 'empire tycoon firma imperium' },
];

function searchPages(q) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nq = norm(q);
  return SEARCH_PAGES
    .map(p => {
      const label = norm(p.label), kw = norm(p.kw || '');
      let score = 0;
      if (label.startsWith(nq)) score = 3;
      else if (label.includes(nq)) score = 2;
      else if (kw.includes(nq)) score = 1;
      return { ...p, score };
    })
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

const RECENT_SEARCHES_KEY = 'acls-recent-searches';
function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]'); } catch { return []; }
}
function addRecentSearch(q) {
  const list = getRecentSearches().filter(x => x !== q);
  list.unshift(q);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list.slice(0, 6)));
}

function searchEmptyState() {
  const recent = getRecentSearches();
  const recentHtml = recent.length ? `
    <div style="margin-top:1.25rem">
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.5rem">
        <i class="fas fa-history" style="margin-right:.4rem"></i>Letzte Suchen
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.4rem">
        ${recent.map(r => `<button class="btn btn-ghost btn-sm" onclick="$('search-input').value=this.textContent;runSearch(this.textContent)">${esc(r)}</button>`).join('')}
      </div>
    </div>` : '';
  return `
    <div style="color:var(--muted);font-size:.9rem;padding:.5rem 0">
      Mindestens 2 Zeichen eingeben – durchsucht Seiten, Sperren, Mitarbeiter &amp; Prüfungsregister.
      <span style="display:inline-block;margin-top:.35rem;font-size:.78rem">Tipp: <kbd style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:.1rem .35rem;font-size:.72rem">Strg</kbd>+<kbd style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:.1rem .35rem;font-size:.72rem">K</kbd> öffnet die Suche von überall.</span>
    </div>${recentHtml}`;
}

async function search() {
  $('pageContent').innerHTML = `
    <div class="pg-header"><div class="pg-header-left"><h2>Globale Suche</h2><p>Seiten, Sperren, Mitarbeiter &amp; Prüfungsregister</p></div></div>
    <div style="display:flex;gap:.75rem;margin-bottom:1.5rem">
      <div class="search-bar" style="max-width:480px;flex:1">
        <i class="fas fa-search"></i>
        <input id="search-input" placeholder="Seite, Name, Discord-ID, Sperrgrund…" style="width:100%"
          oninput="runSearch(this.value)"
          onkeydown="if(event.key==='Enter'){const f=document.querySelector('#search-results [data-search-first]');if(f)f.click();}else if(event.key==='Escape'){this.value='';runSearch('');}">
      </div>
    </div>
    <div id="search-results">${searchEmptyState()}</div>`;
  setTimeout(() => $('search-input')?.focus(), 50);
}

let _searchTimer = null;
let _searchSeq = 0;
window.runSearch = q => {
  clearTimeout(_searchTimer);
  q = q.trim();
  if (q.length < 2) { $('search-results').innerHTML = searchEmptyState(); return; }

  // Seiten-Treffer sofort anzeigen (kein API-Roundtrip nötig)
  const pages = searchPages(q);
  const pagesHtml = pages.length ? `<div style="margin-bottom:1.25rem">
    <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">
      <i class="fas fa-compass" style="color:var(--orange);margin-right:.4rem"></i>Seiten (${pages.length})
    </div>
    ${pages.map((p, i) => `
    <div ${i === 0 ? 'data-search-first' : ''} style="display:flex;align-items:center;gap:.75rem;padding:.55rem .9rem;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:.4rem;cursor:pointer"
      onclick="${p.page ? `navigate('${p.page}')` : `window.open('${p.href}','_blank')`}">
      <i class="fas ${p.icon}" style="color:var(--orange);width:18px;text-align:center"></i>
      <div style="flex:1;font-weight:600;font-size:.9rem">${esc(p.label)}</div>
      <i class="fas ${p.page ? 'fa-arrow-right' : 'fa-external-link-alt'}" style="color:var(--muted);font-size:.75rem"></i>
    </div>`).join('')}
  </div>` : '';

  $('search-results').innerHTML = pagesHtml + '<div id="search-api-results"><div style="color:var(--muted);font-size:.9rem;padding:1rem 0"><i class="fas fa-spinner fa-spin"></i> Suche läuft…</div></div>';

  const seq = ++_searchSeq;
  _searchTimer = setTimeout(async () => {
    const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (seq !== _searchSeq) return; // veraltete Antwort verwerfen
    const box = $('search-api-results');
    if (!box) return;
    if (!data) {
      box.innerHTML = `<div style="display:flex;align-items:center;gap:.6rem;color:var(--red);font-size:.88rem;padding:1rem;background:var(--red-dim);border:1px solid rgba(239,68,68,.3);border-radius:8px">
        <i class="fas fa-exclamation-triangle"></i> Suche fehlgeschlagen – bitte erneut versuchen.
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="runSearch($('search-input').value)">Erneut</button>
      </div>`;
      return;
    }
    addRecentSearch(q);
    const banColor = b => b.is_active ? '#ef4444' : '#6b7280';
    let html = '';

    if (data.bans.length) {
      html += `<div style="margin-bottom:1.25rem">
        <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">
          <i class="fas fa-ban" style="color:#ef4444;margin-right:.4rem"></i>Sperren (${data.bans.length})
        </div>
        ${data.bans.map(b => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;background:var(--surface);border:1px solid ${b.is_active ? 'rgba(239,68,68,.3)' : 'var(--border)'};border-left:3px solid ${banColor(b)};border-radius:8px;margin-bottom:.4rem">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.9rem">${esc(b.person_name)}${b.person_id ? ` <span style="color:var(--muted);font-weight:400;font-size:.8rem">${esc(b.person_id)}</span>` : ''}</div>
            <div style="font-size:.78rem;color:var(--muted);margin-top:.15rem">${esc(b.reason)}</div>
          </div>
          <span class="badge ${b.is_active ? 'badge-r' : ''}" style="${!b.is_active ? 'background:var(--surface2);color:var(--muted)' : ''}">${b.is_active ? 'Aktiv' : 'Aufgehoben'}</span>
          <span style="font-size:.75rem;color:var(--muted);white-space:nowrap">von ${esc(b.issued_by_name)}</span>
        </div>`).join('')}
      </div>`;
    }

    if (data.users.length) {
      html += `<div style="margin-bottom:1.25rem">
        <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">
          <i class="fas fa-users" style="color:var(--blue);margin-right:.4rem"></i>Mitarbeiter (${data.users.length})
        </div>
        ${data.users.map(u => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.55rem .9rem;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:.4rem;cursor:pointer" onclick="window.open('/profil/${u.id}','_blank')">
          ${avatarEl(u, 28)}
          <div style="flex:1"><div style="font-weight:600;font-size:.9rem">${esc(u.username)}</div><div style="font-size:.75rem;color:var(--muted)">${esc(u.role)} · ${esc(u.rank || '—')}</div></div>
          <i class="fas fa-external-link-alt" style="color:var(--muted);font-size:.75rem"></i>
        </div>`).join('')}
      </div>`;
    }

    if (data.registry.length) {
      html += `<div>
        <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">
          <i class="fas fa-clipboard-list" style="color:var(--green);margin-right:.4rem"></i>Prüfungsregister (${data.registry.length})
        </div>
        ${data.registry.map(r => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.55rem .9rem;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${r.passed ? '#22c55e' : '#ef4444'};border-radius:8px;margin-bottom:.4rem">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.9rem">${esc(r.citizen_name)}${r.citizen_id ? ` <span style="color:var(--muted);font-weight:400">${esc(r.citizen_id)}</span>` : ''}</div>
            <div style="font-size:.75rem;color:var(--muted)">${esc(r.category_name)} · ${esc(r.exam_type)} · Prüfer: ${esc(r.examiner_name)}</div>
          </div>
          <span class="badge ${r.passed ? 'badge-g' : 'badge-r'}">${r.passed ? 'Bestanden' : 'Nicht bestanden'}</span>
          <span style="font-size:.75rem;color:var(--muted);white-space:nowrap">${new Date(r.registered_at).toLocaleDateString('de-DE')}</span>
        </div>`).join('')}
      </div>`;
    }

    if (!data.bans.length && !data.users.length && !data.registry.length) {
      html = `<div style="color:var(--muted);font-size:.9rem;padding:1rem 0">${pages.length ? 'Keine weiteren Treffer in Sperren, Mitarbeitern oder Register.' : 'Keine Ergebnisse gefunden.'}</div>`;
    }
    box.innerHTML = html;
  }, 300);
};

// Globaler Shortcut: Strg+K (oder Cmd+K) öffnet die Suche von überall
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    const app = $('app');
    if (app && !app.classList.contains('hidden')) {
      e.preventDefault();
      if (_activePage === 'search') { $('search-input')?.focus(); }
      else navigate('search');
    }
  }
});

// ════════════════════════════════════════════════════════════════
//  ACTIVITY
// ════════════════════════════════════════════════════════════════
let _actPage = 1;
const ACT_PER_PAGE = 20;
let _actAllEvents = [];

async function activity() {
  _actPage = 1;
  const [reg, bansData, ic] = await Promise.all([
    api('/api/registry'), api('/api/bans'), api('/api/ic-log'),
  ]);
  if (!reg) return;

  _actAllEvents = [
    ...(reg || []).map(r => ({ date: r.registered_at, dot: r.passed ? 'g' : 'r', text: `<b>${esc(r.citizen_name)}</b> – ${esc(r.category_name)} ${esc(r.exam_type)} (${r.passed ? 'Bestanden' : 'Nicht bestanden'}) | Prüfer: ${esc(r.examiner_name)}` })),
    ...(bansData || []).map(b => ({ date: b.issued_at, dot: 'r', text: `Hausverbot: <b>${esc(b.person_name)}</b> – ${esc(b.reason)}` })),
    ...(ic || []).filter(e => e.auto).map(e => ({ date: e.created_at, dot: 'o', text: `IC-Zeit: <b>${esc(e.user_name)}</b> – ${(+e.hours).toFixed(1)}h ${e.notes ? '(' + esc(e.notes) + ')' : ''}` })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  renderActivity();
}

function renderActivity() {
  const total  = _actAllEvents.length;
  const pages  = Math.ceil(total / ACT_PER_PAGE) || 1;
  _actPage     = Math.min(_actPage, pages);
  const start  = (_actPage - 1) * ACT_PER_PAGE;
  const slice  = _actAllEvents.slice(start, start + ACT_PER_PAGE);

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left"><h2>Aktivitätslog</h2><p>${total} Einträge gesamt</p></div>
    </div>
    <div class="card">
      ${slice.length ? slice.map(ev => `
        <div class="act-item">
          <div class="act-dot ${ev.dot}"></div>
          <div class="act-text">${ev.text}</div>
          <div class="act-time">${ago(ev.date)}</div>
        </div>`).join('') : '<div class="empty"><i class="fas fa-stream"></i><p>Keine Aktivitäten</p></div>'}
    </div>
    ${pages > 1 ? `
    <div style="display:flex;align-items:center;justify-content:center;gap:.5rem;margin-top:1rem">
      <button class="btn btn-ghost btn-sm" ${_actPage<=1?'disabled':''} onclick="_actPage--;renderActivity()"><i class="fas fa-chevron-left"></i></button>
      <span style="font-size:.85rem;color:var(--muted)">Seite ${_actPage} / ${pages}</span>
      <button class="btn btn-ghost btn-sm" ${_actPage>=pages?'disabled':''} onclick="_actPage++;renderActivity()"><i class="fas fa-chevron-right"></i></button>
    </div>` : ''}`;
}

// ════════════════════════════════════════════════════════════════
//  EMPLOYEE OF THE WEEK
// ════════════════════════════════════════════════════════════════
async function eow() {
  const [data, users] = await Promise.all([api('/api/eow'), api('/api/users')]);
  if (!data) return;

  const candidates   = (users || []).filter(u => u.is_active);
  window._eowNames   = Object.fromEntries(candidates.map(u => [u.id, u.username]));
  const myVote       = data.myVoteFor;
  const myHasChanged = data.myHasChanged;
  const canChange    = myVote && !myHasChanged;
  window._eowMyVote  = myVote;
  const tally        = {};
  data.standings.forEach(s => { tally[s.id] = s.votes; });
  const citTally   = {};
  (data.citizenVotes || []).forEach(c => { citTally[c.nominee_id] = c.votes; });
  const citVoterNames = {};
  (data.citizenVoterNames || []).forEach(v => {
    if (!citVoterNames[v.nominee_id]) citVoterNames[v.nominee_id] = [];
    citVoterNames[v.nominee_id].push(v.voter_username);
  });
  const empVoters = {};
  data.standings.forEach(s => { empVoters[s.id] = s.voters || []; });

  const hofWinners = data.history.slice(0, 5);

  $('pageContent').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem">

      <!-- Hall of Fame -->
      <div class="card">
        <div class="card-head">
          <div class="card-head-icon orange"><i class="fas fa-trophy"></i></div>
          <div><div class="card-title">Hall of Fame</div><div class="card-sub">Die letzten 5 Gewinner</div></div>
        </div>
        ${hofWinners.length ? `
        <div style="display:grid;grid-template-columns:repeat(${hofWinners.length},1fr);gap:.75rem">
          ${hofWinners.map((w, i) => {
            const medals = ['#f59e0b','#9ca3af','#b45309','var(--orange)','var(--orange)'];
            const medalIcons = ['fa-trophy','fa-medal','fa-award','fa-star','fa-star'];
            return `
            <div style="display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:.9rem .75rem;background:var(--input);border-radius:var(--r);text-align:center;position:relative">
              <i class="fas ${medalIcons[i]}" style="position:absolute;top:.6rem;right:.6rem;font-size:.75rem;color:${medals[i]};opacity:.7"></i>
              ${avatarEl(w, 44)}
              <div style="font-weight:700;font-size:.88rem">${esc(w.username)}</div>
              <div style="font-size:.72rem;color:var(--muted)">KW ${isoWeek(w.week)} · ${w.vote_count} Stimmen</div>
            </div>`;
          }).join('')}
        </div>` : '<div class="empty"><i class="fas fa-trophy"></i><p>Noch keine Gewinner</p></div>'}
      </div>

      <!-- Abstimmung -->
      <div class="card">
        <div class="card-head">
          <div class="card-head-icon orange"><i class="fas fa-vote-yea"></i></div>
          <div>
            <div class="card-title">Abstimmung – KW ${isoWeek(data.week)}</div>
            <div class="card-sub">${!myVote ? 'Klicke auf einen Mitarbeiter um deine Stimme abzugeben' : canChange ? '<i class="fas fa-rotate-left" style="margin-right:.3rem"></i>Du kannst deine Stimme noch einmalig ändern' : 'Du hast abgestimmt und deine Stimme bereits geändert'} · <span id="eowCountdown"></span></div>
          </div>
          ${isAdmin() ? `<div style="display:flex;gap:.5rem;margin-left:auto;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="countEow()"><i class="fas fa-calculator"></i> Auszählen</button>
            <button class="btn btn-ghost btn-sm" onclick="syncMembers()"><i class="fas fa-sync"></i> Sync</button>
            <button class="btn btn-ghost btn-sm" style="color:#ef4444;border-color:rgba(239,68,68,.3)" onclick="resetEow()"><i class="fas fa-trash"></i> Zurücksetzen</button>
          </div>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.75rem;margin-top:.25rem">
          ${candidates.map(u => {
            const isSelf  = u.id === currentUser.id;
            const isVoted = myVote === u.id;
            const canVote = (!myVote || canChange) && !isSelf;
            const total   = (tally[u.id] || 0) + (citTally[u.id] || 0);
            return `
            <div onclick="${canVote ? `confirmVote(${u.id})` : ''}"
                 style="display:flex;flex-direction:column;align-items:center;gap:.6rem;padding:1.1rem .75rem;
                        background:${isVoted ? 'var(--orange-dim)' : 'var(--input)'};
                        border:1px solid ${isVoted ? 'rgba(249,115,22,.4)' : 'var(--border)'};
                        border-radius:var(--r);text-align:center;
                        cursor:${canVote ? 'pointer' : 'default'};
                        opacity:${isSelf ? '.5' : '1'};
                        transition:background .15s,border-color .15s,transform .1s"
                 ${canVote ? 'onmouseenter="this.style.transform=\'scale(1.02)\'" onmouseleave="this.style.transform=\'\'"' : ''}>
              <div style="position:relative">
                ${avatarEl(u, 52)}
                ${isVoted ? '<div style="position:absolute;bottom:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center"><i class="fas fa-check" style="font-size:.6rem;color:#fff"></i></div>' : ''}
              </div>
              <div style="font-weight:700;font-size:.9rem">${esc(u.username)}${isSelf ? ' <span style="font-size:.7rem;font-weight:400;color:var(--muted)">(Du)</span>' : ''}</div>
              ${u.rank ? `<div style="font-size:.7rem;color:var(--orange);font-weight:600">${u.rank}</div>` : ''}
              <div style="font-size:.72rem;color:var(--muted);line-height:1.6">
                ${tally[u.id] || 0} Mitarbeiter · ${citTally[u.id] || 0} Bürger
                ${empVoters[u.id]?.length ? `<br><span style="font-size:.67rem;opacity:.85"><i class="fas fa-users" style="margin-right:.25rem"></i>${empVoters[u.id].join(', ')}</span>` : ''}
                ${citVoterNames[u.id]?.length ? `<br><span style="font-size:.67rem;opacity:.75"><i class="fas fa-user" style="margin-right:.25rem"></i>${citVoterNames[u.id].join(', ')}</span>` : ''}
              </div>
              ${isVoted ? '<div style="font-size:.75rem;font-weight:600;color:var(--orange)"><i class="fas fa-check-circle"></i> Deine Wahl</div>' : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// EoW-Countdown: nächster Sonntag 18:00 Uhr Berlin-Zeit
(function startEowCountdown() {
  function update() {
    const el = document.getElementById('eowCountdown');
    if (!el) return;
    const now = new Date();
    const berlin = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    const day  = berlin.getDay(); // 0=So
    const daysUntilSun = (7 - day) % 7 || 7;
    const target = new Date(berlin);
    target.setDate(berlin.getDate() + daysUntilSun);
    target.setHours(18, 0, 0, 0);
    const diff = target - berlin;
    if (diff <= 0) { el.textContent = 'Auszählung läuft!'; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = `Auszählung in ${h > 24 ? Math.floor(h/24)+'T ' + (h%24) + 'h' : h+'h '+m+'m '+s+'s'}`;
    setTimeout(update, 1000);
  }
  update();
})();

window.confirmVote = (nominee_id) => {
  const username = esc(window._eowNames?.[nominee_id] || '');
  const isChange = !!window._eowMyVote;
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-vote-yea" style="margin-right:.5rem;color:var(--orange)"></i>${isChange ? 'Stimme ändern' : 'Stimme abgeben'}</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="padding:.75rem 0;text-align:center">
      <p style="font-size:1rem;margin-bottom:.5rem">${isChange ? 'Möchtest du deine Stimme auf' : 'Möchtest du'} <strong>${username}</strong> ${isChange ? 'ändern?' : 'als Mitarbeiter der Woche wählen?'}</p>
      <p style="font-size:.8rem;color:var(--muted);margin-top:.75rem">${isChange ? 'Achtung: Du kannst deine Stimme danach nicht mehr ändern.' : 'Du kannst deine Stimme danach noch einmalig ändern.'}</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="castVote(${nominee_id})"><i class="fas fa-check"></i> Ja, ${isChange ? 'ändern' : 'wählen'}</button>
    </div>`);
};
window.castVote = async nominee_id => {
  closeModal();
  const r = await api('/api/eow/vote', { method: 'POST', body: { nominee_id } });
  if (r) { toast(r.changed ? 'Stimme geändert!' : 'Stimme abgegeben!', 'ok'); eow(); }
};
window.countEow = async () => {
  const r = await api('/api/eow/count', { method: 'POST' });
  if (r?.ok) { toast('Ausgezählt!', 'ok'); eow(); }
};
window.syncMembers = async () => {
  toast('Synchronisiere Discord-Namen …', '');
  const r = await api('/api/sync-members', { method: 'POST' });
  if (r?.ok) { toast(`${r.synced} Namen synchronisiert`, 'ok'); eow(); }
};
window.resetEow = () => {
  openModal(`
    <div class="modal-head">
      <div class="modal-title" style="color:#ef4444"><i class="fas fa-trash" style="margin-right:.5rem"></i>Abstimmung zurücksetzen</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="padding:.5rem 0">
      <p style="color:var(--muted)">Alle Mitarbeiter- und Bürgerstimmen dieser Woche werden unwiderruflich gelöscht.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" style="background:#ef4444;border-color:#ef4444" onclick="confirmResetEow()"><i class="fas fa-trash"></i> Zurücksetzen</button>
    </div>`);
};
window.confirmResetEow = async () => {
  const r = await api('/api/eow/reset', { method: 'POST' });
  if (r?.ok) { toast('Abstimmung zurückgesetzt', 'ok'); closeModal(); eow(); }
};

// ════════════════════════════════════════════════════════════════
//  EXAMS
// ════════════════════════════════════════════════════════════════
async function exams() {
  const cats = await api('/api/exam-categories');
  if (!cats) return;

  $('pageContent').innerHTML = `
    <div class="pg-header"><div class="pg-header-left"><h2>Prüfung wählen</h2></div></div>
    <div class="exam-grid">
      ${cats.map(cat => `
        <div class="exam-card">
          <div class="exam-icon"><i class="fas ${cat.icon}"></i></div>
          <div>
            <div class="exam-name">${cat.name}</div>
            <div class="exam-desc">${cat.description || ''}</div>
            <div class="exam-q-count" style="margin-top:.3rem">${cat.question_count} Fragen verfügbar</div>
          </div>
          <div class="exam-btns">
            <button class="btn btn-primary" onclick="startExam(${cat.id},'full')"><i class="fas fa-play"></i> Volltest (10)</button>
            <button class="btn btn-ghost btn-sm" onclick="startExam(${cat.id},'flash')"><i class="fas fa-bolt"></i> Blitz (5)</button>
          </div>
        </div>`).join('')}
    </div>`;
}

window.startExam = (category_id, mode) => {
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-user" style="color:var(--orange);margin-right:.5rem"></i>Prüfling</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <p style="font-size:.85rem;color:var(--muted);margin-bottom:.75rem">
      Fülle die Daten des Prüflings aus. Die Person wird nach Bestehen automatisch ins Bürgerregister eingetragen.
    </p>
    <div style="display:flex;align-items:flex-start;gap:.6rem;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);border-radius:var(--r);padding:.65rem .9rem;margin-bottom:1rem;font-size:.82rem;color:#fca5a5">
      <i class="fas fa-skull" style="color:#ef4444;margin-top:.1rem;flex-shrink:0"></i>
      <span><b>Achtung K.O.-Fragen:</b> Diese Prüfung enthält K.O.-Fragen. Eine falsche Antwort führt zum <b>sofortigen Durchfallen</b> und einer automatischen 24h-Sperre des Prüflings.</span>
    </div>
    <form onsubmit="launchExam(event,${category_id},'${mode}')">
      <div class="form-row">
        <div class="form-group"><label>Prüfling Name <span style="color:var(--red)">*</span></label>
          <input class="form-control" id="citName" placeholder="Vorname Nachname" required></div>
        <div class="form-group"><label>Ausweis-ID</label>
          <input class="form-control" id="citId" placeholder="CF-0000"></div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-play"></i> Prüfung starten</button>
      </div>
    </form>`);
};

window.launchExam = async (e, category_id, mode) => {
  e.preventDefault();
  const citizen_name = $('citName').value.trim();
  const citizen_id   = $('citId').value.trim();

  if (citizen_name) {
    const params = new URLSearchParams({ name: citizen_name });
    if (citizen_id) params.set('id', citizen_id);
    const check = await api(`/api/bans/check?${params}`);
    if (check?.banned) {
      const b = check.ban;
      const until = b.expires_at ? `bis ${fmt(b.expires_at)} um ${fmtTime(b.expires_at)}` : 'unbefristet';
      openModal(`
        <div class="modal-head">
          <div class="modal-title" style="color:#ef4444"><i class="fas fa-ban" style="margin-right:.5rem"></i>Bürger gesperrt</div>
          <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
        </div>
        <div style="padding:.5rem 0">
          <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:var(--r);padding:.9rem 1rem;margin-bottom:1rem">
            <div style="font-size:1rem;font-weight:700;margin-bottom:.35rem">${citizen_name}</div>
            <div style="font-size:.85rem;color:#ef4444"><i class="fas fa-lock" style="margin-right:.4rem"></i>Gesperrt ${until}</div>
          </div>
          <div style="font-size:.85rem"><span style="color:var(--muted)">Grund:</span> ${esc(b.reason)}</div>
          <div style="font-size:.82rem;color:var(--muted);margin-top:.4rem">Gesperrt von: ${b.issued_by_name}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        </div>`);
      return;
    }
  }

  closeModal();
  const questions = await api('/api/exams/start', { method: 'POST', body: { category_id, mode, citizen_name, citizen_id } });
  if (!questions) return;
  const cats = await api('/api/exam-categories');
  const cat  = cats?.find(c => c.id === category_id);
  activeQuiz = { category_id, mode, questions, current: 0, answers: {}, cat, citizenName: citizen_name, citizenId: citizen_id };
  renderQuiz(cat);
};

function renderQuiz(cat) {
  const q   = activeQuiz;
  const qst = q.questions[q.current];
  const koBadge = qst.is_ko ? `<div class="ko-badge"><i class="fas fa-skull"></i> K.O.-Frage – Falsche Antwort = Sofort durchgefallen!</div>` : '';
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas ${cat?.icon || 'fa-car'}" style="color:var(--orange);margin-right:.5rem"></i>${cat?.name} – ${q.mode === 'flash' ? 'Blitztest' : 'Volltest'}</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="${qst.is_ko ? 'quiz-wrap ko-mode' : 'quiz-wrap'}">
      <div class="quiz-progress"><div class="quiz-progress-bar" style="width:${(q.current / q.questions.length) * 100}%"></div></div>
      <div class="quiz-counter">Frage ${q.current + 1} von ${q.questions.length}</div>
      ${koBadge}
      <div class="quiz-q">${esc(qst.question)}</div>
      ${[qst.option_a, qst.option_b, qst.option_c, qst.option_d]
        .map((opt, i) => ({ opt, i }))
        .filter(({ opt }) => opt && opt.trim())
        .map(({ opt, i }) => {
          const isSelected = q.answers[qst.id] === i;
          const isCorrect  = qst.correct_answer === i;
          let cls = 'quiz-option';
          if (isSelected) cls += ' selected';
          if (isCorrect)  cls += ' correct-hint';
          return `<div class="${cls}" onclick="selectOpt(${i})">
            <div class="opt-letter">${'ABCD'[i]}</div><div>${esc(opt)}</div>
            ${isCorrect ? '<i class="fas fa-check-circle" style="margin-left:auto;color:var(--green);font-size:.85rem;flex-shrink:0"></i>' : ''}
          </div>`;
        }).join('')}
    </div>
    <div class="modal-footer">
      ${q.current > 0 ? '<button class="btn btn-ghost" onclick="quizNav(-1)"><i class="fas fa-arrow-left"></i> Zurück</button>' : '<span></span>'}
      ${q.current < q.questions.length - 1
        ? '<button class="btn btn-primary" onclick="quizNav(1)">Weiter <i class="fas fa-arrow-right"></i></button>'
        : '<button class="btn btn-primary" onclick="submitExam()"><i class="fas fa-check"></i> Abschicken</button>'}
    </div>`);
}

window.selectOpt = function(i) {
  const qst = activeQuiz.questions[activeQuiz.current];
  activeQuiz.answers[qst.id] = i;
  if (qst.is_ko && i !== qst.correct_answer) {
    api('/api/exams/ko-fail', { method: 'POST', body: { citizen_name: activeQuiz.citizenName, citizen_id: activeQuiz.citizenId, category_id: activeQuiz.category_id, question: qst.question } })
      .then(r => {
        const banNote = (r?.banId && activeQuiz.citizenName)
          ? `<div style="margin-top:.75rem;padding:.6rem .9rem;background:rgba(239,68,68,.1);border-radius:var(--r);border:1px solid rgba(239,68,68,.25);font-size:.82rem;color:#ef4444"><i class="fas fa-ban" style="margin-right:.4rem"></i><b>${activeQuiz.citizenName}</b> wurde automatisch für 24 Stunden gesperrt.</div>` : '';
        openModal(`
          <div class="modal-head">
            <div class="modal-title" style="color:var(--red)"><i class="fas fa-skull" style="margin-right:.5rem"></i>K.O. – Sofort durchgefallen!</div>
            <button class="modal-close" onclick="closeModal();exams()"><i class="fas fa-times"></i></button>
          </div>
          <div class="quiz-result">
            <div class="quiz-score-big quiz-failed">K.O.</div>
            <div style="font-size:1.1rem;margin:.75rem 0;font-weight:700;color:var(--red)">Nicht bestanden</div>
            <div style="font-size:.88rem;color:var(--muted);padding:.65rem;background:rgba(239,68,68,.1);border-radius:var(--r);border:1px solid rgba(239,68,68,.3);margin-top:.5rem">
              <b>K.O.-Frage:</b> ${qst.question}<br><br>
              <b>Richtige Antwort:</b> ${{ 0: qst.option_a, 1: qst.option_b, 2: qst.option_c, 3: qst.option_d }[qst.correct_answer]}
            </div>
            ${banNote}
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeModal();exams()">Schließen</button>
            <button class="btn btn-primary" onclick="startExam(${activeQuiz.category_id},'${activeQuiz.mode}')"><i class="fas fa-redo"></i> Nochmal</button>
          </div>`);
      });
    return;
  }
  renderQuiz(activeQuiz.cat);
};
window.quizNav   = dir => { activeQuiz.current += dir; renderQuiz(activeQuiz.cat); };
const PRAXIS_ERRORS = [
  'Geschwindigkeit überschritten',
  'Stoppschild missachtet',
  'Anweisungen ignoriert',
  'Falscher Fahrstreifen',
  'Zu geringer Abstand',
  'Verkehrszeichen missachtet',
  'Aggressives Fahrverhalten',
  'Handy am Steuer',
  'Falsche Vorfahrt',
  'Gefährliche Überholung',
];

function buildAnswerReview(questions, results) {
  const byId = {};
  for (const r of results) byId[r.id] = r;
  const rows = questions.map((q, idx) => {
    const r = byId[q.id];
    if (!r) return '';
    const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
    const optsHtml = opts.map((opt, i) => {
      if (!opt || !opt.trim()) return '';
      const isCorrect = i === r.correct_answer;
      const isUserWrong = i === r.user_answer && !r.correct;
      let bg = 'transparent', border = 'transparent', color = 'var(--muted)', icon = '';
      if (isCorrect)   { bg = 'rgba(34,197,94,.12)';  border = 'rgba(34,197,94,.4)';  color = 'var(--green)'; icon = '<i class="fas fa-check" style="font-size:.72rem"></i>'; }
      if (isUserWrong) { bg = 'rgba(239,68,68,.1)';   border = 'rgba(239,68,68,.35)'; color = '#ef4444';      icon = '<i class="fas fa-times" style="font-size:.72rem"></i>'; }
      return `<div style="font-size:.79rem;padding:.28rem .5rem;border-radius:4px;background:${bg};border:1px solid ${border};color:${color};display:flex;justify-content:space-between;align-items:center;gap:.4rem">
        <span><b>${'ABCD'[i]}.</b> ${opt}</span>${icon}</div>`;
    }).join('');
    const statusColor = r.correct ? 'var(--green)' : '#ef4444';
    const statusIcon  = r.correct ? 'fa-check-circle' : 'fa-times-circle';
    return `<div style="background:var(--input);border-radius:var(--r);padding:.6rem .75rem;border:1px solid var(--border)">
      <div style="font-size:.81rem;font-weight:600;margin-bottom:.4rem;color:var(--fg);display:flex;align-items:center;gap:.4rem">
        <i class="fas ${statusIcon}" style="color:${statusColor};flex-shrink:0"></i>${idx + 1}. ${q.question}
      </div>
      <div style="display:flex;flex-direction:column;gap:.2rem">${optsHtml}</div>
    </div>`;
  }).join('');
  return `<div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:.9rem">
    <div style="font-size:.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.55rem">Auswertung</div>
    <div style="display:flex;flex-direction:column;gap:.5rem;max-height:310px;overflow-y:auto;padding-right:.2rem">${rows}</div>
  </div>`;
}

window.submitExam = async () => {
  const unanswered = activeQuiz.questions.filter(q => activeQuiz.answers[q.id] === undefined).length;
  if (unanswered > 0) { toast(`Noch ${unanswered} Frage${unanswered > 1 ? 'n' : ''} nicht beantwortet`, 'err'); return; }
  const cat       = activeQuiz.cat;
  const questions = activeQuiz.questions;
  const result    = await api('/api/exams/submit', { method: 'POST', body: { answers: activeQuiz.answers } });
  if (!result) return;
  const citizenName = activeQuiz.citizenName;
  const review = buildAnswerReview(questions, result.results || []);

  if (!result.passed) {
    const autoBan = result.banId
      ? `<div style="margin-top:.75rem;padding:.6rem .9rem;background:rgba(239,68,68,.1);border-radius:var(--r);border:1px solid rgba(239,68,68,.25);font-size:.82rem;color:#ef4444"><i class="fas fa-ban" style="margin-right:.4rem"></i><b>${citizenName}</b> wurde automatisch für 24 Stunden gesperrt.</div>` : '';
    openModal(`
      <div class="modal-head"><div class="modal-title">Ergebnis${citizenName ? ` – ${citizenName}` : ''}</div>
      <button class="modal-close" onclick="closeModal();exams()"><i class="fas fa-times"></i></button></div>
      <div class="quiz-result">
        <div class="quiz-score-big quiz-failed">${result.score}/${result.total}</div>
        <div style="font-size:1.1rem;font-weight:700;margin:.75rem 0">✗ Nicht bestanden</div>
        <div style="font-size:.9rem;color:var(--muted)">${result.percentage}% richtig – ${cat?.name || ''} Theorie</div>
        ${autoBan}
      </div>
      ${review}
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal();exams()">Schließen</button>
        <button class="btn btn-primary" onclick="startExam(${cat?.id ?? activeQuiz.category_id},'${activeQuiz.mode}')"><i class="fas fa-redo"></i> Nochmal</button>
      </div>`);
    return;
  }

  // Theorie bestanden + Bürger-Name → weiter zur Praxis
  if (citizenName) {
    openPraktischeExam(result, cat);
    return;
  }

  // Bestanden ohne Bürger (eigener Test / Blitztest)
  openModal(`
    <div class="modal-head"><div class="modal-title">Ergebnis</div>
    <button class="modal-close" onclick="closeModal();exams()"><i class="fas fa-times"></i></button></div>
    <div class="quiz-result">
      <div class="quiz-score-big quiz-passed">${result.score}/${result.total}</div>
      <div style="font-size:1.1rem;font-weight:700;margin:.75rem 0">✓ Bestanden</div>
      <div style="font-size:.9rem;color:var(--muted)">${result.percentage}% richtig – ${cat?.name || ''} Theorie</div>
    </div>
    ${review}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal();exams()">Schließen</button>
    </div>`);
};

function openPraktischeExam(theorieResult, cat) {
  const citizenName = activeQuiz.citizenName;
  const ROUTE_IMGS = { PKW: '/pkw-route.webp', LKW: '/lkw-route.webp', Motorrad: '/bike-route.webp', Flugschein: '/heli-route.webp' };
  const routeSrc  = ROUTE_IMGS[cat?.name];
  const routeImg  = routeSrc
    ? `<div style="margin-bottom:1rem">
        <div style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.4rem"><i class="fas fa-route" style="margin-right:.35rem;color:var(--orange)"></i>Prüfungsroute ${cat.name}</div>
        <img src="${routeSrc}" alt="${cat.name} Prüfungsroute" style="width:100%;border-radius:var(--r);border:1px solid var(--border);display:block">
       </div>`
    : '';
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-car" style="color:var(--orange);margin-right:.5rem"></i>Praxisprüfung – ${citizenName}</div>
      <button class="modal-close" onclick="closeModal();exams()"><i class="fas fa-times"></i></button>
    </div>
    <div style="padding:.25rem 0">
      <div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:var(--r);padding:.6rem .9rem;font-size:.83rem;color:var(--green);margin-bottom:1rem">
        <i class="fas fa-check-circle" style="margin-right:.4rem"></i>Theorie bestanden (${theorieResult.percentage}%) – Praxisprüfung läuft
      </div>
      ${routeImg}
      <p style="font-size:.88rem;color:var(--muted);margin-bottom:.9rem">Fehler des Fahrers anhaken. Bei einem Fehler sofort durchgefallen.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem .75rem">
        ${PRAXIS_ERRORS.map((err, i) => `
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.35rem .5rem;border-radius:6px;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,.05)'" onmouseout="this.style.background='none'">
            <input type="checkbox" id="perr_${i}" style="accent-color:#ef4444;width:15px;height:15px">
            <span style="font-size:.84rem">${err}</span>
          </label>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal();exams()">Abbrechen</button>
      <button class="btn btn-primary" onclick="submitPraxis()"><i class="fas fa-check"></i> Prüfung abschließen</button>
    </div>`);
}

window.submitPraxis = async () => {
  const citizenName = activeQuiz.citizenName;
  const citizenId   = activeQuiz.citizenId || null;
  const categoryId  = activeQuiz.category_id;
  const errors = PRAXIS_ERRORS.filter((_, i) => document.getElementById(`perr_${i}`)?.checked);
  const result = await api('/api/exams/practical', { method: 'POST', body: { citizen_name: citizenName, citizen_id: citizenId, category_id: categoryId, errors } });
  if (!result) return;
  const banNote = result.banId
    ? `<div style="margin-top:.75rem;padding:.6rem .9rem;background:rgba(239,68,68,.1);border-radius:var(--r);border:1px solid rgba(239,68,68,.25);font-size:.82rem;color:#ef4444"><i class="fas fa-ban" style="margin-right:.4rem"></i><b>${citizenName}</b> wurde für 24 Stunden gesperrt.<br><span style="opacity:.8">Fehler: ${errors.join(', ')}</span></div>` : '';
  const regNote = result.passed
    ? `<div style="margin-top:.75rem;padding:.6rem .9rem;background:rgba(34,197,94,.12);border-radius:var(--r);border:1px solid rgba(34,197,94,.25);font-size:.82rem;color:var(--green)"><i class="fas fa-check-circle" style="margin-right:.4rem"></i><b>${citizenName}</b> wurde ins Bürgerregister eingetragen.</div>` : '';
  openModal(`
    <div class="modal-head"><div class="modal-title">Praxisprüfung – Ergebnis</div>
    <button class="modal-close" onclick="closeModal();exams()"><i class="fas fa-times"></i></button></div>
    <div class="quiz-result">
      <div class="quiz-score-big ${result.passed ? 'quiz-passed' : 'quiz-failed'}">${result.passed ? '✓' : '✗'}</div>
      <div style="font-size:1.1rem;font-weight:700;margin:.75rem 0">${result.passed ? 'Praxis bestanden!' : 'Praxis nicht bestanden'}</div>
      ${regNote}${banNote}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal();exams()">Schließen</button>
    </div>`);
};

// ════════════════════════════════════════════════════════════════
//  REGISTRY
// ════════════════════════════════════════════════════════════════
let regSearch = '';
async function registry() {
  const [rows, cats] = await Promise.all([api(`/api/registry?search=${encodeURIComponent(regSearch)}`), api('/api/exam-categories')]);
  if (!rows) return;

  // Gruppierung nach Bürger-Name (case-insensitive)
  const grouped = {};
  rows.forEach(r => {
    const key = r.citizen_name.trim().toLowerCase();
    if (!grouped[key]) grouped[key] = { name: r.citizen_name, citizenId: r.citizen_id, entries: [] };
    grouped[key].entries.push(r);
  });
  const citizens = Object.values(grouped).sort((a, b) => {
    const aT = Math.max(...a.entries.map(e => new Date(e.registered_at).getTime()));
    const bT = Math.max(...b.entries.map(e => new Date(e.registered_at).getTime()));
    return bT - aT;
  });

  const CAT_COLORS = { PKW: '#f97316', Motorrad: '#ef4444', Boot: '#3b82f6', LKW: '#22c55e', Flugschein: '#a855f7' };

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left"><h2>Bürgerregister</h2><p>${citizens.length} Bürger · ${rows.length} Einträge</p></div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap">
        <div class="search-bar"><i class="fas fa-search"></i>
          <input id="regSearch" placeholder="Bürger suchen..." value="${regSearch}" oninput="regSearch=this.value;clearTimeout(window._rst);window._rst=setTimeout(registry,250)">
        </div>
        <button class="btn btn-primary" onclick="openAddRegistry()"><i class="fas fa-plus"></i> Eintrag hinzufügen</button>
      </div>
    </div>
    ${citizens.length ? citizens.map((c, idx) => {
      const passed    = c.entries.filter(e => e.passed);
      const licenses  = [...new Map(passed.map(e => [e.category_name, e])).values()];
      const latest    = c.entries.reduce((a, b) => new Date(a.registered_at) > new Date(b.registered_at) ? a : b);
      const noteCount = c.entries[0]?.note_count || 0;
      return `
      <div class="card" style="margin-bottom:.75rem">
        <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;cursor:pointer" onclick="toggleCitizenDetail(this,${idx})">
          <div style="width:42px;height:42px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;color:var(--orange);flex-shrink:0">
            ${esc(c.name.trim()[0].toUpperCase())}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.98rem">
              <span style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px" onclick="event.stopPropagation();showCitizenHistory('${esc(c.name).replace(/'/g,"\\'")}','${esc(c.citizenId||'').replace(/'/g,"\\'")}')">
                ${esc(c.name)}
              </span>
              ${c.citizenId ? ` <span style="font-size:.75rem;color:var(--muted);font-weight:400">${esc(c.citizenId)}</span>` : ''}
            </div>
            <div style="font-size:.75rem;color:var(--muted);margin-top:.15rem">Letzter Eintrag: ${fmt(latest.registered_at)}${c.entries.length > 1 ? ` · ${c.entries.length} Einträge` : ''}</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.4rem;align-items:center">
            ${licenses.length ? licenses.map(e => `
              <span title="${e.category_name} – Bestanden" style="display:inline-flex;align-items:center;gap:.3rem;font-size:.72rem;font-weight:700;padding:.2rem .55rem;border-radius:20px;background:${(CAT_COLORS[e.category_name]||'#6b7280')}22;color:${CAT_COLORS[e.category_name]||'#6b7280'};border:1px solid ${(CAT_COLORS[e.category_name]||'#6b7280')}44">
                <i class="fas ${e.icon}"></i>${e.category_name}
              </span>`).join('') : `<span style="font-size:.72rem;color:var(--muted)">Keine Lizenz</span>`}
            ${noteCount > 0 ? `<span title="${noteCount} interne Notiz(en)" style="display:inline-flex;align-items:center;gap:.25rem;font-size:.7rem;font-weight:700;padding:.2rem .5rem;border-radius:20px;background:rgba(168,85,247,.12);color:#a855f7;border:1px solid rgba(168,85,247,.3)"><i class="fas fa-lock" style="font-size:.6rem"></i>${noteCount}</span>` : ''}
          </div>
          <i class="fas fa-chevron-down" style="color:var(--muted);font-size:.75rem;flex-shrink:0"></i>
        </div>
        <div class="reg-detail hidden" style="margin-top:.85rem;border-top:1px solid var(--border);padding-top:.75rem">
          <table class="data-tbl" style="font-size:.82rem">
            <thead><tr><th>Prüfung</th><th>Typ</th><th>Prüfer</th><th>Datum</th><th>Status</th>${isAdmin() ? '<th></th>' : ''}</tr></thead>
            <tbody>
              ${c.entries.sort((a,b) => new Date(b.registered_at)-new Date(a.registered_at)).map(e => {
                let wrongQs = [];
                try { wrongQs = JSON.parse(e.notes || '{}').wrong || []; } catch {}
                const cols = isAdmin() ? 6 : 5;
                return `<tr>
                  <td><i class="fas ${e.icon}" style="color:${CAT_COLORS[e.category_name]||'var(--orange)'};margin-right:.35rem"></i>${esc(e.category_name)}</td>
                  <td><span class="badge ${e.exam_type === 'Praxis' ? 'badge-b' : 'badge-m'}">${esc(e.exam_type)}</span></td>
                  <td>${esc(e.examiner_name)}</td>
                  <td>${fmt(e.registered_at)}</td>
                  <td><span class="badge ${e.passed ? 'badge-g' : 'badge-r'}">${e.passed ? 'Bestanden' : 'Nicht bestanden'}</span></td>
                  ${isAdmin() ? `<td><button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteRegistry(${e.id})"><i class="fas fa-trash"></i></button></td>` : ''}
                </tr>${wrongQs.length ? `<tr style="background:rgba(239,68,68,.04)">
                  <td colspan="${cols}" style="padding:.45rem .9rem .6rem">
                    <div style="font-size:.72rem;font-weight:700;color:#ef4444;margin-bottom:.3rem"><i class="fas fa-times-circle" style="margin-right:.3rem"></i>Falsch beantwortet (${wrongQs.length})</div>
                    <ul style="margin:0;padding-left:1.1rem;font-size:.78rem;color:#fca5a5;line-height:1.6">${wrongQs.map(q => `<li>${esc(q)}</li>`).join('')}</ul>
                  </td>
                </tr>` : ''}`;
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top:.85rem;border-top:1px solid var(--border);padding-top:.6rem">
            <div style="font-size:.75rem;font-weight:700;color:var(--muted);margin-bottom:.45rem;display:flex;align-items:center;gap:.35rem">
              <i class="fas fa-lock" style="font-size:.65rem"></i>Interne Notizen (nur Mitarbeiter)
            </div>
            <div id="rnl-${idx}" style="margin-bottom:.45rem;min-height:1rem"></div>
            <div style="display:flex;gap:.45rem">
              <input class="form-control" id="rni-${idx}" placeholder="Notiz hinzufügen…" style="flex:1;font-size:.81rem;padding:.32rem .6rem" onkeydown="if(event.key==='Enter'){event.preventDefault();addCitizenNote(${idx})}">
              <button class="btn btn-primary btn-sm" onclick="addCitizenNote(${idx})"><i class="fas fa-plus"></i></button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('') : `<div class="empty"><i class="fas fa-id-card"></i><p>Keine Einträge gefunden</p></div>`}`;

  window._regCitizens = citizens;
  window._regCats = cats;
  const si = $('regSearch');
  if (si && document.activeElement !== si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
}

// BATCH 5: Bürger Prüfungs-History Modal
window.showCitizenHistory = async (name, id) => {
  openModal(`<div style="padding:1.5rem"><div class="loader"></div></div>`);
  const params = new URLSearchParams({ name });
  if (id) params.set('id', id);
  const d = await api('/api/citizen-history?' + params);
  if (!d) return;
  const CAT_ICONS = { PKW: 'fa-car', Motorrad: 'fa-motorcycle', Boot: 'fa-ship', LKW: 'fa-truck', Flugschein: 'fa-plane' };
  const rate = d.stats.total ? Math.round(d.stats.passed / d.stats.total * 100) : 0;
  $('modalBox').innerHTML = `
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-id-card" style="color:var(--orange);margin-right:.5rem"></i>Prüfungshistorie: ${esc(name)}</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-bottom:1rem">
      <div style="text-align:center;padding:.6rem;background:var(--surface2);border-radius:8px">
        <div style="font-size:1.4rem;font-weight:800">${d.stats.total}</div>
        <div style="font-size:.7rem;color:var(--muted)">Gesamt</div>
      </div>
      <div style="text-align:center;padding:.6rem;background:var(--surface2);border-radius:8px">
        <div style="font-size:1.4rem;font-weight:800;color:#22c55e">${d.stats.passed}</div>
        <div style="font-size:.7rem;color:var(--muted)">Bestanden</div>
      </div>
      <div style="text-align:center;padding:.6rem;background:var(--surface2);border-radius:8px">
        <div style="font-size:1.4rem;font-weight:800;color:${rate >= 70 ? '#22c55e' : '#ef4444'}">${rate}%</div>
        <div style="font-size:.7rem;color:var(--muted)">Erfolgsrate</div>
      </div>
    </div>
    ${Object.keys(d.stats.byCategory).length ? `
    <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.85rem">
      ${Object.entries(d.stats.byCategory).map(([cat, s]) => `
        <span style="font-size:.75rem;padding:.2rem .55rem;border-radius:20px;background:var(--surface2);border:1px solid var(--border)">
          <i class="fas ${CAT_ICONS[cat]||'fa-certificate'}" style="margin-right:.3rem"></i>${esc(cat)}: ${s.passed}/${s.total}
        </span>`).join('')}
    </div>` : ''}
    <div style="max-height:320px;overflow-y:auto">
      <table class="data-tbl" style="font-size:.82rem">
        <thead><tr><th>Prüfung</th><th>Typ</th><th>Prüfer</th><th>Datum</th><th>Status</th></tr></thead>
        <tbody>${d.rows.map(r => `<tr>
          <td><i class="fas ${CAT_ICONS[r.category_name]||'fa-certificate'}" style="margin-right:.35rem"></i>${esc(r.category_name||'–')}</td>
          <td>${esc(r.exam_type||'–')}</td>
          <td>${esc(r.examiner_name||'–')}</td>
          <td>${new Date(r.registered_at).toLocaleDateString('de-DE')}</td>
          <td><span class="badge ${r.passed ? 'badge-g' : 'badge-r'}">${r.passed ? 'Bestanden' : 'Nicht bestanden'}</span></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Schließen</button></div>`;
};

window.openAddRegistry = () => {
  const cats = window._regCats || [];
  openModal(`
    <div class="modal-head"><div class="modal-title"><i class="fas fa-id-card" style="color:var(--orange);margin-right:.5rem"></i>Eintrag hinzufügen</div>
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <form onsubmit="submitRegistry(event)">
      <div class="form-row">
        <div class="form-group"><label>Bürger-Name</label><input class="form-control" id="rName" placeholder="Vorname Nachname" required></div>
        <div class="form-group"><label>Ausweis-ID</label><input class="form-control" id="rId" placeholder="CF-0000"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Prüfung</label>
          <select class="form-control" id="rCat">${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Typ</label>
          <select class="form-control" id="rType"><option>Praxis</option><option>Theorie</option></select>
        </div>
      </div>
      <div class="form-group"><label>Status</label>
        <select class="form-control" id="rPassed"><option value="1">Bestanden</option><option value="0">Nicht bestanden</option></select>
      </div>
      <div class="form-group"><label>Notizen (optional)</label><input class="form-control" id="rNotes"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
      </div>
    </form>`);
};

window.submitRegistry = async e => {
  e.preventDefault();
  const r = await api('/api/registry', { method: 'POST', body: {
    citizen_name: $('rName').value.trim(),
    citizen_id:   $('rId').value.trim(),
    category_id:  +$('rCat').value,
    exam_type:    $('rType').value,
    passed:       $('rPassed').value === '1',
    notes:        $('rNotes').value.trim(),
  }});
  if (r) { closeModal(); toast('Gespeichert!', 'ok'); registry(); }
};

window.deleteRegistry = async id => {
  if (!confirm('Eintrag löschen?')) return;
  const r = await api(`/api/registry/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht.', 'ok'); registry(); }
};

// ════════════════════════════════════════════════════════════════
//  CITIZEN NOTES
// ════════════════════════════════════════════════════════════════
window.toggleCitizenDetail = (el, idx) => {
  const detail = el.parentElement.querySelector('.reg-detail');
  const wasHidden = detail.classList.contains('hidden');
  detail.classList.toggle('hidden');
  if (wasHidden) {
    const c = window._regCitizens?.[idx];
    if (c) loadCitizenNotes(idx, c.name);
  }
};

window.loadCitizenNotes = async (idx, name) => {
  const listEl = document.getElementById(`rnl-${idx}`);
  if (!listEl || listEl.dataset.loaded) return;
  listEl.dataset.noteName = name;
  const notes = await api(`/api/citizen-notes?name=${encodeURIComponent(name)}`);
  if (!notes) { listEl.textContent = 'Fehler beim Laden.'; return; }
  listEl.dataset.loaded = '1';
  renderCitizenNotes(idx, notes);
};

window.renderCitizenNotes = (idx, notes) => {
  const listEl = document.getElementById(`rnl-${idx}`);
  if (!listEl) return;
  if (!notes.length) {
    listEl.innerHTML = '<div style="color:var(--muted);font-size:.8rem;font-style:italic;padding:.2rem 0">Keine Notizen vorhanden.</div>';
    return;
  }
  listEl.innerHTML = notes.map(n => `
    <div style="display:flex;gap:.5rem;align-items:flex-start;padding:.4rem .6rem;background:var(--surface2);border-radius:6px;margin-bottom:.3rem">
      <div style="flex:1;min-width:0">
        <div style="font-size:.82rem;color:var(--fg);word-break:break-word">${esc(n.note)}</div>
        <div style="font-size:.7rem;color:var(--muted);margin-top:.12rem">${esc(n.created_by_name)} · ${fmt(n.created_at)}</div>
      </div>
      ${(currentUser?.id === n.created_by || isAdmin()) ? `<button class="btn btn-danger btn-sm" style="flex-shrink:0;padding:.18rem .38rem" onclick="deleteCitizenNote(${n.id},${idx})"><i class="fas fa-trash" style="font-size:.68rem"></i></button>` : ''}
    </div>`).join('');
};

window.addCitizenNote = async idx => {
  const input  = document.getElementById(`rni-${idx}`);
  const listEl = document.getElementById(`rnl-${idx}`);
  if (!input || !listEl) return;
  const note = input.value.trim();
  const name = listEl.dataset.noteName || window._regCitizens?.[idx]?.name;
  if (!note || !name) return;
  const r = await api('/api/citizen-notes', { method: 'POST', body: { citizen_name: name, note } });
  if (r) {
    input.value = '';
    delete listEl.dataset.loaded;
    await loadCitizenNotes(idx, name);
    toast('Notiz gespeichert', 'ok');
  }
};

window.deleteCitizenNote = async (noteId, idx) => {
  if (!confirm('Notiz löschen?')) return;
  const r = await api(`/api/citizen-notes/${noteId}`, { method: 'DELETE' });
  if (r) {
    const listEl = document.getElementById(`rnl-${idx}`);
    const name = listEl?.dataset.noteName || window._regCitizens?.[idx]?.name;
    if (listEl && name) { delete listEl.dataset.loaded; await loadCitizenNotes(idx, name); }
    toast('Notiz gelöscht', 'ok');
  }
};

// ════════════════════════════════════════════════════════════════
//  FAQ (staff)
// ════════════════════════════════════════════════════════════════
async function faq() {
  const rows = await api('/api/faq');
  if (!rows) return;
  const cats = [...new Set(rows.map(r => r.category))];

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left"><h2>FAQ</h2><p>${rows.length} Einträge in ${cats.length} Kategorien</p></div>
      ${isAdmin() ? `<button class="btn btn-primary" onclick="openAddFaq()"><i class="fas fa-plus"></i> Frage hinzufügen</button>` : ''}
    </div>
    ${rows.length ? cats.map(cat => `
      <div style="margin-bottom:1.5rem">
        <div style="font-size:.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">${cat}</div>
        ${rows.filter(r => r.category === cat).map(f => `
          <div class="card" style="margin-bottom:.5rem">
            <div style="display:flex;align-items:flex-start;gap:.75rem">
              <div style="flex:1;min-width:0;cursor:pointer" onclick="this.parentElement.parentElement.querySelector('.faq-ans').classList.toggle('hidden')">
                <div style="font-weight:600;font-size:.92rem"><i class="fas fa-question-circle" style="color:#38bdf8;margin-right:.45rem;font-size:.8rem"></i>${esc(f.question)}</div>
                <div class="faq-ans hidden" style="margin-top:.55rem;font-size:.87rem;color:var(--muted);line-height:1.6;white-space:pre-wrap">${esc(f.answer)}</div>
              </div>
              ${isAdmin() ? `
                <div style="display:flex;gap:.35rem;flex-shrink:0">
                  <button class="btn btn-ghost btn-sm" onclick="openEditFaq(${f.id},'${f.question.replace(/'/g,"\\'")}','${f.answer.replace(/'/g,"\\'")}','${f.category}',${f.sort_order||0})"><i class="fas fa-pen"></i></button>
                  <button class="btn btn-danger btn-sm" onclick="deleteFaqItem(${f.id})"><i class="fas fa-trash"></i></button>
                </div>` : ''}
            </div>
          </div>`).join('')}
      </div>`).join('') : '<div class="empty"><i class="fas fa-question-circle"></i><p>Noch keine FAQ-Einträge.</p></div>'}`;
}

window.openAddFaq = () => openModal(`
  <div class="modal-head"><div class="modal-title"><i class="fas fa-question-circle" style="color:#38bdf8;margin-right:.5rem"></i>FAQ-Eintrag hinzufügen</div>
  <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
  <form onsubmit="submitFaq(event)">
    <div class="form-group"><label>Frage</label><input class="form-control" id="faqQ" required placeholder="Wie viel kostet...?"></div>
    <div class="form-group"><label>Antwort</label><textarea class="form-control" id="faqA" rows="4" required placeholder="Die Antwort..."></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Kategorie</label><input class="form-control" id="faqCat" value="Allgemein" placeholder="Allgemein"></div>
      <div class="form-group"><label>Reihenfolge</label><input class="form-control" id="faqSort" type="number" value="0" min="0"></div>
    </div>
    <input type="hidden" id="faqId" value="">
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
    </div>
  </form>`);

window.openEditFaq = (id, q, a, cat, sort) => openModal(`
  <div class="modal-head"><div class="modal-title"><i class="fas fa-pen" style="color:#38bdf8;margin-right:.5rem"></i>FAQ bearbeiten</div>
  <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
  <form onsubmit="submitFaq(event)">
    <div class="form-group"><label>Frage</label><input class="form-control" id="faqQ" required value="${q}"></div>
    <div class="form-group"><label>Antwort</label><textarea class="form-control" id="faqA" rows="4" required>${esc(a)}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Kategorie</label><input class="form-control" id="faqCat" value="${cat}"></div>
      <div class="form-group"><label>Reihenfolge</label><input class="form-control" id="faqSort" type="number" value="${sort}" min="0"></div>
    </div>
    <input type="hidden" id="faqId" value="${id}">
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
    </div>
  </form>`);

window.submitFaq = async e => {
  e.preventDefault();
  const id   = $('faqId').value;
  const body = { question: $('faqQ').value.trim(), answer: $('faqA').value.trim(), category: $('faqCat').value.trim() || 'Allgemein', sort_order: +$('faqSort').value };
  const r = id
    ? await api(`/api/faq/${id}`, { method: 'PUT', body })
    : await api('/api/faq', { method: 'POST', body });
  if (r) { closeModal(); toast('Gespeichert!', 'ok'); faq(); }
};

window.deleteFaqItem = async id => {
  if (!confirm('FAQ-Eintrag löschen?')) return;
  const r = await api(`/api/faq/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht.', 'ok'); faq(); }
};

// ════════════════════════════════════════════════════════════════
//  FACTIONS
// ════════════════════════════════════════════════════════════════
async function factions() {
  const rows = await api('/api/factions');
  if (!rows) return;

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left"><h2>Fraktionsfarben</h2><p>${rows.length} Fraktionen</p></div>
      <button class="btn btn-primary" onclick="openEditFaction()"><i class="fas fa-plus"></i> Fraktion hinzufügen</button>
    </div>
    <div class="tbl-wrap">
      <table class="data-tbl">
        <thead><tr><th>Fraktion</th><th>Primär</th><th>Sekundär</th><th>Pearl</th><th>Notizen</th><th></th></tr></thead>
        <tbody>
          ${rows.map(f => `<tr>
            <td style="font-weight:600;color:var(--text)">${esc(f.name)}</td>
            <td><div style="display:flex;align-items:center;gap:.4rem"><span class="swatch" style="background:${esc(f.primary_color || '#333')}"></span>${esc(f.primary_color || '—')}</div></td>
            <td><div style="display:flex;align-items:center;gap:.4rem"><span class="swatch" style="background:${esc(f.secondary_color || '#333')}"></span>${esc(f.secondary_color || '—')}</div></td>
            <td><div style="display:flex;align-items:center;gap:.4rem"><span class="swatch" style="background:${esc(f.pearl_color || '#333')}"></span>${esc(f.pearl_color || '—')}</div></td>
            <td style="color:var(--muted)">${esc(f.notes || '—')}</td>
            <td><div style="display:flex;gap:.4rem">
              <button class="btn btn-ghost btn-sm" onclick="openEditFaction(${f.id})"><i class="fas fa-pen"></i></button>
              ${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="deleteFaction(${f.id})"><i class="fas fa-trash"></i></button>` : ''}
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

window.openEditFaction = async (id = null) => {
  let f = null;
  if (id) { const rows = await api('/api/factions'); f = rows?.find(x => x.id === id); }
  openModal(`
    <div class="modal-head"><div class="modal-title">${f ? 'Fraktion bearbeiten' : 'Fraktion erstellen'}</div>
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <form onsubmit="submitFaction(event,${id || 0})">
      <div class="form-group"><label>Name</label><input class="form-control" id="fName" value="${esc(f?.name || '')}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Primärfarbe</label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <input type="color" id="fPC" value="${esc(f?.primary_color || '#f97316')}" style="width:42px;height:38px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background:var(--input)">
            <input class="form-control" id="fPrim" value="${esc(f?.primary_color || '#f97316')}">
          </div>
        </div>
        <div class="form-group"><label>Sekundärfarbe</label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <input type="color" id="fSC" value="${esc(f?.secondary_color || '#1c1c1c')}" style="width:42px;height:38px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background:var(--input)">
            <input class="form-control" id="fSec" value="${esc(f?.secondary_color || '#1c1c1c')}">
          </div>
        </div>
      </div>
      <div class="form-group"><label>Pearl-Farbe</label>
        <div style="display:flex;gap:.5rem;align-items:center">
          <input type="color" id="fLC" value="${esc(f?.pearl_color || '#ffffff')}" style="width:42px;height:38px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background:var(--input)">
          <input class="form-control" id="fPrl" value="${esc(f?.pearl_color || '#ffffff')}">
        </div>
      </div>
      <div class="form-group"><label>Notizen</label><input class="form-control" id="fNotes" value="${esc(f?.notes || '')}"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
      </div>
    </form>`);
  [['fPC','fPrim'],['fSC','fSec'],['fLC','fPrl']].forEach(([pick,inp]) => {
    $(pick).addEventListener('input', e => { $(inp).value = e.target.value; });
    $(inp).addEventListener('input', e => { try { $(pick).value = e.target.value; } catch {} });
  });
};

window.submitFaction = async (e, id) => {
  e.preventDefault();
  const body = { name:$('fName').value.trim(), primary_color:$('fPrim').value, secondary_color:$('fSec').value, pearl_color:$('fPrl').value, notes:$('fNotes').value.trim() };
  const r = id
    ? await api(`/api/factions/${id}`, { method: 'PUT', body })
    : await api('/api/factions', { method: 'POST', body });
  if (r) { closeModal(); toast('Gespeichert!', 'ok'); factions(); }
};

window.deleteFaction = async id => {
  if (!confirm('Fraktion löschen?')) return;
  const r = await api(`/api/factions/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht.', 'ok'); factions(); }
};

// ════════════════════════════════════════════════════════════════
//  MAP — echte GTA V Karte mit Leaflet
// ════════════════════════════════════════════════════════════════
async function map() {
  let leafletOk = true;
  const [spots] = await Promise.all([
    api('/api/map-spots'),
    loadLib('leaflet').catch(() => { leafletOk = false; }),
  ]);
  if (!spots) return;

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left"><h2>Abschlepphöfe</h2><p>${spots.length} Spots eingetragen</p></div>
      <div style="display:flex;gap:.65rem;align-items:center">
        <span id="mapMode" style="font-size:.8rem;color:var(--muted)"></span>
        <button class="btn btn-primary" id="addSpotToggle" onclick="toggleMapAdd()"><i class="fas fa-map-marker-alt"></i> Spot hinzufügen</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:start">
      <div class="map-outer">
        <div id="mapContainer" style="height:650px;border-radius:var(--rl)"></div>
      </div>
      <div class="card" style="min-width:140px;padding:.9rem">
        <div style="font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.75rem">Legende</div>
        ${[['hq','#c9a227','ACLS HQ'],['tow','#f97316','Abschlepphof'],['exam','#22c55e','Prüfungsort'],['Felder','#3b82f6','Felder'],['Hotspot','#ec4899','Hotspot'],['Gangs/Familien','#eab308','Gangs/Familien'],['other','#6b7280','Sonstiges']].map(([type,color,label])=>`
        <div style="display:flex;align-items:center;gap:.55rem;margin-bottom:.55rem">
          <div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 6px ${color}88;flex-shrink:0"></div>
          <span style="font-size:.82rem">${label}</span>
        </div>`).join('')}
      </div>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="card-head"><div class="card-head-icon orange"><i class="fas fa-list"></i></div>
      <div><div class="card-title">Alle Abschlepphöfe</div></div></div>
      <div class="tbl-wrap">
        <table class="data-tbl">
          <thead><tr><th>Name</th><th>Beschreibung</th><th>Typ</th><th>Eingetragen von</th><th></th></tr></thead>
          <tbody>
            ${spots.map(s => `<tr>
              <td style="font-weight:600;color:var(--text)">${esc(s.name)}</td>
              <td>${esc(s.description || '—')}</td>
              <td><span style="font-size:.75rem;padding:.15rem .55rem;border-radius:6px;font-weight:600;background:${({'hq':'#c9a22722','tow':'#f9731622','exam':'#22c55e22','Felder':'#3b82f622','Hotspot':'#ec4b9922','Gangs/Familien':'#eab30822'}[s.spot_type]||'#6b728022')};color:${({'hq':'#c9a227','tow':'#f97316','exam':'#22c55e','Felder':'#3b82f6','Hotspot':'#ec4899','Gangs/Familien':'#eab308'}[s.spot_type]||'#6b7280')}">${esc(s.spot_type)}</span></td>
              <td>${s.created_by_name || '—'}</td>
              <td>${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="deleteSpot(${s.id})"><i class="fas fa-trash"></i></button>` : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  if (leafletOk && window.L) {
    initLeafletMap(spots);
  } else {
    $('mapContainer').innerHTML = `<div class="empty" style="height:100%">
      <i class="fas fa-map-marked-alt"></i>
      <p>Karte konnte nicht geladen werden (CDN nicht erreichbar).</p>
      <button class="btn btn-ghost btn-sm" onclick="navigate('map')"><i class="fas fa-redo"></i> Erneut versuchen</button>
    </div>`;
  }
}

window._addingSpot = false;
window.toggleMapAdd = () => {
  window._addingSpot = !window._addingSpot;
  $('addSpotToggle').textContent = window._addingSpot ? '✕ Abbrechen' : '+ Spot hinzufügen';
  const hint = $('mapMode');
  if (hint) hint.textContent = window._addingSpot ? 'Klicke auf die Karte um einen Spot zu platzieren' : '';
  if (leafletMap) leafletMap.getContainer().style.cursor = window._addingSpot ? 'crosshair' : '';
};

// GTA V coordinate helpers — CRS.Simple with 0–1000 unit space
const GTA_SIZE = 1000;
const pctToLatLng = (xPct, yPct) => [
  GTA_SIZE - (yPct / 100) * GTA_SIZE,
  (xPct / 100) * GTA_SIZE,
];
const latLngToPct = (lat, lng) => [
  +((lng / GTA_SIZE) * 100).toFixed(2),
  +(((GTA_SIZE - lat) / GTA_SIZE) * 100).toFixed(2),
];

function initLeafletMap(spots) {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }

  leafletMap = L.map('mapContainer', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    attributionControl: false,
    zoomSnap: 0.1,
    zoomDelta: 0.5,
    scrollWheelZoom: true,
  });

  // GTA V Karte als Image-Overlay
  const bounds = [[0, 0], [GTA_SIZE, GTA_SIZE]];
  L.imageOverlay('/gta-map.webp', bounds, { opacity: 1, zIndex: 1, className: 'gta-map-img' }).addTo(leafletMap);

  leafletMap.fitBounds(bounds, { padding: [4, 4] });

  const spotColor = t => ({ hq:'#c9a227', tow:'#f97316', exam:'#22c55e', Felder:'#3b82f6', Hotspot:'#ec4899', 'Gangs/Familien':'#eab308' }[t] || '#6b7280');

  const makePin = color => L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px ${color}99"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });

  // Add existing spots
  spots.forEach(s => {
    const color = spotColor(s.spot_type);
    const [lat, lng] = pctToLatLng(s.x_pos, s.y_pos);
    L.marker([lat, lng], { icon: makePin(color) })
      .addTo(leafletMap)
      .bindPopup(`<div style="font-family:Inter,sans-serif;min-width:140px">
        <div style="font-weight:700;margin-bottom:.25rem">${esc(s.name)}</div>
        ${s.description ? `<div style="font-size:.8rem;color:#888;margin-bottom:.35rem">${esc(s.description)}</div>` : ''}
        <span style="font-size:.75rem;background:${color}22;color:${color};border-radius:4px;padding:.1rem .4rem;border:1px solid ${color}44">${esc(s.spot_type)}</span>
      </div>`, { closeButton: false });
  });

  // Click to add spot
  leafletMap.on('click', e => {
    if (!window._addingSpot) return;
    const [xPct, yPct] = latLngToPct(e.latlng.lat, e.latlng.lng);
    openAddSpotModal(xPct, yPct);
  });
}

function openAddSpotModal(x, y) {
  openModal(`
    <div class="modal-head"><div class="modal-title">Spot hinzufügen</div>
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <form onsubmit="submitSpot(event,${x},${y})">
      <div class="form-group"><label>Name</label><input class="form-control" id="spName" placeholder="z. B. ACLS Hauptgarage" required></div>
      <div class="form-group"><label>Beschreibung</label><input class="form-control" id="spDesc" placeholder="Kurze Beschreibung"></div>
      <div class="form-group"><label>Typ</label>
        <select class="form-control" id="spType"><option>tow</option><option>exam</option><option>hq</option><option>Felder</option><option>Hotspot</option><option>Gangs/Familien</option><option>other</option></select>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
      </div>
    </form>`);
}

window.submitSpot = async (e, x, y) => {
  e.preventDefault();
  const r = await api('/api/map-spots', { method: 'POST', body: { name: $('spName').value.trim(), description: $('spDesc').value.trim(), x_pos: x, y_pos: y, spot_type: $('spType').value }});
  if (r) { window._addingSpot = false; closeModal(); toast('Spot gespeichert!', 'ok'); map(); }
};

window.deleteSpot = async id => {
  const r = await api(`/api/map-spots/${id}`, { method: 'DELETE' });
  if (r) { toast('Spot gelöscht.', 'ok'); map(); }
};

// ════════════════════════════════════════════════════════════════
//  AUDIT-LOG
// ════════════════════════════════════════════════════════════════
let _auditQ = '', _auditAction = '', _auditPage = 1;
const ACTION_LABELS = {
  ban_create:'Sperre erstellt', ban_lift:'Sperre aufgehoben', ban_delete:'Sperre gelöscht',
  user_update:'User aktualisiert', registry_delete:'Register-Eintrag gelöscht',
  exam_ko_fail:'K.O.-Frage Fail', ic_log_reset:'IC-Log zurückgesetzt',
  ic_log_add:'IC-Zeit eingetragen', announcement_create:'Ankündigung erstellt',
  announcement_delete:'Ankündigung gelöscht', complaint_response:'Beschwerde beantwortet',
  faction_create:'Fraktion erstellt', faction_delete:'Fraktion gelöscht',
  price_create:'Preis erstellt', price_update:'Preis aktualisiert', price_delete:'Preis gelöscht',
  faq_create:'FAQ erstellt', faq_update:'FAQ aktualisiert', faq_delete:'FAQ gelöscht',
  citizen_note_add:'Bürger-Notiz hinzugefügt', citizen_note_delete:'Bürger-Notiz gelöscht',
};
const ACTION_ICONS = {
  ban_create:'fa-ban r', ban_lift:'fa-lock-open g', ban_delete:'fa-trash r',
  user_update:'fa-user-edit o', registry_delete:'fa-id-card r',
  exam_ko_fail:'fa-skull r', ic_log_reset:'fa-redo o', ic_log_add:'fa-clock g',
  announcement_create:'fa-bullhorn o', announcement_delete:'fa-bullhorn r',
  complaint_response:'fa-reply g',
};

async function auditlog() {
  const params = new URLSearchParams({ page: _auditPage });
  if (_auditQ)      params.set('q', _auditQ);
  if (_auditAction) params.set('action', _auditAction);
  const data = await api(`/api/audit-log?${params}`);
  if (!data) return;
  const { rows, total, pages } = data;

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left"><h2>Audit-Log</h2><p>${total} Einträge gesamt</p></div>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap">
        <div class="search-bar"><i class="fas fa-search"></i>
          <input id="auditSearch" placeholder="User oder Details..." value="${_auditQ}"
            oninput="_auditQ=this.value;_auditPage=1;clearTimeout(window._alog);window._alog=setTimeout(auditlog,250)">
        </div>
        <select class="form-control" style="width:auto;font-size:.83rem" onchange="_auditAction=this.value;_auditPage=1;auditlog()">
          <option value="">Alle Aktionen</option>
          ${Object.entries(ACTION_LABELS).map(([k,v]) => `<option value="${k}" ${_auditAction===k?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="card">
      ${rows.length ? `
      <div class="tbl-wrap">
        <table class="data-tbl">
          <thead><tr><th>Zeit</th><th>User</th><th>Aktion</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            ${rows.map(r => {
              const iconClass = ACTION_ICONS[r.action] || 'fa-circle-dot o';
              const [icon, col] = iconClass.split(' ');
              return `<tr>
                <td style="white-space:nowrap;color:var(--muted);font-size:.78rem">${fmt(r.created_at)}</td>
                <td style="font-weight:600">${esc(r.username)}</td>
                <td><span style="display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem">
                  <i class="fas ${icon} ${col==='r'?'style="color:#ef4444"':col==='g'?'style="color:#22c55e"':col==='o'?'style="color:var(--orange)"':''}"></i>
                  ${ACTION_LABELS[r.action] || esc(r.action)}
                </span></td>
                <td style="font-size:.8rem;color:var(--muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.details||'')}">${esc(r.details || '—')}</td>
                <td style="font-size:.75rem;color:var(--muted)">${esc(r.ip || '—')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${pages > 1 ? `
      <div style="display:flex;align-items:center;justify-content:center;gap:.5rem;margin-top:1rem;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" ${_auditPage<=1?'disabled':''} onclick="_auditPage--;auditlog()"><i class="fas fa-chevron-left"></i></button>
        <span style="font-size:.85rem;color:var(--muted)">Seite ${_auditPage} / ${pages}</span>
        <button class="btn btn-ghost btn-sm" ${_auditPage>=pages?'disabled':''} onclick="_auditPage++;auditlog()"><i class="fas fa-chevron-right"></i></button>
      </div>` : ''}
      ` : '<div class="empty"><i class="fas fa-shield-alt"></i><p>Keine Einträge gefunden</p></div>'}
    </div>`;
}

// ════════════════════════════════════════════════════════════════
//  IC-ZEIT
// ════════════════════════════════════════════════════════════════
async function iczeit() {
  const [stats, log, active, me] = await Promise.all([api('/api/ic-stats'), api('/api/ic-log'), api('/api/active-sessions'), api('/api/profile/' + currentUser?.id)]);
  if (!stats) return;

  const maxWeek = Math.max(...stats.map(s => +s.week), 0.01);
  const totalH  = stats.reduce((s, u) => s + +u.week, 0);
  const myWeek  = +(stats.find(s => s.user_id === currentUser?.id)?.week || 0);
  const myGoal  = me?.stats?.ic_goal || 0;
  const goalPct = myGoal > 0 ? Math.min(Math.round((myWeek / myGoal) * 100), 100) : 0;

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left"><h2>IC-Zeit Tracking</h2><p>Discord Voice-Kanal Anwesenheit – automatisch via Bot</p></div></div>

    <div class="card" style="margin-bottom:1.1rem;border:1px solid rgba(249,115,22,.2)">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="flex:1;min-width:180px">
          <div style="font-size:.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.25rem">Mein Wochenziel</div>
          <div style="display:flex;align-items:baseline;gap:.5rem">
            <span style="font-size:1.5rem;font-weight:800;color:var(--orange)">${myWeek.toFixed(1)}h</span>
            <span style="color:var(--muted);font-size:.85rem">/ ${myGoal > 0 ? myGoal + 'h' : 'kein Ziel'}</span>
          </div>
          ${myGoal > 0 ? `
          <div style="height:6px;background:var(--surface2);border-radius:3px;margin-top:.5rem;overflow:hidden">
            <div style="height:100%;width:${goalPct}%;background:${goalPct >= 100 ? '#22c55e' : 'var(--orange)'};border-radius:3px;transition:width .6s"></div>
          </div>
          <div style="font-size:.72rem;color:${goalPct >= 100 ? '#22c55e' : 'var(--muted)'};margin-top:.25rem">${goalPct >= 100 ? '✓ Ziel erreicht!' : goalPct + '% erreicht'}</div>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openGoalModal(${myGoal})"><i class="fas fa-target"></i> Ziel setzen</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:.6rem;background:rgba(250,204,21,.07);border:1px solid rgba(250,204,21,.25);border-radius:10px;padding:.6rem 1rem;margin-bottom:1.1rem;font-size:.88rem;color:var(--text)">
      <i class="fas fa-info-circle" style="color:#facc15;font-size:1rem;flex-shrink:0"></i>
      <span>Damit die IC-Zeit automatisch getrackt wird, müssen Mitarbeiter einem <strong>„Im Dienst"</strong>-Voice-Kanal auf dem Discord-Server beitreten. Die Zeit wird beim Verlassen des Kanals automatisch eingetragen.</span>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-bottom:1.25rem">
      ${isAdmin() ? `<div style="display:flex;gap:.5rem">
        <button class="btn btn-primary" onclick="openLogTime()"><i class="fas fa-plus"></i> Manuell eintragen</button>
        <button class="btn btn-ghost" style="color:#ef4444;border-color:rgba(239,68,68,.3)" onclick="openResetIcModal()"><i class="fas fa-trash"></i> Zurücksetzen</button>
      </div>` : ''}
    </div>

    ${(active && active.length > 0) ? `
    <div class="card" style="margin-bottom:1.1rem;border:1px solid rgba(34,197,94,.25);background:rgba(34,197,94,.05)">
      <div class="card-head">
        <div class="card-head-icon" style="background:rgba(34,197,94,.15)"><i class="fas fa-circle" style="color:#22c55e;font-size:.6rem;animation:pulse 1.5s infinite"></i></div>
        <div><div class="card-title">Jetzt aktiv im Voice</div><div class="card-sub">${active.length} Mitarbeiter werden gerade getrackt</div></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.6rem;padding:.25rem 0">
        ${active.map(s => `
          <div style="display:flex;align-items:center;gap:.5rem;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);border-radius:8px;padding:.35rem .75rem;font-size:.85rem">
            <i class="fas fa-microphone" style="color:#22c55e;font-size:.75rem"></i>
            <span style="font-weight:600">${esc(s.username)}</span>
            <span style="color:var(--muted)">${esc(s.channelName)}</span>
            <span style="color:#22c55e;font-weight:700">${s.minutesSince} Min</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="stats-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:1.1rem">
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Gesamt IC-Stunden (Woche)</div><div class="stat-val o">${totalH.toFixed(1)}h</div></div>
        <div class="stat-ico o"><i class="fas fa-clock"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Aktive Mitarbeiter</div><div class="stat-val">${stats.length}</div></div>
        <div class="stat-ico g"><i class="fas fa-users"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Auto-Einträge</div><div class="stat-val b">${(log || []).filter(e => e.auto).length}</div></div>
        <div class="stat-ico b"><i class="fab fa-discord"></i></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.1rem">
      <div class="card">
        <div class="card-head"><div class="card-head-icon orange"><i class="fas fa-trophy"></i></div>
        <div><div class="card-title">Wochenrangliste</div><div class="card-sub">IC-Stunden diese Woche</div></div></div>
        ${stats.map((u, i) => {
          const pct = maxWeek > 0 ? Math.min((+u.week / maxWeek) * 100, 100) : 0;
          return `<div style="margin-bottom:.85rem">
            <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.35rem">
              <div class="rank-badge${i === 0 ? '' : i === 1 ? ' r2' : ' r3'}"${i > 2 ? ' style="background:#2a2a2a;color:var(--muted)"' : ''}>${i + 1}</div>
              <div style="flex-shrink:0">${avatarEl(u, 28)}</div>
              <div style="flex:1;font-size:.87rem;font-weight:600">${esc(u.username)}</div>
              <div style="font-size:.87rem;font-weight:700;color:var(--orange)">${(+u.week).toFixed(1)}h</div>
            </div>
            <div style="height:4px;background:#2a2a2a;border-radius:2px"><div style="height:100%;width:${pct}%;background:var(--orange);border-radius:2px;transition:width .4s"></div></div>
          </div>`;
        }).join('')}
      </div>

      <div class="card">
        <div class="card-head"><div class="card-head-icon blue"><i class="fas fa-table"></i></div>
        <div><div class="card-title">Übersicht</div><div class="card-sub">Woche / Monat / Gesamt</div></div></div>
        <div class="tbl-wrap">
          <table class="data-tbl">
            <thead><tr><th>Mitarbeiter</th><th>Woche</th><th>Monat</th><th>Gesamt</th></tr></thead>
            <tbody>
              ${stats.map(u => `<tr>
                <td style="font-weight:600;color:var(--text)">${esc(u.username)}</td>
                <td style="color:var(--orange)">${(+u.week).toFixed(1)}h</td>
                <td>${(+u.month).toFixed(1)}h</td>
                <td style="color:var(--muted)">${(+u.total).toFixed(1)}h</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:1.1rem">
      <div class="card-head"><div class="card-head-icon green"><i class="fas fa-list-ul"></i></div>
      <div><div class="card-title">IC-Zeit Log</div><div class="card-sub">Letzte Einträge — <i class="fab fa-discord" style="color:#5865f2"></i> = automatisch via Bot</div></div></div>
      <div class="tbl-wrap">
        <table class="data-tbl">
          <thead><tr><th>Datum</th><th>Mitarbeiter</th><th>Stunden</th><th>Notizen</th><th>Quelle</th>${isAdmin() ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${(log || []).length ? log.map(e => `<tr>
              <td>${fmt(e.date)}</td>
              <td style="font-weight:600;color:var(--text)">${esc(e.user_name)}</td>
              <td style="color:var(--orange);font-weight:700">${(+e.hours).toFixed(1)}h</td>
              <td style="color:var(--muted)">${esc(e.notes || '—')}</td>
              <td>${e.auto ? '<span class="badge badge-b"><i class="fab fa-discord"></i> Bot</span>' : `<span class="badge badge-m">${esc(e.logged_by_name || 'Manuell')}</span>`}</td>
              ${isAdmin() ? `<td><button class="btn btn-danger btn-sm" onclick="deleteIcEntry(${e.id})"><i class="fas fa-trash"></i></button></td>` : ''}
            </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem">Keine Einträge – Bot läuft noch nicht?</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

window.openLogTime = async () => {
  const users = await api('/api/users');
  openModal(`
    <div class="modal-head"><div class="modal-title"><i class="fas fa-clock" style="color:var(--orange);margin-right:.5rem"></i>IC-Zeit manuell eintragen</div>
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <form onsubmit="submitIcTime(event)">
      <div class="form-group"><label>Mitarbeiter</label>
        <select class="form-control" id="icUser">${(users || []).map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join('')}</select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Stunden</label><input type="number" class="form-control" id="icHours" step="0.5" min="0.5" max="24" value="2" required></div>
        <div class="form-group"><label>Datum</label><input type="date" class="form-control" id="icDate" value="${new Date().toISOString().split('T')[0]}" required></div>
      </div>
      <div class="form-group"><label>Session / Notizen</label><input class="form-control" id="icNotes" placeholder="z. B. PKW-Prüfungsschicht"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
      </div>
    </form>`);
};

// BATCH 6: Geburtstag speichern
window.saveBirthday = async () => {
  const val = ($('birthdayInput')?.value || '').trim();
  if (!/^\d{2}-\d{2}$/.test(val)) { toast('Format: MM-TT (z.B. 06-15)', 'err'); return; }
  const r = await api('/api/birthday', { method: 'POST', body: { birthday: val } });
  if (r) toast('Geburtstag gespeichert!', 'ok');
};

window.openGoalModal = (current) => openModal(`
  <div class="modal-head"><div class="modal-title"><i class="fas fa-bullseye" style="color:var(--orange);margin-right:.5rem"></i>Wochenziel setzen</div>
  <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
  <p style="color:var(--muted);font-size:.85rem;margin-bottom:1rem">Wie viele Stunden möchtest du diese Woche als IC-Zeit erreichen?</p>
  <form onsubmit="saveGoal(event)">
    <div class="form-group"><label>Stunden pro Woche</label>
      <input type="number" class="form-control" id="goalInput" value="${current || ''}" min="0" max="200" step="0.5" placeholder="z.B. 10">
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
    </div>
  </form>`);

window.saveGoal = async e => {
  e.preventDefault();
  const goal = parseFloat($('goalInput').value) || 0;
  const r = await api('/api/users/me/goal', { method: 'PATCH', body: { goal } });
  if (r) { closeModal(); toast('Ziel gespeichert!', 'ok'); iczeit(); }
};

window.submitIcTime = async e => {
  e.preventDefault();
  const r = await api('/api/ic-log', { method: 'POST', body: { user_id: +$('icUser').value, hours: +$('icHours').value, date: $('icDate').value, notes: $('icNotes').value.trim() }});
  if (r) { closeModal(); toast('Gespeichert!', 'ok'); iczeit(); }
};

window.deleteIcEntry = async id => {
  const r = await api(`/api/ic-log/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht.', 'ok'); iczeit(); }
};

window.openResetIcModal = () => {
  openModal(`
    <div class="modal-head">
      <div class="modal-title" style="color:#ef4444"><i class="fas fa-trash" style="margin-right:.5rem"></i>IC-Zeit zurücksetzen</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <p style="color:var(--muted);font-size:.88rem;margin-bottom:1.25rem">Wähle welcher Zeitraum gelöscht werden soll. Diese Aktion ist unwiderruflich.</p>
    <div style="display:flex;flex-direction:column;gap:.6rem">
      <button class="btn btn-ghost" style="justify-content:flex-start;gap:.75rem" onclick="confirmResetIc('week')">
        <i class="fas fa-calendar-week" style="color:var(--orange);width:18px;text-align:center"></i>
        <div style="text-align:left"><div style="font-weight:600">Diese Woche</div><div style="font-size:.78rem;color:var(--muted)">Alle Einträge der aktuellen Woche löschen</div></div>
      </button>
      <button class="btn btn-ghost" style="justify-content:flex-start;gap:.75rem" onclick="confirmResetIc('month')">
        <i class="fas fa-calendar-alt" style="color:var(--blue);width:18px;text-align:center"></i>
        <div style="text-align:left"><div style="font-weight:600">Diesen Monat</div><div style="font-size:.78rem;color:var(--muted)">Alle Einträge des aktuellen Monats löschen</div></div>
      </button>
      <button class="btn btn-ghost" style="justify-content:flex-start;gap:.75rem;border-color:rgba(239,68,68,.3)" onclick="confirmResetIc('all')">
        <i class="fas fa-database" style="color:#ef4444;width:18px;text-align:center"></i>
        <div style="text-align:left"><div style="font-weight:600;color:#ef4444">Gesamte Historie</div><div style="font-size:.78rem;color:var(--muted)">Alle IC-Zeit Einträge unwiderruflich löschen</div></div>
      </button>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`);
};

window.confirmResetIc = async scope => {
  const labels = { week: 'Diese Woche', month: 'Diesen Monat', all: 'Gesamte Historie' };
  const warn = scope === 'all'
    ? `Wirklich die GESAMTE IC-Zeit-Historie unwiderruflich löschen? Das kann nicht rückgängig gemacht werden!`
    : `IC-Zeit für „${labels[scope]}" wirklich unwiderruflich löschen?`;
  if (!confirm(warn)) return;
  const r = await api('/api/ic-log/reset', { method: 'POST', body: { scope } });
  if (r?.ok) { toast(`IC-Zeit (${labels[scope]}) zurückgesetzt`, 'ok'); closeModal(); iczeit(); }
};

// ════════════════════════════════════════════════════════════════
//  BANS
// ════════════════════════════════════════════════════════════════
async function bans() {
  const rows = await api('/api/bans');
  if (!rows) return;
  const active = rows.filter(b => b.is_active);

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left"><h2>Aktive Sperren</h2><p>${active.length} aktive Hausverbote</p></div>
      <button class="btn btn-primary" onclick="openAddBan()"><i class="fas fa-plus"></i> Sperre eintragen</button>
    </div>
    <div class="tbl-wrap">
      <table class="data-tbl">
        <thead><tr><th>Person</th><th>ID</th><th>Grund</th><th>Ausgestellt von</th><th>Dauer</th><th>Datum</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map(b => `<tr>
            <td style="font-weight:600;color:var(--text)">${esc(b.person_name)}</td>
            <td>${b.person_id || '—'}</td>
            <td>${esc(b.reason)}</td>
            <td>${b.issued_by_name}</td>
            <td>${b.duration_days ? b.duration_days + ' Tage' : 'Permanent'}</td>
            <td>${fmt(b.issued_at)}</td>
            <td><span class="badge ${b.is_active ? 'badge-r' : 'badge-m'}">${b.is_active ? 'Aktiv' : 'Aufgehoben'}</span></td>
            <td><div style="display:flex;gap:.4rem">
              ${b.is_active ? `<button class="btn btn-success btn-sm" onclick="liftBan(${b.id})"><i class="fas fa-unlock"></i></button>` : ''}
              ${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="deleteBan(${b.id})"><i class="fas fa-trash"></i></button>` : ''}
            </div></td>
          </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:2rem">Keine Sperren</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

window.openAddBan = () => openModal(`
  <div class="modal-head"><div class="modal-title"><i class="fas fa-ban" style="color:var(--red);margin-right:.5rem"></i>Sperre eintragen</div>
  <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
  <form onsubmit="submitBan(event)">
    <div class="form-row">
      <div class="form-group"><label>Name</label><input class="form-control" id="bName" required></div>
      <div class="form-group"><label>Spieler-ID</label><input class="form-control" id="bId" placeholder="CF-0000"></div>
    </div>
    <div class="form-group"><label>Grund</label><input class="form-control" id="bReason" required></div>
    <div class="form-group"><label>Dauer in Tagen (0 = permanent)</label><input type="number" class="form-control" id="bDays" value="30" min="0"></div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button type="submit" class="btn btn-danger"><i class="fas fa-ban"></i> Sperren</button>
    </div>
  </form>`);

window.submitBan = async e => {
  e.preventDefault();
  const r = await api('/api/bans', { method: 'POST', body: { person_name: $('bName').value.trim(), person_id: $('bId').value.trim(), reason: $('bReason').value.trim(), duration_days: +$('bDays').value }});
  if (r) { closeModal(); toast('Sperre eingetragen.', 'ok'); bans(); }
};

window.liftBan = async id => {
  const r = await api(`/api/bans/${id}/lift`, { method: 'PATCH' });
  if (r) { toast('Sperre aufgehoben.', 'ok'); bans(); }
};

window.deleteBan = async id => {
  const r = await api(`/api/bans/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht.', 'ok'); bans(); }
};

// ════════════════════════════════════════════════════════════════
//  PREISLISTE
// ════════════════════════════════════════════════════════════════
async function prices() {
  const rows = await api('/api/prices');
  if (!rows) return;

  const cats = {};
  rows.forEach(r => { if (!cats[r.category]) cats[r.category] = []; cats[r.category].push(r); });

  const CAT_META = {
    'Werkstatt':    { icon: 'fa-wrench', col: '#f97316', sub: 'Reparatur, Tuning & Abschleppdienst' },
    'Fahrschule':   { icon: 'fa-graduation-cap', col: '#22c55e', sub: 'Rechnungspreis – wird automatisch vom Konto abgezogen' },
    'Kundenpreise': { icon: 'fa-hand-holding-usd', col: '#38bdf8', sub: 'Bar auf Hand' },
  };

  const canEdit = isAdmin() || currentUser?.role === 'member' || currentUser?.role === 'ausbilder';

  window._priceRows = rows;

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left"><h2>Preisliste</h2><p>${rows.length} Einträge in ${Object.keys(cats).length} Kategorien</p></div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-ghost" onclick="openRechnungModal()" style="color:#22c55e;border-color:rgba(34,197,94,.3)"><i class="fas fa-file-invoice" style="margin-right:.4rem"></i>Rechnung erstellen</button>
        ${canEdit ? `<button class="btn btn-primary" onclick="openAddPrice()"><i class="fas fa-plus"></i> Preis hinzufügen</button>` : ''}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1rem">
      ${Object.entries(cats).map(([cat, items]) => {
        const m = CAT_META[cat] || { icon: 'fa-tag', col: '#6b7280', sub: '' };
        return `
        <div class="card">
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid var(--border)">
            <div style="width:38px;height:38px;border-radius:10px;background:${m.col}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="fas ${m.icon}" style="color:${m.col};font-size:1rem"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:.98rem">${cat}</div>
              ${m.sub ? `<div style="font-size:.72rem;color:var(--muted)">${m.sub}</div>` : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:.5rem">
            ${items.map(item => `
            <div style="display:flex;align-items:center;gap:.75rem;padding:.55rem .65rem;border-radius:8px;background:var(--surface2);transition:background .15s" onmouseover="this.style.background='var(--surface3)'" onmouseout="this.style.background='var(--surface2)'">
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:.88rem">${esc(item.name)}</div>
                ${item.notes ? `<div style="font-size:.72rem;color:var(--muted);margin-top:.1rem">${esc(item.notes)}</div>` : ''}
              </div>
              <div style="font-size:.95rem;font-weight:800;color:${m.col};white-space:nowrap">${esc(item.price)}</div>
              ${canEdit ? `
              <div style="display:flex;gap:.3rem;flex-shrink:0">
                <button class="btn btn-ghost btn-sm" title="Bearbeiten" onclick="openEditPrice(${item.id},'${encodeURIComponent(JSON.stringify(item))}')"><i class="fas fa-pen" style="font-size:.7rem"></i></button>
                <button class="btn btn-danger btn-sm" title="Löschen" onclick="deletePrice(${item.id})"><i class="fas fa-trash" style="font-size:.7rem"></i></button>
              </div>` : ''}
            </div>`).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

window.openRechnungModal = () => {
  const rows = window._priceRows || [];
  const cats = {};
  rows.forEach(r => { if (!cats[r.category]) cats[r.category] = []; cats[r.category].push(r); });

  const catHtml = Object.entries(cats).map(([cat, items]) => `
    <div style="margin-bottom:1rem">
      <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:.5rem;display:flex;align-items:center;gap:.5rem">
        ${esc(cat)}<div style="flex:1;height:1px;background:var(--border)"></div>
      </div>
      ${items.map(item => `
      <label style="display:flex;align-items:center;gap:.65rem;padding:.45rem .6rem;border-radius:8px;cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <input type="checkbox" class="rech-check" data-id="${item.id}" data-name="${item.name.replace(/"/g,'&quot;')}" data-price="${item.price}" data-notes="${(item.notes||'').replace(/"/g,'&quot;')}" data-cat="${cat.replace(/"/g,'&quot;')}" onchange="rechUpdateTotal()" style="width:16px;height:16px;accent-color:var(--orange);flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-size:.85rem;font-weight:600">${esc(item.name)}</div>
          ${item.notes ? `<div style="font-size:.7rem;color:var(--muted)">${esc(item.notes)}</div>` : ''}
        </div>
        <span style="font-size:.85rem;font-weight:700;color:#22c55e;white-space:nowrap">${esc(item.price)}</span>
        <input type="number" class="rech-qty form-control" data-id="${item.id}" value="1" min="1" max="99"
          style="width:52px;padding:.2rem .35rem;font-size:.82rem;text-align:center;display:none"
          oninput="rechUpdateTotal()" onclick="event.stopPropagation()">
      </label>`).join('')}
    </div>`).join('');

  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-file-invoice" style="color:#22c55e;margin-right:.5rem"></i>Rechnung erstellen</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="form-group" style="margin-bottom:1rem">
      <label>Kunde / Organisation</label>
      <input class="form-control" id="rechKunde" placeholder="z.B. Federal Investigation Bureau (FIB)">
    </div>
    <div style="max-height:320px;overflow-y:auto;padding-right:.25rem;margin-bottom:.75rem">
      ${catHtml}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.65rem .85rem;background:var(--surface2);border-radius:8px;margin-bottom:1rem">
      <span style="font-size:.85rem;font-weight:600;color:var(--muted)">Gesamt</span>
      <span id="rechTotal" style="font-size:1.05rem;font-weight:800;color:#22c55e">0 $</span>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="generateRechnung()" style="background:#22c55e;border-color:#22c55e"><i class="fas fa-file-pdf" style="margin-right:.4rem"></i>PDF erstellen</button>
    </div>`);
};

window.rechUpdateTotal = () => {
  let total = 0;
  let allParseable = true;
  document.querySelectorAll('.rech-check:checked').forEach(cb => {
    const qty = parseInt(document.querySelector(`.rech-qty[data-id="${cb.dataset.id}"]`)?.value) || 1;
    const qtyEl = document.querySelector(`.rech-qty[data-id="${cb.dataset.id}"]`);
    if (qtyEl) qtyEl.style.display = '';
    const raw = cb.dataset.price.replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const val = parseFloat(raw);
    if (!isNaN(val)) total += val * qty;
    else allParseable = false;
  });
  document.querySelectorAll('.rech-check:not(:checked)').forEach(cb => {
    const qtyEl = document.querySelector(`.rech-qty[data-id="${cb.dataset.id}"]`);
    if (qtyEl) qtyEl.style.display = 'none';
  });
  const el = document.getElementById('rechTotal');
  if (el) el.textContent = allParseable ? `${total.toLocaleString('de-DE')} $` : `${total.toLocaleString('de-DE')} $ (+)`;
};

window.generateRechnung = async () => {
  const checked = document.querySelectorAll('.rech-check:checked');
  if (!checked.length) { toast('Bitte mindestens eine Leistung auswählen', 'err'); return; }
  try { await loadLib('jspdf'); } catch { toast('PDF-Modul konnte nicht geladen werden', 'err'); return; }

  const kunde  = document.getElementById('rechKunde')?.value.trim() || 'Barzahler';
  const datum  = new Date().toLocaleDateString('de-DE');
  const nr     = `ACLS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
  const W = 210, H = 297;
  const navy   = [26,  39,  68];
  const gold   = [201,162,  39];
  const white  = [255,255, 255];
  const dark   = [30,  30,  50];
  const muted  = [100,105, 120];

  const items = [];
  let total = 0, hasUnparseable = false;
  let pos = 1;
  checked.forEach(cb => {
    const qty = parseInt(document.querySelector(`.rech-qty[data-id="${cb.dataset.id}"]`)?.value) || 1;
    const ps  = cb.dataset.price;
    const val = parseFloat(ps.replace(/\./g,'').replace(/,/g,'.').replace(/[^0-9.]/g,''));
    const gesamt = isNaN(val) ? null : val * qty;
    if (gesamt === null) hasUnparseable = true; else total += gesamt;
    items.push({
      pos: pos++,
      name: cb.dataset.name,
      notes: cb.dataset.notes || '',
      cat: cb.dataset.cat || '',
      qty,
      price: ps,
      gesamt: gesamt === null ? '—' : `${gesamt.toLocaleString('de-DE')} $`,
    });
  });

  const totalStr = hasUnparseable ? '—' : `${total.toLocaleString('de-DE')} $`;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ── HEADER BG ────────────────────────────────────────────────────
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 48, 'F');

  // ACLS circle logo (left)
  doc.setDrawColor(...gold);
  doc.setLineWidth(1);
  doc.circle(26, 24, 18);
  doc.setLineWidth(0.4);
  doc.circle(26, 24, 15.5);
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('ACLS', 26, 22, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(...gold);
  doc.text('AUTOMOBIL CLUB', 26, 27.5, { align: 'center' });
  doc.text('LOS SANTOS', 26, 31.5, { align: 'center' });

  // Gold decorative lines in circle
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.3);
  doc.line(14, 24.5, 38, 24.5);

  // Title center
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('AUTOMOBIL CLUB', 56, 18);
  doc.setFontSize(21);
  doc.text('LOS SANTOS', 56, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...gold);
  doc.text('SERVICE  ·  LEISTUNG  ·  VERTRAUEN', 56, 35);
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.4);
  doc.line(56, 38, 134, 38);

  // "RECHNUNG" right
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text('RECHNUNG', W - 14, 22, { align: 'right' });
  doc.setDrawColor(...gold);
  doc.setLineWidth(1.2);
  doc.line(W - 72, 26, W - 14, 26);

  // Gold bottom stripe on header
  doc.setFillColor(...gold);
  doc.rect(0, 48, W, 1.5, 'F');

  // ── INVOICE META (right) ────────────────────────────────────────
  const metaX = W - 14;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...muted);
  doc.text('Rechnungsnummer:', metaX, 58, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...dark);
  doc.setFontSize(9);
  doc.text(nr, metaX, 64, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text('Rechnungsdatum:', metaX, 72, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...dark);
  doc.setFontSize(9);
  doc.text(datum, metaX, 78, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text('Mitarbeiter:', metaX, 86, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...dark);
  doc.setFontSize(9);
  doc.text(currentUser?.username || '—', metaX, 92, { align: 'right' });

  // ── BILLING ADDRESS (left) ──────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  doc.text('Rechnung an:', 14, 58);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dark);
  doc.text(kunde, 14, 70);
  doc.setDrawColor(...navy);
  doc.setLineWidth(0.5);
  doc.line(14, 73, Math.min(14 + kunde.length * 4.2 + 10, 120), 73);

  // ── TABLE ───────────────────────────────────────────────────────
  const minRows = Math.max(items.length, 6);
  const tableBody = items.map(it => [
    it.pos.toString(),
    { content: it.name + (it.notes ? `\n${it.notes}` : ''), styles: it.notes ? { fontSize: 9 } : {} },
    it.qty.toString(),
    it.price,
    it.gesamt,
  ]);
  while (tableBody.length < minRows) tableBody.push([{ content: '\n', colSpan: 1 }, '', '', '', '']);

  doc.autoTable({
    startY: 80,
    head: [['POS.', 'BESCHREIBUNG', 'ANZAHL', 'EINZELPREIS', 'GESAMTPREIS']],
    body: tableBody,
    headStyles: {
      fillColor: navy, textColor: white, fontStyle: 'bold',
      fontSize: 8.5, halign: 'center',
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize: 9, textColor: dark, minCellHeight: 14,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 34, halign: 'right' },
      4: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [244, 246, 250] },
    margin: { left: 14, right: 14 },
    theme: 'grid',
    tableLineColor: [210, 215, 228],
    tableLineWidth: 0.18,
  });

  const tY = doc.lastAutoTable.finalY;

  // ── SUMMARY BOX (bottom-right) ──────────────────────────────────
  const bx = W - 14, bw = 72, bLeft = bx - bw;
  let sy = tY + 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  doc.text('Zwischensumme:', bLeft, sy);
  doc.setTextColor(...dark);
  doc.text(totalStr, bx, sy, { align: 'right' });

  sy += 7;
  doc.setTextColor(...muted);
  doc.text('Mehrwertsteuer (0 %):', bLeft, sy);
  doc.setTextColor(...dark);
  doc.text('0 $', bx, sy, { align: 'right' });

  sy += 4;
  doc.setFillColor(...navy);
  doc.roundedRect(bLeft - 4, sy, bw + 8, 12, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...white);
  doc.text('Gesamtsumme:', bLeft, sy + 8);
  doc.text(totalStr, bx, sy + 8, { align: 'right' });

  // ── PAYMENT INFO + SIGNATURE ────────────────────────────────────
  const botY = Math.max(sy + 22, H - 60);

  // Icon circles
  const drawIcon = (cx, cy, symbol) => {
    doc.setDrawColor(...navy);
    doc.setLineWidth(0.5);
    doc.circle(cx, cy, 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...navy);
    doc.text(symbol, cx, cy + 3, { align: 'center' });
  };
  drawIcon(20, botY + 4, '#');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dark);
  doc.text('ZAHLUNGSHINWEIS:', 28, botY + 2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  doc.text('Bitte uberweisen Sie den Betrag innerhalb von 14 Tagen.', 28, botY + 8);

  drawIcon(20, botY + 18, 'V');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dark);
  doc.text('ZAHLUNGSZIEL:', 28, botY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  doc.text('14 Tage nach Rechnungsdatum', 28, botY + 22);

  // Signature line (right)
  const sigMid = (bLeft + bx) / 2;
  doc.setDrawColor(...navy);
  doc.setLineWidth(0.4);
  doc.line(bLeft - 4, botY + 24, bx, botY + 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(currentUser?.username || 'Mitarbeiter', sigMid, botY + 29, { align: 'center' });
  doc.text('Automobil Club Los Santos', sigMid, botY + 34, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text('Vielen Dank fur Ihr Vertrauen!', 14, botY + 34);

  // ── FOOTER ─────────────────────────────────────────────────────
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.6);
  doc.line(14, H - 16, W - 14, H - 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...navy);
  doc.text('WIR BEWEGEN LOS SANTOS.', W / 2, H - 10, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(...gold);
  doc.text('★  ★  ★', W / 2, H - 5, { align: 'center' });

  doc.save(`Rechnung_${nr}_${datum.replace(/\./g, '-')}.pdf`);
  closeModal();
  toast('PDF erstellt!', 'ok');
};

window.openAddPrice = () => {
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-tags" style="color:var(--orange);margin-right:.5rem"></i>Preis hinzufügen</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <form onsubmit="submitPrice(event)">
      <div class="form-row">
        <div class="form-group"><label>Kategorie</label>
          <select class="form-control" id="pCat">
            <option>Werkstatt</option>
            <option>Fahrschule</option>
            <option>Kundenpreise</option>
            <option value="__custom__">Neue Kategorie…</option>
          </select>
        </div>
        <div class="form-group" id="pCatCustomWrap" style="display:none"><label>Kategoriename</label>
          <input class="form-control" id="pCatCustom" placeholder="z.B. Sonderleistungen">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Bezeichnung</label><input class="form-control" id="pName" placeholder="z.B. PKW" required></div>
        <div class="form-group"><label>Preis</label><input class="form-control" id="pPrice" placeholder="z.B. 1.000$" required></div>
      </div>
      <div class="form-group"><label>Hinweis (optional)</label><input class="form-control" id="pNotes" placeholder="z.B. Bar auf Hand"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
      </div>
    </form>`);
  document.getElementById('pCat').addEventListener('change', function() {
    const wrap = document.getElementById('pCatCustomWrap');
    wrap.style.display = this.value === '__custom__' ? '' : 'none';
  });
};

window.openEditPrice = (id, encoded) => {
  const item = JSON.parse(decodeURIComponent(encoded));
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-pen" style="color:var(--orange);margin-right:.5rem"></i>Preis bearbeiten</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <form onsubmit="submitEditPrice(event,${id})">
      <div class="form-row">
        <div class="form-group"><label>Kategorie</label><input class="form-control" id="epCat" value="${esc(item.category)}" required></div>
        <div class="form-group"><label>Bezeichnung</label><input class="form-control" id="epName" value="${esc(item.name)}" required></div>
      </div>
      <div class="form-group"><label>Preis</label><input class="form-control" id="epPrice" value="${esc(item.price)}" required></div>
      <div class="form-group"><label>Hinweis (optional)</label><input class="form-control" id="epNotes" value="${esc(item.notes||'')}"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
      </div>
    </form>`);
};

window.submitPrice = async e => {
  e.preventDefault();
  const catSel = document.getElementById('pCat').value;
  const category = catSel === '__custom__' ? document.getElementById('pCatCustom').value.trim() : catSel;
  if (!category) return;
  const r = await api('/api/prices', { method: 'POST', body: {
    category,
    name:  document.getElementById('pName').value,
    price: document.getElementById('pPrice').value,
    notes: document.getElementById('pNotes').value,
  }});
  if (r) { closeModal(); toast('Preis gespeichert!', 'ok'); prices(); }
};

window.submitEditPrice = async (e, id) => {
  e.preventDefault();
  const r = await api(`/api/prices/${id}`, { method: 'PATCH', body: {
    category: document.getElementById('epCat').value,
    name:     document.getElementById('epName').value,
    price:    document.getElementById('epPrice').value,
    notes:    document.getElementById('epNotes').value,
  }});
  if (r) { closeModal(); toast('Gespeichert!', 'ok'); prices(); }
};

window.deletePrice = async id => {
  if (!confirm('Preis löschen?')) return;
  const r = await api(`/api/prices/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht.', 'ok'); prices(); }
};

// ════════════════════════════════════════════════════════════════
//  FAHRZEUGMARKT
// ════════════════════════════════════════════════════════════════
//  ORGANIGRAMM
// ════════════════════════════════════════════════════════════════
async function organigramm() {
  const staff = await api('/api/organigramm');
  if (!staff) return;
  const leitung     = staff.filter(u => u.rank === 'Rang 12');
  const leitungIds  = new Set(leitung.map(u => u.id));
  const admins      = staff.filter(u => u.role === 'admin'     && !leitungIds.has(u.id));
  const ausbilder   = staff.filter(u => u.role === 'ausbilder' && !leitungIds.has(u.id));
  const mitarbeiter = staff.filter(u => u.role !== 'admin' && u.role !== 'ausbilder' && !leitungIds.has(u.id));

  function memberCard(u, isLeitung = false) {
    const glow = frameGlow(u.equipped_frame);
    const _avSrc = u.avatar_custom || (u.avatar && u.discord_id ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=128` : null);
    const av = _avSrc
      ? `<img src="${_avSrc}" style="width:${isLeitung?80:64}px;height:${isLeitung?80:64}px;border-radius:50%;object-fit:cover;${glow}${isLeitung?'border:2px solid #c9a227':''}" onerror="this.outerHTML='<div style=\'width:${isLeitung?80:64}px;height:${isLeitung?80:64}px;border-radius:50%;background:${isLeitung?'#c9a227':'var(--orange)'};display:flex;align-items:center;justify-content:center;font-size:${isLeitung?'1.8':'1.5'}rem;font-weight:700\'>${(u.username||'?')[0].toUpperCase()}</div>'">`
      : `<div style="width:${isLeitung?80:64}px;height:${isLeitung?80:64}px;border-radius:50%;background:${isLeitung?'#c9a227':'var(--orange)'};display:flex;align-items:center;justify-content:center;font-size:${isLeitung?'1.8':'1.5'}rem;font-weight:700;${glow}">${(u.username||'?')[0].toUpperCase()}</div>`;
    const roleColor = isLeitung ? '#c9a227' : u.role === 'admin' ? '#f97316' : u.role === 'ausbilder' ? '#60a5fa' : 'var(--muted)';
    const roleName  = isLeitung ? 'Rang 12' : u.role === 'admin' ? 'Administration' : u.role === 'ausbilder' ? 'Ausbilder' : 'Mitarbeiter';
    const roleBg    = isLeitung ? 'rgba(201,162,39,.18)' : u.role === 'admin' ? 'rgba(249,115,22,.15)' : u.role === 'ausbilder' ? 'rgba(96,165,250,.12)' : 'rgba(255,255,255,.06)';
    const borderCol = isLeitung ? 'rgba(201,162,39,.5)' : u.role === 'admin' ? 'rgba(249,115,22,.35)' : u.role === 'ausbilder' ? 'rgba(96,165,250,.25)' : 'var(--border)';
    const crownIcon = isLeitung ? '<i class="fas fa-crown" style="color:#c9a227;font-size:.85rem"></i>' : '';
    return `<div onclick="openSteckbrief(${u.id})" title="Steckbrief öffnen" style="cursor:pointer;background:var(--surface);border:1px solid ${borderCol};border-radius:var(--r);padding:1.25rem 1rem;display:flex;flex-direction:column;align-items:center;gap:.55rem;text-align:center;transition:transform .12s,box-shadow .12s${isLeitung?';box-shadow:0 0 18px rgba(201,162,39,.18)':''}" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px ${isLeitung?'rgba(201,162,39,.25)':'rgba(0,0,0,.25)'}'" onmouseout="this.style.transform='';this.style.boxShadow='${isLeitung?'0 0 18px rgba(201,162,39,.18)':''}'">
      ${crownIcon}
      ${av}
      <div style="font-weight:700;font-size:${isLeitung?'1rem':'.95rem'};${nameColorCss(u.equipped_namecolor)}">${decoEmoji(u.equipped_deco)}${esc(u.username)}</div>
      ${titleLine(u.equipped_title)}
      ${(u.honorary_titles||[]).length ? `<div style="display:flex;flex-wrap:wrap;gap:.25rem;justify-content:center">${(u.honorary_titles).map(t=>`<span style="font-size:.62rem;font-weight:700;padding:.12rem .4rem;border-radius:999px;background:rgba(251,191,36,.1);border:1px solid ${t.color||'#fbbf24'}44;color:${t.color||'#fbbf24'};white-space:nowrap">${t.icon||'⭐'} ${esc(t.title)}</span>`).join('')}</div>` : ''}
      <span style="font-size:.7rem;font-weight:700;padding:.18rem .6rem;border-radius:20px;background:${roleBg};color:${roleColor}">${roleName}</span>
    </div>`;
  }

  function tier(label, icon, color, members, isLeitung = false) {
    if (!members.length) return '';
    return `<div style="margin-bottom:2rem">
      <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${color};margin-bottom:.85rem;display:flex;align-items:center;gap:.6rem">
        <i class="fas ${icon}"></i>${label}
        <div style="flex:1;height:1px;background:${isLeitung?'rgba(201,162,39,.35)':'var(--border)'}"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${isLeitung?180:160}px,1fr));gap:.85rem">
        ${members.map(u => memberCard(u, isLeitung)).join('')}
      </div>
    </div>`;
  }

  $('pageContent').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:.75rem">
      <div></div>
      <a href="/team" target="_blank" class="btn btn-ghost btn-sm"><i class="fas fa-external-link-alt"></i> Öffentliche Seite</a>
    </div>
    ${tier('Leitung', 'fa-crown', '#c9a227', leitung, true)}
    ${tier('Administration', 'fa-shield-alt', '#f97316', admins)}
    ${tier('Ausbilder', 'fa-graduation-cap', '#60a5fa', ausbilder)}
    ${tier('Mitarbeiter', 'fa-users', 'var(--muted)', mitarbeiter)}
    ${!staff.length ? '<div class="empty"><i class="fas fa-users"></i><p>Keine aktiven Mitarbeiter</p></div>' : ''}`;
}

// ── Steckbrief-Modal (in-page) ─────────────────────────────────
window.openSteckbrief = async function(userId) {
  $('modalBox').style.maxWidth = '700px';
  $('modalBox').style.padding  = '0';
  $('modalBox').innerHTML = `<div style="padding:2rem;text-align:center"><div class="loader"></div></div>`;
  $('modalOverlay').classList.remove('hidden');

  const [profileRes, gbRes] = await Promise.all([
    fetch('/api/profile/' + userId),
    fetch('/api/guestbook/' + userId),
  ]);

  if (!profileRes.ok) {
    $('modalBox').innerHTML = `<div style="padding:2rem;text-align:center;color:var(--muted)"><i class="fas fa-user-slash" style="font-size:2rem;margin-bottom:.75rem;display:block"></i>Profil nicht gefunden.</div>`;
    return;
  }
  const d  = await profileRes.json();
  const gb = gbRes.ok ? await gbRes.json() : [];
  const u  = d.user, s = d.stats;

  const ROLE_LABEL = { admin:'Administration', ausbilder:'Ausbilder', member:'Mitarbeiter' };
  const ROLE_COLOR = { admin:'#f97316', ausbilder:'#60a5fa', member:'var(--muted)' };
  const ROLE_BG    = { admin:'rgba(249,115,22,.15)', ausbilder:'rgba(96,165,250,.12)', member:'rgba(255,255,255,.06)' };

  const _steckSrc = u.avatar_custom || (u.avatar && u.discord_id ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=128` : null);
  const av = _steckSrc
    ? `<img src="${_steckSrc}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div style="width:72px;height:72px;border-radius:50%;background:var(--surface2);display:none;align-items:center;justify-content:center;font-size:1.6rem;font-weight:800;flex-shrink:0">${esc((u.username||'?').slice(0,2).toUpperCase())}</div>`
    : `<div style="width:72px;height:72px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:800;flex-shrink:0">${esc((u.username||'?').slice(0,2).toUpperCase())}</div>`;

  const honoraryTitles = d.honoraryTitles || [];
  const passRate = s.conducted > 0 ? Math.round((s.passed_exams / s.total_exams) * 100) : 0;
  const memberSince = new Date(u.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' });

  const BICONS = { ic_10:'fa-clock',ic_50:'fa-hourglass-half',ic_100:'fa-hourglass-end',ic_250:'fa-star',ic_500:'fa-crown',exams_10:'fa-clipboard-check',exams_50:'fa-clipboard-check',exams_100:'fa-clipboard-check',eow_1:'fa-trophy',eow_3:'fa-trophy',eow_5:'fa-trophy',cat_pkw:'fa-car',cat_motorrad:'fa-motorcycle',cat_boot:'fa-ship',cat_lkw:'fa-truck',cat_flugschein:'fa-plane',game_3:'fa-gamepad',game_10:'fa-gamepad',duel_5:'fa-bolt',duel_25:'fa-bolt',tow_pro:'fa-truck-pickup',bj_500:'fa-heart',coins_1k:'fa-coins',coins_10k:'fa-coins',streak_7:'fa-fire',streak_30:'fa-fire' };
  const BNAMES = { ic_10:'10h IC',ic_50:'50h IC',ic_100:'100h IC',ic_250:'250h IC',ic_500:'500h IC',exams_10:'10 Prüfungen',exams_50:'50 Prüfungen',exams_100:'100 Prüfungen',eow_1:'1× MdW',eow_3:'3× MdW',eow_5:'5× MdW',cat_pkw:'PKW',cat_motorrad:'Motorrad',cat_boot:'Boot',cat_lkw:'LKW',cat_flugschein:'Flugschein',game_3:'Spieler',game_10:'Zocker',duel_5:'Duellant',duel_25:'Duell-Meister',tow_pro:'Abschlepp-Profi',bj_500:'High Roller',coins_1k:'Sparer',coins_10k:'Krösus',streak_7:'7-Tage-Serie',streak_30:'30-Tage-Serie' };

  function gbEntry(e) {
    const eAv = e.author_avatar && e.author_discord_id
      ? `<img src="https://cdn.discordapp.com/avatars/${e.author_discord_id}/${e.author_avatar}.png" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0">`
      : `<div style="width:28px;height:28px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700;flex-shrink:0">${esc((e.author_name||'?').slice(0,2).toUpperCase())}</div>`;
    const canDel = currentUser && (currentUser.id === e.author_id || currentUser.id === +userId || isAdmin());
    return `<div style="display:flex;gap:.6rem;padding:.6rem 0;border-bottom:1px solid var(--border)">
      ${eAv}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap">
          <span style="font-weight:700;font-size:.8rem">${esc(e.author_name)}</span>
          <span style="font-size:.67rem;color:var(--muted)">${ago(e.created_at)}</span>
          ${canDel ? `<button onclick="sbDeleteGb(${e.id},${userId})" style="margin-left:auto;background:none;border:none;color:var(--muted);cursor:pointer;font-size:.7rem"><i class="fas fa-trash"></i></button>` : ''}
        </div>
        <div style="font-size:.82rem;margin-top:.1rem;white-space:pre-wrap;word-break:break-word">${esc(e.message)}</div>
      </div>
    </div>`;
  }

  $('modalBox').innerHTML = `
    <div style="padding:1.25rem 1.5rem;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
        <span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Steckbrief</span>
        <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        ${av}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
            <span style="font-size:1.15rem;font-weight:800">${esc(u.username)}</span>
            <span style="font-size:.68rem;font-weight:700;padding:.18rem .55rem;border-radius:20px;background:${ROLE_BG[u.role]||'rgba(255,255,255,.06)'};color:${ROLE_COLOR[u.role]||'var(--muted)'}">${ROLE_LABEL[u.role]||u.role}</span>
            ${u.rank ? `<span style="font-size:.68rem;color:var(--muted)">${esc(u.rank)}</span>` : ''}
          </div>
          ${honoraryTitles.length ? `<div style="display:flex;flex-wrap:wrap;gap:.3rem;margin:.35rem 0">
            ${honoraryTitles.map(t=>`<span style="font-size:.67rem;font-weight:700;padding:.15rem .5rem;border-radius:999px;background:rgba(251,191,36,.1);border:1px solid ${t.color||'#fbbf24'}55;color:${t.color||'#fbbf24'}">${t.icon||'⭐'} ${esc(t.title)}</span>`).join('')}
          </div>` : ''}
          <div style="font-size:.73rem;color:var(--muted)">Dabei seit ${memberSince}</div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;padding:.9rem 1.5rem;border-bottom:1px solid var(--border)">
      ${[
        { val: s.conducted,              lbl: 'Prüfungen',    color: '#f97316' },
        { val: s.eow_wins,               lbl: 'MdW-Titel',    color: '#22c55e' },
        { val: (+s.ic_total).toFixed(1)+'h', lbl: 'IC gesamt', color: '#60a5fa' },
        { val: (+s.ic_week).toFixed(1)+'h',  lbl: 'IC Woche',  color: '#fbbf24' },
      ].map(st => `<div style="text-align:center;background:var(--surface2);border-radius:9px;padding:.6rem .4rem">
        <div style="font-size:1.1rem;font-weight:800;color:${st.color}">${st.val}</div>
        <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-top:.1rem">${st.lbl}</div>
      </div>`).join('')}
    </div>

    <div style="padding:1rem 1.5rem;max-height:52vh;overflow-y:auto;display:flex;flex-direction:column;gap:1rem">
      ${s.conducted > 0 ? `<div>
        <div style="font-size:.63rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.45rem">Prüfungsquote</div>
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.3rem">
          <span>${passRate}% Bestehensquote</span><span style="color:var(--muted)">${s.total_exams} Prüfungen</span>
        </div>
        <div style="height:5px;background:var(--surface2);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${passRate}%;background:${passRate>=70?'#22c55e':'#f97316'};border-radius:3px"></div>
        </div>
        ${d.byCategory?.length ? `<div style="margin-top:.5rem;display:flex;flex-wrap:wrap;gap:.3rem">${d.byCategory.map(c=>`<span style="font-size:.65rem;background:var(--surface2);border-radius:999px;padding:.12rem .5rem;border:1px solid var(--border)">${esc(c.category)}: ${c.count}×</span>`).join('')}</div>` : ''}
      </div>` : ''}

      ${d.badges?.length ? `<div>
        <div style="font-size:.63rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.45rem">Abzeichen (${d.badges.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:.3rem">
          ${d.badges.map(b=>`<span style="display:inline-flex;align-items:center;gap:.3rem;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:.22rem .6rem;font-size:.7rem;font-weight:600" title="${new Date(b.earned_at).toLocaleDateString('de-DE')}"><i class="fas ${BICONS[b.badge_type]||'fa-award'}" style="color:#f97316;font-size:.72rem"></i>${BNAMES[b.badge_type]||b.badge_type}</span>`).join('')}
        </div>
      </div>` : ''}

      <div>
        <div style="font-size:.63rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.5rem">📖 Gästebuch</div>
        ${currentUser ? `<div style="display:flex;gap:.5rem;margin-bottom:.65rem">
          <textarea id="sb-gb-${userId}" maxlength="300" rows="2" placeholder="Hinterlasse ${esc(u.username)} eine Nachricht…" class="input" style="flex:1;resize:vertical;font-size:.8rem"></textarea>
          <button class="btn btn-primary btn-sm" style="align-self:flex-end;white-space:nowrap" onclick="sbPostGb(${userId})"><i class="fas fa-paper-plane"></i></button>
        </div>` : `<div style="font-size:.73rem;color:var(--muted);margin-bottom:.5rem">Als Mitarbeiter anmelden um Einträge zu hinterlassen.</div>`}
        <div>${gb.length ? gb.map(gbEntry).join('') : `<div style="font-size:.75rem;color:var(--muted)">Noch keine Einträge – sei der Erste! ✍️</div>`}</div>
      </div>
    </div>`;
};

window.sbPostGb = async function(userId) {
  const input = document.getElementById('sb-gb-' + userId);
  const message = input?.value.trim();
  if (!message || message.length < 2) return;
  const r = await fetch('/api/guestbook/' + userId, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (r.ok) { input.value = ''; openSteckbrief(userId); }
  else { const d = await r.json().catch(() => null); toast(d?.error || 'Fehler', 'err'); }
};

window.sbDeleteGb = async function(entryId, userId) {
  const r = await fetch('/api/guestbook/' + entryId, { method: 'DELETE' });
  if (r.ok) openSteckbrief(userId);
};

function steckbrief() { navigate('organigramm'); }

// ════════════════════════════════════════════════════════════════
//  BEWERBUNGEN (Staff)
// ════════════════════════════════════════════════════════════════
async function applications() {
  const rows = await api('/api/applications');
  if (!rows) return;
  const pending  = rows.filter(r => r.status === 'pending');
  const decided  = rows.filter(r => r.status !== 'pending');

  function statusBadge(s) {
    if (s === 'pending')  return '<span style="background:rgba(251,191,36,.15);color:#fbbf24;font-size:.7rem;font-weight:700;padding:.18rem .55rem;border-radius:20px"><i class="fas fa-clock" style="margin-right:.3rem"></i>Ausstehend</span>';
    if (s === 'accepted') return '<span style="background:rgba(34,197,94,.12);color:#22c55e;font-size:.7rem;font-weight:700;padding:.18rem .55rem;border-radius:20px"><i class="fas fa-check" style="margin-right:.3rem"></i>Angenommen</span>';
    return '<span style="background:rgba(239,68,68,.12);color:#ef4444;font-size:.7rem;font-weight:700;padding:.18rem .55rem;border-radius:20px"><i class="fas fa-times" style="margin-right:.3rem"></i>Abgelehnt</span>';
  }

  function appCard(a, showActions) {
    return `<div class="card" style="display:flex;flex-direction:column;gap:.75rem">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;flex-wrap:wrap">
        <div>
          <div style="font-weight:700;font-size:1rem">${esc(a.discord_username)} <span style="font-size:.8rem;font-weight:400;color:var(--muted)">· ${esc(a.ic_name)}${a.ic_age ? ', ' + esc(a.ic_age) + ' J.' : ''}</span></div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:.15rem">${new Date(a.created_at).toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <div style="display:flex;align-items:center;gap:.5rem">${statusBadge(a.status)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
        <div>
          <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.3rem">Vorerfahrung</div>
          <div style="font-size:.85rem;line-height:1.5;color:var(--text)">${esc(a.experience)}</div>
        </div>
        <div>
          <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.3rem">Verfügbarkeit</div>
          <div style="font-size:.85rem;line-height:1.5;color:var(--text)">${esc(a.availability)}</div>
        </div>
      </div>
      <div>
        <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.3rem">Motivation</div>
        <div style="font-size:.85rem;line-height:1.5;color:var(--text)">${esc(a.motivation)}</div>
      </div>
      ${a.admin_note ? `<div style="background:var(--surface2);border-left:3px solid var(--orange);border-radius:0 6px 6px 0;padding:.5rem .75rem;font-size:.82rem"><span style="font-size:.68rem;font-weight:700;color:var(--muted);text-transform:uppercase">Admin-Notiz:</span><br>${esc(a.admin_note)}</div>` : ''}
      ${showActions && isAdmin() ? `<div style="display:flex;gap:.5rem;padding-top:.5rem;border-top:1px solid var(--border)">
        <button class="btn btn-primary btn-sm" style="flex:1" onclick="decideApplication(${a.id},'accepted')"><i class="fas fa-check"></i> Annehmen</button>
        <button class="btn btn-danger btn-sm" style="flex:1" onclick="decideApplication(${a.id},'rejected')"><i class="fas fa-times"></i> Ablehnen</button>
        <button class="btn btn-ghost btn-sm" title="Löschen" onclick="deleteApplication(${a.id})"><i class="fas fa-trash"></i></button>
      </div>` : (isAdmin() ? `<div style="padding-top:.5rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end"><button class="btn btn-ghost btn-sm" style="color:#ef4444" title="Löschen" onclick="deleteApplication(${a.id})"><i class="fas fa-trash"></i> Löschen</button></div>` : '')}
    </div>`;
  }

  $('pageContent').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.5rem">
      ${pending.length ? `
      <div>
        <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#fbbf24;margin-bottom:.85rem;display:flex;align-items:center;gap:.5rem">
          <i class="fas fa-clock"></i>Ausstehend (${pending.length})
        </div>
        <div style="display:flex;flex-direction:column;gap:.75rem">${pending.map(a => appCard(a, true)).join('')}</div>
      </div>` : '<div class="empty"><i class="fas fa-inbox"></i><p>Keine offenen Bewerbungen</p></div>'}
      ${decided.length ? `
      <div>
        <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.85rem;display:flex;align-items:center;gap:.5rem">
          <i class="fas fa-history"></i>Entschieden (${decided.length})
          <div style="flex:1;height:1px;background:var(--border);margin-left:.25rem"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.75rem">${decided.map(a => appCard(a, false)).join('')}</div>
      </div>` : ''}
    </div>`;
}

window.decideApplication = (id, status) => {
  const isAccept = status === 'accepted';
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-${isAccept ? 'check' : 'times'}" style="color:${isAccept ? '#22c55e' : '#ef4444'};margin-right:.5rem"></i>Bewerbung ${isAccept ? 'annehmen' : 'ablehnen'}</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="padding:.5rem 0">
      <div class="form-group">
        <label>Notiz für den Bewerber (optional)</label>
        <textarea class="form-control" id="appNote" rows="3" placeholder="${isAccept ? 'Willkommensnachricht…' : 'Begründung…'}" style="resize:vertical"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn ${isAccept ? 'btn-primary' : 'btn-danger'}" onclick="submitDecision(${id},'${status}')">
        <i class="fas fa-${isAccept ? 'check' : 'times'}"></i> ${isAccept ? 'Annehmen' : 'Ablehnen'}
      </button>
    </div>`);
};
window.submitDecision = async (id, status) => {
  const note = document.getElementById('appNote')?.value || '';
  const r = await api(`/api/applications/${id}`, { method: 'PATCH', body: { status, admin_note: note } });
  if (r) { closeModal(); toast(status === 'accepted' ? 'Angenommen!' : 'Abgelehnt.', 'ok'); applications(); }
};
window.deleteApplication = async id => {
  if (!confirm('Bewerbung löschen? Der Bewerber kann dann erneut bewerben.')) return;
  const r = await api(`/api/applications/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht.', 'ok'); applications(); }
};

// ════════════════════════════════════════════════════════════════
async function carmarket() {
  const rows = await api('/api/car-listings');
  if (rows === null) return;
  window._listingsCache = new Map(rows.map(l => [l.id, l]));
  const canEditAny = isAdmin();

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left">
        <h2>Fahrzeugmarkt</h2>
        <p>${rows.length} Inserat${rows.length !== 1 ? 'e' : ''}</p>
      </div>
      <button class="btn btn-primary" onclick="openAddListing()"><i class="fas fa-plus"></i> Inserat erstellen</button>
    </div>
    ${!rows.length ? `<div class="empty"><i class="fas fa-car-side"></i><p>Noch keine Inserate vorhanden.</p></div>` : `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem" id="listingGrid">
      ${rows.map(l => listingCard(l, canEditAny)).join('')}
    </div>`}`;
}

window.openListingDetail = id => {
  const l = window._listingsCache?.get(id);
  if (!l) return;
  const isOwner = currentUser?.discord_id === l.owner_discord_id;
  const canDel  = isOwner || isAdmin();
  const canEdit = isAdmin();
  const isRent  = l.listing_type === 'vermietung';
  const dur     = l.duration === '7_tage' ? '7 Tage' : l.duration === '1_monat' ? '1 Monat' : '';

  openModal(`
  <div style="overflow:hidden;border-radius:var(--rl)">
    ${l.image_data ? `
      <div style="position:relative;line-height:0">
        <img src="${l.image_data}" style="width:100%;max-height:320px;object-fit:contain;background:#000;display:block;border-radius:var(--rl) var(--rl) 0 0">
        <button onclick="closeModal()" style="position:absolute;top:.65rem;right:.65rem;background:rgba(0,0,0,.55);border:none;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.9rem;backdrop-filter:blur(4px)"><i class="fas fa-times"></i></button>
      </div>` : `
      <div class="modal-head">
        <div class="modal-title"><i class="fas fa-car-side" style="color:var(--orange);margin-right:.5rem"></i>${esc(l.car)}</div>
        <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
      </div>`}
    <div style="padding:1.25rem 1.5rem 1.5rem">
      ${l.image_data ? `<h2 style="font-size:1.25rem;font-weight:800;margin:0 0 .2rem;padding-right:1rem">${esc(l.car)}</h2>` : ''}
      <div style="font-size:1.45rem;font-weight:800;color:#f97316;margin-bottom:.5rem">
        ${esc(l.price)}$${isRent && dur ? `<span style="font-size:.85rem;font-weight:600;color:var(--muted);margin-left:.4rem">/ ${dur}</span>` : ''}
      </div>
      <div style="margin-bottom:1rem">${listingTypeBadge(l)}</div>
      <div style="display:flex;flex-direction:column;gap:.7rem;border-top:1px solid var(--border);padding-top:1rem">
        <div style="display:flex;align-items:center;gap:.85rem">
          <div style="width:36px;height:36px;border-radius:9px;background:#f9731618;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-user" style="color:#f97316;font-size:.85rem"></i></div>
          <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.1rem">Anbieter</div><div style="font-weight:700">${esc(l.name)}</div></div>
        </div>
        <div style="display:flex;align-items:center;gap:.85rem">
          <div style="width:36px;height:36px;border-radius:9px;background:#f9731618;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-phone" style="color:#f97316;font-size:.85rem"></i></div>
          <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.1rem">Telefon</div><div style="font-weight:700">${esc(l.phone)}</div></div>
        </div>
        ${l.notes ? `
        <div style="display:flex;align-items:flex-start;gap:.85rem">
          <div style="width:36px;height:36px;border-radius:9px;background:#f9731618;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-align-left" style="color:#f97316;font-size:.85rem"></i></div>
          <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.1rem">Beschreibung</div><div style="line-height:1.55">${esc(l.notes)}</div></div>
        </div>` : ''}
        <div style="display:flex;align-items:center;gap:.85rem">
          <div style="width:36px;height:36px;border-radius:9px;background:var(--surface2);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-clock" style="color:var(--muted);font-size:.85rem"></i></div>
          <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.1rem">Eingestellt</div><div>${ago(l.created_at)}</div></div>
        </div>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border)">
        <button class="btn btn-ghost" style="flex:1" onclick="closeModal()"><i class="fas fa-arrow-left"></i> Zurück</button>
        ${canEdit ? `<button class="btn btn-ghost btn-sm" style="padding:.45rem .9rem" title="Bearbeiten" onclick="closeModal();setTimeout(()=>openEditListing(${l.id},'${encodeURIComponent(JSON.stringify({...l, image_data: null}))}'),60)"><i class="fas fa-pen"></i></button>` : ''}
        ${canDel  ? `<button class="btn btn-danger btn-sm" style="padding:.45rem .9rem" title="Löschen" onclick="closeModal();setTimeout(()=>deleteListing(${l.id}),60)"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    </div>
  </div>`);
  $('modalBox').style.maxWidth = '620px';
  $('modalBox').style.padding = '0';
};

function listingTypeBadge(l) {
  const isRent = l.listing_type === 'vermietung';
  const dur = l.duration === '7_tage' ? '7 Tage' : l.duration === '1_monat' ? '1 Monat' : '';
  return isRent
    ? `<span style="font-size:.68rem;font-weight:700;padding:.2rem .55rem;border-radius:20px;background:rgba(59,130,246,.15);color:#60a5fa;white-space:nowrap"><i class="fas fa-key" style="margin-right:.3rem"></i>Miete${dur ? ' · ' + dur : ''}</span>`
    : `<span style="font-size:.68rem;font-weight:700;padding:.2rem .55rem;border-radius:20px;background:rgba(34,197,94,.12);color:#22c55e;white-space:nowrap"><i class="fas fa-tag" style="margin-right:.3rem"></i>Verkauf</span>`;
}

function listingCard(l, canEditAny) {
  const isOwner = currentUser?.discord_id === l.owner_discord_id;
  const canDel  = canEditAny || isOwner;
  const isRent  = l.listing_type === 'vermietung';
  const dur     = l.duration === '7_tage' ? '7 Tage' : l.duration === '1_monat' ? '1 Monat' : '';
  return `
  <div class="card" onclick="openListingDetail(${l.id})" style="display:flex;flex-direction:column;gap:0;padding:0;overflow:hidden;cursor:pointer;transition:transform .12s,box-shadow .12s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 24px rgba(0,0,0,.18)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
    ${l.image_data
      ? `<div class="listing-img-wrap"><img class="listing-img" src="${l.image_data}" alt="${esc(l.car)}" loading="lazy"></div>`
      : `<div class="listing-no-img"><i class="fas fa-${isRent ? 'key' : 'car-side'}" style="color:var(--orange);font-size:1.6rem;opacity:.45"></i></div>`}
    <div style="padding:.9rem;display:flex;flex-direction:column;gap:.45rem;flex:1">
      <div>
        <div style="font-weight:800;font-size:1.05rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(l.car)}">${esc(l.car)}</div>
        <div style="font-size:1.1rem;font-weight:800;color:#f97316">${esc(l.price)}$${isRent && dur ? `<span style="font-size:.75rem;font-weight:600;color:var(--muted);margin-left:.3rem">/ ${dur}</span>` : ''}</div>
      </div>
      <div>${listingTypeBadge(l)}</div>
      <div style="display:flex;flex-direction:column;gap:.2rem;font-size:.83rem;color:var(--muted)">
        <div><i class="fas fa-user" style="width:14px;text-align:center;margin-right:.35rem"></i>${esc(l.name)}</div>
        <div><i class="fas fa-phone" style="width:14px;text-align:center;margin-right:.35rem"></i>${esc(l.phone)}</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:.5rem;border-top:1px solid var(--border)">
        <div style="font-size:.72rem;color:var(--muted)">${ago(l.created_at)}</div>
        <div style="display:flex;gap:.35rem" onclick="event.stopPropagation()">
          ${canEditAny ? `<button class="btn btn-ghost btn-sm" title="Bearbeiten" onclick="openEditListing(${l.id},'${encodeURIComponent(JSON.stringify({...l, image_data: null}))}')"><i class="fas fa-pen" style="font-size:.7rem"></i></button>` : ''}
          ${canDel ? `<button class="btn btn-danger btn-sm" title="Löschen" onclick="deleteListing(${l.id})"><i class="fas fa-trash" style="font-size:.7rem"></i></button>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

window.fmtListingPrice = input => {
  const digits = input.value.replace(/\D/g, '');
  input.value = digits ? parseInt(digits, 10).toLocaleString('de-DE') : '';
};

window.openAddListing = () => {
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-car-side" style="color:var(--orange);margin-right:.5rem"></i>Inserat erstellen</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <form onsubmit="submitListing(event)">
      <input type="hidden" id="lTypeVal" value="verkauf">
      <div class="form-group">
        <label>Art des Inserats *</label>
        <div style="display:flex;gap:.5rem">
          <button type="button" id="lBtnVerkauf" class="btn btn-primary btn-sm" style="flex:1" onclick="setListingType('verkauf')"><i class="fas fa-tag"></i> Verkauf</button>
          <button type="button" id="lBtnVermietung" class="btn btn-ghost btn-sm" style="flex:1" onclick="setListingType('vermietung')"><i class="fas fa-key"></i> Vermietung</button>
        </div>
      </div>
      <div id="lDurationWrap" class="form-group" style="display:none">
        <label>Laufzeit *</label>
        <select class="form-control" id="lDuration">
          <option value="7_tage">7 Tage</option>
          <option value="1_monat">1 Monat</option>
        </select>
      </div>
      <div class="form-group"><label>Fahrzeug *</label><input class="form-control" id="lCar" placeholder="z.B. Audi A4 Avant 2020" required></div>
      <div class="form-row">
        <div class="form-group"><label id="lPriceLabel">Wunschpreis *</label><input class="form-control" id="lPrice" placeholder="z.B. 85.000" oninput="fmtListingPrice(this)" required></div>
        <div class="form-group"><label>Telefonnummer *</label><input class="form-control" id="lPhone" placeholder="z.B. 555-1234" required></div>
      </div>
      <div class="form-group"><label>Dein Name *</label><input class="form-control" id="lName" placeholder="Vor- und Nachname (IC)" required value="${esc(currentUser?.username || '')}"></div>
      <div class="form-group"><label>Notizen (optional)</label><textarea class="form-control" id="lNotes" rows="3" placeholder="Zustand, Ausstattung, besondere Merkmale…" style="resize:vertical"></textarea></div>
      <div class="form-group">
        <label>Fahrzeugfoto (optional)</label>
        <input type="hidden" id="lImageData" value="">
        <div id="lImgPreview" style="display:none;margin-bottom:.5rem">
          <img id="lImgThumb" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
        </div>
        <div style="display:flex;gap:.5rem">
          <div class="img-upload-area" style="flex:1" onclick="document.getElementById('lImage').click()">
            <i class="fas fa-camera" style="color:var(--orange);margin-bottom:.3rem;display:block;font-size:1.1rem"></i>
            <div style="font-size:.8rem;color:var(--muted)">Foto auswählen</div>
          </div>
          <button type="button" id="lImgClear" class="btn btn-ghost btn-sm" style="display:none;color:#ef4444;align-self:center" onclick="clearListingImage('lImage','lImgThumb','lImgPreview','lImgClear')">
            <i class="fas fa-times"></i> Entfernen
          </button>
        </div>
        <input type="file" id="lImage" accept="image/*" style="display:none" onchange="previewListingImage('lImage','lImgThumb','lImgPreview','lImgClear')">
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-check"></i> Inserieren</button>
      </div>
    </form>`);
};

window.setListingType = type => {
  document.getElementById('lTypeVal').value = type;
  document.getElementById('lBtnVerkauf').className   = `btn btn-sm ${type === 'verkauf'    ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('lBtnVermietung').className = `btn btn-sm ${type === 'vermietung' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('lDurationWrap').style.display = type === 'vermietung' ? '' : 'none';
  const pl = document.getElementById('lPriceLabel');
  if (pl) pl.textContent = type === 'vermietung' ? 'Mietpreis *' : 'Wunschpreis *';
};

window.submitListing = async e => {
  e.preventDefault();
  const imgData = window._listingImg || null;
  const res = await fetch('/api/car-listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      car:          document.getElementById('lCar').value,
      price:        document.getElementById('lPrice').value,
      phone:        document.getElementById('lPhone').value,
      name:         document.getElementById('lName').value,
      notes:        document.getElementById('lNotes').value,
      listing_type: document.getElementById('lTypeVal').value,
      duration:     document.getElementById('lDuration')?.value || null,
      image_data:   imgData || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || 'Fehler', 'err'); return; }
  closeModal();
  toast('Inserat erstellt!', 'ok');
  if (document.getElementById('listingGrid')) carmarket();
  else if (document.getElementById('voterListings')) loadVoterMarket();
};

window.openEditListing = (id, encoded) => {
  const l = JSON.parse(decodeURIComponent(encoded));
  const isRent = l.listing_type === 'vermietung';
  // Load existing image from cache so it's preserved on save
  const cached = window._listingsCache?.get(id);
  window._listingImg = cached?.image_data || null;
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-pen" style="color:var(--orange);margin-right:.5rem"></i>Inserat bearbeiten</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <form onsubmit="submitEditListing(event,${id})">
      <input type="hidden" id="elTypeVal" value="${l.listing_type || 'verkauf'}">
      <div class="form-group">
        <label>Art des Inserats *</label>
        <div style="display:flex;gap:.5rem">
          <button type="button" id="elBtnVerkauf" class="btn ${!isRent ? 'btn-primary' : 'btn-ghost'} btn-sm" style="flex:1" onclick="setEditListingType('verkauf')"><i class="fas fa-tag"></i> Verkauf</button>
          <button type="button" id="elBtnVermietung" class="btn ${isRent ? 'btn-primary' : 'btn-ghost'} btn-sm" style="flex:1" onclick="setEditListingType('vermietung')"><i class="fas fa-key"></i> Vermietung</button>
        </div>
      </div>
      <div id="elDurationWrap" class="form-group" style="${isRent ? '' : 'display:none'}">
        <label>Laufzeit *</label>
        <select class="form-control" id="elDuration">
          <option value="7_tage" ${l.duration === '7_tage' ? 'selected' : ''}>7 Tage</option>
          <option value="1_monat" ${l.duration === '1_monat' ? 'selected' : ''}>1 Monat</option>
        </select>
      </div>
      <div class="form-group"><label>Fahrzeug *</label><input class="form-control" id="elCar" value="${esc(l.car)}" required></div>
      <div class="form-row">
        <div class="form-group"><label id="elPriceLabel">${isRent ? 'Mietpreis *' : 'Wunschpreis *'}</label><input class="form-control" id="elPrice" value="${esc(l.price)}" oninput="fmtListingPrice(this)" required></div>
        <div class="form-group"><label>Telefonnummer *</label><input class="form-control" id="elPhone" value="${esc(l.phone)}" required></div>
      </div>
      <div class="form-group"><label>Name *</label><input class="form-control" id="elName" value="${esc(l.name)}" required></div>
      <div class="form-group"><label>Notizen</label><textarea class="form-control" id="elNotes" rows="3" style="resize:vertical">${esc(l.notes || '')}</textarea></div>
      <div class="form-group">
        <label>Fahrzeugfoto</label>
        <div id="elImgPreview" style="${cached?.image_data ? '' : 'display:none'};margin-bottom:.5rem">
          <img id="elImgThumb" src="${cached?.image_data || ''}" style="width:100%;max-height:140px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
        </div>
        <div style="display:flex;gap:.5rem">
          <div class="img-upload-area" style="flex:1" onclick="document.getElementById('elImage').click()">
            <i class="fas fa-camera" style="color:var(--orange);margin-bottom:.3rem;display:block;font-size:1rem"></i>
            <div style="font-size:.78rem;color:var(--muted)">${cached?.image_data ? 'Foto ersetzen' : 'Foto hochladen'}</div>
          </div>
          <button type="button" id="elImgClear" class="btn btn-ghost btn-sm" style="${cached?.image_data ? '' : 'display:none'};color:#ef4444;align-self:center" onclick="clearListingImage('elImage','elImgThumb','elImgPreview','elImgClear')">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <input type="file" id="elImage" accept="image/*" style="display:none" onchange="previewListingImage('elImage','elImgThumb','elImgPreview','elImgClear')">
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
      </div>
    </form>`);
};

window.setEditListingType = type => {
  document.getElementById('elTypeVal').value = type;
  document.getElementById('elBtnVerkauf').className    = `btn btn-sm ${type === 'verkauf'    ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('elBtnVermietung').className  = `btn btn-sm ${type === 'vermietung' ? 'btn-primary' : 'btn-ghost'}`;
  document.getElementById('elDurationWrap').style.display = type === 'vermietung' ? '' : 'none';
  const pl = document.getElementById('elPriceLabel');
  if (pl) pl.textContent = type === 'vermietung' ? 'Mietpreis *' : 'Wunschpreis *';
};

window.submitEditListing = async (e, id) => {
  e.preventDefault();
  const r = await api(`/api/car-listings/${id}`, { method: 'PATCH', body: {
    car:          document.getElementById('elCar').value,
    price:        document.getElementById('elPrice').value,
    phone:        document.getElementById('elPhone').value,
    name:         document.getElementById('elName').value,
    notes:        document.getElementById('elNotes').value,
    listing_type: document.getElementById('elTypeVal').value,
    duration:     document.getElementById('elDuration')?.value || null,
    image_data:   window._listingImg,
  }});
  if (r) { closeModal(); toast('Gespeichert!', 'ok'); carmarket(); }
};

window.deleteListing = async id => {
  if (!confirm('Inserat löschen?')) return;
  const r = await api(`/api/car-listings/${id}`, { method: 'DELETE' });
  if (r) {
    toast('Inserat gelöscht.', 'ok');
    if (document.getElementById('listingGrid')) carmarket();
    else loadVoterMarket();
  }
};

// ════════════════════════════════════════════════════════════════
//  ADMIN
// ════════════════════════════════════════════════════════════════
async function admin() {
  if (!isAdmin()) { $('pageContent').innerHTML = '<div class="empty"><i class="fas fa-lock"></i><p>Kein Zugriff</p></div>'; return; }
  const [users, cats, announcements, complaints] = await Promise.all([api('/api/users'), api('/api/exam-categories'), api('/api/announcements'), api('/api/complaints')]);
  window._adminComplaints = complaints || [];
  if (!users) return;
  window._adminCats = cats;
  window._userNames = Object.fromEntries(users.map(u => [u.id, u.username]));

  const openComplaints = (complaints||[]).filter(c=>c.status==='offen').length;
  const totalQuestions = cats?.reduce((s,c)=>s+c.question_count,0)||0;
  const activeUsers    = users.filter(u => u.is_active).length;

  const P = 'padding:1rem 1.1rem';
  const BR = 'border-right:1px solid var(--border)';
  const BB = 'border-bottom:1px solid var(--border)';

  $('pageContent').innerHTML = `

    <!-- Topbar -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem;margin-bottom:.85rem">
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:.4rem;padding:.3rem .65rem;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:.78rem">
          <i class="fas fa-users" style="color:var(--orange);font-size:.7rem"></i><b>${activeUsers}</b><span style="color:var(--muted)"> Nutzer</span>
        </span>
        <span style="display:flex;align-items:center;gap:.4rem;padding:.3rem .65rem;background:var(--surface);border:1px solid ${openComplaints?'rgba(239,68,68,.4)':'var(--border)'};border-radius:6px;font-size:.78rem">
          <i class="fas fa-comment-alt" style="color:${openComplaints?'#ef4444':'var(--muted)'};font-size:.7rem"></i><b style="color:${openComplaints?'#ef4444':'inherit'}">${openComplaints}</b><span style="color:var(--muted)"> offen</span>
        </span>
        <span style="display:flex;align-items:center;gap:.4rem;padding:.3rem .65rem;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:.78rem">
          <i class="fas fa-question-circle" style="color:#60a5fa;font-size:.7rem"></i><b>${totalQuestions}</b><span style="color:var(--muted)"> Fragen</span>
        </span>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="enterCitizenView()"><i class="fas fa-eye" style="margin-right:.35rem"></i>Bürgeransicht</button>
    </div>

    <!-- Ein Container, zwei unabhängige Spalten -->
    <div style="border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;background:var(--card-bg)">

      <!-- Spalten-Bereich -->
      <div style="display:grid;grid-template-columns:1fr 1fr;align-items:start;${BB}">

        <!-- LINKE SPALTE -->
        <div style="${BR}">

          <!-- Benutzerverwaltung -->
          <div style="${P};${BB}">
            <div class="card-head" style="margin-bottom:.7rem">
              <div class="card-head-icon orange"><i class="fas fa-users"></i></div>
              <div style="flex:1"><div class="card-title">Benutzerverwaltung</div><div class="card-sub">${activeUsers} aktive Nutzer</div></div>
              <button class="btn btn-primary btn-sm" onclick="openAddUser()"><i class="fas fa-user-plus"></i> Hinzufügen</button>
            </div>
            <div class="tbl-wrap" style="max-height:300px;overflow-y:auto">
              <table class="data-tbl">
                <thead><tr><th>Name</th><th>Rolle / Rang</th><th colspan="2"></th></tr></thead>
                <tbody>${users.filter(u=>u.is_active).map(u=>`<tr>
                  <td><div style="display:flex;align-items:center;gap:.45rem">${avatarEl(u,24)}<span style="font-weight:600;font-size:.82rem">${esc(u.username)}</span></div></td>
                  <td><div style="display:flex;flex-direction:column;gap:.2rem">
                    <select class="form-control" style="padding:.15rem .3rem;height:auto;font-size:.77rem;width:auto" onchange="setRole(${u.id},this.value)">
                      <option value="member"    ${u.role==='member'   ?'selected':''}>Mitarbeiter</option>
                      <option value="ausbilder" ${u.role==='ausbilder'?'selected':''}>Ausbilder</option>
                      <option value="admin"     ${u.role==='admin'    ?'selected':''}>Admin</option>
                      <option value="citizen"   ${u.role==='citizen'  ?'selected':''}>Bürger</option>
                    </select>
                    <select class="form-control" style="padding:.15rem .3rem;height:auto;font-size:.77rem;width:auto" onchange="setRank(${u.id},this.value)">
                      ${['Azubi','Mitarbeiter','Senior','Führungskraft','Rang 12'].map(r=>`<option ${(u.rank||'Mitarbeiter')===r?'selected':''}>${r}</option>`).join('')}
                    </select>
                  </div></td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-ghost btn-sm" onclick="openProfileModal(${u.id})" title="Statistiken"><i class="fas fa-chart-bar"></i></button>
                    <button class="btn btn-ghost btn-sm" onclick="openRenameUser(${u.id})" title="Umbenennen"><i class="fas fa-pen"></i></button>
                  </td>
                  <td><button class="btn btn-danger btn-sm" onclick="removeUser(${u.id})"><i class="fas fa-trash"></i></button></td>
                </tr>`).join('')}</tbody>
              </table>
            </div>
          </div>

          <!-- Beschwerden -->
          <div style="${P};${BB}">
            <div class="card-head" style="margin-bottom:.7rem">
              <div class="card-head-icon" style="background:rgba(239,68,68,.15)"><i class="fas fa-comment-alt" style="color:#ef4444"></i></div>
              <div><div class="card-title">Beschwerden</div><div class="card-sub">${openComplaints} offen</div></div>
            </div>
            ${(complaints||[]).length?`
            <div class="tbl-wrap" style="max-height:260px;overflow-y:auto"><table class="data-tbl">
              <thead><tr><th>Bürger</th><th>Betreff</th><th>Datum</th><th>Status</th><th></th></tr></thead>
              <tbody>${complaints.map(c=>`<tr style="cursor:pointer" onclick="openComplaint(${c.id})">
                <td style="font-weight:600;font-size:.82rem">${esc(c.citizen_name)}</td>
                <td style="font-size:.81rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.subject)}</td>
                <td style="font-size:.75rem;color:var(--muted);white-space:nowrap">${new Date(c.created_at).toLocaleDateString('de-DE')}</td>
                <td><span style="font-size:.71rem;padding:.1rem .4rem;border-radius:5px;font-weight:700;background:${c.status==='offen'?'rgba(239,68,68,.15)':'rgba(34,197,94,.15)'};color:${c.status==='offen'?'#ef4444':'#22c55e'}">${c.status}</span></td>
                <td onclick="event.stopPropagation()">${c.status==='offen'
                  ?`<button class="btn btn-ghost btn-sm" onclick="resolveComplaint(${c.id},'erledigt')"><i class="fas fa-check"></i></button>`
                  :`<button class="btn btn-ghost btn-sm" onclick="resolveComplaint(${c.id},'offen')"><i class="fas fa-undo"></i></button>`}</td>
              </tr>`).join('')}</tbody>
            </table></div>`:'<div class="empty" style="padding:.6rem"><p>Keine Beschwerden</p></div>'}
          </div>

          <!-- Coins verwalten -->
          <div style="${P}">
            <div class="card-head" style="margin-bottom:.7rem">
              <div class="card-head-icon" style="background:rgba(251,191,36,.15)"><i class="fas fa-coins" style="color:#fbbf24"></i></div>
              <div><div class="card-title">Coins verwalten</div><div class="card-sub">Gutschreiben, abziehen oder setzen</div></div>
            </div>
            <div style="position:relative">
              <input class="form-control" id="coinAdminSearch" placeholder="Nutzer suchen…" autocomplete="off" oninput="coinAdminSearch()" onblur="setTimeout(()=>{const b=$('coinAdminResults');if(b)b.style.display='none'},150)">
              <div id="coinAdminResults" style="position:absolute;z-index:30;left:0;right:0;background:var(--card);border:1px solid var(--border);border-radius:var(--r);margin-top:.2rem;max-height:200px;overflow:auto;display:none"></div>
            </div>
            <div id="coinAdminTarget" style="display:none;margin-top:.65rem;padding:.7rem;background:var(--input);border-radius:var(--r)">
              <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.55rem;flex-wrap:wrap">
                <span id="coinAdminTargetName" style="font-weight:700"></span>
                <span class="badge badge-m" id="coinAdminTargetBal"></span>
              </div>
              <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
                <select class="form-control" id="coinAdminMode" style="width:auto;font-size:.81rem">
                  <option value="add">+ / − Gutschreiben / Abziehen</option>
                  <option value="set">= Auf Wert setzen</option>
                </select>
                <input class="form-control" id="coinAdminAmount" type="number" step="1" placeholder="Betrag" style="width:110px" onkeydown="if(event.key==='Enter')applyCoinAdmin()">
                <button class="btn btn-primary btn-sm" onclick="applyCoinAdmin()"><i class="fas fa-check"></i> Anwenden</button>
              </div>
              <div style="font-size:.69rem;color:var(--muted);margin-top:.4rem">Wird im Audit-Log protokolliert.</div>
            </div>
          </div>

        </div><!-- /LINKE SPALTE -->

        <!-- RECHTE SPALTE -->
        <div>

          <!-- Fragenverwaltung -->
          <div style="${P};${BB}">
            <div class="card-head" style="margin-bottom:.7rem">
              <div class="card-head-icon blue"><i class="fas fa-question-circle"></i></div>
              <div style="flex:1"><div class="card-title">Fragenverwaltung</div><div class="card-sub">${totalQuestions} Fragen total</div></div>
              <button class="btn btn-primary btn-sm" onclick="openAddQuestion()"><i class="fas fa-plus"></i> Hinzufügen</button>
            </div>
            ${(cats||[]).map(cat=>`
              <div style="display:flex;align-items:center;justify-content:space-between;padding:.4rem .6rem;background:var(--input);border-radius:var(--r);margin-bottom:.3rem">
                <div style="display:flex;align-items:center;gap:.45rem">
                  <i class="fas ${cat.icon}" style="color:var(--orange);width:13px;text-align:center;font-size:.78rem"></i>
                  <span style="font-size:.84rem;font-weight:600">${cat.name}</span>
                </div>
                <div style="display:flex;align-items:center;gap:.35rem">
                  <span class="badge badge-m">${cat.question_count}</span>
                  <button class="btn btn-ghost btn-sm" onclick="manageQuestions(${cat.id},'${cat.name}','${cat.icon}')"><i class="fas fa-cog"></i></button>
                </div>
              </div>`).join('')}
          </div>

          <!-- Schwarzes Brett -->
          <div style="${P};${BB}">
            <div class="card-head" style="margin-bottom:.7rem">
              <div class="card-head-icon orange"><i class="fas fa-bullhorn"></i></div>
              <div style="flex:1"><div class="card-title">Schwarzes Brett</div><div class="card-sub">${announcements?.length||0} Ankündigungen</div></div>
              <button class="btn btn-primary btn-sm" onclick="openAnnouncementModal()"><i class="fas fa-plus"></i> Neu</button>
            </div>
            ${(announcements||[]).length?announcements.map(a=>`
              <div style="padding:.45rem .6rem;background:var(--input);border-radius:var(--r);margin-bottom:.3rem${a.is_pinned?';border-left:3px solid var(--orange)':''}">
                <div style="display:flex;align-items:center;gap:.35rem">
                  ${a.is_pinned?'<i class="fas fa-thumbtack" style="color:var(--orange);font-size:.68rem"></i>':''}
                  <div style="font-weight:600;font-size:.84rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.title)}</div>
                  <button class="btn btn-ghost btn-sm" onclick="pinAnnouncement(${a.id})"><i class="fas fa-thumbtack"></i></button>
                  <button class="btn btn-danger btn-sm" onclick="deleteAnnouncement(${a.id})"><i class="fas fa-trash"></i></button>
                </div>
                <div style="font-size:.75rem;color:var(--muted);margin-top:.12rem">${esc(a.content.slice(0,90))}${a.content.length>90?'…':''}</div>
              </div>`).join('')
            :'<div class="empty" style="padding:.6rem"><p>Keine Ankündigungen</p></div>'}
          </div>

          <!-- Umfrage -->
          <div style="${P}">
            <div class="card-head" style="margin-bottom:.7rem">
              <div class="card-head-icon" style="background:rgba(99,102,241,.15)"><i class="fas fa-poll" style="color:#818cf8"></i></div>
              <div><div class="card-title">Umfrage</div><div class="card-sub">Frage der Woche</div></div>
            </div>
            <div id="pollAdminContent" style="margin-bottom:.65rem"><div style="color:var(--muted);font-size:.81rem">Wird geladen…</div></div>
            <div style="border-top:1px solid var(--border);padding-top:.65rem">
              <div style="font-weight:600;font-size:.79rem;margin-bottom:.35rem">Neue Umfrage</div>
              <input class="form-control" id="pollQuestion" placeholder="Frage eingeben…" style="margin-bottom:.28rem">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:.28rem;margin-bottom:.28rem">
                <input class="form-control" id="pollOpt1" placeholder="Option 1">
                <input class="form-control" id="pollOpt2" placeholder="Option 2">
                <input class="form-control" id="pollOpt3" placeholder="Option 3 (opt.)">
                <input class="form-control" id="pollOpt4" placeholder="Option 4 (opt.)">
              </div>
              <button class="btn btn-primary btn-sm" style="width:100%" onclick="submitPollAdmin()"><i class="fas fa-plus"></i> Umfrage starten</button>
            </div>
          </div>

        </div><!-- /RECHTE SPALTE -->

      </div><!-- /Spalten-Bereich -->

      <!-- Wunsch-Titel: volle Breite, nur wenn ausstehend -->
      <div style="display:none;${BB}" id="customTitleCard">
        <div style="${P}">
          <div class="card-head" style="margin-bottom:.7rem">
            <div class="card-head-icon" style="background:rgba(251,191,36,.15)"><i class="fas fa-pen" style="color:#fbbf24"></i></div>
            <div><div class="card-title">Wunsch-Titel</div><div class="card-sub">Freigeben oder ablehnen – Ablehnung erstattet 2.500 Coins</div></div>
          </div>
          <div id="customTitleList"></div>
        </div>
      </div>

      <!-- Ehrentitel -->
      <div style="${P};${BB}" id="honorarySection">
        <div class="card-head" style="margin-bottom:.7rem">
          <div class="card-head-icon" style="background:rgba(251,191,36,.15)"><i class="fas fa-star" style="color:#fbbf24"></i></div>
          <div style="flex:1"><div class="card-title">Ehrentitel vergeben</div><div class="card-sub">Admin-Titel – kostenlos, dauerhaft, im Steckbrief sichtbar</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.65rem;align-items:start">
          <div>
            <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem">Mitarbeiter suchen</div>
            <div style="position:relative">
              <input class="form-control" id="honorarySearch" placeholder="Name eingeben…" autocomplete="off"
                oninput="honorarySearchUser()" onblur="setTimeout(()=>{const r=$('honoraryResults');if(r)r.style.display='none'},180)">
              <div id="honoraryResults" style="position:absolute;z-index:30;left:0;right:0;background:var(--card);border:1px solid var(--border);border-radius:var(--r);margin-top:.2rem;max-height:180px;overflow:auto;display:none"></div>
            </div>
            <div id="honoraryTarget" style="display:none;margin-top:.5rem;padding:.55rem .7rem;background:var(--input);border-radius:var(--r);font-size:.82rem">
              <span id="honoraryTargetName" style="font-weight:700"></span>
              <button onclick="honoraryClear()" style="float:right;background:none;border:none;color:var(--muted);cursor:pointer"><i class="fas fa-times"></i></button>
            </div>
            <div style="margin-top:.5rem;display:flex;flex-direction:column;gap:.35rem">
              <input class="form-control" id="honoraryTitle" maxlength="40" placeholder="Titel (max. 40 Zeichen)…">
              <div>
                <div style="font-size:.7rem;color:var(--muted);margin-bottom:.3rem">Symbol wählen:</div>
                <div style="display:flex;flex-wrap:wrap;gap:.3rem" id="honoraryIconGrid">${['⭐','🏆','👑','🎖️','🛡️','⚡','🔥','💎','🎯','🚨','🦅','💪','❤️','🌟','🏅','🎪','🔱','🌈','🦁','⚔️'].map(ic=>`<button type="button" onclick="honoraryPickIcon('${ic}')" id="hicon-${ic.codePointAt(0)}" style="font-size:1.1rem;width:32px;height:32px;border:2px solid var(--border);border-radius:7px;background:var(--input);cursor:pointer;transition:.12s" title="${ic}">${ic}</button>`).join('')}</div>
                <div style="margin-top:.4rem;font-size:.8rem;color:var(--muted)">Gewählt: <span id="honoraryIconPreview" style="font-size:1rem">⭐</span></div>
              </div>
              <div style="display:flex;align-items:center;gap:.5rem;font-size:.8rem">
                <label style="color:var(--muted)">Farbe:</label>
                <input type="color" id="honoraryColor" value="#fbbf24" style="width:36px;height:28px;border:1px solid var(--border);border-radius:5px;cursor:pointer;background:var(--input);padding:2px">
              </div>
              <button class="btn btn-primary btn-sm" onclick="honoraryGrant()"><i class="fas fa-award"></i> Titel vergeben</button>
            </div>
          </div>
          <div>
            <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem">Vergebene Titel</div>
            <div id="honoraryList" style="max-height:230px;overflow-y:auto"><div style="color:var(--muted);font-size:.8rem">Wird geladen…</div></div>
          </div>
        </div>
      </div>

      <!-- Offene Wetten (nur bei vorhandenen) -->
      <div id="adminBetsSection" style="display:none;${BB}">
        <div style="${P}">
          <div class="card-head" style="margin-bottom:.7rem">
            <div class="card-head-icon" style="background:rgba(245,158,11,.15)"><i class="fas fa-handshake" style="color:#f59e0b"></i></div>
            <div style="flex:1"><div class="card-title">Offene Wetten</div><div class="card-sub">Angenommene Wetten auflösen</div></div>
          </div>
          <div id="adminBetsList"></div>
        </div>
      </div>

      <!-- Spiele-Ranglisten verwalten -->
      <div style="${P};${BB}">
        <div class="card-head" style="margin-bottom:.7rem">
          <div class="card-head-icon" style="background:rgba(251,191,36,.15)"><i class="fas fa-gamepad" style="color:#fbbf24"></i></div>
          <div style="flex:1"><div class="card-title">Spiele-Ranglisten verwalten</div><div class="card-sub">Einzelne Einträge entfernen</div></div>
          <select class="form-control" id="adminGameScoreSelect" style="width:auto;font-size:.81rem" onchange="loadGameScoresAdmin(this.value)"></select>
        </div>
        <div id="adminGameScoresList"><div style="color:var(--muted);font-size:.82rem">Spiel auswählen…</div></div>
      </div>

      <!-- Live Analytics -->
      <div style="${P};${BB}">
        <div class="card-head" style="margin-bottom:.7rem">
          <div class="card-head-icon" style="background:rgba(34,197,94,.15)"><i class="fas fa-chart-bar" style="color:#22c55e"></i></div>
          <div><div class="card-title">Live Analytics</div><div class="card-sub">Letzte 7 Tage</div></div>
        </div>
        <div id="adminAnalyticsSection"><div style="color:var(--muted);font-size:.82rem">Wird geladen…</div></div>
      </div>

      <!-- Statistiken -->
      <div style="${P}">
        <div class="card-head" style="margin-bottom:.7rem">
          <div class="card-head-icon" style="background:rgba(56,189,248,.15)"><i class="fas fa-chart-line" style="color:#38bdf8"></i></div>
          <div><div class="card-title">Statistiken</div><div class="card-sub">Letzte 12 Wochen</div></div>
        </div>
        <div id="adminStatsSummary" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.85rem"></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.1rem">
          <div><div style="font-size:.67rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.35rem">Prüfungen / Woche</div><canvas id="chartExams" height="150"></canvas></div>
          <div><div style="font-size:.67rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.35rem">IC-Stunden / Woche</div><canvas id="chartIc" height="150"></canvas></div>
          <div><div style="font-size:.67rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.35rem">Coin-Wirtschaft / Woche</div><canvas id="chartCoins" height="150"></canvas></div>
          <div><div style="font-size:.67rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.35rem">Beliebteste Spiele (12W)</div><canvas id="chartGames" height="150"></canvas></div>
          <div><div style="font-size:.67rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.35rem">Aktive Spieler / Woche</div><canvas id="chartPlayers" height="150"></canvas></div>
          <div><div style="font-size:.67rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.35rem">Längste Login-Serien</div><div id="topStreaksList" style="font-size:.81rem"></div></div>
        </div>
      </div>

    </div>`;
  loadPollAdmin();
  loadAdminStats();
  loadCustomTitles();
  loadAdminAnalytics();
  loadHonoraryTitles();
  loadAdminBets();
  loadGameScoresAdminList();
}

async function loadGameScoresAdminList() {
  const sel = $('adminGameScoreSelect');
  if (!sel) return;
  const games = await api('/api/admin/games-list');
  if (!games) return;
  sel.innerHTML = `<option value="">Spiel wählen…</option>` + games.map(g => `<option value="${g.key}">${esc(g.label)}</option>`).join('');
}

window.loadGameScoresAdmin = async game => {
  const list = $('adminGameScoresList');
  if (!list) return;
  if (!game) { list.innerHTML = '<div style="color:var(--muted);font-size:.82rem">Spiel auswählen…</div>'; return; }
  list.innerHTML = '<div style="color:var(--muted);font-size:.82rem">Wird geladen…</div>';
  const rows = await api(`/api/admin/game-scores/${game}`);
  if (!rows) return;
  if (!rows.length) { list.innerHTML = '<div class="empty" style="padding:.6rem"><p>Keine Einträge</p></div>'; return; }
  list.innerHTML = `<div class="tbl-wrap" style="max-height:320px;overflow-y:auto"><table class="data-tbl">
    <thead><tr><th>#</th><th>Spieler</th><th>Punkte</th><th></th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr>
      <td style="color:var(--muted);font-size:.78rem">${i + 1}</td>
      <td><div style="display:flex;align-items:center;gap:.45rem">${avatarEl(r, 22)}<span style="font-weight:600;font-size:.82rem">${esc(r.username)}</span></div></td>
      <td style="font-weight:700;font-size:.82rem">${(r.score || 0).toLocaleString('de-DE')}</td>
      <td><button class="btn btn-danger btn-sm" onclick="removeGameScore('${game}','${r.discord_id}','${esc(r.username)}')"><i class="fas fa-trash"></i></button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
};

window.removeGameScore = async (game, discordId, username) => {
  if (!confirm(`${username} aus der Rangliste entfernen?`)) return;
  const r = await api(`/api/admin/game-scores/${game}/${discordId}`, { method: 'DELETE' });
  if (r) { toast('Entfernt.', 'ok'); loadGameScoresAdmin(game); }
};

// BATCH 9: Admin Analytics
async function loadAdminAnalytics() {
  const el = document.getElementById('adminAnalyticsSection');
  if (!el) return;
  const d = await api('/api/admin/analytics?days=7');
  if (!d || _activePage !== 'admin') return;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.75rem;margin-bottom:1.25rem">
      ${[
        { val: d.dau.reduce((a,b) => a + b.users, 0), lbl: 'Aktive Nutzer (7T)', color: '#22c55e' },
        { val: d.newUsers, lbl: 'Neue Mitarbeiter', color: '#60a5fa' },
        { val: d.coinFlow.reduce((a,b) => a + b.earned, 0).toLocaleString('de-DE'), lbl: 'Coins verdient', color: '#fbbf24' },
        { val: d.examStats.reduce((a,b) => a + b.total, 0), lbl: 'Prüfungen (7T)', color: '#a855f7' },
      ].map(s => `<div class="card" style="padding:.85rem;text-align:center">
        <div style="font-size:1.5rem;font-weight:800;color:${s.color}">${s.val}</div>
        <div style="font-size:.7rem;color:var(--muted);margin-top:.2rem">${s.lbl}</div>
      </div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.25rem">
      <div class="card" style="padding:1rem">
        <div style="font-size:.72rem;font-weight:700;color:var(--muted);margin-bottom:.75rem">SPIELNUTZUNG (7T)</div>
        <div style="display:flex;flex-direction:column;gap:.3rem">
          ${d.gameUsage.length ? d.gameUsage.slice(0,8).map(g => `<div style="display:flex;align-items:center;gap:.5rem">
            <span style="font-size:.78rem;min-width:100px">${esc(g.game)}</span>
            <div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${d.gameUsage[0].sessions ? Math.round(g.sessions/d.gameUsage[0].sessions*100) : 0}%;background:#a855f7;border-radius:3px"></div>
            </div>
            <span style="font-size:.7rem;color:var(--muted)">${g.sessions}×</span>
          </div>`).join('') : '<div style="color:var(--muted);font-size:.8rem">Keine Daten</div>'}
        </div>
      </div>
      <div class="card" style="padding:1rem">
        <div style="font-size:.72rem;font-weight:700;color:var(--muted);margin-bottom:.75rem">TOP COIN-VERDIENER (7T)</div>
        ${d.topEarners.length ? d.topEarners.map((u,i) => `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">
          <span style="font-size:.75rem;color:var(--muted);width:16px">${i+1}</span>
          <span style="font-size:.82rem;font-weight:600;flex:1">${esc(u.username)}</span>
          <span style="font-size:.78rem;color:#fbbf24">+${(+u.net).toLocaleString('de-DE')}</span>
        </div>`).join('') : '<div style="color:var(--muted);font-size:.8rem">Keine Daten</div>'}
      </div>
    </div>
    <div class="card" style="padding:1rem">
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);margin-bottom:.75rem">COIN-FLOW (letzte 7 Tage)</div>
      <canvas id="coinFlowChart" height="120"></canvas>
    </div>`;

  const ctx = document.getElementById('coinFlowChart');
  if (ctx && d.coinFlow.length) { try { await loadLib('chart'); } catch {} }
  if (ctx && window.Chart && d.coinFlow.length) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: d.coinFlow.map(r => r.day.slice(5)),
        datasets: [
          { label: 'Verdient', data: d.coinFlow.map(r => r.earned), backgroundColor: 'rgba(34,197,94,.6)' },
          { label: 'Ausgegeben', data: d.coinFlow.map(r => r.spent), backgroundColor: 'rgba(239,68,68,.5)' }
        ]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#6b7280' } }, y: { ticks: { color: '#6b7280' } } } }
    });
  }
}

async function loadCustomTitles() {
  const card = $('customTitleCard'), list = $('customTitleList');
  if (!card || !list) return;
  const rows = await api('/api/admin/custom-titles');
  if (!rows?.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  list.innerHTML = rows.map(r => `
    <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.88rem">„✨ ${esc(r.text)}"</div>
        <div style="font-size:.72rem;color:var(--muted)">von ${esc(r.username || r.discord_id)} · ${ago(r.created_at)}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="decideCustomTitle(${r.id}, 'approve')"><i class="fas fa-check"></i> Freigeben</button>
      <button class="btn btn-danger btn-sm" onclick="decideCustomTitle(${r.id}, 'reject')"><i class="fas fa-times"></i> Ablehnen</button>
    </div>`).join('');
}

window.decideCustomTitle = async (id, action) => {
  const r = await api(`/api/admin/custom-titles/${id}`, { method: 'POST', body: { action } });
  if (r) { toast(action === 'approve' ? 'Titel freigegeben! ✨' : 'Abgelehnt – Coins erstattet', 'ok'); loadCustomTitles(); }
};

// ── Ehrentitel (Admin) ───────────────────────────────────────────
window._honoraryTargetId = null;
window._honoraryIcon = '⭐';

window.honoraryPickIcon = icon => {
  window._honoraryIcon = icon;
  const prev = $('honoraryIconPreview');
  if (prev) prev.textContent = icon;
  document.querySelectorAll('#honoraryIconGrid button').forEach(b => {
    const match = b.textContent.trim() === icon;
    b.style.borderColor = match ? 'var(--orange)' : 'var(--border)';
    b.style.background  = match ? 'rgba(249,115,22,.15)' : 'var(--input)';
  });
};

async function loadHonoraryTitles() {
  const el = $('honoraryList');
  if (!el) return;
  const rows = await api('/api/admin/honorary-titles');
  if (!rows) return;
  el.innerHTML = rows.length ? rows.map(r => `
    <div style="display:flex;align-items:center;gap:.5rem;padding:.4rem 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <span style="font-size:.7rem;padding:.15rem .5rem;background:rgba(251,191,36,.12);border:1px solid ${r.color||'#fbbf24'}33;color:${r.color||'#fbbf24'};border-radius:999px;font-weight:700">${r.icon||'⭐'} ${esc(r.title)}</span>
      <span style="font-size:.75rem;font-weight:600">${esc(r.username)}</span>
      <span style="font-size:.68rem;color:var(--muted);margin-left:auto">von ${esc(r.granted_by)} · ${ago(r.granted_at)}</span>
      <button class="btn btn-danger btn-sm" onclick="honoraryRevoke(${r.id})" title="Entziehen"><i class="fas fa-trash"></i></button>
    </div>`).join('')
  : '<div style="font-size:.8rem;color:var(--muted)">Noch keine Ehrentitel vergeben.</div>';
}

window.honorarySearchUser = async () => {
  const q = $('honorarySearch')?.value.trim();
  const res_el = $('honoraryResults');
  if (!q) { if (res_el) res_el.style.display = 'none'; return; }
  const rows = await api(`/api/users`);
  if (!rows || !res_el) return;
  const filtered = rows.filter(u => u.username.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  if (!filtered.length) { res_el.innerHTML = '<div style="padding:.45rem .75rem;font-size:.8rem;color:var(--muted)">Nicht gefunden</div>'; res_el.style.display = 'block'; return; }
  res_el.innerHTML = filtered.map(u => `
    <div style="padding:.4rem .75rem;cursor:pointer;font-size:.82rem;display:flex;align-items:center;gap:.5rem;border-bottom:1px solid var(--border)"
      onmousedown="honorarySelect(${u.id},'${esc(u.username).replace(/'/g,"\\'")}')"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <i class="fas fa-user" style="color:var(--muted);font-size:.72rem"></i>
      <span style="font-weight:600">${esc(u.username)}</span>
      <span style="font-size:.68rem;color:var(--muted);margin-left:auto">${u.role}</span>
    </div>`).join('');
  res_el.style.display = 'block';
};

window.honorarySelect = (id, name) => {
  window._honoraryTargetId = id;
  const inp = $('honorarySearch'), tgt = $('honoraryTarget'), nm = $('honoraryTargetName'), res = $('honoraryResults');
  if (inp) inp.style.display = 'none';
  if (tgt) tgt.style.display = '';
  if (nm)  nm.textContent = name;
  if (res) res.style.display = 'none';
};

window.honoraryClear = () => {
  window._honoraryTargetId = null;
  const inp = $('honorarySearch'), tgt = $('honoraryTarget');
  if (inp) { inp.style.display = ''; inp.value = ''; }
  if (tgt) tgt.style.display = 'none';
  // Reset icon selection
  window._honoraryIcon = '⭐';
  const prev = $('honoraryIconPreview'); if (prev) prev.textContent = '⭐';
  document.querySelectorAll('#honoraryIconGrid button').forEach(b => { b.style.borderColor = 'var(--border)'; b.style.background = 'var(--input)'; });
};

window.honoraryGrant = async () => {
  const user_id = window._honoraryTargetId;
  const title   = $('honoraryTitle')?.value.trim();
  const color   = $('honoraryColor')?.value || '#fbbf24';
  const icon    = window._honoraryIcon || '⭐';
  if (!user_id) { toast('Mitarbeiter auswählen', 'err'); return; }
  if (!title || title.length < 2) { toast('Titel eingeben', 'err'); return; }
  const r = await api('/api/admin/honorary-titles', { method: 'POST', body: { user_id, title, color, icon } });
  if (r) {
    toast(`Ehrentitel vergeben! ${icon}`, 'ok');
    honoraryClear();
    if ($('honoraryTitle')) $('honoraryTitle').value = '';
    window._honoraryIcon = '⭐';
    const prev = $('honoraryIconPreview'); if (prev) prev.textContent = '⭐';
    document.querySelectorAll('#honoraryIconGrid button').forEach(b => { b.style.borderColor = 'var(--border)'; b.style.background = 'var(--input)'; });
    loadHonoraryTitles();
  }
};

window.honoraryRevoke = async id => {
  if (!confirm('Ehrentitel entziehen?')) return;
  const r = await api(`/api/admin/honorary-titles/${id}`, { method: 'DELETE' });
  if (r) { toast('Titel entzogen.'); loadHonoraryTitles(); }
};

// ── Admin-Wetten ──────────────────────────────────────────────────
async function loadAdminBets() {
  const section = $('adminBetsSection'), list = $('adminBetsList');
  if (!section || !list) return;
  const rows = await api('/api/admin/bets');
  if (!rows) return;
  const accepted = rows.filter(b => b.status === 'accepted');
  section.style.display = accepted.length ? '' : 'none';
  if (!accepted.length) return;
  list.innerHTML = accepted.map(b => `
    <div style="background:var(--input);border-radius:var(--r);padding:.75rem;margin-bottom:.5rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;flex-wrap:wrap">
        <span style="font-size:.67rem;font-weight:700;color:var(--muted)">#${b.id}</span>
        <span style="font-size:.78rem;font-weight:800;color:#fbbf24">${b.amount.toLocaleString('de-DE')} 🪙 je Seite</span>
        <span style="font-size:.68rem;color:var(--muted);margin-left:auto">${ago(b.created_at)}</span>
      </div>
      <div style="font-size:.83rem;font-weight:700;margin-bottom:.35rem">${esc(b.description)}</div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:.55rem">
        <b>${esc(b.creator_name)}</b> vs. <b>${esc(b.opponent_name)}</b>
      </div>
      <input class="form-control" id="betNote-${b.id}" placeholder="Admin-Notiz (optional)" style="margin-bottom:.4rem;font-size:.8rem">
      <div style="display:flex;gap:.4rem;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="adminResolveBet(${b.id},'${b.creator_did}')">
          <i class="fas fa-trophy"></i> ${esc(b.creator_name)} gewinnt
        </button>
        <button class="btn btn-primary btn-sm" onclick="adminResolveBet(${b.id},'${b.opponent_did}')"
          style="background:linear-gradient(135deg,#a855f7,#7c3aed)">
          <i class="fas fa-trophy"></i> ${esc(b.opponent_name)} gewinnt
        </button>
      </div>
    </div>`).join('');
}

window.adminResolveBet = async (id, winner_did) => {
  const admin_note = $(`betNote-${id}`)?.value.trim() || null;
  const r = await api(`/api/admin/bets/${id}/resolve`, { method: 'POST', body: { winner_did, admin_note } });
  if (r) { toast('Wette aufgelöst – Coins ausgezahlt! 🏆', 'ok'); loadAdminBets(); }
};

let _adminCharts = [];
async function loadAdminStats() {
  if (typeof Chart === 'undefined') return; // CDN nicht geladen
  const d = await api('/api/admin/stats');
  if (!d || _activePage !== 'admin') return;

  const chip = (label, val, color) => `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:.5rem .9rem">
      <div style="font-size:1.05rem;font-weight:800;color:${color}">${(+val).toLocaleString('de-DE')}</div>
      <div style="font-size:.66rem;color:var(--muted)">${label}</div>
    </div>`;
  const sumEl = $('adminStatsSummary');
  if (sumEl) sumEl.innerHTML =
    chip('Aktive Mitarbeiter', d.summary.activeStaff, 'var(--text)') +
    chip('Prüfungen gesamt', d.summary.examsTotal, '#22c55e') +
    chip('Coins im Umlauf', d.summary.coinsInUmlauf, '#fbbf24') +
    chip('Coins jemals verdient', d.summary.coinsTotal, '#fbbf24') +
    chip('Aktive Spieler (7 Tage)', d.summary.activeWeek ?? 0, '#60a5fa') +
    chip('Transfers (7 Tage)', d.summary.transfers7d ?? 0, '#4ade80');

  _adminCharts.forEach(c => { try { c.destroy(); } catch {} });
  _adminCharts = [];
  const wkLabel = r => 'KW ' + isoWeek(r.wk);
  const tick = '#9ca3af', grid = 'rgba(128,128,128,.14)';
  const baseOpts = {
    responsive: true,
    plugins: { legend: { labels: { color: tick, boxWidth: 12, font: { size: 10 } } } },
    scales: {
      x: { ticks: { color: tick, font: { size: 10 } }, grid: { color: grid } },
      y: { beginAtZero: true, ticks: { color: tick, font: { size: 10 } }, grid: { color: grid } },
    },
  };
  try { await loadLib('chart'); } catch {}
  const mk = (id, cfg) => { const el = $(id); if (el && window.Chart) _adminCharts.push(new Chart(el, cfg)); };

  mk('chartExams', {
    type: 'bar',
    data: {
      labels: d.exams.map(wkLabel),
      datasets: [
        { label: 'Bestanden',       data: d.exams.map(r => r.p),       backgroundColor: '#22c55e' },
        { label: 'Nicht bestanden', data: d.exams.map(r => r.c - r.p), backgroundColor: '#ef4444' },
      ],
    },
    options: { ...baseOpts, scales: { x: { stacked: true, ...baseOpts.scales.x }, y: { stacked: true, ...baseOpts.scales.y } } },
  });
  mk('chartIc', {
    type: 'line',
    data: {
      labels: d.ic.map(wkLabel),
      datasets: [{ label: 'IC-Stunden', data: d.ic.map(r => r.h), borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,.15)', fill: true, tension: .3 }],
    },
    options: baseOpts,
  });
  mk('chartCoins', {
    type: 'line',
    data: {
      labels: d.coins.map(wkLabel),
      datasets: [
        { label: 'Verdient',   data: d.coins.map(r => r.earned), borderColor: '#22c55e', tension: .3 },
        { label: 'Ausgegeben', data: d.coins.map(r => r.spent),  borderColor: '#ef4444', tension: .3 },
      ],
    },
    options: baseOpts,
  });
  if (d.games?.length) mk('chartGames', {
    type: 'bar',
    data: {
      labels: d.games.map(g => GAME_NAMES_DE[g.game] || g.game),
      datasets: [{ label: 'Spielrunden', data: d.games.map(g => g.plays), backgroundColor: '#a855f7' }],
    },
    options: { ...baseOpts, indexAxis: 'y', plugins: { legend: { display: false } } },
  });
  if (d.activePlayers?.length) {
    const dcByWk = Object.fromEntries((d.dailyClaims || []).map(r => [r.wk, r.c]));
    mk('chartPlayers', {
      type: 'line',
      data: {
        labels: d.activePlayers.map(wkLabel),
        datasets: [
          { label: 'Aktive Spieler', data: d.activePlayers.map(r => r.c), borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,.15)', fill: true, tension: .3 },
          { label: 'Tagesbonus-Abholungen', data: d.activePlayers.map(r => dcByWk[r.wk] || 0), borderColor: '#fb923c', tension: .3 },
        ],
      },
      options: baseOpts,
    });
  }
  const streakEl = $('topStreaksList');
  if (streakEl) streakEl.innerHTML = (d.topStreaks || []).length
    ? d.topStreaks.map((s, i) => `
      <div style="display:flex;align-items:center;gap:.6rem;padding:.45rem 0;border-bottom:1px solid var(--border)">
        <span style="width:22px;text-align:center;font-weight:700">${['🥇','🥈','🥉'][i] || (i + 1) + '.'}</span>
        <span style="flex:1;font-weight:600">${esc(s.username || '?')}</span>
        <span style="color:#fb923c;font-weight:700">🔥 ${s.best_streak}</span>
        <span style="color:var(--muted);font-size:.7rem">aktuell: ${s.streak}</span>
      </div>`).join('')
    : '<div style="color:var(--muted);font-size:.78rem;padding:.5rem 0">Noch keine Login-Serien</div>';
}

async function loadPollAdmin() {
  const el = document.getElementById('pollAdminContent');
  if (!el) return;
  const polls = await fetch('/api/poll/active').then(r => r.json()).catch(() => null);
  if (!polls || !Array.isArray(polls) || polls.length === 0) {
    el.innerHTML = '<div style="font-size:.82rem;color:var(--muted)">Keine aktive Umfrage.</div>';
    return;
  }
  el.innerHTML = polls.map(poll => {
    const totalVotes = poll.totalVotes;
    return `<div style="border:1px solid var(--border);border-radius:8px;padding:.6rem .8rem;margin-bottom:.6rem">
      <div style="font-size:.82rem;font-weight:600;margin-bottom:.4rem">${esc(poll.question)}</div>
      ${poll.options.map(opt => {
        const pct = totalVotes ? Math.round(opt.count / totalVotes * 100) : 0;
        return `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;font-size:.78rem">
          <span style="flex:1;color:var(--muted)">${esc(opt.label)}</span>
          <span style="font-weight:700">${opt.count}</span>
          <span style="color:var(--muted)">(${pct}%)</span>
        </div>`;
      }).join('')}
      <div style="font-size:.75rem;color:var(--muted);margin-top:.3rem">${totalVotes} Stimmen gesamt</div>
      <div style="display:flex;gap:.4rem;margin-top:.65rem">
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="deactivatePollAdmin(${poll.id})"><i class="fas fa-stop"></i> Beenden</button>
        <button class="btn btn-danger btn-sm" onclick="deletePollAdmin(${poll.id})"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

window.submitPollAdmin = async () => {
  const q = document.getElementById('pollQuestion')?.value.trim();
  const opts = ['pollOpt1','pollOpt2','pollOpt3','pollOpt4']
    .map(id => document.getElementById(id)?.value.trim()).filter(Boolean);
  if (!q || opts.length < 2) { toast('Frage und mindestens 2 Optionen eingeben', 'err'); return; }
  const r = await api('/api/polls', { method: 'POST', body: { question: q, options: opts } });
  if (r) {
    toast('Umfrage gestartet!', 'ok');
    ['pollQuestion','pollOpt1','pollOpt2','pollOpt3','pollOpt4'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    loadPollAdmin();
    loadPollWidget('staffPollWidget');
  }
};

window.deactivatePollAdmin = async id => {
  await api(`/api/polls/${id}/deactivate`, { method: 'PATCH', body: {} });
  toast('Umfrage beendet', 'ok');
  loadPollAdmin();
  const cid = document.getElementById('staffPollWidget') ? 'staffPollWidget' : 'vPollWidget';
  loadPollWidget(cid);
};

window.deletePollAdmin = async id => {
  if (!confirm('Umfrage und alle Stimmen löschen?')) return;
  await api(`/api/polls/${id}`, { method: 'DELETE' });
  toast('Umfrage gelöscht', 'ok');
  loadPollAdmin();
  const cid = document.getElementById('staffPollWidget') ? 'staffPollWidget' : 'vPollWidget';
  loadPollWidget(cid);
};

window.openAddUser = () => openModal(`
  <div class="modal-head"><div class="modal-title">Nutzer hinzufügen</div>
  <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
  <form onsubmit="submitUser(event)">
    <div class="form-group"><label>Benutzername</label><input class="form-control" id="uName" required></div>
    <div class="form-group"><label>Discord-ID (18-stellig)</label><input class="form-control" id="uDid" placeholder="102938475610293847" required></div>
    <div class="form-group"><label>Rolle</label>
      <select class="form-control" id="uRole"><option value="member">Mitarbeiter</option><option value="ausbilder">Ausbilder</option><option value="admin">Admin</option><option value="citizen">Bürger (kein ACLS-Mitarbeiter)</option></select>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Hinzufügen</button>
    </div>
  </form>`);

window.submitUser = async e => {
  e.preventDefault();
  const r = await api('/api/users', { method: 'POST', body: { discord_id: $('uDid').value.trim(), username: $('uName').value.trim(), role: $('uRole').value }});
  if (r) { closeModal(); toast('Nutzer hinzugefügt!', 'ok'); admin(); }
};

window.toggleRole = async (id, role) => {
  const r = await api(`/api/users/${id}`, { method: 'PATCH', body: { role: role === 'admin' ? 'member' : 'admin' }});
  if (r) { toast('Rolle geändert.', 'ok'); admin(); }
};

window.setRole = async (id, role) => {
  if (id === currentUser.id && role !== 'admin') {
    toast('Du kannst dich nicht selbst herabstufen.', 'err');
    admin();
    return;
  }
  const r = await api(`/api/users/${id}`, { method: 'PATCH', body: { role } });
  if (r) toast('Rolle gespeichert.', 'ok');
};

window.removeUser = async id => {
  if (!confirm('Nutzer entfernen?')) return;
  const r = await api(`/api/users/${id}`, { method: 'DELETE' });
  if (r) { toast('Entfernt.', 'ok'); admin(); }
};

window.openRenameUser = (id) => openModal((currentName => `
  <div class="modal-head">
    <div class="modal-title"><i class="fas fa-pen" style="color:var(--orange);margin-right:.5rem"></i>Namen ändern</div>
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
  </div>
  <form onsubmit="submitRenameUser(event,${id})">
    <div class="form-group">
      <label>Neuer Name</label>
      <input class="form-control" id="renameInput" value="${currentName}" required autofocus>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
    </div>
  </form>`)(esc(window._userNames?.[id] || '')));

window.submitRenameUser = async (e, id) => {
  e.preventDefault();
  const username = $('renameInput').value.trim();
  if (!username) return;
  const r = await api(`/api/users/${id}`, { method: 'PATCH', body: { username } });
  if (r) { toast('Name geändert.', 'ok'); closeModal(); admin(); }
};

window.setRank = async (id, rank) => {
  const r = await api(`/api/users/${id}/rank`, { method: 'PATCH', body: { rank } });
  if (r) toast('Rang gespeichert.', 'ok');
};

// ── Admin: Coins verwalten ───────────────────────────────────────
let _coinAdminResults = [];
let _coinAdminTarget  = null;
let _coinAdminTimer   = null;
window.coinAdminSearch = () => {
  clearTimeout(_coinAdminTimer);
  _coinAdminTimer = setTimeout(async () => {
    const q   = $('coinAdminSearch').value.trim();
    const box = $('coinAdminResults');
    if (!box) return;
    if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const rows = await api('/api/admin/coins/search?q=' + encodeURIComponent(q));
    _coinAdminResults = rows || [];
    if (!_coinAdminResults.length) {
      box.innerHTML = '<div style="padding:.55rem .75rem;color:var(--muted);font-size:.82rem">Niemand gefunden</div>';
    } else {
      box.innerHTML = _coinAdminResults.map((r, i) => `
        <div style="padding:.5rem .75rem;cursor:pointer;display:flex;justify-content:space-between;gap:.6rem;border-bottom:1px solid var(--border)"
             onmousedown="pickCoinAdmin(${i})">
          <span style="font-weight:600">${esc(r.username || r.discord_id)}
            <span style="font-size:.7rem;color:var(--muted)">(${r.role === 'admin' ? 'Admin' : r.role === 'ausbilder' ? 'Ausbilder' : r.role === 'member' ? 'Mitarbeiter' : 'Bürger'})</span>
          </span>
          <span style="color:#fbbf24;font-weight:700;white-space:nowrap">${(r.balance || 0).toLocaleString('de-DE')} 🪙</span>
        </div>`).join('');
    }
    box.style.display = '';
  }, 220);
};
window.pickCoinAdmin = (i) => {
  const t = _coinAdminResults[i];
  if (!t) return;
  _coinAdminTarget = t;
  $('coinAdminResults').style.display = 'none';
  $('coinAdminSearch').value = t.username || t.discord_id;
  $('coinAdminTarget').style.display = '';
  $('coinAdminTargetName').textContent = t.username || t.discord_id;
  $('coinAdminTargetBal').textContent  = (t.balance || 0).toLocaleString('de-DE') + ' Coins';
  $('coinAdminAmount').value = '';
  $('coinAdminAmount').focus();
};
window.applyCoinAdmin = async () => {
  if (!_coinAdminTarget) { toast('Erst einen Nutzer wählen', 'err'); return; }
  const mode   = $('coinAdminMode').value;
  const amount = parseInt($('coinAdminAmount').value, 10);
  if (!Number.isFinite(amount)) { toast('Betrag fehlt', 'err'); return; }
  const r = await api('/api/admin/coins', { method: 'POST', body: { discord_id: _coinAdminTarget.discord_id, mode, amount } });
  if (r?.ok) {
    toast(`${_coinAdminTarget.username || 'Konto'}: jetzt ${r.balance.toLocaleString('de-DE')} Coins`, 'ok');
    _coinAdminTarget.balance = r.balance;
    $('coinAdminTargetBal').textContent = r.balance.toLocaleString('de-DE') + ' Coins';
    $('coinAdminAmount').value = '';
  }
};

// ── Bürgeransicht (Admin-Vorschau) ───────────────────────────────
window.enterCitizenView = async () => {
  window._origVoterLogout = window.voterLogout;
  window.voterLogout = () => toast('Abmelden nicht verfügbar in der Vorschau.', 'err');

  const banner = document.createElement('div');
  banner.id = 'citizenPreviewBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#7c3aed;color:#fff;padding:8px 20px;display:flex;align-items:center;justify-content:space-between;font-family:Inter,sans-serif;font-size:13px;font-weight:600;box-shadow:0 2px 12px rgba(0,0,0,.4)';
  banner.innerHTML = `
    <span><i class="fas fa-eye" style="margin-right:8px"></i>Bürgeransicht – Vorschau</span>
    <button onclick="exitCitizenView()" style="background:rgba(255,255,255,.2);border:none;color:#fff;padding:5px 16px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;font-family:Inter,sans-serif">← Zurück zum Admin</button>`;
  document.body.appendChild(banner);

  $('app').classList.add('hidden');
  $('loginScreen').classList.add('hidden');
  $('voterScreen').classList.remove('hidden');
  $('voterScreen').style.paddingTop = '44px';
  await renderVoterScreen();
};

window.exitCitizenView = () => {
  const banner = document.getElementById('citizenPreviewBanner');
  if (banner) banner.remove();
  $('voterScreen').classList.add('hidden');
  $('voterScreen').style.paddingTop = '';
  $('app').classList.remove('hidden');
  if (window._origVoterLogout) {
    window.voterLogout = window._origVoterLogout;
    delete window._origVoterLogout;
  }
};

window.openAnnouncementModal = () => openModal(`
  <div class="modal-head"><div class="modal-title"><i class="fas fa-bullhorn" style="color:var(--orange);margin-right:.5rem"></i>Ankündigung erstellen</div>
  <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
  <form onsubmit="submitAnnouncement(event)">
    <div class="form-group"><label>Titel</label><input class="form-control" id="annTitle" placeholder="Titel der Ankündigung" required></div>
    <div class="form-group"><label>Inhalt</label><textarea class="form-control" id="annContent" rows="4" placeholder="Text der Ankündigung..." required style="resize:vertical"></textarea></div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Veröffentlichen</button>
    </div>
  </form>`);

window.submitAnnouncement = async e => {
  e.preventDefault();
  const r = await api('/api/announcements', { method: 'POST', body: { title: $('annTitle').value.trim(), content: $('annContent').value.trim() } });
  if (r) { toast('Ankündigung veröffentlicht!', 'ok'); closeModal(); admin(); }
};

window.deleteAnnouncement = async id => {
  if (!confirm('Ankündigung löschen?')) return;
  const r = await api(`/api/announcements/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht.', 'ok'); admin(); }
};

window.pinAnnouncement = async id => {
  const r = await api(`/api/announcements/${id}/pin`, { method: 'PATCH' });
  if (r) { toast('Gespeichert.', 'ok'); admin(); }
};

window.resolveComplaint = async (id, status, response) => {
  const r = await api(`/api/complaints/${id}`, { method: 'PATCH', body: { status, admin_response: response || null } });
  if (r) { toast('Gespeichert.', 'ok'); closeModal(); admin(); }
};

window.openComplaint = (id) => {
  const complaints = window._adminComplaints || [];
  const c = complaints.find(x => x.id === id);
  if (!c) return;
  const statusColor = s => s === 'offen' ? '#ef4444' : s === 'in_bearbeitung' ? '#f59e0b' : '#22c55e';
  const statusLabel = s => s === 'offen' ? 'Offen' : s === 'in_bearbeitung' ? 'In Bearbeitung' : 'Gelöst';
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-comment-alt" style="color:var(--orange);margin-right:.5rem"></i>Beschwerde</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="display:flex;flex-direction:column;gap:.7rem">
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;font-size:.82rem;color:var(--muted)">
        <span><i class="fas fa-user" style="margin-right:.3rem"></i><b style="color:var(--fg)">${esc(c.citizen_name)}</b></span>
        <span><i class="fas fa-calendar" style="margin-right:.3rem"></i>${new Date(c.created_at).toLocaleDateString('de-DE')}</span>
        <span style="padding:.15rem .5rem;border-radius:6px;font-weight:600;font-size:.75rem;background:${statusColor(c.status)}22;color:${statusColor(c.status)}">${statusLabel(c.status)}</span>
      </div>
      <div style="font-weight:700;font-size:1rem">${esc(c.subject)}</div>
      <div style="background:var(--input);border-radius:var(--r);padding:.85rem 1rem;font-size:.87rem;line-height:1.65;white-space:pre-wrap;color:var(--fg)">${esc(c.message)}</div>
      ${c.admin_response ? `<div style="padding:.6rem .8rem;background:rgba(59,130,246,.1);border-left:3px solid #3b82f6;border-radius:6px;font-size:.85rem"><b style="color:#3b82f6">Bisherige Antwort:</b><br>${esc(c.admin_response)}</div>` : ''}
      <div class="form-group" style="margin:0">
        <label style="font-size:.8rem">Antwort an Bürger (optional)</label>
        <textarea class="form-control" id="complaint-response" rows="3" placeholder="Diese Antwort wird dem Bürger angezeigt…" style="resize:vertical">${esc(c.admin_response||'')}</textarea>
      </div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-sm" style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid #ef444444" onclick="resolveComplaint(${c.id},'offen',document.getElementById('complaint-response').value)">Offen</button>
        <button class="btn btn-sm" style="background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid #f59e0b44" onclick="resolveComplaint(${c.id},'in_bearbeitung',document.getElementById('complaint-response').value)">In Bearbeitung</button>
        <button class="btn btn-primary btn-sm" onclick="resolveComplaint(${c.id},'geloest',document.getElementById('complaint-response').value)"><i class="fas fa-check"></i> Gelöst</button>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`);
};

window.openAddQuestion = (cid = '', catName = '') => openModal(`
  <div class="modal-head"><div class="modal-title">Frage hinzufügen</div>
  <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
  <form onsubmit="submitQuestion(event)">
    <div class="form-group"><label>Kategorie</label>
      <select class="form-control" id="qCat" id="qCat">
        ${(window._adminCats || []).map(c => `<option value="${c.id}"${c.id==cid?' selected':''}>${c.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Frage</label><textarea class="form-control" id="qText" rows="3" required></textarea></div>
    <div class="form-group"><label>Antwort A</label><input class="form-control" id="qA" required></div>
    <div class="form-group"><label>Antwort B</label><input class="form-control" id="qB" required></div>
    <div class="form-group"><label>Antwort C</label><input class="form-control" id="qC" required></div>
    <div class="form-group"><label>Antwort D <span style="color:var(--muted);font-size:.8rem">(optional)</span></label><input class="form-control" id="qD"></div>
    <div class="form-group"><label>Richtige Antwort</label>
      <select class="form-control" id="qAns"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Speichern</button>
    </div>
  </form>`);

window.submitQuestion = async e => {
  e.preventDefault();
  const r = await api('/api/exam-questions', { method: 'POST', body: { category_id: +$('qCat').value, question: $('qText').value.trim(), option_a: $('qA').value.trim(), option_b: $('qB').value.trim(), option_c: $('qC').value.trim(), option_d: $('qD').value.trim(), correct_answer: +$('qAns').value }});
  if (r) { closeModal(); toast('Frage gespeichert!', 'ok'); admin(); }
};

window.manageQuestions = async (cid, name, icon) => {
  const qs = await api(`/api/exam-questions/${cid}`);
  openModal(`
    <div class="modal-head"><div class="modal-title"><i class="fas ${icon}" style="color:var(--orange);margin-right:.5rem"></i>${name} – Fragen (${qs?.length || 0})</div>
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <button class="btn btn-primary btn-sm" onclick="openAddQuestion(${cid})" style="margin-bottom:1rem"><i class="fas fa-plus"></i> Neue Frage</button>
    <div style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:.5rem">
      ${(qs || []).map(q => `<div style="background:var(--input);border-radius:var(--r);padding:.75rem">
        <div style="font-size:.85rem;font-weight:600;margin-bottom:.4rem">${q.question}</div>
        <div style="display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.5rem">
          ${[q.option_a,q.option_b,q.option_c,q.option_d].map((o,i)=>({o,i})).filter(({o})=>o&&o.trim()).map(({o,i})=>`<span class="badge ${i===q.correct_answer?'badge-g':'badge-m'}">${'ABCD'[i]}: ${o}</span>`).join('')}
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteQuestion(${q.id})"><i class="fas fa-trash"></i></button>
      </div>`).join('') || '<div class="empty"><i class="fas fa-question-circle"></i><p>Keine Fragen</p></div>'}
    </div>`);
  window._adminCats = await api('/api/exam-categories');
};

window.deleteQuestion = async id => {
  const r = await api(`/api/exam-questions/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht.', 'ok'); closeModal(); admin(); }
};

// ════════════════════════════════════════════════════════════════
//  PROFILE MODAL
// ════════════════════════════════════════════════════════════════
const BADGE_META = {
  exams_10:  { icon: 'fa-star',   color: '#eab308', label: '10 Prüfungen abgenommen' },
  exams_50:  { icon: 'fa-medal',  color: '#f97316', label: '50 Prüfungen abgenommen' },
  exams_100: { icon: 'fa-trophy', color: '#f59e0b', label: '100 Prüfungen abgenommen' },
  eow_1:     { icon: 'fa-crown',  color: '#f97316', label: '1x Mitarbeiter der Woche' },
  eow_3:     { icon: 'fa-gem',    color: '#a855f7', label: '3x Mitarbeiter der Woche' },
  eow_5:     { icon: 'fa-award',  color: '#f59e0b', label: '5x Mitarbeiter der Woche' },
  game_3:    { icon: 'fa-gamepad',      color: '#cd7f32', label: '3 Minispiele gespielt' },
  game_10:   { icon: 'fa-gamepad',      color: '#f59e0b', label: '10 Minispiele gespielt' },
  duel_5:    { icon: 'fa-bolt',         color: '#f472b6', label: '5 Duell-Siege' },
  duel_25:   { icon: 'fa-bolt',         color: '#f59e0b', label: '25 Duell-Siege' },
  tow_pro:   { icon: 'fa-truck-pickup', color: '#fb923c', label: 'Abschlepp-Profi' },
  bj_500:    { icon: 'fa-heart',        color: '#ef4444', label: 'High Roller' },
  coins_1k:  { icon: 'fa-coins',        color: '#cd7f32', label: '1.000 Coins verdient' },
  coins_10k: { icon: 'fa-coins',        color: '#f59e0b', label: '10.000 Coins verdient' },
};
const RANK_COLOR = { Azubi: '#6b7280', Mitarbeiter: '#3b82f6', Senior: '#f97316', Führungskraft: '#a855f7' };

window.openProfileModal = async id => {
  const d = await api(`/api/profile/${id}`);
  if (!d) return;
  const { user: u, stats: st, recentExams, badges, birthday } = d;
  const url = avatarUrl(u);
  const rank = u.rank || 'Mitarbeiter';
  const rankColor = RANK_COLOR[rank] || '#6b7280';

  openModal(`
    <div class="modal-head"><div class="modal-title">Profil</div>
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <div class="profile-header" style="${u.equipped_banner && BANNER_CSS[u.equipped_banner] ? `background:${BANNER_CSS[u.equipped_banner]};border-radius:12px;padding:1rem;` : ''}">
      <div class="profile-av" style="${url ? 'background:transparent;padding:0;overflow:hidden;' : ''}${frameGlow(u.equipped_frame)}">
        ${url ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='${initials(u.username)}'">` : initials(u.username)}
      </div>
      <div>
        <div class="profile-name" style="${nameColorCss(u.equipped_namecolor)}">${decoEmoji(u.equipped_deco)}${esc(u.username)}</div>
        ${titleLine(u.equipped_title, '.75rem')}
        <div style="display:flex;align-items:center;gap:.4rem;margin-top:.2rem">
          <span style="font-size:.78rem;font-weight:700;padding:.15rem .55rem;border-radius:20px;background:${rankColor}22;color:${rankColor};border:1px solid ${rankColor}44">${rank}</span>
          ${u.role === 'admin' ? '<span style="font-size:.72rem;font-weight:600;padding:.1rem .45rem;border-radius:20px;background:rgba(249,115,22,.15);color:var(--orange)">Admin</span>' : ''}
        </div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:.2rem"><i class="fab fa-discord"></i> ${u.discord_id}</div>
      </div>
    </div>
    ${badges?.length ? `
    <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.85rem">
      ${badges.map(b => { const m = BADGE_META[b.badge_type]; return m ? `<div title="${m.label}" style="display:flex;align-items:center;gap:.35rem;padding:.25rem .6rem;border-radius:20px;background:${m.color}22;border:1px solid ${m.color}44;font-size:.78rem;font-weight:600;color:${m.color}"><i class="fas ${m.icon}"></i>${m.label}</div>` : ''; }).join('')}
    </div>` : ''}
    <div class="profile-stats">
      <div class="pstat"><div class="pstat-val">${st.conducted}</div><div class="pstat-lbl">Prüfungen abgenommen</div></div>
      <div class="pstat"><div class="pstat-val o" style="color:var(--orange)">${st.eow_wins}</div><div class="pstat-lbl">MA der Woche</div></div>
      <div class="pstat"><div class="pstat-val" style="color:var(--blue)">${(+st.ic_total||0).toFixed(2)}h</div><div class="pstat-lbl">IC-Stunden gesamt</div></div>
    </div>
    <div style="display:flex;gap:.5rem;margin-bottom:.85rem">
      <div style="flex:1;background:var(--input);border-radius:var(--r);padding:.65rem;text-align:center">
        <div style="font-size:1.1rem;font-weight:700;color:var(--orange)">${(+st.ic_week||0).toFixed(2)}h</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:.1rem">IC-Zeit diese Woche</div>
      </div>
      <div style="flex:1;background:var(--input);border-radius:var(--r);padding:.65rem;text-align:center">
        <div style="font-size:1.1rem;font-weight:700;color:var(--green)">${st.total_exams}</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:.1rem">Online-Tests gemacht</div>
      </div>
    </div>
    <div class="divider"></div>
    <div style="font-size:.78rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.65rem">Letzte Tests</div>
    ${recentExams.length ? recentExams.map(s => `
      <div class="re-item">
        <div class="re-ico ${s.passed ? 'pass' : 'fail'}"><i class="fas ${s.passed ? 'fa-check' : 'fa-times'}"></i></div>
        <div class="re-info">
          <div class="re-name">${s.category_name} ${s.mode === 'flash' ? 'Blitz' : 'Volltest'}</div>
          <div class="re-meta">${s.score}/${s.total} richtig</div>
        </div>
        <div class="re-time">${ago(s.taken_at)}</div>
      </div>`).join('') : '<div class="empty" style="padding:.5rem"><p>Keine Tests absolviert</p></div>'}
    ${id == currentUser?.id ? `
    <div class="divider"></div>
    <div style="display:flex;align-items:center;gap:.7rem;flex-wrap:wrap">
      <div class="card-head-icon" style="width:28px;height:28px;font-size:.75rem;background:rgba(249,115,22,.15)"><i class="fas fa-birthday-cake" style="color:var(--orange)"></i></div>
      <div style="flex:1"><div style="font-weight:600;font-size:.85rem">Mein Geburtstag</div><div style="font-size:.73rem;color:var(--muted)">Wird im Team-Dashboard angezeigt</div></div>
    </div>
    <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-top:.55rem">
      <input class="form-control" id="birthdayInput" type="text" placeholder="MM-TT (z.B. 06-15)" maxlength="5" value="${birthday||''}" style="width:150px" oninput="this.value=this.value.replace(/[^0-9\\-]/g,'')">
      <button class="btn btn-primary btn-sm" onclick="saveBirthday()"><i class="fas fa-save"></i> Speichern</button>
      <span style="font-size:.73rem;color:var(--muted)">z.B. 06-15 für 15. Juni</span>
    </div>` : ''}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
    </div>`);
};

// ════════════════════════════════════════════════════════════════
//  AUSBILDUNG – RANG-PRÜFUNGEN
// ════════════════════════════════════════════════════════════════
let activeRankExam    = null;
let currentRankModule  = 'm1'; // 'm1' | 'm2' | 'm3'
let currentRankM2Idx   = 0;    // aktuelle Frage in M2
let examPollTimer      = null;  // setInterval-Handle für Sync-Polling

let _lastExamSig = '';

function startExamPolling() {
  // SSE übernimmt Echtzeit-Sync; Polling nur als Fallback (30s) für Verbindungsabbrüche
  stopExamPolling();
  _lastExamSig = '';
  examPollTimer = setInterval(async () => {
    if (!activeRankExam) return stopExamPolling();
    let resp, state;
    try { resp = await fetch('/api/rank-exam/state', { headers: { 'Content-Type': 'application/json' } }); } catch { return; }
    if (resp.status === 404 || resp.status === 403) {
      stopExamPolling();
      if (activeRankExam) { activeRankExam = null; closeModal(); toast('Prüfung wurde abgeschlossen.', 'info'); }
      return;
    }
    if (!resp.ok) return;
    try { state = await resp.json(); } catch { return; }
    if (!state || !activeRankExam) return;
    const sig = JSON.stringify([state.m1_data, state.m2_answers, state.m3_ratings, state.m3_notes, state.current_module, state.current_m2_idx]);
    if (sig === _lastExamSig) return;
    _lastExamSig = sig;
    if (state.m1_data    !== null)      activeRankExam.m1Data    = state.m1_data;
    if (state.m2_answers)               activeRankExam.m2Answers = state.m2_answers;
    if (state.m3_ratings)               activeRankExam.m3Ratings = state.m3_ratings;
    if (state.m3_notes   !== undefined) activeRankExam.m3Notes   = state.m3_notes;
    const serverM2Idx = state.current_m2_idx ?? currentRankM2Idx;
    if (state.current_module && state.current_module !== currentRankModule) {
      currentRankModule = state.current_module;
      if (state.current_module === 'm1') window.renderRankM1?.();
      if (state.current_module === 'm2') { currentRankM2Idx = serverM2Idx; window.renderRankM2?.(serverM2Idx); }
      if (state.current_module === 'm3') window.renderRankM3?.();
    } else {
      if (currentRankModule === 'm1') window.renderRankM1?.();
      if (currentRankModule === 'm2') { currentRankM2Idx = serverM2Idx; window.renderRankM2?.(serverM2Idx); }
      if (currentRankModule === 'm3') {
        const ta = document.getElementById('rM3Notes');
        if (ta && document.activeElement === ta) activeRankExam.m3Notes = ta.value;
        window.renderRankM3?.();
      }
    }
  }, 30_000); // 30s Fallback — SSE liefert Echtzeit
}

function stopExamPolling() {
  if (examPollTimer) { clearInterval(examPollTimer); examPollTimer = null; }
}

const LOCATIONS_POOL = [
  'Pillbox Hill Medical Center','Sandy Shores','Paleto Bay','Grapeseed',
  'Vinewood Hills','Rockford Hills','Strawberry','Davis','Del Perro',
  'La Mesa','Vespucci Beach','Little Seoul','Cypress Flats','El Burro Heights',
  'Rancho','Mirror Park','Forum Drive','Burton','Morningwood','Chamberlain Hills',
  'Grand Senora Desert','Alamo Sea','Zancudo River','Calafia Bridge','Lago Zancudo',
];

const M3_ITEMS   = ['Dispatch annehmen','Fragen stellen / Kommunikation','Teile holen','Auto tunen','Rechnung ausstellen & Dispatch schließen','Allgemeine Einschätzung'];
const M3_LABELS  = ['Mangelhaft','Befriedigend','Gut','Sehr Gut'];
const M3_COLORS  = ['#ef4444','#f97316','#22c55e','#16a34a'];

async function ausbildung() {
  const [exams, qs, onb] = await Promise.all([api('/api/rank-exams'), api('/api/rank-questions'), api('/api/onboarding')]);
  const total  = exams?.length || 0;
  const passed = exams?.filter(e => e.passed).length || 0;
  const onbCard = onb ? `
    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-head">
        <div class="card-head-icon" style="background:rgba(74,222,128,.15)"><i class="fas fa-tasks" style="color:#4ade80"></i></div>
        <div><div class="card-title">Onboarding neuer Mitarbeiter</div><div class="card-sub">Einarbeitungs-Checkliste · ${onb.total} Punkte pro Person</div></div>
      </div>
      ${onb.users.map(u => {
        const pct = Math.round(u.done / onb.total * 100);
        const complete = u.done >= onb.total;
        return `<div style="display:flex;align-items:center;gap:.75rem;padding:.5rem 0;border-bottom:1px solid var(--border)">
          ${avatarEl(u, 28)}
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.85rem">${esc(u.username)} <span style="font-size:.7rem;color:var(--muted)">· ${u.rank || 'Mitarbeiter'}</span></div>
            <div style="height:5px;background:var(--input);border-radius:3px;overflow:hidden;margin-top:.25rem;max-width:260px">
              <div style="height:100%;width:${pct}%;background:${complete ? '#22c55e' : 'var(--orange)'};transition:width .3s"></div>
            </div>
          </div>
          <span style="font-size:.74rem;font-weight:700;color:${complete ? '#22c55e' : 'var(--muted)'}">${u.done}/${onb.total}</span>
          <button class="btn btn-ghost btn-sm" onclick="openOnboardingModal(${u.id})"><i class="fas fa-clipboard-check"></i> Checkliste</button>
        </div>`;
      }).join('')}
    </div>` : '';
  $('pageContent').innerHTML = `
    <div class="stats-row" style="margin-bottom:1.25rem">
      <div class="stat-card"><div class="stat-val">${total}</div><div class="stat-lab">Gesamtprüfungen</div></div>
      <div class="stat-card"><div class="stat-val">${passed}</div><div class="stat-lab">Bestanden</div></div>
      <div class="stat-card"><div class="stat-val">${total ? Math.round(passed/total*100) : 0}%</div><div class="stat-lab">Bestehensquote</div></div>
    </div>
    ${onbCard}
    <div class="card">
      <div class="card-head">
        <div class="card-head-icon orange"><i class="fas fa-graduation-cap"></i></div>
        <div><div class="card-title">Prüfungen</div><div class="card-sub">Gesellen- & Meisterprüfungen</div></div>
        <div style="margin-left:auto;display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="manageRankQuestions()"><i class="fas fa-question-circle"></i> Fragen verwalten</button>
          <button class="btn btn-ghost btn-sm" onclick="showJoinRankExam()"><i class="fas fa-link"></i> Beitreten</button>
          <button class="btn btn-primary" onclick="startRankExamSetup()"><i class="fas fa-plus"></i> Neue Prüfung</button>
        </div>
      </div>
      ${exams?.length ? `<div class="tbl-wrap"><table class="data-tbl">
        <thead><tr><th>Typ</th><th>Prüfling</th><th>Prüfer</th><th>M1</th><th>M2</th><th>M3</th><th>Ergebnis</th><th>Datum</th><th></th></tr></thead>
        <tbody>${exams.map(e => `<tr>
          <td><span class="badge badge-m">${e.exam_type==='meister'?'Meister':'Geselle'}</span></td>
          <td><b>${esc(e.examinee_name)}</b>${e.examinee_id?` <span style="font-size:.72rem;color:var(--muted)">${esc(e.examinee_id)}</span>`:''}</td>
          <td>${esc(e.examiner_name)}${e.examiner2_name?`<br><span style="font-size:.72rem;color:var(--muted)">+ ${esc(e.examiner2_name)}</span>`:''}</td>
          <td><span class="badge ${e.m1_passed?'badge-g':'badge-r'}">${e.m1_score}/${e.m1_max} Orte</span></td>
          <td><span class="badge ${e.m2_passed?'badge-g':'badge-r'}">${e.m2_score}/${e.m2_total}</span></td>
          <td><span class="badge ${e.m3_passed?'badge-g':'badge-r'}">${(+e.m3_score).toFixed(1)}/4</span></td>
          <td><span class="badge ${e.passed?'badge-g':'badge-r'}">${e.passed?'Bestanden':'Nicht bestanden'}</span></td>
          <td style="white-space:nowrap">${fmt(e.taken_at)}</td>
          <td>${e.passed?`<button class="btn btn-ghost btn-sm" onclick="window.open('/api/rank-exams/${e.id}/certificate')" title="Zertifikat öffnen"><i class="fas fa-certificate" style="color:var(--orange)"></i></button>`:''}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty"><i class="fas fa-graduation-cap"></i><p>Noch keine Prüfungen</p></div>'}
    </div>`;
  animateCountUps();
}

window.openOnboardingModal = async userId => {
  const d = await api(`/api/onboarding/${userId}`);
  if (!d) return;
  const done = d.items.filter(i => i.done).length;
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-tasks" style="color:#4ade80;margin-right:.5rem"></i>Onboarding – ${esc(d.user.username)}</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:.8rem">${done} von ${d.total} Punkten erledigt · Klick zum Abhaken</div>
    <div style="display:flex;flex-direction:column;gap:.4rem;max-height:380px;overflow-y:auto">
      ${d.items.map(it => `
        <div onclick="toggleOnboarding(${userId}, '${it.id}')" style="display:flex;align-items:center;gap:.7rem;padding:.55rem .7rem;background:var(--input);border-radius:8px;cursor:pointer;border:1px solid ${it.done ? 'rgba(34,197,94,.35)' : 'var(--border)'}">
          <div style="width:22px;height:22px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:${it.done ? 'rgba(34,197,94,.2)' : 'var(--surface2)'};border:1px solid ${it.done ? '#22c55e' : 'var(--border)'}">
            ${it.done ? '<i class="fas fa-check" style="color:#22c55e;font-size:.7rem"></i>' : ''}
          </div>
          <div style="flex:1">
            <div style="font-size:.85rem;font-weight:600;${it.done ? 'color:var(--muted);text-decoration:line-through' : ''}">${it.label}</div>
            ${it.done && it.doneByName ? `<div style="font-size:.68rem;color:var(--muted)">✓ ${esc(it.doneByName)} · ${fmt(it.doneAt)}</div>` : ''}
          </div>
        </div>`).join('')}
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal();ausbildung()">Schließen</button></div>`);
};

window.toggleOnboarding = async (userId, itemId) => {
  const r = await api(`/api/onboarding/${userId}/toggle`, { method: 'POST', body: { item: itemId } });
  if (r) openOnboardingModal(userId);
};

window.startRankExamSetup = async function() {
  const members = await api('/api/users') || [];
  const ausbilder = members.filter(u => u.is_active && (u.role === 'ausbilder' || u.role === 'admin'));
  const selfId = currentUser?.id;
  const memberOptions = ausbilder
    .filter(u => u.id !== selfId)
    .map(u => `<option value="${u.id}">${esc(u.username)}</option>`)
    .join('');
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-graduation-cap" style="color:var(--orange);margin-right:.5rem"></i>Neue Prüfung starten</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="display:flex;flex-direction:column;gap:.9rem;padding:.25rem 0">
      <div><label class="form-label">Prüfungstyp</label>
        <select id="rExamType" class="form-input">
          <option value="gesellen">Gesellenprüfung</option>
          <option value="meister">Meisterprüfung</option>
        </select></div>
      <div><label class="form-label">Name des Prüflings</label>
        <input id="rExamineeName" class="form-input" placeholder="Vor- und Nachname..."></div>
      <div><label class="form-label">Spieler-ID (optional)</label>
        <input id="rExamineeId" class="form-input" placeholder="z.B. Steam-ID..."></div>
      ${memberOptions ? `<div><label class="form-label">Zweiter Prüfer (optional)</label>
        <select id="rExaminer2" class="form-input">
          <option value="">– Kein zweiter Prüfer –</option>
          ${memberOptions}
        </select></div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="beginRankExam()"><i class="fas fa-play"></i> Prüfung starten</button>
    </div>`);
};

window.beginRankExam = async function() {
  const type      = $('rExamType')?.value;
  const name      = $('rExamineeName')?.value.trim();
  const pid       = $('rExamineeId')?.value.trim();
  const examiner2 = $('rExaminer2')?.value || null;
  if (!name) { toast('Bitte Namen des Prüflings eingeben', 'err'); return; }
  const poolCopy    = [...LOCATIONS_POOL].sort(() => Math.random() - 0.5);
  const m1Locations = poolCopy.slice(0, 4);
  const data = await api('/api/rank-exam/start', { method: 'POST', body: {
    exam_type: type, examinee_name: name, examinee_id: pid || null,
    examiner2_id: examiner2 || null, m1_locations: m1Locations,
  }});
  if (!data) return;
  activeRankExam = { joinCode: data.join_code, type, examineeName: name, examineeId: pid||null,
    questions: data.questions, m1Locations, m1Data: [], m2Answers: {}, m2Revealed: {},
    m3Ratings: new Array(6).fill(0), m3Notes: '' };
  currentRankModule = 'm1';
  startExamPolling();
  window.renderRankM1();
};

window.showJoinRankExam = function() {
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-link" style="color:var(--orange);margin-right:.5rem"></i>Prüfung beitreten</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="display:flex;flex-direction:column;gap:.75rem;padding:.25rem 0">
      <p style="font-size:.85rem;color:var(--muted);margin:0">Gib den 6-stelligen Code ein, den der erste Prüfer erhalten hat.</p>
      <input id="rJoinCode" class="form-input" placeholder="z.B. AB12CD" maxlength="6"
        style="text-transform:uppercase;letter-spacing:.2em;font-size:1.1rem;text-align:center">
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="doJoinRankExam()"><i class="fas fa-sign-in-alt"></i> Beitreten</button>
    </div>`);
};

window.doJoinRankExam = async function() {
  const code = $('rJoinCode')?.value.trim().toUpperCase();
  if (!code || code.length < 4) { toast('Bitte Code eingeben', 'err'); return; }
  const data = await api('/api/rank-exam/join', { method: 'POST', body: { join_code: code } });
  if (!data) return;
  activeRankExam = {
    joinCode:    data.join_code,
    type:        data.exam_type,
    examineeName:data.examinee_name,
    examineeId:  data.examinee_id,
    questions:   data.questions,
    m1Locations: data.m1_locations,
    m1Data:      data.m1_data || [],
    m2Answers:   data.m2_answers || {},
    m2Revealed:  {},
    m3Ratings:   data.m3_ratings || new Array(6).fill(0),
    m3Notes:     data.m3_notes || '',
  };
  toast(`Prüfung ${code} beigetreten`, 'ok');
  currentRankModule = 'm1';
  startExamPolling();
  window.renderRankM1();
};

function saveRankState(patch) {
  if (!activeRankExam?.joinCode) return;
  api('/api/rank-exam/active', { method: 'PUT', body: patch }).catch(() => {});
}

function rankExamHeader(title, icon, step) {
  return `<div class="modal-head">
    <div class="modal-title"><i class="fas ${icon}" style="color:var(--orange);margin-right:.5rem"></i>${title}</div>
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.9rem;flex-wrap:wrap;gap:.4rem">
    <div style="font-size:.8rem;color:var(--muted)">
      <b style="color:var(--fg)">${activeRankExam.examineeName}</b> · ${activeRankExam.type==='meister'?'Meisterprüfung':'Gesellenprüfung'} · Modul ${step} von 3
    </div>
    <div style="font-size:.75rem;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:.2rem .6rem;letter-spacing:.12em;font-weight:700;color:var(--orange)" title="Code für zweiten Prüfer">
      <i class="fas fa-link" style="margin-right:.3rem;font-size:.65rem"></i>${activeRankExam.joinCode}
    </div>
  </div>`;
}

window.renderRankM1 = function() {
  const locs = activeRankExam.m1Locations;
  openModal(`${rankExamHeader('Modul 1 – Ortskunde','fa-map-marker-alt','1')}
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:.75rem">4 zufällige Orte – bewerte je drei Kriterien (max. ${locs.length*3} Punkte, Bestehen ab 70%):</div>
    <div style="display:grid;grid-template-columns:1.5rem 1fr repeat(3,auto);align-items:center;gap:.5rem .9rem;padding:.1rem 0">
      <div></div>
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Ort</div>
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;text-align:center">Gefunden</div>
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;text-align:center;white-space:nowrap">Sinvollster Weg</div>
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;text-align:center;white-space:nowrap">StVO</div>
      ${locs.map((loc, i) => {
        const d = activeRankExam.m1Data[i] || {};
        return `
        <span style="font-weight:700;color:var(--orange);text-align:right">${i+1}.</span>
        <span style="font-weight:600;font-size:.88rem">${loc}</span>
        <div style="display:flex;justify-content:center"><input type="checkbox" id="rFound${i}" onchange="rankM1Update()" style="width:1.1rem;height:1.1rem;cursor:pointer;accent-color:var(--orange)" ${d.found?'checked':''}></div>
        <div style="display:flex;justify-content:center"><input type="checkbox" id="rRoute${i}" onchange="rankM1Update()" style="width:1.1rem;height:1.1rem;cursor:pointer;accent-color:var(--orange)" ${d.best_route?'checked':''}></div>
        <div style="display:flex;justify-content:center"><input type="checkbox" id="rStvo${i}"  onchange="rankM1Update()" style="width:1.1rem;height:1.1rem;cursor:pointer;accent-color:var(--orange)" ${d.stvo?'checked':''}></div>
        ${i < locs.length-1 ? `<div style="grid-column:1/-1;height:1px;background:var(--border);margin:.1rem 0"></div>` : ''}
      `}).join('')}
    </div>
    <div class="modal-footer">
      <span style="font-size:.78rem;color:var(--muted)">Modul 1 von 3 · max. ${locs.length*3} Punkte</span>
      <button class="btn btn-primary" onclick="rankM1Next()">Weiter zu Modul 2 <i class="fas fa-arrow-right"></i></button>
    </div>`);
};

window.rankM1Update = function() {
  if (!activeRankExam) return;
  const locs = activeRankExam.m1Locations;
  activeRankExam.m1Data = locs.map((loc, i) => ({
    found:      $(`rFound${i}`)?.checked  || false,
    best_route: $(`rRoute${i}`)?.checked  || false,
    stvo:       $(`rStvo${i}`)?.checked   || false,
  }));
  saveRankState({ m1_data: activeRankExam.m1Data });
};
window.rankM1Next = function() {
  const locs = activeRankExam.m1Locations;
  activeRankExam.m1Data = locs.map((loc, i) => ({
    location:   loc,
    found:      $(`rFound${i}`)?.checked || false,
    best_route: $(`rRoute${i}`)?.checked || false,
    stvo:       $(`rStvo${i}`)?.checked  || false,
  }));
  currentRankModule = 'm2'; currentRankM2Idx = 0;
  saveRankState({ m1_data: activeRankExam.m1Data, current_module: 'm2' });
  window.renderRankM2(0);
};

window.renderRankM2 = function(idx) {
  const exam = activeRankExam;
  if (!exam.questions.length) { window.renderRankM3(); return; }
  const q       = exam.questions[idx];
  const total   = exam.questions.length;
  const ans     = exam.m2Answers[q.id];
  const revealed = exam.m2Revealed[q.id];
  openModal(`${rankExamHeader('Modul 2 – Mentalteil','fa-brain','2')}
    <div class="quiz-wrap">
      <div class="quiz-progress"><div class="quiz-progress-bar" style="width:${((idx+1)/total)*100}%"></div></div>
      <div class="quiz-counter">Frage ${idx+1} von ${total}</div>
      <div class="quiz-q">${q.question}</div>
      <div style="margin:.6rem 0">
        <button class="btn btn-ghost btn-sm" onclick="rankM2Reveal(${idx})" style="font-size:.8rem">
          <i class="fas fa-${revealed?'eye-slash':'eye'}"></i> ${revealed?'Antwort verbergen':'Musterlösung anzeigen'}
        </button>
      </div>
      ${revealed ? `<div style="background:var(--input);border-left:3px solid var(--green);border-radius:var(--r);padding:.7rem 1rem;font-size:.87rem;color:var(--fg);line-height:1.5">${q.option_a}</div>` : ''}
      <div style="display:flex;gap:.6rem;margin-top:.9rem">
        <button onclick="rankM2Mark(${idx},1)" style="flex:1;padding:.65rem;border-radius:var(--r);font-weight:700;font-size:.9rem;cursor:pointer;transition:all .12s;
          background:${ans===1?'#22c55e22':'var(--surface2)'};color:${ans===1?'#22c55e':'var(--muted)'};border:2px solid ${ans===1?'#22c55e':'var(--border)'}">
          <i class="fas fa-check"></i> Richtig
        </button>
        <button onclick="rankM2Mark(${idx},0)" style="flex:1;padding:.65rem;border-radius:var(--r);font-weight:700;font-size:.9rem;cursor:pointer;transition:all .12s;
          background:${ans===0?'#ef444422':'var(--surface2)'};color:${ans===0?'#ef4444':'var(--muted)'};border:2px solid ${ans===0?'#ef4444':'var(--border)'}">
          <i class="fas fa-times"></i> Falsch
        </button>
      </div>
    </div>
    <div class="modal-footer">
      ${idx>0
        ?`<button class="btn btn-ghost" onclick="rankM2Nav(${idx-1})"><i class="fas fa-arrow-left"></i> Zurück</button>`
        :`<button class="btn btn-ghost" onclick="renderRankM1()"><i class="fas fa-arrow-left"></i> Zu Modul 1</button>`}
      ${idx<total-1
        ?`<button class="btn btn-primary" onclick="rankM2Nav(${idx+1})">Weiter <i class="fas fa-arrow-right"></i></button>`
        :`<button class="btn btn-primary" onclick="rankM2Next()">Weiter zu Modul 3 <i class="fas fa-arrow-right"></i></button>`}
    </div>`);
};

window.rankM2Nav = function(idx) {
  currentRankM2Idx = idx;
  saveRankState({ current_m2_idx: idx });
  window.renderRankM2(idx);
};
window.rankM2Mark = function(idx, val) {
  activeRankExam.m2Answers[activeRankExam.questions[idx].id] = val;
  currentRankM2Idx = idx;
  saveRankState({ m2_answers: activeRankExam.m2Answers, current_m2_idx: idx });
  window.renderRankM2(idx);
};
window.rankM2Reveal = function(idx) {
  const id = activeRankExam.questions[idx].id;
  activeRankExam.m2Revealed[id] = !activeRankExam.m2Revealed[id];
  window.renderRankM2(idx);
};
window.rankM2Next = function() {
  currentRankModule = 'm3';
  saveRankState({ current_module: 'm3' });
  window.renderRankM3();
};

window.renderRankM3 = function renderRankM3() {
  const exam = activeRankExam;
  openModal(`${rankExamHeader('Modul 3 – Praktischer Teil Auto Tuning','fa-tools','3')}
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:.8rem">Bewerte den Prüfling in jeder Kategorie (Bestehen ab Ø 2,5):</div>
    <div style="display:flex;flex-direction:column;gap:.55rem">
      ${M3_ITEMS.map((item,i)=>`
        <div style="background:var(--input);border-radius:var(--r);padding:.6rem .85rem">
          <div style="font-size:.84rem;font-weight:600;margin-bottom:.5rem">${i+1}. ${item}</div>
          <div style="display:flex;gap:.35rem;flex-wrap:wrap">
            ${M3_LABELS.map((lbl,r)=>{
              const val=r+1, sel=exam.m3Ratings[i]===val;
              const c=M3_COLORS[r];
              return `<button onclick="rankM3Rate(${i},${val})"
                style="padding:.3rem .75rem;border-radius:var(--r);font-size:.78rem;font-weight:600;cursor:pointer;transition:all .12s;
                  background:${sel?c+'22':'var(--surface2)'};color:${sel?c:'var(--muted)'};border:1px solid ${sel?c+'55':'var(--border)'}">${lbl}</button>`;
            }).join('')}
          </div>
        </div>`).join('')}
    </div>
    <div style="margin-top:.85rem">
      <label class="form-label">Notizen / Gesamteinschätzung</label>
      <textarea id="rM3Notes" class="form-input" rows="2" placeholder="Freitext..." style="resize:vertical">${esc(exam.m3Notes||'')}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="rankM2Next_back()"><i class="fas fa-arrow-left"></i> Zurück</button>
      <button class="btn btn-primary" onclick="submitRankExam()"><i class="fas fa-check"></i> Prüfung abschließen</button>
    </div>`);
};

window.rankM3Rate = function(i, val) {
  activeRankExam.m3Notes = $('rM3Notes')?.value || '';
  activeRankExam.m3Ratings[i] = val;
  saveRankState({ m3_ratings: activeRankExam.m3Ratings, m3_notes: activeRankExam.m3Notes });
  window.renderRankM3();
};
window.rankM2Next_back = function() {
  activeRankExam.m3Notes = $('rM3Notes')?.value || '';
  window.renderRankM2(activeRankExam.questions.length - 1);
};

window.submitRankExam = async function() {
  const exam = activeRankExam;
  const unrated = exam.m3Ratings.filter(r => !r).length;
  if (unrated > 0) { toast(`Noch ${unrated} Kategorie(n) in Modul 3 nicht bewertet`, 'err'); return; }
  const unanswered = exam.questions.filter(q => exam.m2Answers[q.id] === undefined && exam.questions.length > 0).length;
  if (unanswered > 0) { toast(`Noch ${unanswered} Frage(n) in Modul 2 nicht bewertet (Richtig/Falsch)`, 'err'); return; }
  exam.m3Notes = $('rM3Notes')?.value || '';
  saveRankState({ m3_notes: exam.m3Notes });
  stopExamPolling();
  const result = await api('/api/rank-exam/submit', { method: 'POST', body: {} });
  if (!result) {
    activeRankExam = null;
    closeModal();
    return;
  }
  activeRankExam = null;
  const rLabel = v => M3_LABELS[Math.min(Math.round(v)-1, 3)] || '';
  openModal(`
    <div class="modal-head">
      <div class="modal-title">Prüfungsergebnis</div>
      <button class="modal-close" onclick="closeModal();ausbildung()"><i class="fas fa-times"></i></button>
    </div>
    <div class="quiz-result">
      <div class="quiz-score-big ${result.passed?'quiz-passed':'quiz-failed'}">${result.passed?'✓':'✗'}</div>
      <div style="font-size:1.1rem;font-weight:700;margin:.75rem 0">${result.passed?'Prüfung bestanden!':'Prüfung nicht bestanden'}</div>
      ${result.examiner2_name?`<div style="font-size:.8rem;color:var(--muted)"><i class="fas fa-user-friends" style="margin-right:.35rem"></i>Zweiter Prüfer: <b style="color:var(--fg)">${result.examiner2_name}</b></div>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:.45rem;margin-bottom:1rem">
      ${[
        { icon:'fa-map-marker-alt', label:'Modul 1 – Ortskunde',   pass:result.m1_passed, score:`${result.m1_score}/${result.m1_max} Orte bestanden` },
        { icon:'fa-brain',          label:'Modul 2 – Mentalteil',   pass:result.m2_passed, score:`${result.m2_score}/${result.m2_total} Fragen` },
        { icon:'fa-tools',          label:'Modul 3 – Praktischer Teil', pass:result.m3_passed, score:`Ø ${result.m3_score.toFixed(1)}/4 (${rLabel(result.m3_score)})` },
      ].map(m=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:.6rem .85rem;background:var(--input);border-radius:var(--r);border-left:3px solid ${m.pass?'var(--green)':'#ef4444'}">
        <span style="font-size:.85rem"><i class="fas ${m.icon}" style="margin-right:.4rem;color:var(--muted)"></i>${m.label}</span>
        <span style="font-weight:700;font-size:.85rem;color:${m.pass?'var(--green)':'#ef4444'}">${m.score} ${m.pass?'✓':'✗'}</span>
      </div>`).join('')}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal();ausbildung()">Schließen</button>
    </div>`);
};

window.manageRankQuestions = async function() {
  const qs = await api('/api/rank-questions');
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-question-circle" style="color:var(--orange);margin-right:.5rem"></i>Modul-2 Fragen verwalten</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <form onsubmit="addRankQuestion(event)" style="display:flex;flex-direction:column;gap:.5rem;padding-bottom:.9rem;border-bottom:1px solid var(--border);margin-bottom:.9rem">
      <select id="rqType" class="form-input">
        <option value="gesellen">Gesellenprüfung</option>
        <option value="meister">Meisterprüfung</option>
      </select>
      <input id="rqQ" class="form-input" placeholder="Frage..." required>
      <textarea id="rqA" class="form-input" rows="2" placeholder="Musterlösung / korrekte Antwort..." required style="resize:vertical"></textarea>
      <button class="btn btn-primary btn-sm" type="submit"><i class="fas fa-plus"></i> Frage hinzufügen</button>
    </form>
    <div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:.4rem">
      ${(qs||[]).map(q=>`
        <div style="background:var(--input);border-radius:var(--r);padding:.55rem .75rem;display:flex;align-items:flex-start;gap:.5rem">
          <div style="flex:1;font-size:.82rem">
            <span class="badge badge-m" style="margin-right:.35rem;font-size:.68rem">${q.exam_type==='gesellen'?'Geselle':q.exam_type==='meister'?'Meister':'Beide'}</span>${q.question}
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteRankQuestion(${q.id})"><i class="fas fa-trash"></i></button>
        </div>`).join('')||'<div class="empty"><p>Noch keine Fragen</p></div>'}
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Schließen</button></div>`);
};

window.addRankQuestion = async function(e) {
  e.preventDefault();
  const r = await api('/api/rank-questions', { method: 'POST', body: {
    exam_type: $('rqType').value,
    question:  $('rqQ').value.trim(),
    option_a:  $('rqA').value.trim(),
  }});
  if (r) { toast('Frage gespeichert!', 'ok'); manageRankQuestions(); }
};

window.deleteRankQuestion = async function(id) {
  await api(`/api/rank-questions/${id}`, { method: 'DELETE' });
  manageRankQuestions();
};

// ════════════════════════════════════════════════════════════════
//  COIN-SHOP
// ════════════════════════════════════════════════════════════════
const GAME_NAMES_DE = {
  race: 'Autorennen', brick: 'Brick Breaker', deadzone: 'Dead Zone', snake: 'Snake',
  tetris: 'Tetris', bookofra: 'Book of Ra', skycop: 'Sky Cop', doodlejump: 'Doodle Jump',
  towerdefense: 'Tower Defense', '2048': '2048', quiz: 'Quiz Survival', idle: 'Werkstatt',
  rpg: 'Dungeon RPG', tow: 'Abschlepp-Simulator', blackjack: 'Blackjack', memory: 'Memory',
  slot: 'ACLS Mega Spin',
  wordle: 'Wort-Raten', // entfernt – Label bleibt für alte Transaktionen
};
function txLabel(reason) {
  const map = {
    daily: '📅 Tagesbonus', 'shop:buy': '🛒 Shop-Kauf', 'tournament:prize': '🏆 Turnier-Preisgeld',
    'duel:win': '⚔️ Duell gewonnen', 'duel:loss': '⚔️ Duell verloren', 'duel:draw': '⚔️ Duell unentschieden',
    'blackjack:bet': '🃏 Blackjack-Einsatz', 'blackjack:win': '🃏 Blackjack-Gewinn',
    'blackjack:push': '🃏 Blackjack-Push', 'blackjack:double': '🃏 Blackjack verdoppelt',
    'blackjack:refund': '🃏 Blackjack erstattet (Neustart)',
    'slot:bet': '🎰 Mega Spin Einsatz', 'slot:win': '🎰 Mega Spin Gewinn',
    'slot:jackpot': '💰 JACKPOT geknackt!',
    'exam:blitz': '📋 Blitz-Prüfung abgehalten', 'exam:standard': '📋 Prüfung abgehalten',
    'exam:praxis': '📋 Praxisprüfung abgehalten',
    'lottery:ticket': '🎟️ Lotterie-Lose gekauft', 'lottery:win': '🎟️ Lotterie-Jackpot!',
    'shop:vip_30': '⭐ VIP-Rolle gekauft', 'shop:booster_24': '⚡ Coin-Booster gekauft',
    'shop:mystery_box': '🎲 Mystery-Box gekauft', 'mystery:coins': '🎲 Mystery-Box Gewinn',
    'shop:custom_title': '✏️ Wunsch-Titel beantragt', 'shop:custom_title_refund': '✏️ Wunsch-Titel erstattet',
    'bracket:fee': '🏟️ Turnier-Einsatz', 'bracket:win': '🏟️ Turnier gewonnen!',
    'bracket:second': '🏟️ Turnier-Finalist', 'bracket:refund': '🏟️ Turnier-Einsatz zurück',
    'transfer:out': '💸 Coins gesendet', 'transfer:in': '💝 Coins erhalten',
  };
  if (map[reason]) return map[reason];
  if (reason.startsWith('game:')) return '🎮 ' + (GAME_NAMES_DE[reason.slice(5)] || reason.slice(5));
  return reason;
}

async function shop() {
  const [me, shopData, lotto] = await Promise.all([api('/api/coins/me'), api('/api/shop'), api('/api/lottery')]);
  if (!me || !shopData) return;

  const itemCard = it => {
    const myAv = avatarUrl(currentUser);
    // Typ-spezifische Vorschau
    let preview;
    switch (it.type) {
      case 'frame':
        preview = myAv
          ? `<img src="${myAv}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;${frameGlow(it.id)}">`
          : `<div style="width:52px;height:52px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;${frameGlow(it.id)}">${initials(currentUser.username)}</div>`;
        break;
      case 'truck':
        preview = `<div style="width:58px;height:30px;border-radius:6px;background:${it.color};border:2px solid rgba(255,255,255,.25);position:relative;margin:.6rem 0">
          <div style="position:absolute;top:-5px;left:50%;transform:translateX(-50%);width:9px;height:9px;border-radius:50%;background:${it.id === 'skin_truck_police' ? '#3b82f6' : '#fbbf24'};box-shadow:0 0 6px ${it.id === 'skin_truck_police' ? '#3b82f6' : '#fbbf24'}"></div>
        </div>`;
        break;
      case 'deck':
        preview = `<div style="width:38px;height:54px;border-radius:6px;border:2px solid #f8fafc;background:${DECK_CSS[it.id] || '#7c2d12'}"></div>`;
        break;
      case 'banner':
        preview = `<div style="width:86px;height:32px;border-radius:8px;background:${BANNER_CSS[it.id] || 'var(--surface2)'}"></div>`;
        break;
      case 'namecolor':
        preview = `<div style="font-weight:800;font-size:.95rem;color:${NAME_COLORS[it.id] || '#fff'}">${esc(currentUser.username)}</div>`;
        break;
      case 'deco':
        preview = `<div style="font-size:1.6rem">${it.name.split(' ')[0]}</div>`;
        break;
      default:
        preview = `<div style="font-size:1.6rem">${it.name.split(' ')[0]}</div>`;
    }
    let btn;
    const equippable = !['perk', 'consumable'].includes(it.type);
    if (it.equipped)
      btn = `<button class="btn btn-ghost btn-sm" onclick="shopUnequip('${it.type}')"><i class="fas fa-check" style="color:#22c55e"></i> Ausgerüstet</button>`;
    else if (it.owned && equippable)
      btn = `<button class="btn btn-primary btn-sm" onclick="shopEquip('${it.id}')">Ausrüsten</button>`;
    else if (it.owned)
      btn = `<span class="badge" style="background:rgba(34,197,94,.12);color:#22c55e">Gekauft ✓</span>`;
    else
      btn = `<button class="btn btn-sm" style="background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);color:#fbbf24" onclick="shopBuy('${it.id}', ${it.price})">🪙 ${it.price.toLocaleString('de-DE')}</button>`;
    // Live-Vorschau am Topbar-Avatar (nur Rahmen)
    const previewBtn = it.type === 'frame' && !it.equipped
      ? `<button class="btn btn-ghost btn-sm" style="font-size:.68rem;padding:.25rem .6rem" onclick="framePreview('${it.id}')"><i class="fas fa-eye"></i> Vorschau</button>`
      : '';
    return `<div class="card" style="display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1rem;text-align:center">
      ${preview}
      <div style="font-weight:700;font-size:.85rem">${it.name}</div>
      <div style="font-size:.7rem;color:var(--muted)">${it.desc || ''}</div>
      ${btn}
      ${previewBtn}
    </div>`;
  };

  const fmtUntil = u => u ? new Date(u.replace(' ', 'T') + 'Z').toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '';
  const groupsOrder = [
    ['title',     'Titel'],
    ['frame',     'Avatar-Rahmen'],
    ['deco',      'Avatar-Deko'],
    ['namecolor', 'Namensfarbe'],
    ['banner',    'Profil-Banner'],
    ['truck',     'Truck-Skins (Abschlepp-Simulator)'],
    ['deck',      'Kartendecks (Blackjack)'],
  ];
  const consumables = shopData.items.filter(i => i.type === 'consumable' || i.type === 'perk');

  $('pageContent').innerHTML = `
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.25rem">
      <div class="card" style="flex:1;min-width:220px;display:flex;align-items:center;gap:1rem;padding:1.1rem">
        <div style="font-size:2.2rem">🪙</div>
        <div>
          <div style="font-size:1.5rem;font-weight:800;color:#fbbf24">${me.balance.toLocaleString('de-DE')}</div>
          <div style="font-size:.75rem;color:var(--muted)">ACLS-Coins · insgesamt verdient: ${me.totalEarned.toLocaleString('de-DE')}</div>
        </div>
      </div>
      <div class="card" style="flex:1;min-width:220px;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.1rem">
        <div>
          <div style="font-weight:700;font-size:.9rem">📅 Tagesbonus
            ${me.streak > 0 ? `<span style="margin-left:.4rem;font-size:.78rem;color:#fb923c">🔥 ${me.streak} Tage-Serie</span>` : ''}
          </div>
          <div style="font-size:.73rem;color:var(--muted)">Serie nicht abreißen lassen – der Bonus wächst täglich (max. 50)${me.bestStreak > 1 ? ` · Rekord: ${me.bestStreak} Tage` : ''}</div>
          ${me.streak > 0 && me.streak < 30 ? `<div style="font-size:.68rem;color:var(--muted);margin-top:.2rem">Nächster Meilenstein: ${me.streak < 7 ? `Tag 7 (+75 extra)` : `Tag 30 (+300 extra)`}</div>` : ''}
        </div>
        ${me.dailyAvailable
          ? `<button class="btn btn-primary btn-sm" onclick="claimDaily()">+${me.nextDaily || 25} abholen</button>`
          : `<span class="badge" style="background:var(--surface2);color:var(--muted)">Heute abgeholt ✓</span>`}
      </div>
    </div>

    <!-- Coins senden (Tauschsystem) -->
    <div class="card" style="padding:1rem 1.2rem;margin-bottom:1.25rem;border-color:rgba(74,222,128,.25)">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="font-size:1.6rem">💸</div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:.9rem">Coins senden</div>
          <div style="font-size:.72rem;color:var(--muted)">Schenke einem Mitglied Coins – max. 200 pro Tag</div>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
          <select class="form-control" id="transferTarget" style="width:180px;font-size:.82rem"><option value="">Empfänger wählen…</option></select>
          <input class="form-control" id="transferAmount" type="number" min="1" max="200" placeholder="Betrag" style="width:90px;font-size:.82rem">
          <button class="btn btn-sm" style="background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.4);color:#4ade80;white-space:nowrap" onclick="sendCoins()">Senden</button>
        </div>
      </div>
    </div>

    ${lotto ? `
    <div class="card" style="padding:1.1rem 1.2rem;margin-bottom:1.25rem;background:linear-gradient(135deg,rgba(34,197,94,.08),rgba(34,197,94,.02));border-color:rgba(34,197,94,.3)">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="font-size:2rem">🎟️</div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:800;font-size:1rem">Wochenlotterie</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:.15rem">Los: ${lotto.ticketPrice} 🪙 · Ziehung Sonntag 19:00 Uhr · Der Gewinner bekommt den ganzen Pot!</div>
          ${lotto.lastDraw?.winner_username ? `<div style="font-size:.72rem;color:#4ade80;margin-top:.25rem"><i class="fas fa-crown"></i> Letzte Ziehung: <b>${esc(lotto.lastDraw.winner_username)}</b> gewann ${(+lotto.lastDraw.pot).toLocaleString('de-DE')} 🪙</div>` : ''}
        </div>
        <div style="text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:#4ade80">${lotto.pot.toLocaleString('de-DE')} 🪙</div>
          <div style="font-size:.68rem;color:var(--muted)">Pot · ${lotto.totalTickets} Lose · ${lotto.players} Spieler</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.4rem;align-items:stretch">
          <button class="btn btn-sm" style="background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4);color:#4ade80" onclick="lotteryBuy(1)">1 Los kaufen</button>
          <button class="btn btn-sm" style="background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4);color:#4ade80" onclick="lotteryBuy(5)">5 Lose kaufen</button>
          <div style="font-size:.68rem;color:var(--muted);text-align:center">Deine Lose: <b>${lotto.myTickets}</b>/${lotto.maxTickets}</div>
        </div>
      </div>
    </div>` : ''}

    <div class="card" style="padding:1rem 1.2rem;margin-bottom:1.25rem">
      <div style="font-weight:700;font-size:.85rem;margin-bottom:.5rem"><i class="fas fa-info-circle" style="color:var(--orange);margin-right:.4rem"></i>So verdienst du Coins</div>
      <div style="display:flex;gap:1.2rem;flex-wrap:wrap;font-size:.78rem;color:var(--muted)">
        <span>🎮 Minispiele spielen (bis 150/Tag pro Spiel)</span>
        <span>📋 Prüfung abhalten: Blitz +25 · Standard/Praxis +50</span>
        <span>🏆 Wochenturnier: 500 / 250 / 100 für Top 3</span>
        <span>⚔️ Quiz-Duell: 150 für den Sieger</span>
        <span>📅 Tagesbonus: +25</span>
        <span>🃏 Blackjack: Einsatz verdoppeln</span>
      </div>
    </div>

    <!-- Extras: Verbrauchsartikel & Freischaltungen -->
    <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">Extras & Boosts</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.7rem;margin-bottom:.8rem">
      ${consumables.map(itemCard).join('')}
    </div>
    ${me.vipUntil || me.boosterUntil || currentUser?.rank === 'Rang 12' ? `<div style="font-size:.72rem;color:var(--muted);margin-bottom:1.2rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
      ${me.vipUntil ? `<span>⭐ VIP aktiv bis <b style="color:#fbbf24">${fmtUntil(me.vipUntil)}</b></span>` : ''}
      ${me.boosterUntil ? `<span>⚡ Coin-Booster aktiv bis <b style="color:#4ade80">${fmtUntil(me.boosterUntil)}</b></span>` : ''}
      ${currentUser?.rank === 'Rang 12' && !me.vipUntil ? `<button class="btn btn-ghost btn-sm" style="font-size:.7rem" onclick="vipTest()"><i class="fas fa-flask" style="color:#fbbf24"></i> VIP 10 Min testen (Rang 12)</button>` : ''}
    </div>` : '<div style="margin-bottom:.7rem"></div>'}

    <!-- Wunsch-Titel -->
    <div class="card" style="padding:1rem 1.2rem;margin-bottom:1.5rem;border-color:rgba(251,191,36,.3)">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="font-size:1.6rem">✏️</div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:.9rem">Wunsch-Titel <span style="color:#fbbf24">· 2.500 🪙</span></div>
          <div style="font-size:.72rem;color:var(--muted)">Dein eigener Titel-Text (3–30 Zeichen). Ein Admin prüft ihn vor der Freischaltung – bei Ablehnung gibt es die Coins zurück.</div>
          ${me.customTitle?.status === 'pending' ? `<div style="font-size:.74rem;color:#fbbf24;margin-top:.3rem"><i class="fas fa-clock"></i> Wartet auf Freigabe: „${esc(me.customTitle.text)}"</div>` : ''}
          ${me.customTitle?.status === 'approved' && me.equippedTitle?.startsWith('custom:') ? `<div style="font-size:.74rem;color:#4ade80;margin-top:.3rem"><i class="fas fa-check"></i> Freigeschaltet: „${esc(me.equippedTitle.slice(7))}"</div>` : ''}
        </div>
        ${me.customTitle?.status !== 'pending' ? `
        <div style="display:flex;gap:.5rem;align-items:center">
          <input class="form-control" id="customTitleInput" maxlength="30" placeholder="z. B. Der Nachtschlepper" style="width:200px;font-size:.82rem">
          <button class="btn btn-sm" style="background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);color:#fbbf24;white-space:nowrap" onclick="buyCustomTitle()">Beantragen</button>
        </div>` : ''}
      </div>
    </div>

    ${groupsOrder.map(([type, label]) => {
      const items = shopData.items.filter(i => i.type === type);
      if (!items.length) return '';
      return `
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">${label}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.7rem;margin-bottom:1.5rem">${items.map(itemCard).join('')}</div>`;
    }).join('')}

    <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">Letzte Transaktionen</div>
    <div class="card" style="padding:.4rem .9rem">
      ${me.transactions.length ? me.transactions.map(t => `
        <div style="display:flex;align-items:center;gap:.6rem;padding:.45rem 0;border-bottom:1px solid var(--border);font-size:.8rem">
          <span style="flex:1">${txLabel(t.reason)}</span>
          <span style="font-weight:700;color:${t.amount >= 0 ? '#4ade80' : '#ef4444'}">${t.amount >= 0 ? '+' : ''}${t.amount}</span>
          <span style="color:var(--muted);font-size:.7rem;white-space:nowrap">${ago(t.created_at)}</span>
        </div>`).join('') : '<div style="padding:.8rem 0;color:var(--muted);font-size:.8rem">Noch keine Transaktionen – spiel ein Minispiel!</div>'}
    </div>`;

  // Empfängerliste fürs Coins-Senden nachladen
  fetch('/api/users/public').then(r => r.json()).then(users => {
    const sel = $('transferTarget');
    if (!sel) return;
    sel.innerHTML = '<option value="">Empfänger wählen…</option>' + users
      .filter(u => u.discord_id && u.discord_id !== currentUser?.discord_id)
      .map(u => `<option value="${u.discord_id}">${esc(u.username)}</option>`).join('');
  }).catch(() => {});
}

window.sendCoins = async () => {
  const toDiscordId = $('transferTarget')?.value;
  const amount      = parseInt($('transferAmount')?.value, 10);
  if (!toDiscordId) { toast('Bitte Empfänger wählen', 'err'); return; }
  if (!amount || amount < 1) { toast('Bitte gültigen Betrag eingeben', 'err'); return; }
  const name = $('transferTarget').selectedOptions[0]?.textContent || 'Mitglied';
  const r = await api('/api/coins/transfer', { method: 'POST', body: { toDiscordId, amount } });
  if (r) {
    toast(`${amount} Coins an ${name} gesendet! 💸 (heute: ${r.sentToday}/${r.limit})`, 'ok');
    updateCoinChip(r.balance);
    shop();
  }
};

// ════════════════════════════════════════════════════════════════
//  FREUNDE — Liste & Statistik-Vergleich
// ════════════════════════════════════════════════════════════════
async function freunde() {
  const [data, allUsers] = await Promise.all([api('/api/friends'), api('/api/users/public')]);
  if (!data) return;
  const friendIds = new Set(data.friends.map(f => f.id));
  const addable = (allUsers || []).filter(u => u.id !== currentUser.id && !friendIds.has(u.id));

  const statChip = (icon, val, label, color) => `
    <div style="display:flex;align-items:center;gap:.35rem;font-size:.72rem;color:var(--muted)" title="${label}">
      <i class="fas ${icon}" style="color:${color};font-size:.7rem"></i><b style="color:var(--text)">${val}</b>
    </div>`;

  // Rang-Zeile: Staff = ACLS-Rang, Bürger = verdienter Bürger-Titel · dazu Season-Pass-Level
  const rankLine = (f) => {
    const main = f.is_staff
      ? `<span>${esc(f.rank || 'Mitarbeiter')}</span>`
      : `<span style="color:${f.tier?.color || 'var(--muted)'};font-weight:600">${f.tier?.icon || ''} ${esc(f.tier?.name || 'Bürger')}</span>`;
    const season = f.season_level > 0 ? ` · <span title="Season-Pass-Level" style="color:#c084fc">🎫 Lvl ${f.season_level}</span>` : '';
    const streak = f.streak > 0 ? ` · 🔥 ${f.streak}` : '';
    return main + season + streak;
  };

  $('pageContent').innerHTML = `
    <div class="card" style="padding:1rem 1.2rem;margin-bottom:1.25rem">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="font-size:1.6rem">🤝</div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:.9rem">Freund hinzufügen</div>
          <div style="font-size:.72rem;color:var(--muted)">Füge bis zu 30 Mitglieder hinzu und vergleiche eure Statistiken</div>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center">
          <select class="form-control" id="friendSelect" style="width:200px;font-size:.82rem">
            <option value="">Mitglied wählen…</option>
            ${addable.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="addFriend()"><i class="fas fa-user-plus"></i> Hinzufügen</button>
        </div>
      </div>
    </div>

    ${data.friends.length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:.8rem">
      ${data.friends.map(f => {
        const isOnline = f.last_seen_at && (Date.now() - new Date(f.last_seen_at).getTime()) < 5 * 60 * 1000;
        const onlineDot = isOnline
          ? `<span title="Jetzt online" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#22c55e;border:2px solid var(--bg);position:absolute;bottom:1px;right:1px"></span>`
          : '';
        const bffBadge = f.is_best_friend
          ? `<span title="Bester Freund – meiste gemeinsame DMs" style="font-size:.68rem;background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.3);border-radius:20px;padding:.1rem .45rem;margin-left:.3rem"><i class="fas fa-star"></i> BFF</span>`
          : '';
        return `
      <div class="card" style="padding:1rem 1.1rem${f.is_best_friend ? ';border-color:rgba(251,191,36,.35)' : ''}">
        <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.7rem">
          <div style="position:relative;flex-shrink:0">${avatarEl(f, 40)}${onlineDot}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.username)}${bffBadge}</div>
            <div style="font-size:.68rem;color:var(--muted)">${rankLine(f)}${isOnline ? ' · <span style="color:#22c55e">Online</span>' : ''}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="removeFriend(${f.id})" title="Entfernen" style="color:var(--muted)"><i class="fas fa-user-minus"></i></button>
        </div>
        <div style="display:flex;gap:.9rem;flex-wrap:wrap;margin-bottom:.8rem">
          ${statChip('fa-coins', (+f.coins_earned).toLocaleString('de-DE'), 'Coins verdient', '#fbbf24')}
          ${statChip('fa-clock', f.ic_week + 'h', 'IC-Zeit diese Woche', '#60a5fa')}
          ${statChip('fa-medal', f.badges, 'Abzeichen', '#facc15')}
          ${statChip('fa-gamepad', f.games_played, 'Spiele gespielt', '#f472b6')}
        </div>
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="compareFriend(${f.id})"><i class="fas fa-balance-scale"></i> Vergleichen</button>
          <a href="/profil/${f.id}" target="_blank" class="btn btn-ghost btn-sm" style="text-decoration:none"><i class="fas fa-user"></i> Profil</a>
        </div>
      </div>`;}).join('')}
    </div>` : `
    <div class="empty"><i class="fas fa-user-friends"></i><p>Noch keine Freunde hinzugefügt.<br>Wähle oben ein Mitglied aus und starte den Vergleich!</p></div>`}`;
}

window.addFriend = async () => {
  const id = $('friendSelect')?.value;
  if (!id) { toast('Bitte Mitglied wählen', 'err'); return; }
  const r = await api(`/api/friends/${id}`, { method: 'POST' });
  if (r) { toast('Freund hinzugefügt! 🤝', 'ok'); freunde(); }
};

window.removeFriend = async id => {
  const r = await api(`/api/friends/${id}`, { method: 'DELETE' });
  if (r) { toast('Entfernt', ''); freunde(); }
};

// ── Freunde in der Bürger-/Voter-Ansicht (eigene Section, kein Staff-pageContent) ──
async function loadVoterFriends() {
  const box = document.getElementById('friendsSection');
  if (!box) return;
  const [data, allUsers] = await Promise.all([api('/api/friends'), api('/api/users/public')]);
  if (!data) { box.innerHTML = '<div class="empty"><i class="fas fa-lock"></i><p>Freunde sind für dich nicht verfügbar.</p></div>'; return; }
  const friendIds = new Set(data.friends.map(f => f.id));
  const addable = (allUsers || []).filter(u => u.id !== currentUser.id && !friendIds.has(u.id));

  const statChip = (icon, val, label, color) => `
    <div style="display:flex;align-items:center;gap:.35rem;font-size:.72rem;color:var(--muted)" title="${label}">
      <i class="fas ${icon}" style="color:${color};font-size:.7rem"></i><b style="color:var(--text)">${val}</b>
    </div>`;
  const rankLine = (f) => {
    const main = f.is_staff
      ? `<span>${esc(f.rank || 'Mitarbeiter')}</span>`
      : `<span style="color:${f.tier?.color || 'var(--muted)'};font-weight:600">${f.tier?.icon || ''} ${esc(f.tier?.name || 'Bürger')}</span>`;
    const season = f.season_level > 0 ? ` · <span title="Season-Pass-Level" style="color:#c084fc">🎫 Lvl ${f.season_level}</span>` : '';
    const streak = f.streak > 0 ? ` · 🔥 ${f.streak}` : '';
    return main + season + streak;
  };

  box.innerHTML = `
    <div class="card" style="padding:1rem 1.2rem;margin-bottom:1.25rem">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="font-size:1.6rem">🤝</div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:.9rem">Freund hinzufügen</div>
          <div style="font-size:.72rem;color:var(--muted)">Füge bis zu 30 Personen hinzu und vergleiche eure Statistiken</div>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center">
          <select class="form-control" id="vFriendSelect" style="width:200px;font-size:.82rem">
            <option value="">Person wählen…</option>
            ${addable.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="voterAddFriend()"><i class="fas fa-user-plus"></i> Hinzufügen</button>
        </div>
      </div>
    </div>
    ${data.friends.length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:.8rem">
      ${data.friends.map(f => {
        const isOnline = f.last_seen_at && (Date.now() - new Date(f.last_seen_at).getTime()) < 5 * 60 * 1000;
        const onlineDot = isOnline ? `<span title="Jetzt online" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#22c55e;border:2px solid var(--bg);position:absolute;bottom:1px;right:1px"></span>` : '';
        const bffBadge = f.is_best_friend ? `<span style="font-size:.68rem;background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.3);border-radius:20px;padding:.1rem .45rem;margin-left:.3rem"><i class="fas fa-star"></i> BFF</span>` : '';
        return `
      <div class="card" style="padding:1rem 1.1rem${f.is_best_friend?';border-color:rgba(251,191,36,.35)':''}">
        <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.7rem">
          <div style="position:relative;flex-shrink:0">${avatarEl(f, 40)}${onlineDot}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.username)}${bffBadge}</div>
            <div style="font-size:.68rem;color:var(--muted)">${rankLine(f)}${isOnline?' · <span style="color:#22c55e">Online</span>':''}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="voterRemoveFriend(${f.id})" title="Entfernen" style="color:var(--muted)"><i class="fas fa-user-minus"></i></button>
        </div>
        <div style="display:flex;gap:.9rem;flex-wrap:wrap;margin-bottom:.8rem">
          ${statChip('fa-coins', (+f.coins_earned).toLocaleString('de-DE'), 'Coins verdient', '#fbbf24')}
          ${statChip('fa-medal', f.badges, 'Abzeichen', '#facc15')}
          ${statChip('fa-gamepad', f.games_played, 'Spiele gespielt', '#f472b6')}
        </div>
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="compareFriend(${f.id})"><i class="fas fa-balance-scale"></i> Vergleichen</button>
          <a href="/profil/${f.id}" target="_blank" class="btn btn-ghost btn-sm" style="text-decoration:none"><i class="fas fa-user"></i> Profil</a>
        </div>
      </div>`;}).join('')}
    </div>` : `
    <div class="empty"><i class="fas fa-user-friends"></i><p>Noch keine Freunde hinzugefügt.<br>Wähle oben jemanden aus und starte den Vergleich!</p></div>`}`;
}

window.voterAddFriend = async () => {
  const id = document.getElementById('vFriendSelect')?.value;
  if (!id) { toast('Bitte jemanden wählen', 'err'); return; }
  const r = await api(`/api/friends/${id}`, { method: 'POST' });
  if (r) { toast('Freund hinzugefügt! 🤝', 'ok'); loadVoterFriends(); }
};
window.voterRemoveFriend = async id => {
  const r = await api(`/api/friends/${id}`, { method: 'DELETE' });
  if (r) { toast('Entfernt', ''); loadVoterFriends(); }
};

window.compareFriend = async id => {
  const d = await api(`/api/friends/compare/${id}`);
  if (!d) return;
  const m = d.me, f = d.friend;
  const fmtN = v => (+v).toLocaleString('de-DE');
  const rows = [
    ['🪙 Coins verdient',     fmtN(m.coins_earned),  fmtN(f.coins_earned),  m.coins_earned - f.coins_earned],
    ['💰 Kontostand',         fmtN(m.coins_balance), fmtN(f.coins_balance), m.coins_balance - f.coins_balance],
    ['🔥 Beste Login-Serie',  m.best_streak,         f.best_streak,         m.best_streak - f.best_streak],
    ['🎫 Season-Pass-Level',  m.season_level,        f.season_level,        m.season_level - f.season_level],
    ['⏱️ IC-Zeit gesamt',     m.ic_total + 'h',      f.ic_total + 'h',      m.ic_total - f.ic_total],
    ['📅 IC-Zeit Woche',      m.ic_week + 'h',       f.ic_week + 'h',       m.ic_week - f.ic_week],
    ['🎖️ Abzeichen',          m.badges,              f.badges,              m.badges - f.badges],
    ['📋 Prüfungen abgen.',   m.exams,               f.exams,               m.exams - f.exams],
    ['🏆 MdW-Titel',          m.eow_wins,            f.eow_wins,            m.eow_wins - f.eow_wins],
    ['⚔️ Duell-Siege',        m.duel_wins,           f.duel_wins,           m.duel_wins - f.duel_wins],
    ['🎮 Versch. Spiele',     m.games_played,        f.games_played,        m.games_played - f.games_played],
  ];
  const cell = (val, win) => `<td style="text-align:center;font-weight:${win ? '800' : '500'};color:${win ? '#4ade80' : 'var(--text)'};padding:.45rem .5rem">${val}${win ? ' 👑' : ''}</td>`;
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-balance-scale" style="color:var(--orange);margin-right:.4rem"></i>Vergleich</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-around;margin:.6rem 0 1rem">
      <div style="text-align:center">${avatarEl(m, 46)}<div style="font-weight:700;font-size:.85rem;margin-top:.3rem">${esc(m.username)}</div></div>
      <div style="font-size:1.3rem;font-weight:800;color:var(--muted)">VS</div>
      <div style="text-align:center">${avatarEl(f, 46)}<div style="font-weight:700;font-size:.85rem;margin-top:.3rem">${esc(f.username)}</div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      ${rows.map(([label, mv, fv, diff]) => `
      <tr style="border-bottom:1px solid var(--border)">
        ${cell(mv, diff > 0)}
        <td style="text-align:center;color:var(--muted);font-size:.74rem;padding:.45rem .5rem;white-space:nowrap">${label}</td>
        ${cell(fv, diff < 0)}
      </tr>`).join('')}
    </table>
    ${d.games.length ? `
    <div style="font-size:.7rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin:1rem 0 .4rem">🎮 Spiel-Bestscores</div>
    <table style="width:100%;border-collapse:collapse;font-size:.8rem">
      ${d.games.map(g => {
        const my = g.my_score || 0, th = g.their_score || 0;
        return `<tr style="border-bottom:1px solid var(--border)">
          ${cell(fmtN(my), my > th)}
          <td style="text-align:center;color:var(--muted);font-size:.72rem;padding:.4rem .5rem">${GAME_NAMES_DE[g.game] || g.game}</td>
          ${cell(fmtN(th), th > my)}
        </tr>`;
      }).join('')}
    </table>` : ''}`);
};

// Rahmen 6 Sekunden live am Topbar-Avatar testen
let _framePreviewTimer = null;
window.framePreview = frameId => {
  const av = $('uAvatarBox');
  if (!av) return;
  clearTimeout(_framePreviewTimer);
  const css = frameGlow(frameId);
  av.style.boxShadow = '';
  av.style.animation = '';
  // frameGlow liefert "box-shadow:…;animation:…;" → als Inline-Styles anwenden
  css.split(';').filter(Boolean).forEach(rule => {
    const [prop, val] = rule.split(/:(.+)/);
    if (prop === 'box-shadow') av.style.boxShadow = val;
    if (prop === 'animation')  av.style.animation = val;
  });
  toast('Vorschau aktiv – 6 Sekunden ⏱️', '');
  _framePreviewTimer = setTimeout(() => {
    av.style.boxShadow = '';
    av.style.animation = '';
    loadCoins(); // eigenen (gekauften) Rahmen wiederherstellen
  }, 6000);
};

window.lotteryBuy = async count => {
  const r = await api('/api/lottery/buy', { method: 'POST', body: { count } });
  if (r) { toast(`${count} Los${count > 1 ? 'e' : ''} gekauft – viel Glück! 🍀`, 'ok'); updateCoinChip(r.balance); shop(); }
};

window.claimDaily = async () => {
  const r = await api('/api/coins/daily', { method: 'POST' });
  if (r) {
    const extra = r.milestone ? ` 🎉 ${r.streak}-Tage-Meilenstein: +${r.milestone} extra!` : '';
    toast(`+${r.amount} Coins Tagesbonus! 🔥 Serie: ${r.streak} Tag${r.streak > 1 ? 'e' : ''}${extra}`, 'ok');
    updateCoinChip(r.balance);
    shop();
  }
};
window.shopBuy = async (itemId, price) => {
  const r = await api('/api/shop/buy', { method: 'POST', body: { itemId } });
  if (!r) return;
  updateCoinChip(r.balance);
  if (r.mystery) {
    const m = r.mystery;
    const inner = m.kind === 'coins'
      ? `<div style="font-size:3rem">🪙</div><div style="font-size:1.3rem;font-weight:800;color:#fbbf24;margin:.4rem 0">+${m.amount} Coins!</div>`
      : m.kind === 'ticket'
        ? `<div style="font-size:3rem">🎟️</div><div style="font-size:1.1rem;font-weight:800;margin:.4rem 0">Ein Lotterie-Los für diese Woche!</div>`
        : `<div style="font-size:3rem">✨</div><div style="font-size:1.1rem;font-weight:800;margin:.4rem 0">${esc(m.name)} freigeschaltet!</div>`;
    openModal(`
      <div class="modal-head"><div class="modal-title">🎲 Mystery-Box</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
      <div style="text-align:center;padding:1.2rem 0">${inner}</div>
      <div class="modal-footer" style="justify-content:center">
        <button class="btn btn-primary" onclick="closeModal();shopBuy('mystery_box')">🎲 Noch eine (200 🪙)</button>
        <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
      </div>`);
    renderUserWidget(); shop();
    return;
  }
  if (r.vipUntil)          toast('VIP aktiviert! Der Bot vergibt dir die Rolle gleich ⭐', 'ok');
  else if (r.boosterUntil) toast('Coin-Booster aktiv – 24h doppelte Spiel-Coins! ⚡', 'ok');
  else                     toast('Gekauft & ausgerüstet! 🎉', 'ok');
  renderUserWidget(); shop();
};

window.vipTest = async () => {
  const r = await api('/api/shop/vip-test', { method: 'POST' });
  if (r) { toast('VIP-Test gestartet – der Bot vergibt dir die Rolle für 10 Minuten ⭐', 'ok'); shop(); }
};

window.buyCustomTitle = async () => {
  const text = $('customTitleInput')?.value.trim();
  if (!text || text.length < 3) { toast('Mindestens 3 Zeichen', 'err'); return; }
  const r = await api('/api/shop/custom-title', { method: 'POST', body: { text } });
  if (r) { toast('Anfrage eingereicht – ein Admin prüft deinen Titel! ✏️', 'ok'); updateCoinChip(r.balance); shop(); }
};
window.shopEquip = async itemId => {
  const r = await api('/api/shop/equip', { method: 'POST', body: { itemId } });
  if (r) { toast('Ausgerüstet!', 'ok'); renderUserWidget(); shop(); }
};
window.shopUnequip = async slot => {
  const r = await api('/api/shop/equip', { method: 'POST', body: { itemId: null, slot } });
  if (r) { toast('Abgelegt', 'ok'); renderUserWidget(); shop(); }
};

// ════════════════════════════════════════════════════════════════
//  SAISON-PASS
// ════════════════════════════════════════════════════════════════
// Belohnung als kurzer Text + Icon darstellen
function seasonRewardLabel(r) {
  if (!r) return '–';
  const parts = [];
  if (r.coins)   parts.push(`${r.coins} 🪙`);
  if (r.ticket)  parts.push(`${r.ticket}× 🎟️ Los`);
  if (r.booster) parts.push(`⚡ Booster ${r.booster}h`);
  if (r.item)    parts.push(`🎁 ${SHOP_TITLE_NAMES[r.item] || SEASON_ITEM_NAMES[r.item] || r.item}`);
  return parts.join(' + ') || '–';
}
const SEASON_ITEM_NAMES = {
  frame_gold: 'Gold-Rahmen', frame_neon: 'Neon-Rahmen', frame_feuer: 'Feuer-Rahmen',
  frame_lila: 'Twilight-Rahmen', frame_regenbogen: 'Regenbogen-Rahmen',
  deco_crown: '👑 Krone', deco_wrench: '🔧 Schraubenschlüssel', deco_blitz: '⚡ Blitz', deco_halo: '😇 Heiligenschein',
};

async function saison() {
  const d = await api('/api/season');
  if (!d) return;
  const pct = Math.round((d.xpInLevel / d.xpPerLevel) * 100);
  const atMax = d.level >= d.maxLevel;

  // Quests
  const questHtml = d.quests.map(q => {
    const qpct = Math.round((q.progress / q.goal) * 100);
    const done = q.progress >= q.goal;
    return `<div class="card" style="padding:.8rem 1rem;display:flex;align-items:center;gap:.9rem">
      <div style="font-size:1.5rem">${q.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.85rem">${esc(q.label)}</div>
        <div style="height:7px;background:var(--surface2);border-radius:99px;overflow:hidden;margin:.4rem 0 .25rem">
          <div style="height:100%;width:${qpct}%;background:${done ? '#22c55e' : '#a855f7'};border-radius:99px;transition:width .3s"></div>
        </div>
        <div style="font-size:.7rem;color:var(--muted)">${q.progress}/${q.goal} · Belohnung: <b style="color:#a855f7">+${q.xp} XP</b></div>
      </div>
      ${q.claimed
        ? '<span style="font-size:.72rem;color:#22c55e;font-weight:700;white-space:nowrap"><i class="fas fa-check"></i> Erledigt</span>'
        : done
          ? `<button class="btn btn-primary btn-sm" onclick="seasonClaimQuest('${q.id}')" style="white-space:nowrap">Einlösen</button>`
          : '<span style="font-size:.72rem;color:var(--muted);white-space:nowrap">läuft…</span>'}
    </div>`;
  }).join('');

  // Belohnungsstufen (Track-Tabelle)
  const rewardHtml = d.rewards.map(r => {
    const cell = (track) => {
      const rew = track === 'premium' ? r.premium : r.free;
      const claimed = track === 'premium' ? r.premiumClaimed : r.freeClaimed;
      const premLocked = track === 'premium' && !d.premiumUnlocked;
      const claimable = r.reached && !claimed && !premLocked;
      return `<div style="flex:1;min-width:130px;padding:.55rem .7rem;border-radius:10px;border:1px solid ${claimed ? 'rgba(34,197,94,.4)' : claimable ? 'rgba(168,85,247,.5)' : 'var(--border)'};background:${claimed ? 'rgba(34,197,94,.07)' : claimable ? 'rgba(168,85,247,.08)' : 'var(--surface2)'};opacity:${r.reached ? 1 : .5}">
        <div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${track === 'premium' ? '#fbbf24' : 'var(--muted)'};margin-bottom:.2rem">${track === 'premium' ? '🌟 Premium' : 'Gratis'}</div>
        <div style="font-size:.78rem;font-weight:600">${seasonRewardLabel(rew)}</div>
        ${claimed
          ? '<div style="font-size:.66rem;color:#22c55e;font-weight:700;margin-top:.3rem"><i class="fas fa-check"></i> Abgeholt</div>'
          : claimable
            ? `<button class="btn btn-primary btn-sm" style="margin-top:.35rem;padding:.2rem .6rem;font-size:.7rem" onclick="seasonClaimLevel(${r.level},'${track}')">Abholen</button>`
            : premLocked && r.reached
              ? '<div style="font-size:.64rem;color:#fbbf24;margin-top:.3rem"><i class="fas fa-lock"></i> Premium nötig</div>'
              : ''}
      </div>`;
    };
    return `<div style="display:flex;align-items:stretch;gap:.6rem;margin-bottom:.6rem">
      <div style="width:46px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:10px;background:${r.reached ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'var(--surface2)'};border:1px solid var(--border)">
        <div style="font-size:.6rem;color:${r.reached ? 'rgba(255,255,255,.7)' : 'var(--muted)'}">Stufe</div>
        <div style="font-size:1.1rem;font-weight:800;color:${r.reached ? '#fff' : 'var(--muted)'}">${r.level}</div>
      </div>
      ${cell('free')}
      ${cell('premium')}
    </div>`;
  }).join('');

  const _saisonContainer = (currentUser?.voter && document.getElementById('saisonSection')) || $('pageContent');
  _saisonContainer.innerHTML = `
    <div class="card" style="padding:1.4rem;margin-bottom:1.25rem;background:linear-gradient(135deg,rgba(168,85,247,.12),rgba(168,85,247,.02));border-color:rgba(168,85,247,.35)">
      <div style="display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap;margin-bottom:1rem">
        <div style="font-size:2.6rem">🎖️</div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:.72rem;font-weight:700;color:#a855f7;text-transform:uppercase;letter-spacing:.08em">Saison · ${esc(d.seasonName)}</div>
          <div style="font-size:1.45rem;font-weight:800;margin:.1rem 0">Stufe ${d.level}${atMax ? ' · MAX 🏆' : ''}</div>
          <div style="font-size:.78rem;color:var(--muted)">Verdiene XP durch Minispiele, Tagesbonus, Duelle & Quests. Jede Stufe schaltet Belohnungen frei.</div>
        </div>
        ${d.premiumUnlocked ? '<span style="font-size:.7rem;font-weight:800;color:#fbbf24;border:1px solid rgba(251,191,36,.4);background:rgba(251,191,36,.08);padding:.3rem .7rem;border-radius:99px">🌟 Premium aktiv</span>'
                  : currentUser?.voter ? ''
                  : `<button onclick="buySeasonPremium()" title="Premium-Pass freischalten" style="font-size:.68rem;font-weight:700;color:#fbbf24;border:1px solid rgba(251,191,36,.4);background:rgba(251,191,36,.08);padding:.3rem .7rem;border-radius:99px;cursor:pointer;font-family:inherit;white-space:nowrap">🌟 Premium (${d.premiumCost||500} Coins)</button>`}
      </div>
      <div style="display:flex;align-items:center;gap:.6rem">
        <div style="flex:1;height:14px;background:var(--surface2);border-radius:99px;overflow:hidden;position:relative">
          <div style="height:100%;width:${atMax ? 100 : pct}%;background:linear-gradient(90deg,#7c3aed,#a855f7,#d8b4fe);border-radius:99px;transition:width .4s"></div>
        </div>
        <div style="font-size:.74rem;font-weight:700;color:#a855f7;white-space:nowrap">${atMax ? `${d.xp} XP` : `${d.xpInLevel}/${d.xpPerLevel} XP`}</div>
      </div>
    </div>

    <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">⚡ Wochen-Quests <span style="color:#a855f7;text-transform:none;letter-spacing:0">· Reset jeden Montag</span></div>
    <div style="display:grid;gap:.6rem;margin-bottom:1.5rem">${questHtml}</div>

    <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">🎁 Belohnungsstufen</div>
    <div>${rewardHtml}</div>

    <!-- BATCH 7: Referral-Card -->
    <div id="referralCard" style="margin-top:1.25rem"></div>`;

  // Referral-Widget laden
  loadReferralWidget();
}

window.seasonClaimQuest = async (id) => {
  const r = await api('/api/season/claim-quest', { method: 'POST', body: { questId: id } });
  if (r) { toast(`+${r.xpGained} XP eingelöst! 🎉`, 'ok'); saison(); }
};
window.seasonClaimLevel = async (level, track) => {
  const r = await api('/api/season/claim-level', { method: 'POST', body: { level, track } });
  if (r) { toast('Belohnung abgeholt! 🎁', 'ok'); loadCoins(); saison(); }
};
window.buySeasonPremium = async () => {
  if (!confirm('Premium-Pass für 500 Coins freischalten? Schaltet alle Premium-Belohnungen dieser Saison frei.')) return;
  const r = await api('/api/season/buy-premium', { method: 'POST' });
  if (r) { toast('🌟 Premium-Pass freigeschaltet!', 'ok'); updateCoinChip(r.balance); saison(); }
};

// BATCH 7: Referral-Widget
async function loadReferralWidget() {
  const el = document.getElementById('referralCard');
  if (!el) return;
  const d = await fetch('/api/referral/link').then(r => r.json()).catch(() => null);
  if (!d) return;
  el.innerHTML = `<div class="card" style="background:linear-gradient(135deg,rgba(34,197,94,.08),rgba(34,197,94,.02));border-color:rgba(34,197,94,.3)">
    <div class="card-head">
      <div class="card-head-icon" style="background:rgba(34,197,94,.15)"><i class="fas fa-user-plus" style="color:#22c55e"></i></div>
      <div><div class="card-title">Freunde einladen</div><div class="card-sub">+100 Coins pro erfolgreich eingeladenem Bürger</div></div>
    </div>
    <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.65rem">
      <input class="form-control" value="${esc(d.link)}" readonly style="flex:1;font-size:.78rem;cursor:pointer" onclick="this.select()" id="refLinkInput">
      <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${esc(d.link).replace(/'/g, "\\'")}').then(()=>toast('Link kopiert!','ok'))">
        <i class="fas fa-copy"></i> Kopieren
      </button>
    </div>
    <div style="font-size:.8rem;color:var(--muted)">
      <i class="fas fa-check-circle" style="color:#22c55e;margin-right:.3rem"></i>
      <strong>${d.count}</strong> Bürger erfolgreich eingeladen · <strong>${d.count * 100}</strong> Coins verdient
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════
//  WOCHENTURNIER
// ════════════════════════════════════════════════════════════════
function tournamentCountdown() {
  // Nächster Sonntag 20:00 (lokale Zeit ≈ Berlin für die Zielgruppe)
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  d.setHours(20, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 7);
  const ms = d - now;
  const days = Math.floor(ms / 86400000), hrs = Math.floor(ms % 86400000 / 3600000), min = Math.floor(ms % 3600000 / 60000);
  return days > 0 ? `${days}T ${hrs}h` : `${hrs}h ${min}min`;
}

async function turnier() {
  const t = await api('/api/tournament');
  if (!t) return;
  const medals = ['🥇', '🥈', '🥉'];
  const avEl = r => r.avatar
    ? `<img src="https://cdn.discordapp.com/avatars/${r.discord_id}/${r.avatar}.png?size=64" style="width:30px;height:30px;border-radius:50%;object-fit:cover;${frameGlow(r.equipped_frame)}">`
    : `<div style="width:30px;height:30px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;${frameGlow(r.equipped_frame)}">${initials(r.username)}</div>`;

  $('pageContent').innerHTML = `
    <div class="card" style="padding:1.4rem;margin-bottom:1.25rem;background:linear-gradient(135deg,rgba(251,191,36,.10),rgba(251,191,36,.02));border-color:rgba(251,191,36,.35)">
      <div style="display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap">
        <div style="font-size:2.6rem">🏆</div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:.72rem;font-weight:700;color:#fbbf24;text-transform:uppercase;letter-spacing:.08em">Turnier-Spiel der Woche · KW ${isoWeek(t.week)}</div>
          <div style="font-size:1.45rem;font-weight:800;margin:.15rem 0">${esc(t.gameName)}</div>
          <div style="font-size:.78rem;color:var(--muted)">Dein bester Score in dieser Woche zählt automatisch. Auswertung: Sonntag 20:00 Uhr (noch ${tournamentCountdown()})</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.5rem;align-items:flex-end">
          <a href="${t.gameUrl}" target="_blank"><button class="btn btn-primary"><i class="fas fa-play"></i> Jetzt spielen</button></a>
          <div style="font-size:.72rem;color:var(--muted)">Preise: 🥇 ${t.prizes[0]} · 🥈 ${t.prizes[1]} · 🥉 ${t.prizes[2]} 🪙</div>
        </div>
      </div>
      ${t.myScore != null ? `<div style="margin-top:.9rem;padding-top:.9rem;border-top:1px solid rgba(251,191,36,.2);font-size:.85rem">Dein Score diese Woche: <b style="color:#fbbf24">${t.myScore.toLocaleString('de-DE')}</b></div>` : ''}
    </div>

    ${t.lastWinner ? `
    <div class="card" style="padding:.9rem 1.2rem;margin-bottom:1.25rem;display:flex;align-items:center;gap:.8rem">
      <i class="fas fa-crown" style="color:#fbbf24;font-size:1.1rem"></i>
      <div style="font-size:.82rem">Letzte Woche gewann <b>${esc(t.lastWinner.username || '–')}</b> das ${esc(t.lastWinner.game)}-Turnier${t.lastWinner.score != null ? ` mit ${(+t.lastWinner.score).toLocaleString('de-DE')} Punkten` : ''} 🎉</div>
    </div>` : ''}

    <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">Rangliste dieser Woche</div>
    <div class="card" style="padding:.5rem 1rem">
      ${t.leaderboard.length ? t.leaderboard.map((r, i) => `
        <div style="display:flex;align-items:center;gap:.7rem;padding:.55rem 0;border-bottom:1px solid var(--border);${currentUser && r.discord_id === currentUser.discord_id ? 'background:rgba(251,191,36,.06);border-radius:8px;padding-left:.5rem;padding-right:.5rem' : ''}">
          <div style="width:28px;text-align:center;font-weight:800;font-size:.9rem">${medals[i] || (i + 1) + '.'}</div>
          ${avEl(r)}
          <div style="flex:1"><div style="font-weight:600;font-size:.85rem;${nameColorCss(r.equipped_namecolor)}">${decoEmoji(r.equipped_deco)}${esc(r.username || 'Unbekannt')}</div>${titleLine(r.equipped_title, '.62rem')}</div>
          ${i < 3 ? `<span style="font-size:.7rem;color:#fbbf24;font-weight:700">+${t.prizes[i]} 🪙</span>` : ''}
          <div style="font-weight:800;color:#fbbf24;font-size:.9rem">${(+r.score).toLocaleString('de-DE')}</div>
        </div>`).join('') : '<div style="padding:1.2rem 0;text-align:center;color:var(--muted);font-size:.85rem">Noch keine Teilnehmer – sei der Erste! 🚀</div>'}
    </div>`;
}

// ════════════════════════════════════════════════════════════════
//  QUIZ-DUELL (1v1 live)
// ════════════════════════════════════════════════════════════════
let _duel = { code: null, answering: false, t0: 0, viewingResult: false, gen: 0 };
// Duell rendert wahlweise ins Staff-SPA (pageContent) oder in die Voter-Section
const duelEl      = () => document.getElementById(window._duelContainer || 'pageContent');
const duelVisible = () => _activePage === 'duell' || !!window._duelActive;
function duelClearTimer() {
  if (window._duelTimer) { clearInterval(window._duelTimer); window._duelTimer = null; }
}

// ── Duell-Turnier (8er K.o.-Bracket) ─────────────────────────────
function bracketCard(br) {
  if (!br) return '';
  const lastLine = br.lastWinner
    ? `<div style="font-size:.72rem;color:var(--muted);margin-top:.35rem"><i class="fas fa-crown" style="color:#fbbf24"></i> Letztes Turnier: <b>${esc(br.lastWinner.winner_name || '–')}</b> gewann ${Math.round(br.lastWinner.pot * 0.75).toLocaleString('de-DE')} 🪙</div>`
    : '';
  // Kein offenes Turnier → Werbe-Karte
  if (!br.bracket) {
    return `<div class="card" style="padding:1.1rem 1.3rem;margin-bottom:1.25rem;background:linear-gradient(135deg,rgba(168,85,247,.10),rgba(168,85,247,.02));border-color:rgba(168,85,247,.35)">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="font-size:2rem">🏟️</div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:800;font-size:1rem">Duell-Turnier</div>
          <div style="font-size:.74rem;color:var(--muted)">${br.size} Spieler · K.o.-System · Einsatz ${br.fee} 🪙 → Pot ${br.size * br.fee} 🪙 (75 % Sieger / 25 % Finalist)</div>
          ${lastLine}
        </div>
        <button class="btn btn-primary" onclick="bracketJoin()"><i class="fas fa-sign-in-alt"></i> Anmelden (${br.fee} 🪙)</button>
      </div>
    </div>`;
  }
  const b = br.bracket;
  // Anmeldephase
  if (b.status === 'open') {
    return `<div class="card" style="padding:1.1rem 1.3rem;margin-bottom:1.25rem;border-color:rgba(168,85,247,.35)">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.7rem">
        <div style="font-size:1.7rem">🏟️</div>
        <div style="flex:1">
          <div style="font-weight:800">Duell-Turnier · Anmeldung läuft (${br.players.length}/${b.size})</div>
          <div style="font-size:.74rem;color:var(--muted)">Startet automatisch bei ${b.size} Spielern · Pot aktuell: <b style="color:#fbbf24">${b.pot} 🪙</b></div>
        </div>
        ${br.joined
          ? `<button class="btn btn-ghost btn-sm" onclick="bracketLeave()"><i class="fas fa-sign-out-alt"></i> Abmelden (${b.fee} 🪙 zurück)</button>`
          : `<button class="btn btn-primary" onclick="bracketJoin()"><i class="fas fa-sign-in-alt"></i> Anmelden (${b.fee} 🪙)</button>`}
      </div>
      <div style="display:flex;gap:.45rem;flex-wrap:wrap">
        ${br.players.map(p => `<span style="display:inline-flex;align-items:center;gap:.35rem;background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:.25rem .7rem;font-size:.76rem;font-weight:600">
          ${p.avatar ? `<img src="https://cdn.discordapp.com/avatars/${p.discord_id}/${p.avatar}.png?size=32" style="width:18px;height:18px;border-radius:50%">` : '👤'} ${esc(p.username)}
        </span>`).join('')}
        ${Array.from({ length: Math.max(0, b.size - br.players.length) }, () => '<span style="background:var(--surface2);opacity:.4;border:1px dashed var(--border);border-radius:999px;padding:.25rem .8rem;font-size:.76rem">frei</span>').join('')}
      </div>
    </div>`;
  }
  // Turnier läuft → Bracket-Baum
  const roundName = { 1: 'Viertelfinale', 2: 'Halbfinale', 3: 'Finale' };
  const rounds = [...new Set(br.matches.map(m => m.bracket_round))].sort();
  const matchRow = m => {
    const done = m.status === 'done';
    const winHost  = done && m.winner_did === m.host_did;
    const winGuest = done && m.winner_did === m.guest_did;
    const mine = !done && (m.host_did === currentUser?.discord_id || m.guest_did === currentUser?.discord_id);
    return `<div style="background:var(--surface2);border:1px solid ${mine ? 'rgba(244,114,182,.5)' : 'var(--border)'};border-radius:8px;padding:.45rem .6rem;margin-bottom:.45rem;font-size:.76rem">
      <div style="display:flex;justify-content:space-between;gap:.5rem;${winHost ? 'color:#4ade80;font-weight:700' : done && !winHost ? 'opacity:.55' : ''}"><span>${esc(m.host_name || '?')}</span><span>${m.host_score || 0}</span></div>
      <div style="display:flex;justify-content:space-between;gap:.5rem;${winGuest ? 'color:#4ade80;font-weight:700' : done && !winGuest ? 'opacity:.55' : ''}"><span>${esc(m.guest_name || '?')}</span><span>${m.guest_score || 0}</span></div>
      ${mine ? `<button class="btn btn-primary btn-sm" style="width:100%;margin-top:.35rem" onclick="duelArena('${m.code}')">▶ Jetzt spielen!</button>` : ''}
    </div>`;
  };
  return `<div class="card" style="padding:1.1rem 1.3rem;margin-bottom:1.25rem;border-color:rgba(168,85,247,.35)">
    <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.8rem;flex-wrap:wrap">
      <div style="font-size:1.5rem">🏟️</div>
      <div style="font-weight:800">Duell-Turnier läuft · Pot ${b.pot} 🪙</div>
      <span style="font-size:.68rem;color:var(--muted);margin-left:auto">Pro Match max. 6 Minuten – wer nicht antritt, scheidet aus</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(${rounds.length || 1},1fr);gap:.8rem;align-items:start">
      ${rounds.map(r => `<div>
        <div style="font-size:.66rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.45rem">${roundName[r] || 'Runde ' + r}</div>
        ${br.matches.filter(m => m.bracket_round === r).map(matchRow).join('')}
      </div>`).join('')}
    </div>
  </div>`;
}

window.bracketJoin = async () => {
  const r = await api('/api/bracket/join', { method: 'POST' });
  if (r) { toast('Angemeldet – viel Erfolg! ⚔️', 'ok'); updateCoinChip(r.balance); duell(); }
};
window.bracketLeave = async () => {
  const r = await api('/api/bracket/leave', { method: 'POST' });
  if (r) { toast('Abgemeldet – Einsatz zurückerstattet', 'ok'); loadCoins(); duell(); }
};

async function duell() {
  duelClearTimer();
  // Generationszähler: jede neuere Render-Anforderung macht ältere ungültig,
  // damit sich SSE-Event und Polling nicht gegenseitig überschreiben
  const gen = ++_duel.gen;
  _duel.viewingResult = false;
  const [data, br] = await Promise.all([api('/api/duels'), api('/api/bracket')]);
  if (gen !== _duel.gen) return;
  if (!data) return;
  if (data.myDuel) { duelArena(data.myDuel.code); return; }
  _duel.code = null;

  duelEl().innerHTML = `
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.25rem">
      <div class="card" style="flex:2;min-width:260px;padding:1.4rem;display:flex;align-items:center;gap:1.2rem;background:linear-gradient(135deg,rgba(244,114,182,.10),rgba(244,114,182,.02));border-color:rgba(244,114,182,.35)">
        <div style="font-size:2.6rem">⚔️</div>
        <div style="flex:1">
          <div style="font-size:1.2rem;font-weight:800">Fordere jemanden heraus!</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem">8 Fragen · 15 Sekunden pro Frage · Schnelligkeit gibt Bonuspunkte<br>Sieger: <b style="color:#fbbf24">+150 🪙</b> · Verlierer: +25 🪙</div>
        </div>
        <button class="btn btn-primary" onclick="duelCreate()"><i class="fas fa-bolt"></i> Duell erstellen</button>
      </div>
      <div class="card" style="flex:1;min-width:160px;padding:1.4rem;text-align:center">
        <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem">Deine Bilanz</div>
        <div style="font-size:1.3rem;font-weight:800"><span style="color:#4ade80">${data.stats.wins}</span> : <span style="color:#ef4444">${data.stats.losses}</span></div>
        <div style="font-size:.7rem;color:var(--muted)">Siege : Niederlagen</div>
      </div>
    </div>

    ${bracketCard(br)}

    <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.6rem">Offene Herausforderungen</div>
    <div id="duel-open-list">
      ${data.open.length ? data.open.map(d => `
        <div class="card" style="padding:.7rem 1rem;margin-bottom:.5rem;display:flex;align-items:center;gap:.8rem">
          ${d.avatar ? `<img src="https://cdn.discordapp.com/avatars/${d.discord_id}/${d.avatar}.png?size=64" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : `<div style="width:32px;height:32px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:700">${initials(d.username)}</div>`}
          <div style="flex:1">
            <div style="font-weight:700;font-size:.85rem">${esc(d.username)}</div>
            <div style="font-size:.7rem;color:var(--muted)">wartet auf einen Gegner · ${ago(d.created_at)}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="duelJoin('${d.code}')"><i class="fas fa-bolt"></i> Annehmen</button>
        </div>`).join('') : '<div class="card" style="padding:1.2rem;text-align:center;color:var(--muted);font-size:.85rem">Keine offenen Duelle – erstelle eins!</div>'}
    </div>`;
}

window.duelCreate = async () => {
  const r = await api('/api/duels', { method: 'POST' });
  if (r) duelArena(r.code);
};
window.duelJoin = async code => {
  const r = await api(`/api/duels/${code}/join`, { method: 'POST' });
  if (r) duelArena(code);
};
window.duelCancel = async () => {
  if (_duel.code) await api(`/api/duels/${_duel.code}/cancel`, { method: 'POST' });
  duell();
};

function handleDuelEvent(d) {
  if (_duel.code && d.code === _duel.code) {
    if (d.action === 'emote') {
      if (d.fromDid !== currentUser?.discord_id) showDuelEmote(d.emote, d.from);
      return;
    }
    if (d.action === 'start' || d.action === 'done') { duelArena(_duel.code); return; }
    if (d.action === 'progress') { duelUpdateOpp(); return; }
  }
  if (!_duel.code && !_duel.viewingResult && (d.action === 'open' || d.action === 'start')) duell();
}

window.duelEmote = async emote => {
  if (!_duel.code) return;
  try {
    await fetch(`/api/duels/${_duel.code}/emote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emote }) });
    showDuelEmote(emote, 'Du');
  } catch {}
};

// Großes Emote schwebt kurz über dem Duell
function showDuelEmote(emote, from) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:22%;left:50%;transform:translateX(-50%);z-index:9999;text-align:center;pointer-events:none;transition:opacity .4s,transform 1.8s ease-out';
  el.innerHTML = `<div style="font-size:3.2rem;filter:drop-shadow(0 4px 10px rgba(0,0,0,.5))">${emote}</div>
    <div style="font-size:.72rem;color:#fff;background:rgba(0,0,0,.6);border-radius:8px;padding:.15rem .55rem;display:inline-block">${esc(from)}</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateX(-50%) translateY(-36px)'; });
  setTimeout(() => { el.style.opacity = '0'; }, 1400);
  setTimeout(() => el.remove(), 2000);
}

async function duelUpdateOpp() {
  if (!_duel.code) return;
  try {
    const r = await fetch(`/api/duels/${_duel.code}/state`);
    if (!r.ok) return;
    const s = await r.json();
    const el = $('duel-opp-progress');
    if (el) el.textContent = `${s.oppIdx}/${s.total}`;
    const sc = $('duel-opp-score');
    if (sc) sc.textContent = s.oppScore;
    if (s.status === 'done') duelArena(_duel.code);
  } catch {}
}

function duelPlayerBox(p, score, progress, total, align) {
  const av = p?.avatar
    ? `<img src="https://cdn.discordapp.com/avatars/${p.discord_id}/${p.avatar}.png?size=64" style="width:42px;height:42px;border-radius:50%;object-fit:cover">`
    : `<div style="width:42px;height:42px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.75rem">${initials(p?.username || '?')}</div>`;
  return `<div style="display:flex;align-items:center;gap:.7rem;${align === 'right' ? 'flex-direction:row-reverse;text-align:right' : ''}">
    ${av}
    <div>
      <div style="font-weight:700;font-size:.85rem">${esc(p?.username || '???')}</div>
      <div style="font-size:.72rem;color:var(--muted)">Frage <span id="${align === 'right' ? 'duel-opp-progress' : 'duel-my-progress'}">${progress}/${total}</span></div>
    </div>
    <div style="font-size:1.35rem;font-weight:800;color:${align === 'right' ? '#ef4444' : '#4ade80'};margin:0 .4rem" id="${align === 'right' ? 'duel-opp-score' : 'duel-my-score'}">${score}</div>
  </div>`;
}

async function duelArena(code) {
  _duel.code = code;
  const gen = ++_duel.gen;
  duelClearTimer();
  const s = await api(`/api/duels/${code}/state`);
  if (gen !== _duel.gen) return; // eine neuere Instanz hat übernommen
  if (!s) {
    // Netzwerkfehler: NICHT in die Lobby springen, sondern kurz neu versuchen
    setTimeout(() => { if (duelVisible() && _duel.code === code && gen === _duel.gen) duelArena(code); }, 3000);
    return;
  }

  // ── Wartend auf Gegner ──
  if (s.status === 'waiting') {
    duelEl().innerHTML = `
      <div class="card" style="max-width:480px;margin:2rem auto;padding:2.2rem;text-align:center">
        <div style="font-size:2.6rem;margin-bottom:.6rem">⏳</div>
        <div style="font-size:1.15rem;font-weight:800;margin-bottom:.3rem">Warte auf einen Gegner…</div>
        <div style="font-size:.8rem;color:var(--muted);margin-bottom:1.2rem">Dein Duell ist für alle Mitarbeiter & Bürger sichtbar.<br>Sobald jemand annimmt, geht es automatisch los!</div>
        <div class="loader" style="margin:0 auto 1.2rem"></div>
        <button class="btn btn-ghost btn-sm" onclick="duelCancel()"><i class="fas fa-times"></i> Duell abbrechen</button>
      </div>`;
    // Fallback-Polling falls SSE hängt
    window._duelTimer = setInterval(() => { if (duelVisible() && gen === _duel.gen) duelArena(code); }, 5000);
    return;
  }

  const emoteBar = s.emotes && s.status === 'active'
    ? `<div style="display:flex;gap:.4rem;justify-content:center;margin-bottom:1rem">
        ${(s.emoteList || []).map(e => `<button onclick="duelEmote('${e}')" title="Emote senden" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;font-size:1.05rem;padding:.25rem .55rem;cursor:pointer;transition:transform .1s" onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform=''">${e}</button>`).join('')}
      </div>`
    : '';
  const header = `
    <div class="card" style="padding:.9rem 1.2rem;margin-bottom:${s.emotes && s.status === 'active' ? '.5rem' : '1rem'};display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      ${duelPlayerBox(s.isHost ? s.host : s.guest, s.myScore, s.myIdx, s.total, 'left')}
      <div style="font-weight:800;color:var(--muted);font-size:.9rem">VS</div>
      ${duelPlayerBox(s.isHost ? s.guest : s.host, s.oppScore, s.oppIdx, s.total, 'right')}
    </div>${emoteBar}`;

  // ── Fertig ──
  if (s.status === 'done') {
    _duel.code = null;
    _duel.viewingResult = true;
    const won  = s.result === 'win';
    const draw = s.result === 'draw';
    duelEl().innerHTML = header + `
      <div class="card" style="max-width:480px;margin:1.5rem auto;padding:2.2rem;text-align:center">
        <div style="font-size:3rem;margin-bottom:.5rem">${draw ? '🤝' : won ? '🏆' : '😢'}</div>
        <div style="font-size:1.4rem;font-weight:800;color:${draw ? 'var(--text)' : won ? '#4ade80' : '#ef4444'}">${draw ? 'Unentschieden!' : won ? 'Gewonnen!' : 'Verloren!'}</div>
        <div style="font-size:.95rem;margin:.5rem 0 1rem">${s.myScore} : ${s.oppScore}</div>
        <div style="font-size:.8rem;color:#fbbf24;font-weight:700;margin-bottom:1.4rem">+${draw ? s.coins.draw : won ? s.coins.win : s.coins.loss} 🪙 ACLS-Coins</div>
        <button class="btn btn-primary" onclick="duell()"><i class="fas fa-redo"></i> Zur Duell-Lobby</button>
      </div>`;
    loadCoins();
    return;
  }

  // ── Aktiv: alle eigenen Fragen beantwortet → auf Gegner warten ──
  if (!s.question) {
    duelEl().innerHTML = header + `
      <div class="card" style="max-width:480px;margin:1.5rem auto;padding:2.2rem;text-align:center">
        <div style="font-size:2.4rem;margin-bottom:.6rem">✅</div>
        <div style="font-weight:800;font-size:1.05rem;margin-bottom:.3rem">Du bist fertig!</div>
        <div style="font-size:.8rem;color:var(--muted)">Warte, bis dein Gegner alle Fragen beantwortet hat…</div>
        <div class="loader" style="margin:1.2rem auto 0"></div>
      </div>`;
    // Fallback-Polling falls SSE hängt
    window._duelTimer = setInterval(() => { if (duelVisible() && gen === _duel.gen) duelArena(code); }, 5000);
    return;
  }

  // ── Aktiv: Frage anzeigen ──
  _duel.t0 = Date.now();
  _duel.answering = false;
  duelEl().innerHTML = header + `
    <div class="card" style="max-width:640px;margin:0 auto;padding:1.6rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem">
        <span style="font-size:.75rem;font-weight:700;color:var(--muted)">Frage ${s.question.idx + 1} von ${s.total}</span>
        <span style="font-size:.85rem;font-weight:800;color:#fbbf24" id="duel-timer-txt">15.0s</span>
      </div>
      <div style="height:6px;background:var(--surface2);border-radius:4px;overflow:hidden;margin-bottom:1.2rem">
        <div id="duel-timer-bar" style="height:100%;width:100%;background:linear-gradient(90deg,#4ade80,#fbbf24,#ef4444);transition:width .1s linear"></div>
      </div>
      <div style="font-weight:700;font-size:1.02rem;line-height:1.5;margin-bottom:1.2rem">${esc(s.question.question)}</div>
      <div style="display:flex;flex-direction:column;gap:.6rem" id="duel-options">
        ${s.question.options.map((o, i) => `
          <button class="btn btn-ghost" id="duel-opt-${i}" onclick="duelAnswer(${i})" style="text-align:left;justify-content:flex-start;padding:.8rem 1rem;font-size:.88rem">
            <b style="margin-right:.6rem;color:var(--orange)">${'ABCD'[i]}</b> ${esc(o)}
          </button>`).join('')}
      </div>
    </div>`;

  // Countdown
  window._duelTimer = setInterval(() => {
    if (gen !== _duel.gen) { duelClearTimer(); return; } // verwaister Timer einer alten Runde
    const left = Math.max(0, s.timeMs - (Date.now() - _duel.t0));
    const bar = $('duel-timer-bar'), txt = $('duel-timer-txt');
    if (bar) bar.style.width = (left / s.timeMs * 100) + '%';
    if (txt) txt.textContent = (left / 1000).toFixed(1) + 's';
    if (left <= 0) { duelClearTimer(); duelAnswer(-1); }
  }, 100);
}

window.duelAnswer = async answer => {
  if (_duel.answering || !_duel.code) return;
  _duel.answering = true;
  duelClearTimer();
  const ms = Date.now() - _duel.t0;
  const r = await api(`/api/duels/${_duel.code}/answer`, { method: 'POST', body: { answer, ms } });
  if (!r) { _duel.answering = false; if (_duel.code) duelArena(_duel.code); return; }
  // Feedback: richtige Antwort grün, eigene falsche rot
  document.querySelectorAll('#duel-options button').forEach(b => b.disabled = true);
  const right = $(`duel-opt-${r.correctAnswer}`);
  if (right) { right.style.borderColor = '#22c55e'; right.style.background = 'rgba(34,197,94,.12)'; }
  if (!r.correct && answer >= 0) {
    const mine = $(`duel-opt-${answer}`);
    if (mine) { mine.style.borderColor = '#ef4444'; mine.style.background = 'rgba(239,68,68,.12)'; }
  }
  if (r.correct) toast(`Richtig! +${r.points} Punkte`, 'ok');
  setTimeout(() => { if (duelVisible() && _duel.code) duelArena(_duel.code); }, 1100);
};

// ════════════════════════════════════════════════════════════════
//  GAME-RANGLISTE (Dashboard-Widget)
// ════════════════════════════════════════════════════════════════
function _rankBadge(i) {
  const style = i > 3 ? ' style="background:#2a2a2a;color:var(--muted)"' : '';
  const cls = i === 1 ? '' : i === 2 ? ' r2' : ' r3';
  return `<div class="rank-badge${cls}"${style}>${i}</div>`;
}

async function loadGameLeaderboard(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const data = await api('/api/game-leaderboard');
  if (!data || !data.length) { el.innerHTML = ''; return; }

  const withScores = data.filter(g => g.top && g.top.length > 0);
  if (!withScores.length) { el.innerHTML = ''; return; }

  let openGame = null;

  function renderWidget() {
    el.innerHTML = `
    <div class="card" style="margin-top:0">
      <div class="card-head">
        <div class="card-head-icon" style="background:rgba(251,191,36,.15)"><i class="fas fa-gamepad" style="color:#fbbf24"></i></div>
        <div><div class="card-title">Spiele-Rangliste</div><div class="card-sub">Top 3 pro Minispiel</div></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin:.4rem 0 .85rem">
        ${withScores.map(g => `
          <button onclick="window._glToggle('${g.game}')"
            style="padding:.28rem .65rem;border-radius:999px;font-size:.72rem;font-weight:700;border:1px solid ${openGame===g.game?'var(--accent)':'var(--border)'};background:${openGame===g.game?'var(--accent)':'var(--surface2)'};color:${openGame===g.game?'#fff':'var(--text)'};cursor:pointer;transition:all .12s">
            ${esc(g.label || g.game)}
          </button>`).join('')}
      </div>
      ${openGame ? (() => {
        const g = withScores.find(x => x.game === openGame);
        if (!g || !g.top.length) return '<div class="empty"><i class="fas fa-trophy"></i><p>Noch keine Einträge</p></div>';
        return `<div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.82rem">
            <thead><tr style="border-bottom:1px solid var(--border)">
              <th style="padding:.4rem .6rem;text-align:left;color:var(--muted);font-weight:600">#</th>
              <th style="padding:.4rem .6rem;text-align:left;color:var(--muted);font-weight:600">Spieler</th>
              <th style="padding:.4rem .6rem;text-align:right;color:var(--muted);font-weight:600">Punkte</th>
            </tr></thead>
            <tbody>
              ${g.top.map((e, i) => `
                <tr style="border-bottom:1px solid var(--border);${currentUser && e.discord_id === currentUser.discord_id ? 'background:rgba(168,85,247,.08)' : ''}">
                  <td style="padding:.4rem .6rem">${_rankBadge(i + 1)}</td>
                  <td style="padding:.4rem .6rem">
                    <div style="display:flex;align-items:center;gap:.5rem">
                      <div style="width:24px;height:24px;flex-shrink:0">${avatarEl(e, 24)}</div>
                      <span style="font-weight:600">${esc(e.username)}</span>
                    </div>
                  </td>
                  <td style="padding:.4rem .6rem;text-align:right;font-weight:700;color:#fbbf24">${(e.score||0).toLocaleString('de-DE')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      })() : '<div style="font-size:.8rem;color:var(--muted);text-align:center;padding:.5rem 0">Spiel auswählen, um die Rangliste zu sehen</div>'}
    </div>`;
  }

  window._glToggle = game => {
    openGame = openGame === game ? null : game;
    renderWidget();
  };

  renderWidget();
}

// ════════════════════════════════════════════════════════════════
//  SCHWARZMARKT
// ════════════════════════════════════════════════════════════════
async function schwarzmarkt() {
  const data = await api('/api/blackmarket');
  if (!data) return;

  function msUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight - now;
  }

  function fmtCountdown(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  $('pageContent').innerHTML = `
    <div style="max-width:720px">
      <div class="card" style="margin-bottom:1.2rem;background:linear-gradient(135deg,rgba(239,68,68,.12),rgba(0,0,0,0));border-color:rgba(239,68,68,.35)">
        <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
          <div style="font-size:2.5rem">🕵️</div>
          <div style="flex:1">
            <div style="font-weight:800;font-size:1.1rem">Schwarzmarkt</div>
            <div style="font-size:.82rem;color:var(--muted);margin-top:.25rem">3 exklusive Angebote täglich – heute um Mitternacht weg. Kein Refund.</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:.7rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em">Rotation in</div>
            <div id="bm-countdown" style="font-size:1.4rem;font-weight:900;font-variant-numeric:tabular-nums;color:#ef4444;font-family:monospace">${fmtCountdown(msUntilMidnight())}</div>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem">
        ${data.slots.map(slot => `
          <div class="card" style="${slot.sold ? 'opacity:.55' : 'border-color:rgba(239,68,68,.4)'}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem">
              <span style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#ef4444">Angebot ${slot.slot + 1}</span>
              ${slot.sold ? '<span style="font-size:.65rem;font-weight:700;color:var(--muted)">VERKAUFT</span>' : `<span style="font-size:.65rem;font-weight:800;color:#4ade80">-${slot.discount}%</span>`}
            </div>
            <div style="font-weight:800;font-size:.98rem;margin-bottom:.15rem">${esc(slot.name || slot.item_id)}</div>
            <div style="font-size:.72rem;color:var(--muted);margin-bottom:.75rem">${esc(slot.type || '')}</div>
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.8rem">
              <span style="font-size:.78rem;color:var(--muted);text-decoration:line-through">${slot.original_price?.toLocaleString('de-DE')} 🪙</span>
              <span style="font-size:1rem;font-weight:800;color:#fbbf24">${slot.discounted_price?.toLocaleString('de-DE')} 🪙</span>
            </div>
            ${slot.sold
              ? '<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:.4rem">Nicht mehr verfügbar</div>'
              : `<button class="btn btn-primary btn-sm" style="width:100%;background:linear-gradient(135deg,#ef4444,#dc2626)" onclick="bmBuy('${slot.item_id}',${slot.slot})">Kaufen</button>`}
          </div>`).join('')}
      </div>

      ${isAdmin() ? `
        <div style="margin-top:1.5rem">
          <button class="btn btn-ghost btn-sm" onclick="bmAdminRefresh()"><i class="fas fa-sync"></i> Rotation jetzt zurücksetzen (Admin)</button>
        </div>` : ''}
    </div>`;

  clearInterval(schwarzmarkt._cdTimer);
  schwarzmarkt._cdTimer = setInterval(() => {
    const el = document.getElementById('bm-countdown');
    if (!el) { clearInterval(schwarzmarkt._cdTimer); return; }
    el.textContent = fmtCountdown(msUntilMidnight());
  }, 1000);
}

window.bmBuy = async (itemId, slot) => {
  const r = await api('/api/blackmarket/buy', { method: 'POST', body: { item_id: itemId, slot } });
  if (r) { toast('Gekauft & ausgerüstet! 🕵️', 'ok'); updateCoinChip(r.balance); schwarzmarkt(); }
};

window.bmAdminRefresh = async () => {
  const r = await api('/api/admin/blackmarket/refresh', { method: 'POST' });
  if (r) { toast('Rotation zurückgesetzt', 'ok'); schwarzmarkt(); }
};

// ════════════════════════════════════════════════════════════════
//  FEEDBACK & IDEEN
// ════════════════════════════════════════════════════════════════
async function feedback() {
  const data = await api('/api/feedback');
  if (!data) return;

  const STATUS_COLORS = { offen:'#6b7280', in_prüfung:'#fbbf24', umgesetzt:'#22c55e', abgelehnt:'#ef4444' };
  const STATUS_LABELS = { offen:'Offen', in_prüfung:'In Prüfung', umgesetzt:'Umgesetzt', abgelehnt:'Abgelehnt' };

  $('pageContent').innerHTML = `
    <div style="max-width:720px">
      <!-- Einreichen -->
      <div class="card" style="margin-bottom:1.3rem">
        <div class="card-head">
          <div class="card-head-icon" style="background:rgba(34,211,238,.15)"><i class="fas fa-lightbulb" style="color:#22d3ee"></i></div>
          <div><div class="card-title">Idee einreichen</div><div class="card-sub">Was können wir verbessern?</div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.6rem;margin-top:.5rem">
          <input id="fb-title" class="input" placeholder="Titel (max. 80 Zeichen)" maxlength="80">
          <textarea id="fb-desc" class="input" placeholder="Beschreibung (optional)" rows="3" style="resize:vertical"></textarea>
          <button class="btn btn-primary" onclick="fbSubmit()"><i class="fas fa-paper-plane"></i> Einreichen</button>
        </div>
      </div>

      <!-- Ideen-Liste -->
      <div id="fb-list">
        ${data.ideas.length === 0
          ? '<div class="empty"><i class="fas fa-lightbulb"></i><p>Noch keine Ideen – sei der Erste!</p></div>'
          : data.ideas.map(idea => `
            <div class="card" style="margin-bottom:.75rem;border-left:3px solid ${STATUS_COLORS[idea.status]||'var(--border)'}">
              <div style="display:flex;align-items:flex-start;gap:.9rem">
                <div style="display:flex;flex-direction:column;align-items:center;gap:.25rem;flex-shrink:0;min-width:44px">
                  <button onclick="fbVote(${idea.id})" style="background:${idea.my_vote?'rgba(168,85,247,.25)':'var(--surface2)'};border:1px solid ${idea.my_vote?'#a855f7':'var(--border)'};border-radius:8px;padding:.3rem .5rem;cursor:pointer;color:${idea.my_vote?'#a855f7':'var(--muted)'}">
                    <i class="fas fa-chevron-up" style="font-size:.8rem"></i>
                  </button>
                  <span style="font-size:.8rem;font-weight:800;color:${idea.my_vote?'#a855f7':'var(--text)'}">${idea.votes}</span>
                </div>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.25rem">
                    <span style="font-weight:700;font-size:.9rem">${esc(idea.title)}</span>
                    <span style="font-size:.6rem;font-weight:700;padding:.15rem .5rem;border-radius:999px;background:${STATUS_COLORS[idea.status]||'#6b7280'}22;color:${STATUS_COLORS[idea.status]||'var(--muted)'};border:1px solid ${STATUS_COLORS[idea.status]||'var(--border)'}">
                      ${STATUS_LABELS[idea.status]||idea.status}
                    </span>
                    ${isAdmin() ? `<select onchange="fbSetStatus(${idea.id},this.value)" style="font-size:.65rem;padding:.1rem .3rem;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);margin-left:auto">
                      ${Object.keys(STATUS_LABELS).map(s=>`<option value="${s}" ${idea.status===s?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}
                    </select>
                    <button onclick="fbDelete(${idea.id})" style="background:none;border:none;color:#ef4444;cursor:pointer;padding:.1rem"><i class="fas fa-trash" style="font-size:.7rem"></i></button>` : ''}
                  </div>
                  ${idea.description ? `<div style="font-size:.78rem;color:var(--muted);line-height:1.5">${esc(idea.description)}</div>` : ''}
                  <div style="font-size:.68rem;color:var(--muted);margin-top:.35rem">von <b>${esc(idea.username)}</b> · ${ago(idea.created_at)}</div>
                </div>
              </div>
            </div>`).join('')}
      </div>
    </div>`;
}

window.fbSubmit = async () => {
  const title = $('fb-title')?.value.trim();
  const description = $('fb-desc')?.value.trim();
  if (!title) { toast('Titel ist Pflicht', 'err'); return; }
  const r = await api('/api/feedback', { method: 'POST', body: { title, description } });
  if (r) { toast('Idee eingereicht!', 'ok'); feedback(); }
};

window.fbVote = async id => {
  const r = await api(`/api/feedback/${id}/vote`, { method: 'POST' });
  if (r !== null) feedback();
};

window.fbSetStatus = async (id, status) => {
  const r = await api(`/api/feedback/${id}/status`, { method: 'PATCH', body: { status } });
  if (r) feedback();
};

window.fbDelete = async id => {
  if (!confirm('Idee wirklich löschen?')) return;
  const r = await api(`/api/feedback/${id}`, { method: 'DELETE' });
  if (r) feedback();
};

// ════════════════════════════════════════════════════════════════
//  FRAGEN-EDITOR (Admin)
// ════════════════════════════════════════════════════════════════
async function frageneditor() {
  if (!isAdmin()) { toast('Kein Zugriff', 'err'); return; }
  const stats = await api('/api/admin/questions/stats');
  if (!stats) return;

  const catId = window._feActiveCat || stats[0]?.id;
  window._feActiveCat = catId;

  let questions = [];
  if (catId) {
    const q = await api(`/api/admin/questions?catId=${catId}`);
    if (q) questions = q;
  }

  $('pageContent').innerHTML = `
    <div style="max-width:900px">
      <!-- Stats-Chips -->
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.2rem">
        ${stats.map(c => `
          <button onclick="window._feActiveCat=${c.id};frageneditor()"
            style="padding:.35rem .85rem;border-radius:999px;font-size:.75rem;font-weight:700;border:1px solid ${catId===c.id?'var(--accent)':'var(--border)'};background:${catId===c.id?'var(--accent)':'var(--surface2)'};color:${catId===c.id?'#fff':'var(--text)'};cursor:pointer">
            ${esc(c.name)} <span style="opacity:.7">(${c.total})</span>
          </button>`).join('')}
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.9rem;flex-wrap:wrap;gap:.5rem">
        <div style="font-weight:700;font-size:.9rem">${questions.length} Fragen in dieser Kategorie</div>
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-ghost btn-sm" onclick="loadQuestionSuggestions()"><i class="fas fa-inbox"></i> Vorschläge</button>
          <button class="btn btn-primary btn-sm" onclick="feOpenModal(null,${catId})"><i class="fas fa-plus"></i> Neue Frage</button>
        </div>
      </div>

      ${questions.length === 0
        ? '<div class="empty"><i class="fas fa-edit"></i><p>Noch keine Fragen in dieser Kategorie</p></div>'
        : questions.map(q => `
          <div class="card" style="margin-bottom:.65rem;${q.is_seeded?'border-left:3px solid #6b7280':'border-left:3px solid var(--accent)'}">
            <div style="display:flex;align-items:flex-start;gap:.8rem">
              <div style="flex:1;min-width:0">
                <div style="font-size:.78rem;font-weight:600;margin-bottom:.3rem">${esc(q.question)}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.2rem .6rem;font-size:.7rem;color:var(--muted)">
                  <span ${q.correct_answer==='A'?'style="color:#22c55e;font-weight:700"':''}>A: ${esc(q.option_a)}</span>
                  <span ${q.correct_answer==='B'?'style="color:#22c55e;font-weight:700"':''}>B: ${esc(q.option_b)}</span>
                  <span ${q.correct_answer==='C'?'style="color:#22c55e;font-weight:700"':''}>C: ${esc(q.option_c)}</span>
                  <span ${q.correct_answer==='D'?'style="color:#22c55e;font-weight:700"':''}>D: ${esc(q.option_d)}</span>
                </div>
                ${q.is_ko ? '<div style="font-size:.6rem;font-weight:800;color:#ef4444;margin-top:.3rem">KO-FRAGE</div>' : ''}
                ${q.is_seeded ? '<div style="font-size:.6rem;color:var(--muted);margin-top:.2rem">System-Frage (schreibgeschützt)</div>' : ''}
              </div>
              ${!q.is_seeded ? `
                <div style="display:flex;gap:.4rem;flex-shrink:0">
                  <button class="btn btn-ghost btn-sm" onclick="feOpenModal(${q.id},${catId})"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-danger btn-sm" onclick="feDelete(${q.id})"><i class="fas fa-trash"></i></button>
                </div>` : ''}
            </div>
          </div>`).join('')}
    </div>`;
}

window.feOpenModal = (questionId, catId) => {
  const isEdit = questionId !== null;
  let existing = null;
  if (isEdit) {
    const cards = document.querySelectorAll('#pageContent .card');
    // We'll just open a blank form and let the user fill if we can't read from DOM easily
    // For edit, fetch existing data:
    api(`/api/admin/questions?catId=${catId}`).then(qs => {
      if (!qs) return;
      const q = qs.find(x => x.id === questionId);
      if (!q) return;
      $('fe-question').value = q.question;
      $('fe-a').value = q.option_a;
      $('fe-b').value = q.option_b;
      $('fe-c').value = q.option_c;
      $('fe-d').value = q.option_d;
      $('fe-correct').value = q.correct_answer;
      $('fe-ko').checked = !!q.is_ko;
    });
  }
  openModal(`
    <div class="modal-head">
      <div class="modal-title">${isEdit ? 'Frage bearbeiten' : 'Neue Frage'}</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="display:flex;flex-direction:column;gap:.65rem;padding:.4rem 0">
      <textarea id="fe-question" class="input" placeholder="Fragetext" rows="3" style="resize:vertical"></textarea>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
        <input id="fe-a" class="input" placeholder="Option A">
        <input id="fe-b" class="input" placeholder="Option B">
        <input id="fe-c" class="input" placeholder="Option C">
        <input id="fe-d" class="input" placeholder="Option D">
      </div>
      <div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:.5rem">
          <label style="font-size:.78rem;font-weight:600">Richtige Antwort:</label>
          <select id="fe-correct" class="input" style="width:auto">
            <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:.4rem">
          <input type="checkbox" id="fe-ko">
          <label for="fe-ko" style="font-size:.78rem;font-weight:600;cursor:pointer">KO-Frage</label>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="feSave(${questionId},${catId})">${isEdit ? 'Speichern' : 'Erstellen'}</button>
    </div>`);
};

window.feSave = async (questionId, catId) => {
  const body = {
    category_id: catId,
    question: $('fe-question')?.value.trim(),
    option_a: $('fe-a')?.value.trim(),
    option_b: $('fe-b')?.value.trim(),
    option_c: $('fe-c')?.value.trim(),
    option_d: $('fe-d')?.value.trim(),
    correct_answer: $('fe-correct')?.value,
    is_ko: $('fe-ko')?.checked ? 1 : 0,
  };
  if (!body.question || !body.option_a || !body.option_b || !body.option_c || !body.option_d) {
    toast('Alle Felder ausfüllen', 'err'); return;
  }
  const isEdit = questionId !== null;
  const r = await api(isEdit ? `/api/admin/questions/${questionId}` : '/api/admin/questions', {
    method: isEdit ? 'PUT' : 'POST', body,
  });
  if (r) { toast(isEdit ? 'Gespeichert!' : 'Frage erstellt!', 'ok'); closeModal(); frageneditor(); }
};

window.feDelete = async id => {
  if (!confirm('Frage wirklich löschen?')) return;
  const r = await api(`/api/admin/questions/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht', 'ok'); frageneditor(); }
};

// BATCH 10: Fragen-Vorschläge (Admin-View)
window.loadQuestionSuggestions = async () => {
  const rows = await api('/api/question-suggestions');
  if (!rows) return;
  const pending = rows.filter(r => r.status === 'pending');
  const done = rows.filter(r => r.status !== 'pending');
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-inbox" style="color:#818cf8;margin-right:.5rem"></i>Fragen-Vorschläge (${pending.length} offen)</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="max-height:500px;overflow-y:auto">
      ${pending.length === 0 ? '<div class="empty"><i class="fas fa-check"></i><p>Keine offenen Vorschläge</p></div>' :
        pending.map(q => `
        <div class="card" style="margin-bottom:.65rem;border-left:3px solid #818cf8">
          <div style="font-size:.72rem;color:var(--muted);margin-bottom:.3rem">
            von <b>${esc(q.username)}</b> · ${esc(q.cat_name)} · ${ago(q.created_at)}
          </div>
          <div style="font-size:.85rem;font-weight:600;margin-bottom:.4rem">${esc(q.question)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.2rem;font-size:.75rem;color:var(--muted);margin-bottom:.5rem">
            <span style="${q.correct==='A'?'color:#22c55e;font-weight:700':''}">A: ${esc(q.option_a)}</span>
            <span style="${q.correct==='B'?'color:#22c55e;font-weight:700':''}">B: ${esc(q.option_b)}</span>
            <span style="${q.correct==='C'?'color:#22c55e;font-weight:700':''}">C: ${esc(q.option_c)}</span>
            <span style="${q.correct==='D'?'color:#22c55e;font-weight:700':''}">D: ${esc(q.option_d)}</span>
          </div>
          <div style="display:flex;gap:.4rem">
            <button class="btn btn-primary btn-sm" onclick="decideSuggestion(${q.id},'approve')"><i class="fas fa-check"></i> Annehmen (+50 Coins)</button>
            <button class="btn btn-danger btn-sm" onclick="decideSuggestion(${q.id},'reject')"><i class="fas fa-times"></i> Ablehnen</button>
          </div>
        </div>`).join('')}
      ${done.length > 0 ? `<div style="font-size:.72rem;font-weight:700;color:var(--muted);margin:.75rem 0 .4rem;text-transform:uppercase;letter-spacing:.05em">Bereits bewertet (${done.length})</div>
        ${done.slice(0,5).map(q => `<div style="padding:.5rem .75rem;background:var(--surface2);border-radius:8px;margin-bottom:.3rem;font-size:.78rem">
          <span style="color:${q.status==='approved'?'#22c55e':'#ef4444'};font-weight:700">${q.status==='approved'?'✓':'✗'}</span>
          ${esc(q.question.slice(0,60))}… · <span style="color:var(--muted)">${esc(q.username)}</span>
        </div>`).join('')}` : ''}
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Schließen</button></div>`);
};

window.decideSuggestion = async (id, action) => {
  const endpoint = action === 'approve' ? `/api/question-suggestions/${id}/approve` : `/api/question-suggestions/${id}/reject`;
  const r = await api(endpoint, { method: 'POST', body: {} });
  if (r) {
    toast(action === 'approve' ? 'Angenommen & 50 Coins vergeben!' : 'Abgelehnt', 'ok');
    loadQuestionSuggestions();
  }
};

// BATCH 10: Frage vorschlagen Modal (für Bürger + Staff)
window.openQuestionSuggestModal = async () => {
  const cats = await api('/api/exam-categories');
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-lightbulb" style="color:#fbbf24;margin-right:.5rem"></i>Prüfungsfrage vorschlagen</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="display:flex;flex-direction:column;gap:.6rem;padding:.4rem 0">
      <div class="form-group">
        <label style="font-size:.78rem;font-weight:600">Kategorie</label>
        <select class="form-control" id="qs-cat">
          ${(cats||[]).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label style="font-size:.78rem;font-weight:600">Frage</label>
        <textarea class="form-control" id="qs-question" placeholder="Fragetext eingeben…" rows="3" style="resize:vertical"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
        <div class="form-group"><label style="font-size:.75rem">Option A</label><input class="form-control" id="qs-a" placeholder="Antwort A"></div>
        <div class="form-group"><label style="font-size:.75rem">Option B</label><input class="form-control" id="qs-b" placeholder="Antwort B"></div>
        <div class="form-group"><label style="font-size:.75rem">Option C</label><input class="form-control" id="qs-c" placeholder="Antwort C"></div>
        <div class="form-group"><label style="font-size:.75rem">Option D</label><input class="form-control" id="qs-d" placeholder="Antwort D"></div>
      </div>
      <div class="form-group">
        <label style="font-size:.78rem;font-weight:600">Korrekte Antwort</label>
        <select class="form-control" id="qs-correct">
          <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
        </select>
      </div>
      <div style="font-size:.75rem;color:var(--muted)"><i class="fas fa-coins" style="color:#fbbf24;margin-right:.3rem"></i>Bei Annahme: +50 ACLS-Coins</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="submitQuestionSuggestion()"><i class="fas fa-paper-plane"></i> Einreichen</button>
    </div>`);
};

window.submitQuestionSuggestion = async () => {
  const body = {
    category_id: $('qs-cat')?.value,
    question: $('qs-question')?.value.trim(),
    option_a: $('qs-a')?.value.trim(),
    option_b: $('qs-b')?.value.trim(),
    option_c: $('qs-c')?.value.trim(),
    option_d: $('qs-d')?.value.trim(),
    correct: $('qs-correct')?.value,
  };
  if (!body.question || !body.option_a || !body.option_b || !body.option_c || !body.option_d) { toast('Alle Felder ausfüllen', 'err'); return; }
  const r = await api('/api/question-suggestions', { method: 'POST', body });
  if (r) { toast('Vorschlag eingereicht! Danke!', 'ok'); closeModal(); }
};

// ════════════════════════════════════════════════════════════════
//  BESCHWERDE-KANBAN (Admin)
// ════════════════════════════════════════════════════════════════
// Beschwerde-Kanban wurde durch das einheitliche Ticket-System ersetzt
async function beschwerden() { navigate('tickets'); }


// ════════════════════════════════════════════════════════════════
//  COIN-WETTEN
// ════════════════════════════════════════════════════════════════
async function wetten() {
  const bets = await api('/api/bets/my');
  if (!bets) return;

  const myDid = currentUser?.discord_id || window._voterDiscordId;
  const incoming  = bets.filter(b => b.opponent_did === myDid && b.status === 'pending');
  const active    = bets.filter(b => (b.creator_did === myDid && ['pending','accepted'].includes(b.status))
                                  || (b.opponent_did === myDid && b.status === 'accepted'));
  const history   = bets.filter(b => ['resolved','declined','cancelled'].includes(b.status));

  function betCard(b, role) {
    const isCreator  = b.creator_did === myDid;
    const opponent   = isCreator ? b.opponent_name : b.creator_name;
    const statusMap  = { pending:'Offen', accepted:'Angenommen', resolved:'Abgeschlossen', declined:'Abgelehnt', cancelled:'Storniert' };
    const statusColor= { pending:'#fbbf24', accepted:'#60a5fa', resolved:'#22c55e', declined:'#ef4444', cancelled:'#6b7280' };
    const st = b.status;
    const wonBadge = st === 'resolved' ? (b.winner_did === myDid
      ? `<span style="font-size:.67rem;padding:.15rem .45rem;background:rgba(34,197,94,.15);border:1px solid #22c55e;color:#22c55e;border-radius:999px;font-weight:700">Gewonnen +${(b.amount*2).toLocaleString('de-DE')} 🪙</span>`
      : `<span style="font-size:.67rem;padding:.15rem .45rem;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.4);color:#ef4444;border-radius:999px;font-weight:700">Verloren −${b.amount.toLocaleString('de-DE')} 🪙</span>`)
      : '';

    return `<div class="card" style="padding:.85rem 1rem;margin-bottom:.5rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;flex-wrap:wrap">
        <span style="font-size:.67rem;font-weight:700;color:var(--muted)">#${b.id}</span>
        <span style="font-size:.72rem;font-weight:800;color:${statusColor[st]||'var(--muted)'}">${statusMap[st]||st}</span>
        ${wonBadge}
        <span style="margin-left:auto;font-size:.72rem;color:var(--muted)">${ago(b.created_at)}</span>
      </div>
      <div style="font-size:.84rem;font-weight:700;margin-bottom:.3rem">${esc(b.description)}</div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:.5rem">
        ${isCreator?'Du':'<b>'+esc(b.creator_name)+'</b>'} vs. ${isCreator?'<b>'+esc(opponent)+'</b>':'Du'}
        · <span style="color:#fbbf24;font-weight:700">${b.amount.toLocaleString('de-DE')} 🪙</span> je Seite
        ${b.admin_note ? `· <i style="color:var(--muted)">„${esc(b.admin_note)}"</i>` : ''}
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap">
        ${st === 'pending' && b.opponent_did === myDid ? `
          <button class="btn btn-primary btn-sm" onclick="betAccept(${b.id})"><i class="fas fa-check"></i> Annehmen</button>
          <button class="btn btn-ghost btn-sm" onclick="betDecline(${b.id})" style="color:#ef4444"><i class="fas fa-times"></i> Ablehnen</button>
        ` : ''}
        ${st === 'pending' && b.creator_did === myDid ? `
          <button class="btn btn-ghost btn-sm" onclick="betCancel(${b.id})" style="color:#ef4444"><i class="fas fa-ban"></i> Stornieren</button>
        ` : ''}
      </div>
    </div>`;
  }

  $('pageContent').innerHTML = `
    <!-- Neue Wette -->
    <div class="card" style="margin-bottom:1rem">
      <div class="card-head" style="margin-bottom:.85rem">
        <div class="card-head-icon" style="background:rgba(245,158,11,.15)"><i class="fas fa-handshake" style="color:#f59e0b"></i></div>
        <div><div class="card-title">Neue Wette</div><div class="card-sub">Setze gegen einen anderen Spieler</div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:.6rem">
        <div style="position:relative">
          <input class="input" id="betOpponentInput" placeholder="Gegner suchen (Name eingeben)…" autocomplete="off"
            oninput="betSearchOpponent()" onblur="setTimeout(()=>{const r=$('betOpponentResults');if(r)r.style.display='none'},180)">
          <div id="betOpponentResults" style="position:absolute;z-index:30;left:0;right:0;top:100%;background:var(--card);border:1px solid var(--border);border-radius:var(--r);margin-top:.15rem;max-height:200px;overflow:auto;display:none"></div>
        </div>
        <div id="betOpponentTag" style="display:none;padding:.5rem .75rem;background:var(--surface2);border-radius:var(--r);font-size:.82rem;display:flex;align-items:center;gap:.5rem">
          <i class="fas fa-user-check" style="color:#f59e0b"></i>
          <span id="betOpponentName" style="font-weight:700"></span>
          <button onclick="betClearOpponent()" style="margin-left:auto;background:none;border:none;color:var(--muted);cursor:pointer"><i class="fas fa-times"></i></button>
        </div>
        <div>
          <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem">Einsatz</div>
          <div style="display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.4rem">
            ${[100,250,500,1000,2500,5000].map(v=>`<button class="chip" onclick="betSetAmount(${v})">${v.toLocaleString('de-DE')}</button>`).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <input class="input" id="betAmountInput" type="number" min="100" max="10000" step="50" value="100" style="width:130px"
              oninput="document.querySelectorAll('#pageContent .chip').forEach(c=>c.classList.remove('active'))">
            <span style="font-size:.8rem;color:var(--muted)">🪙 je Seite · Gewinn: <b id="betWinDisplay" style="color:#fbbf24">200 🪙</b></span>
          </div>
        </div>
        <div>
          <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem">Bedingung (was wird gewettet?)</div>
          <textarea class="input" id="betDescription" rows="2" maxlength="200" placeholder="z.B. „Wer als nächstes im Dienst ist gewinnt" · max. 200 Zeichen" style="resize:vertical"></textarea>
        </div>
        <button class="btn btn-primary" onclick="betCreate()"><i class="fas fa-handshake"></i> Wette abschicken</button>
      </div>
    </div>

    <!-- Eingehende Wetten -->
    ${incoming.length ? `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-head" style="margin-bottom:.6rem">
        <div class="card-head-icon" style="background:rgba(251,191,36,.15)"><i class="fas fa-inbox" style="color:#fbbf24"></i></div>
        <div><div class="card-title">Eingehende Wetten</div><div class="card-sub">${incoming.length} offene Anfragen</div></div>
      </div>
      ${incoming.map(b=>betCard(b,'opponent')).join('')}
    </div>` : ''}

    <!-- Aktive Wetten -->
    <div class="card" style="margin-bottom:1rem">
      <div class="card-head" style="margin-bottom:.6rem">
        <div class="card-head-icon" style="background:rgba(96,165,250,.15)"><i class="fas fa-fire" style="color:#60a5fa"></i></div>
        <div><div class="card-title">Aktive Wetten</div><div class="card-sub">${active.length} laufend</div></div>
      </div>
      ${active.length ? active.map(b=>betCard(b,'active')).join('') : '<div class="empty" style="padding:.5rem"><p>Keine aktiven Wetten</p></div>'}
    </div>

    <!-- Historie -->
    <div class="card">
      <div class="card-head" style="margin-bottom:.6rem">
        <div class="card-head-icon" style="background:rgba(107,114,128,.15)"><i class="fas fa-history" style="color:#6b7280"></i></div>
        <div><div class="card-title">Verlauf</div><div class="card-sub">${history.length} abgeschlossen</div></div>
      </div>
      ${history.length ? history.slice(0,20).map(b=>betCard(b,'history')).join('') : '<div class="empty" style="padding:.5rem"><p>Noch keine abgeschlossenen Wetten</p></div>'}
    </div>`;

  // Chip-Styling init
  $('betAmountInput')?.addEventListener('input', () => {
    const v = +$('betAmountInput').value || 0;
    const winEl = $('betWinDisplay');
    if (winEl) winEl.textContent = (v * 2).toLocaleString('de-DE') + ' 🪙';
  });
}

window._betOpponentDid  = null;
window._betOpponentName = null;

window.betSetAmount = v => {
  const inp = $('betAmountInput');
  if (inp) { inp.value = v; inp.dispatchEvent(new Event('input')); }
  document.querySelectorAll('#pageContent .chip').forEach(c => {
    const val = +c.textContent.replace(/\./g,'');
    c.classList.toggle('active', val === v);
  });
  const winEl = $('betWinDisplay');
  if (winEl) winEl.textContent = (v * 2).toLocaleString('de-DE') + ' 🪙';
};

window.betSearchOpponent = async () => {
  const q = $('betOpponentInput')?.value.trim();
  const res_el = $('betOpponentResults');
  if (!q || q.length < 1) { if (res_el) res_el.style.display = 'none'; return; }
  const rows = await api(`/api/bets/search?q=${encodeURIComponent(q)}`);
  if (!rows || !res_el) return;
  if (!rows.length) { res_el.innerHTML = '<div style="padding:.5rem .75rem;font-size:.8rem;color:var(--muted)">Niemanden gefunden</div>'; res_el.style.display = 'block'; return; }
  res_el.innerHTML = rows.map(r => `
    <div style="padding:.45rem .75rem;cursor:pointer;font-size:.82rem;display:flex;align-items:center;gap:.5rem;border-bottom:1px solid var(--border)"
      onmousedown="betSelectOpponent('${r.discord_id}','${esc(r.username).replace(/'/g,"\\'")}')"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <i class="fas fa-user" style="color:var(--muted);font-size:.75rem"></i>
      <span style="font-weight:600">${esc(r.username)}</span>
      <span style="margin-left:auto;font-size:.7rem;color:#fbbf24">${(r.balance||0).toLocaleString('de-DE')} 🪙</span>
    </div>`).join('');
  res_el.style.display = 'block';
};

window.betSelectOpponent = (did, name) => {
  window._betOpponentDid  = did;
  window._betOpponentName = name;
  const inp = $('betOpponentInput');
  const tag = $('betOpponentTag');
  const nm  = $('betOpponentName');
  const res = $('betOpponentResults');
  if (inp) inp.style.display = 'none';
  if (tag) tag.style.display = 'flex';
  if (nm)  nm.textContent = name;
  if (res) res.style.display = 'none';
};

window.betClearOpponent = () => {
  window._betOpponentDid  = null;
  window._betOpponentName = null;
  const inp = $('betOpponentInput');
  const tag = $('betOpponentTag');
  if (inp) { inp.style.display = ''; inp.value = ''; }
  if (tag) tag.style.display = 'none';
};

window.betCreate = async () => {
  const opponent_did = window._betOpponentDid;
  const amount       = Math.round(+$('betAmountInput')?.value || 0);
  const description  = $('betDescription')?.value.trim();
  if (!opponent_did) { toast('Gegner auswählen', 'err'); return; }
  const r = await api('/api/bets', { method: 'POST', body: { opponent_did, amount, description } });
  if (r) { toast('Wette abgeschickt!', 'ok'); betClearOpponent(); wetten(); }
};

window.betAccept = async id => {
  if (!confirm('Wette annehmen? Dein Einsatz wird sofort abgezogen.')) return;
  const r = await api(`/api/bets/${id}/accept`, { method: 'POST' });
  if (r) { toast('Wette angenommen!', 'ok'); wetten(); }
};

window.betDecline = async id => {
  const r = await api(`/api/bets/${id}/decline`, { method: 'POST' });
  if (r) { toast('Wette abgelehnt.'); wetten(); }
};

window.betCancel = async id => {
  if (!confirm('Wette stornieren? Dein Einsatz wird zurückerstattet.')) return;
  const r = await api(`/api/bets/${id}/cancel`, { method: 'POST' });
  if (r) { toast('Wette storniert – Coins zurück.', 'ok'); wetten(); }
};

// ════════════════════════════════════════════════════════════════
//  SUPPORT-TICKETS (H4)
// ════════════════════════════════════════════════════════════════
async function tickets() {
  const data = await api('/api/tickets');
  if (!data) return;
  const statusBadge = s => s === 'open' ? '<span class="badge badge-r">Offen</span>' : s === 'in_progress' ? '<span class="badge badge-o" style="background:rgba(251,191,36,.15);color:#fbbf24;border-color:rgba(251,191,36,.3)">In Bearbeitung</span>' : '<span class="badge badge-g">Geschlossen</span>';
  const catColor = { 'Werkstatt-Auftrag':'#f97316', 'Abschleppdienst':'#fbbf24', Bug:'#ef4444', Frage:'#38bdf8', Beschwerde:'#f97316', 'Feature-Wunsch':'#a855f7', Sonstiges:'#9ca3af' };
  $('pageContent').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:1rem">
      <button class="btn btn-primary" onclick="openTicketForm()"><i class="fas fa-plus"></i> Neues Ticket</button>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-head-icon" style="background:rgba(251,113,133,.15)"><i class="fas fa-ticket-alt" style="color:#fb7185"></i></div><div><div class="card-title">Meine Tickets</div><div class="card-sub">${data.length} Einträge</div></div></div>
      ${data.length ? data.map(t => `
        <div style="padding:.75rem 0;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:flex-start;gap:.75rem" onclick="openTicket(${t.id})">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.2rem">
              <span style="font-weight:700;font-size:.88rem">${esc(t.title)}</span>
              ${statusBadge(t.status)}
              <span style="font-size:.7rem;padding:.15rem .5rem;border-radius:99px;background:rgba(0,0,0,.15);color:${catColor[t.category]||'#9ca3af'}">${esc(t.category)}</span>
            </div>
            <div style="font-size:.77rem;color:var(--muted)">${ago(t.created_at)} · ${t.replies || 0} Antwort(en)${t.assigned_name ? ' · Bearbeiter: ' + esc(t.assigned_name) : ''}</div>
          </div>
          <i class="fas fa-chevron-right" style="color:var(--muted);margin-top:.25rem;flex-shrink:0"></i>
        </div>
      `).join('') : '<div class="empty"><i class="fas fa-ticket-alt"></i><p>Noch keine Tickets</p></div>'}
    </div>`;
}

window.openTicketForm = () => {
  openModal(`
    <div class="modal-head"><div class="modal-icon" style="background:rgba(251,113,133,.15)"><i class="fas fa-ticket-alt" style="color:#fb7185"></i></div><div><div class="modal-title">Neues Ticket</div></div><button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Kategorie</label>
        <select id="tCat" class="form-control">
          ${['Werkstatt-Auftrag','Abschleppdienst','Bug','Frage','Beschwerde','Feature-Wunsch','Sonstiges'].map(c => `<option>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Titel</label><input id="tTitle" class="form-control" maxlength="200" placeholder="Kurze Zusammenfassung"></div>
      <div class="form-group"><label class="form-label">Beschreibung</label><textarea id="tBody" class="form-control" rows="5" maxlength="2000" placeholder="Beschreibe das Problem oder deine Frage möglichst genau…"></textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button><button class="btn btn-primary" onclick="submitTicket()">Absenden</button></div>`);
};

window.submitTicket = async () => {
  const r = await api('/api/tickets', { method: 'POST', body: { category: $('tCat').value, title: $('tTitle').value, body: $('tBody').value } });
  if (r) { closeModal(); toast('Ticket erstellt!', 'ok'); tickets(); }
};

window.openTicket = async id => {
  const t = await api(`/api/tickets/${id}`);
  if (!t) return;
  const statusOptions = ['open','in_progress','closed'];
  const statusLabel = { open:'Offen', in_progress:'In Bearbeitung', closed:'Geschlossen' };
  const isStaff = isAusbilder();
  openModal(`
    <div class="modal-head"><div class="modal-icon" style="background:rgba(251,113,133,.15)"><i class="fas fa-ticket-alt" style="color:#fb7185"></i></div>
      <div><div class="modal-title">${esc(t.title)}</div><div class="modal-sub">${esc(t.category)} · #${t.id}</div></div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body">
      ${isStaff ? `<div style="display:flex;gap:.5rem;margin-bottom:.75rem;align-items:center;flex-wrap:wrap">
        <span style="font-size:.8rem;color:var(--muted)">Status:</span>
        ${statusOptions.map(s => `<button class="btn btn-sm ${t.status===s?'btn-primary':'btn-ghost'}" onclick="setTicketStatus(${id},'${s}')">${statusLabel[s]}</button>`).join('')}
      </div>` : ''}
      <div style="background:var(--surface2);border-radius:8px;padding:.75rem;margin-bottom:1rem;font-size:.88rem">${esc(t.body)}</div>
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:1rem">Erstellt ${ago(t.created_at)} von ${esc(t.creator_name)}</div>
      ${t.replies?.map(r => `
        <div style="margin-bottom:.75rem;padding:.6rem .75rem;border-radius:8px;background:${r.is_staff?'rgba(34,197,94,.06)':'var(--surface2)'};border:1px solid ${r.is_staff?'rgba(34,197,94,.2)':'var(--border)'}">
          <div style="font-size:.73rem;color:var(--muted);margin-bottom:.25rem">${esc(r.author_name)}${r.is_staff?' <span style="color:#22c55e;font-weight:700">[Staff]</span>':''} · ${ago(r.created_at)}</div>
          <div style="font-size:.85rem">${esc(r.body)}</div>
        </div>`).join('') || ''}
      <textarea id="ticketReplyBox" class="form-control" rows="3" placeholder="Antwort schreiben…" style="margin-top:.5rem"></textarea>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Schließen</button><button class="btn btn-primary" onclick="replyTicket(${id})"><i class="fas fa-paper-plane"></i> Antworten</button></div>`);
};

window.setTicketStatus = async (id, status) => {
  const r = await api(`/api/tickets/${id}`, { method: 'PUT', body: { status } });
  if (r) { toast('Status aktualisiert', 'ok'); openTicket(id); }
};
window.replyTicket = async id => {
  const body = $('ticketReplyBox')?.value;
  if (!body?.trim()) { toast('Antwort leer', 'err'); return; }
  const r = await api(`/api/tickets/${id}/reply`, { method: 'POST', body: { body } });
  if (r) { toast('Antwort gesendet!', 'ok'); openTicket(id); }
};

// ════════════════════════════════════════════════════════════════
//  STATISTIK-TRENDS (H9)
// ════════════════════════════════════════════════════════════════
async function statistiken() {
  const d = await api('/api/stats/trends');
  if (!d) return;
  const fmt_wk = wk => { const p = (wk||'').split('-'); return p.length>=3?`${p[2]}.${p[1]}`:wk; };
  const labels = [...new Set([...d.exams.map(r=>r.wk),...d.ic.map(r=>r.wk),...d.coins.map(r=>r.wk)])].sort();
  $('pageContent').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card"><div class="card-head"><div class="card-head-icon orange"><i class="fas fa-graduation-cap"></i></div><div><div class="card-title">Prüfungen</div><div class="card-sub">pro Woche (12 Wochen)</div></div></div><canvas id="chartExams" height="160"></canvas></div>
      <div class="card"><div class="card-head"><div class="card-head-icon" style="background:rgba(34,197,94,.15)"><i class="fas fa-clock" style="color:#22c55e"></i></div><div><div class="card-title">IC-Zeit</div><div class="card-sub">Stunden pro Woche</div></div></div><canvas id="chartIc" height="160"></canvas></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card"><div class="card-head"><div class="card-head-icon" style="background:rgba(251,191,36,.15)"><i class="fas fa-coins" style="color:#fbbf24"></i></div><div><div class="card-title">Coin-Umsatz</div><div class="card-sub">Verdient vs. Ausgegeben</div></div></div><canvas id="chartCoins" height="160"></canvas></div>
      <div class="card"><div class="card-head"><div class="card-head-icon" style="background:rgba(168,85,247,.15)"><i class="fas fa-users" style="color:#a855f7"></i></div><div><div class="card-title">Top Prüfer</div><div class="card-sub">letzte 4 Wochen</div></div></div>
        ${d.topExaminers.map((e,i) => `<div style="display:flex;align-items:center;gap:.75rem;padding:.5rem 0;border-bottom:1px solid var(--border)"><div class="rank-badge${i<3?['',' r2',' r3'][i]:''}">${i+1}</div><div style="flex:1;font-weight:600;font-size:.85rem">${esc(e.examiner_name)}</div><span style="font-size:.8rem;color:var(--orange);font-weight:700">${e.c} Prüfungen</span></div>`).join('')||'<div class="empty"><p>Keine Daten</p></div>'}
      </div>
    </div>`;
  try { await loadLib('chart'); } catch { toast('Diagramm-Modul konnte nicht geladen werden', 'err'); return; }
  requestAnimationFrame(() => {
    if (!window.Chart) return;
    const chartOpts = (labels, datasets, y_label) => ({
      type:'line', data:{ labels: labels.map(fmt_wk), datasets },
      options:{ responsive:true, plugins:{ legend:{ labels:{ color:'#9ca3af', font:{ size:11 } } } }, scales:{ x:{ ticks:{ color:'#6b7280', font:{size:10} }, grid:{color:'rgba(255,255,255,.05)' }}, y:{ ticks:{ color:'#6b7280', font:{size:10} }, grid:{color:'rgba(255,255,255,.05)' }, title:{ display:!!y_label, text:y_label||'', color:'#9ca3af' } } } }
    });
    const getVal = (arr, wk, field) => arr.find(r=>r.wk===wk)?.[field] ?? 0;
    new Chart($('chartExams'), chartOpts(labels, [
      { label:'Gesamt', data: labels.map(wk=>getVal(d.exams,wk,'total')), borderColor:'#f97316', backgroundColor:'rgba(249,115,22,.1)', tension:.3, fill:true },
      { label:'Bestanden', data: labels.map(wk=>getVal(d.exams,wk,'passed')), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.08)', tension:.3, fill:true },
    ]));
    new Chart($('chartIc'), chartOpts(labels, [
      { label:'IC-Stunden', data: labels.map(wk=>getVal(d.ic,wk,'hours')), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.1)', tension:.3, fill:true },
    ], 'Stunden'));
    new Chart($('chartCoins'), chartOpts(labels, [
      { label:'Verdient', data: labels.map(wk=>getVal(d.coins,wk,'earned')), borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,.1)', tension:.3, fill:true },
      { label:'Ausgegeben', data: labels.map(wk=>getVal(d.coins,wk,'spent')), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.08)', tension:.3, fill:true },
    ], 'Coins'));
  });
}

// ════════════════════════════════════════════════════════════════
//  MITARBEITER-VORSTELLUNG
// ════════════════════════════════════════════════════════════════
async function team_vorstellung() {
  const data = await api('/api/team-profiles');
  if (!data) return;
  const roleLabel = { admin:'Admin', ausbilder:'Ausbilder', member:'Mitarbeiter' };
  const roleColor = { admin:'#ef4444', ausbilder:'#f97316', member:'#22c55e' };
  const isMine = u => currentUser && u.discord_id === currentUser.discord_id;
  $('pageContent').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">
      ${data.map(u => {
        const avUrl = u.avatar_custom || (u.avatar && u.discord_id ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=128` : null);
        return `<div class="card" style="text-align:center;padding:1.5rem 1rem;cursor:${isMine(u)?'default':'pointer'};transition:transform .12s,box-shadow .12s" ${!isMine(u)?`onclick="openSteckbrief(${u.id})" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,.25)'" onmouseout="this.style.transform='';this.style.boxShadow=''"`:''}>
          <div style="width:80px;height:80px;border-radius:50%;margin:0 auto .75rem;overflow:hidden;border:3px solid ${roleColor[u.role]||'var(--orange)'};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;background:var(--surface2)">
            ${avUrl ? `<img src="${avUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : (u.username||'?')[0].toUpperCase()}
          </div>
          <div style="font-weight:800;font-size:1rem">${esc(u.username)}</div>
          <div style="font-size:.72rem;margin:.2rem 0 .5rem;color:${roleColor[u.role]||'var(--orange)'};font-weight:700;text-transform:uppercase;letter-spacing:.05em">${roleLabel[u.role]||''}${u.rank && u.rank !== 'Mitarbeiter' ? ' · ' + esc(u.rank) : ''}</div>
          ${u.specialty ? `<div style="font-size:.78rem;color:var(--muted);margin-bottom:.3rem"><i class="fas fa-tools" style="margin-right:.3rem;color:var(--orange)"></i>${esc(u.specialty)}</div>` : ''}
          ${u.bio ? `<div style="font-size:.8rem;color:var(--muted);line-height:1.5;margin-bottom:.4rem">${esc(u.bio)}</div>` : '<div style="font-size:.78rem;color:var(--surface2);margin-bottom:.4rem">Noch kein Profil ausgefüllt</div>'}
          ${u.fun_fact ? `<div style="font-size:.75rem;padding:.4rem .7rem;background:var(--surface2);border-radius:8px;color:var(--muted);margin-top:.3rem"><i class="fas fa-star" style="color:#fbbf24;margin-right:.3rem"></i>${esc(u.fun_fact)}</div>` : ''}
          ${isMine(u)
            ? `<button class="btn btn-ghost btn-sm" style="margin-top:.75rem;width:100%" onclick="editMyProfile()"><i class="fas fa-edit"></i> Profil bearbeiten</button>`
            : `<div style="margin-top:.75rem;font-size:.72rem;color:var(--muted)"><i class="fas fa-user-circle" style="margin-right:.3rem"></i>Klicken für Steckbrief</div>`}
        </div>`;
      }).join('')}
    </div>`;
}

window.editMyProfile = async () => {
  const data = await api('/api/team-profiles');
  const me = data?.find(u => u.discord_id === currentUser?.discord_id) || {};
  openModal(`
    <div class="modal-head"><div class="modal-icon orange"><i class="fas fa-id-badge"></i></div><div><div class="modal-title">Profil bearbeiten</div></div><button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Über mich (Bio)</label><textarea id="pBio" class="form-control" rows="3" maxlength="500">${esc(me.bio||'')}</textarea></div>
      <div class="form-group"><label class="form-label">Spezialgebiet</label><input id="pSpec" class="form-control" maxlength="200" value="${esc(me.specialty||'')}"></div>
      <div class="form-group"><label class="form-label">Fun Fact</label><input id="pFun" class="form-control" maxlength="300" value="${esc(me.fun_fact||'')}"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button><button class="btn btn-primary" onclick="saveProfile()">Speichern</button></div>`);
};
window.saveProfile = async () => {
  const r = await api('/api/team-profiles/me', { method: 'PUT', body: { bio: $('pBio').value, specialty: $('pSpec').value, fun_fact: $('pFun').value } });
  if (r) { closeModal(); toast('Profil gespeichert!', 'ok'); team_vorstellung(); }
};

// ════════════════════════════════════════════════════════════════
//  GLOBALES LEVEL-SYSTEM
// ════════════════════════════════════════════════════════════════
async function level() {
  const [me, board] = await Promise.all([api('/api/levels/me'), api('/api/levels')]);
  if (!me) return;
  const prestigeStars = n => n > 0 ? `<span style="color:#fbbf24;font-weight:700">✦`.repeat(Math.min(n,5)) + `</span>` : '';
  $('pageContent').innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-head"><div class="card-head-icon" style="background:rgba(251,191,36,.15)"><i class="fas fa-star" style="color:#fbbf24"></i></div><div><div class="card-title">Mein Level</div><div class="card-sub">Prestige: ${me.prestige || 0}</div></div></div>
      <div style="display:flex;align-items:center;gap:1.5rem;padding:.75rem 0">
        <div style="text-align:center;min-width:70px">
          <div style="font-size:2.5rem;font-weight:800;color:var(--orange);line-height:1">${me.level || 1}</div>
          <div style="font-size:.7rem;color:var(--muted);font-weight:600;text-transform:uppercase">Level</div>
          ${prestigeStars(me.prestige || 0)}
        </div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted);margin-bottom:.3rem">
            <span>${me.total_xp || 0} XP</span><span>Nächstes Level: ${me.xp_next || '–'} XP</span>
          </div>
          <div style="height:12px;background:var(--input);border-radius:8px;overflow:hidden">
            <div style="height:100%;width:${me.xp_pct||0}%;background:linear-gradient(90deg,#f97316,#fbbf24);border-radius:8px;transition:width .5s"></div>
          </div>
          <div style="font-size:.73rem;color:var(--muted);margin-top:.25rem">${me.xp_pct||0}% zum nächsten Level · XP durch: Tagesbonus (+25), Prüfungen (+50), Wheel</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-head-icon orange"><i class="fas fa-trophy"></i></div><div><div class="card-title">XP-Rangliste</div><div class="card-sub">Top 50 aller Zeiten</div></div></div>
      ${(board||[]).map((u,i) => `
        <div class="lb-item" style="${currentUser?.discord_id===u.discord_id?'background:rgba(249,115,22,.06);border-radius:8px;':''}">
          ${i<3?`<div class="rank-badge${i===0?'':i===1?' r2':' r3'}">${i+1}</div>`:` <div style="width:28px;text-align:center;font-size:.8rem;color:var(--muted);font-weight:700">${i+1}</div>`}
          <div style="flex:1;min-width:0"><div class="lb-name">${esc(u.username)}${u.prestige>0?` ${prestigeStars(u.prestige)}`:''}</div></div>
          <div style="text-align:right">
            <div style="font-size:.88rem;font-weight:700;color:var(--orange)">Lv. ${u.level}</div>
            <div style="font-size:.7rem;color:var(--muted)">${u.total_xp} XP${u.prestige>0?` · P${u.prestige}`:''}</div>
          </div>
        </div>`).join('')||'<div class="empty"><i class="fas fa-star"></i><p>Noch keine Einträge</p></div>'}
    </div>`;
}

// ════════════════════════════════════════════════════════════════
//  DAILY BONUS WHEEL
// ════════════════════════════════════════════════════════════════
let _wheelSpinning = false;

async function wheel() {
  const d = await api('/api/wheel/status');
  if (!d) return;
  const prizes = d.prizes || [];
  const colors = prizes.map(p => p.color);
  const N = prizes.length;
  const arc = (Math.PI * 2) / N;
  $('pageContent').innerHTML = `
    <div style="max-width:480px;margin:0 auto">
      <div class="card" style="text-align:center;padding:1.5rem">
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:.5rem"><i class="fas fa-dharmachakra" style="color:#c084fc;margin-right:.5rem"></i>Daily Bonus Wheel</div>
        <div style="font-size:.83rem;color:var(--muted);margin-bottom:1.25rem">Täglich einmal drehen – Coins & XP gewinnen!</div>
        <div style="position:relative;display:inline-block">
          <canvas id="wheelCanvas" width="300" height="300" style="border-radius:50%;box-shadow:0 0 32px rgba(192,132,252,.3)"></canvas>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:var(--bg);border:3px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:.8rem;pointer-events:none;z-index:2"><i class="fas fa-star" style="color:#fbbf24"></i></div>
          <div style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);color:#c084fc;font-size:1.6rem;pointer-events:none">▼</div>
        </div>
        <div style="margin-top:1rem">
          ${d.can_spin
            ? `<button id="wheelBtn" class="btn btn-primary" style="background:linear-gradient(135deg,#a855f7,#c084fc);border:none;font-size:1rem;padding:.7rem 2rem" onclick="spinWheel()"><i class="fas fa-sync-alt"></i> Jetzt drehen!</button>`
            : `<div style="padding:.75rem;background:var(--surface2);border-radius:8px;color:var(--muted);font-size:.85rem"><i class="fas fa-check-circle" style="color:#22c55e;margin-right:.4rem"></i>Heute bereits gedreht – morgen wieder!</div>`}
          <div style="font-size:.73rem;color:var(--muted);margin-top:.5rem">Gesamt gedreht: ${d.total_spins} mal</div>
        </div>
      </div>
    </div>`;
  // Rad zeichnen
  const canvas = $('wheelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let rotation = 0;
  function drawWheel(rot) {
    ctx.clearRect(0, 0, 300, 300);
    for (let i = 0; i < N; i++) {
      const start = rot + i * arc - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(150, 150);
      ctx.arc(150, 150, 148, start, start + arc);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.save();
      ctx.translate(150, 150);
      ctx.rotate(start + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 3;
      ctx.fillText(prizes[i].label, 140, 4);
      ctx.restore();
    }
  }
  drawWheel(0);
  window._wheelCtx = ctx;
  window._wheelDraw = drawWheel;
  window._wheelN = N;
  window._wheelArc = arc;
}

window.spinWheel = async () => {
  if (_wheelSpinning) return;
  _wheelSpinning = true;
  const btn = $('wheelBtn');
  if (btn) btn.disabled = true;
  const r = await api('/api/wheel/spin', { method: 'POST' });
  if (!r) { _wheelSpinning = false; if (btn) btn.disabled = false; return; }
  const targetIdx = r.prize_idx;
  const N = window._wheelN || 8;
  const arc = window._wheelArc || (Math.PI * 2 / N);
  // Drehe so, dass targetIdx oben (unter dem Pfeil) landet
  const targetAngle = -(targetIdx * arc + arc / 2);
  const totalRotation = Math.PI * 2 * 5 + targetAngle; // 5 Umdrehungen + Ziel
  const startTime = performance.now();
  const duration = 4000;
  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 4);
    const currentRot = totalRotation * ease;
    window._wheelDraw?.(currentRot);
    if (t < 1) { requestAnimationFrame(animate); }
    else {
      _wheelSpinning = false;
      const prize = r.prize;
      openModal(`
        <div style="text-align:center;padding:2rem 1rem">
          <div style="font-size:3rem;margin-bottom:.5rem">🎉</div>
          <div style="font-size:1.4rem;font-weight:800;color:${prize.color||'var(--orange)'}">${esc(prize.label)}</div>
          <div style="font-size:.85rem;color:var(--muted);margin-top:.5rem">
            ${(r.coins||prize.coins)>0?`+${r.coins||prize.coins} Coins`:''} ${prize.xp>0?`+${prize.xp} XP`:''}
          </div>
          ${r.friend_bonus?`<div style="margin-top:.4rem;font-size:.78rem;color:#22c55e"><i class="fas fa-user-friends"></i> +10% Freundes-Bonus aktiv!</div>`:''}
          <button class="btn btn-primary" style="margin-top:1.25rem" onclick="closeModal();wheel()">Super!</button>
        </div>`);
    }
  }
  requestAnimationFrame(animate);
};

// ════════════════════════════════════════════════════════════════
//  MILESTONE-SYSTEM
// ════════════════════════════════════════════════════════════════
async function milestones() {
  const data = await api('/api/milestones');
  if (!data) return;
  const done = data.filter(m => m.completed);
  const pending = data.filter(m => !m.completed);
  $('pageContent').innerHTML = `
    <div style="display:flex;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
      <div class="stat-card"><div class="stat-val">${done.length}</div><div class="stat-lab">Abgeschlossen</div></div>
      <div class="stat-card"><div class="stat-val">${pending.length}</div><div class="stat-lab">Offen</div></div>
    </div>
    ${pending.length ? `<div class="card" style="margin-bottom:1rem">
      <div class="card-head"><div class="card-head-icon orange"><i class="fas fa-flag"></i></div><div><div class="card-title">Offene Meilensteine</div></div></div>
      ${pending.map(m => {
        const pct = Math.min(100, Math.round(m.progress / m.goal * 100));
        return `<div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 0;border-bottom:1px solid var(--border)">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${m.icon}" style="color:var(--orange)"></i></div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.85rem">${esc(m.title)}</div>
            <div style="height:5px;background:var(--input);border-radius:3px;overflow:hidden;margin:.2rem 0;max-width:200px">
              <div style="height:100%;width:${pct}%;background:var(--orange);border-radius:3px;transition:width .4s"></div>
            </div>
            <div style="font-size:.7rem;color:var(--muted)">${m.progress}/${m.goal} · +${m.reward} Coins</div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}
    ${done.length ? `<div class="card">
      <div class="card-head"><div class="card-head-icon" style="background:rgba(34,197,94,.15)"><i class="fas fa-check-circle" style="color:#22c55e"></i></div><div><div class="card-title">Abgeschlossen</div></div></div>
      ${done.map(m => `<div style="display:flex;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--border)">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(34,197,94,.12);border:2px solid rgba(34,197,94,.3);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${m.icon}" style="color:#22c55e"></i></div>
        <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:.85rem">${esc(m.title)}</div><div style="font-size:.7rem;color:var(--muted)">${ago(m.completed_at)} · +${m.reward} Coins</div></div>
        <i class="fas fa-check" style="color:#22c55e"></i>
      </div>`).join('')}
    </div>` : ''}`;
}

// ════════════════════════════════════════════════════════════════
//  CHANGELOG-SYSTEM
// ════════════════════════════════════════════════════════════════
const FEATURES_LIST = [
  {
    cat: 'Mitarbeiter-Tools', icon: 'fa-briefcase', color: '#f97316', items: [
      { name: 'Dashboard', desc: 'Persönliche Übersicht: Coins, Streak, IC-Zeit, letzte Prüfungen, Nachrichten & Schnellzugriff auf alle Bereiche.' },
      { name: 'Aktivitäts-Log', desc: 'Chronologische Zeitleiste aller Ereignisse im Portal (Prüfungen, Abstimmungen, IC-Zeit, Turniere u.v.m.).' },
      { name: 'Mitarbeiter der Woche', desc: 'Wöchentliche Community-Abstimmung. Mitarbeiter & Bürger können abstimmen. Automatische Auswertung sonntags.' },
      { name: 'Prüfungssystem', desc: 'Theorie- & Praxisprüfungen für Bürger in allen Fahrzeugkategorien. Automatische Bewertung, K.O.-Fragen, sofortiger Bann bei K.O.-Versagen, PDF-Zertifikat.' },
      { name: 'Rang-Prüfungen (Ausbildung)', desc: '3-Modul Gesellen-/Meisterprüfung (Ortskunde, Mentalteil, Praktischer Teil). Echtzeit-Kollaboration zweier Prüfer via SSE, automatische Zertifikat-Generierung.' },
      { name: 'Bürgerregister', desc: 'Vollständige Datenbank aller Führerschein-Inhaber. Filterfähig nach Kategorie, Prüfer und Zeitraum.' },
      { name: 'IC-Zeit Tracking', desc: 'Automatische Messung der In-Character-Zeit über Discord Voice-Kanäle. Wochenstunden, Rangliste und Monatsberichte.' },
      { name: 'Onboarding-Wizard', desc: 'Einarbeitungs-Checkliste für neue Mitarbeiter mit Fortschrittsbalken. Ausbilder sehen den Status aller Neuzugänge.' },
      { name: 'Bewerbungssystem', desc: 'Online-Bewerbungsformular für Bewerber. Admin-Kanban-Board zur Verwaltung (Offen / In Prüfung / Angenommen / Abgelehnt).' },
      { name: 'Support-Tickets', desc: 'Ticket-System für Bugs, Fragen & Beschwerden. Kategorien, Statusverwaltung, Staff-Replies.' },
    ]
  },
  {
    cat: 'Informationen & Karten', icon: 'fa-map-marked-alt', color: '#22c55e', items: [
      { name: 'Abschlepphöfe-Karte', desc: 'Interaktive Leaflet-Karte mit allen ACLS-Standorten in GTA V inkl. Fahrzeuglisten.' },
      { name: 'Fraktionsfarben', desc: 'Übersicht aller offiziellen Fraktionsfahrzeugfarben mit Hex-Codes und Vorschau.' },
      { name: 'Preisliste', desc: 'Tabellarische Fahrschul- & Servicepreise, jederzeit von Admins aktualisierbar.' },
      { name: 'Fahrzeugmarkt', desc: 'Private Fahrzeuginserate der Mitarbeiter. Mit Bild-Upload und Direktkontakt-Funktion.' },
      { name: 'Prüfungsvorbereitung', desc: 'Externe Lernseite (/quiz) mit dem gesamten Fragenkatalog — auch ohne Login nutzbar.' },
      { name: 'FAQ', desc: 'Verwaltbare FAQ-Sektion. Admins können Fragen & Antworten direkt im Portal pflegen.' },
      { name: 'Organigramm / Unser Team', desc: 'Hierarchische Darstellung aller aktiven Mitarbeiter mit Steckbrief-Modal.' },
      { name: 'Mitarbeiter-Vorstellung', desc: 'Öffentliche Profilkarten für alle Mitarbeiter mit Bio, Spezialgebiet und Fun Fact.' },
      { name: 'Statistik-Trends', desc: 'Chart.js-Charts für Prüfungen, IC-Zeit, Coin-Umsatz und Top-Prüfer (letzte 12 Wochen).' },
    ]
  },
  {
    cat: 'Coins & Wirtschaft', icon: 'fa-coins', color: '#fbbf24', items: [
      { name: 'ACLS-Coin-System', desc: 'Interne Währung für alle Aktivitäten. Täglicher Bonus mit Streak-Multiplikator (bis 5×), wöchentliches Cap.' },
      { name: 'Daily Bonus Wheel', desc: 'Täglich einmal drehen: animiertes 8-Segment-Rad mit Coins- & XP-Preisen. Freundes-Bonus: +10% Coins, wenn ein Freund in den letzten 2 Stunden online war.' },
      { name: 'Coin-Shop', desc: 'Shop für Kosmetika: Titel, Profilrahmen, Namensfarben, Dekorationen, Trucks, Decks, VIP-Rolle, XP-Booster, Lotterietickets.' },
      { name: 'Coin-Transfers', desc: 'Coins an andere Mitarbeiter senden (max. 200/Tag, timing-sicher).' },
      { name: 'Marktplatz', desc: 'Spieler-zu-Spieler Kosmetika-Handel. Listings mit Bild und Direktkauf.' },
      { name: 'Schwarzmarkt', desc: 'Tägliche Sonderangebote mit Timer (24h). Zufällige Auswahl aus dem gesamten Shop-Katalog mit Rabatt.' },
      { name: 'Coin-Wetten', desc: 'Wette gegen andere Mitarbeiter & Bürger. Herausforderung annehmen/ablehnen, Coins automatisch reserviert.' },
      { name: 'Lotteriesystem', desc: 'Wöchentliche Coin-Lotterie. Tickets kaufen, Freitags-Ziehung, Jackpot gestaffelt nach Teilnehmerzahl.' },
    ]
  },
  {
    cat: 'Progression & Profil', icon: 'fa-star', color: '#a855f7', items: [
      { name: 'Globales Level-System', desc: 'Permanentes XP-System über alle Aktivitäten. XP durch Tagesbonus (+25), Prüfungen (+50), Wheel. Rangliste Top 50.' },
      { name: 'Prestige-System 2.0', desc: 'Bei Level 50: Prestige-Reset mit Stern-Badge. Mehrfach prestigeable.' },
      { name: 'Saison-Pass (Battle Pass)', desc: '30 Tiers pro Saison (monatlich). Gratis-Track + Premium-Track (500 Coins). Wochen-Quests für XP.' },
      { name: 'Meilenstein-System', desc: '14 permanente Lebensziele (Exams, IC-Zeit, Streak, Coins, Level). Automatische Coin-Belohnung bei Abschluss.' },
      { name: 'Badge-System', desc: '25+ Errungenschaften für besondere Leistungen. Badges mit SVG-Animationen auf dem Profil.' },
      { name: 'Geheime Abzeichen', desc: 'Versteckte Erfolge, die nur durch besondere Aktionen freigeschaltet werden (z.B. ersten Freund hinzufügen, erste DM, erste Wheel-Drehung). Erscheinen erst nach Entdeckung.' },
      { name: 'Profilrahmen-Animationen', desc: 'Kosmetische Rahmen mit CSS-Animationen: Rainbow, Neon (Cyan-Glow), Gold-Puls, Prestige-Farbwechsel.' },
      { name: 'Titel-System 2.0', desc: 'Über 20 Titel im Shop + Custom-Titel (Admin-genehmigt) + Ehrentiitel. Werden neben dem Namen angezeigt.' },
      { name: 'Profilbild-Upload', desc: 'Eigenes Bild hochladen (max 300 KB, auto-komprimiert auf 256px). Ersetzt das Discord-Avatar.' },
      { name: 'Mein Profil', desc: 'Persönliche Seite für Bio, Spezialgebiet, Fun Fact und Profilbild-Verwaltung.' },
      { name: 'Mein ACLS Hub', desc: 'Persönlicher Startpunkt mit Profil-Hero, XP-Fortschrittsbalken, Saison-Pass-Status und Schnellzugriff auf alle persönlichen Features.' },
      { name: 'Freundesliste', desc: 'Freundschaftsanfragen senden, Statistik-Vergleich, Gästebuch-Einträge.' },
    ]
  },
  {
    cat: 'Soziales & Community', icon: 'fa-users', color: '#38bdf8', items: [
      { name: 'Clubs & Gilden', desc: 'Gründe einen eigenen Club (500 Coins) mit Name, Tag, Emoji-Logo und Beschreibung. Bis zu 50 Mitglieder, Club-Rangliste nach XP & Kasse, Präsidenten verwalten Mitglieder und können die Präsidentschaft übergeben.' },
      { name: 'Vereinskasse (Treasury)', desc: 'Gemeinsame Club-Kasse: Mitglieder zahlen Coins ein (steigert Club-XP & persönlichen Beitrag), Präsidenten zahlen aus. Jede Aktion landet im Club-Protokoll. Beim Auflösen geht die Restkasse zurück.' },
      { name: 'Direktnachrichten', desc: 'Private 1:1 Nachrichten zwischen Mitarbeitern. Ungelesen-Badge, Posteingang und Verlauf.' },
      { name: 'Freundes-Feed', desc: 'Dashboard-Widget mit den aktuellen Aktivitäten deiner Freunde (neue Badges & Highscores) aus den letzten 7 Tagen.' },
      { name: 'Online-Status', desc: 'Grüner Punkt bei Freunden, die in den letzten 5 Minuten aktiv waren – basiert auf Letzte-Aktivität-Tracking.' },
      { name: 'Bester-Freund-Badge', desc: 'Automatische Auszeichnung für den Freund mit den meisten gemeinsamen Direktnachrichten.' },
      { name: 'Willkommens-Banner', desc: 'Onboarding-Banner für neue Nutzer beim ersten Besuch mit direktem Einstieg in Prüfung, Daily Wheel und Community.' },
      { name: 'Feedback & Ideen', desc: 'Community-Vorschläge einreichen und abstimmen (👍/👎). Kommentarfunktion.' },
      { name: 'Benachrichtigungs-Center', desc: 'Echtzeit-Benachrichtigungen via SSE für Coins, Badges, Duelle, Turniere und Tickets.' },
      { name: 'Aktive Sperren', desc: 'Übersicht aller aktiven Hausverbote mit automatischem Ablauf nach 24h.' },
      { name: 'Globale Suche', desc: 'Sperren, Mitarbeiter & Bürgerregister gleichzeitig durchsuchen.' },
    ]
  },
  {
    cat: 'Admin-Bereich', icon: 'fa-shield-alt', color: '#ef4444', items: [
      { name: 'Admin-Panel', desc: 'Nutzerverwaltung, Rollen, Aktivierungsstatus, manuelle Coin-Vergabe, Twitch-Widget, Dashboard-Config.' },
      { name: 'Audit-Log', desc: 'Lückenlose Protokollierung aller Admin-Aktionen (Wer hat was wann geändert).' },
      { name: 'Fragen-Editor', desc: 'Prüfungsfragen verwalten: Erstellen, Bearbeiten, Kategorisieren, K.O.-Fragen markieren.' },
      { name: 'Beschwerde-Kanban', desc: 'Eingehende Beschwerden als Kanban-Board verwalten (Offen / In Bearbeitung / Gelöst).' },
      { name: 'Ranglisten-Verwaltung', desc: 'Spieler aus Minispiel-Highscore-Listen entfernen ohne andere Einträge zu beeinflussen.' },
      { name: 'Changelog-Verwaltung', desc: 'Neue Changelog-Einträge erstellen und bestehende löschen.' },
      { name: 'Anti-Cheat: XP-Überwachung', desc: 'Jeder Saison-XP-Gewinn wird mit Quelle & Zeitstempel protokolliert. Spitzen über 5.000 XP/Stunde werden automatisch geflaggt. Dashboard zeigt Anomalien, 24h-Top-Verdiener und den XP-Verlauf pro Nutzer.' },
    ]
  },
  {
    cat: 'Wettbewerb & Live-Spiele', icon: 'fa-trophy', color: '#f59e0b', items: [
      { name: 'Wochenturnier', desc: 'Jede Woche ein anderes Minispiel im Turniermodus. Automatische Auswertung Freitagabend, Coins für Top 3.' },
      { name: 'Quiz-Duell (1v1)', desc: 'Live-Duell gegen andere Mitarbeiter oder Bürger. SSE-Echtzeit, Emote-Reaktionen, Bracket-Turnier.' },
      { name: 'Trivia-Team', desc: 'Team-Quiz: 2 Teams gegeneinander, 20 Fragen, 20 Sekunden pro Frage, SSE-Live-Updates, 100 Coins für das Siegerteam.' },
    ]
  },
  {
    cat: 'Minispiele', icon: 'fa-gamepad', color: '#4ade80', items: [
      { name: 'Autorennen', desc: 'Top-Down Rennsimulator mit Strecken-Editor (eigene Pattern-Strecken erstellen) und Ghost-Rennen (gegen aufgezeichnete Bestzeiten anderer Spieler antreten).' },
      { name: 'Brick Breaker', desc: 'Klassischer Breakout-Klon. Bälle, Power-Ups und Highscore-Liste.' },
      { name: 'Dead Zone', desc: 'Zombie-Shooter aus der Vogelperspektive. Wellen-System, Coins pro Kill.' },
      { name: 'Snake', desc: 'Klassische Schlange. Wächst mit jeder Beute, je länger desto mehr Punkte.' },
      { name: 'Tetris', desc: 'Original Tetris-Mechanik mit modernem ACLS-Design und Highscore.' },
      { name: 'Sky Cop', desc: 'Hubschrauber-Stealth-Game: Fahrzeuge verfolgen, Verdächtige markieren.' },
      { name: 'Doodle Jump', desc: 'Endlos-Springer. Plattformen generieren sich zufällig, Highscore-Liste.' },
      { name: 'Tower Defense', desc: 'Türme platzieren, Wellen abwehren, Upgrades kaufen. Mehrstufige Karte.' },
      { name: '2048', desc: 'Zahlen-Puzzle: Gleiche Kacheln zusammenschieben bis 2048.' },
      { name: 'Quiz Survival', desc: 'Prüfungsfragen im Überlebensmodus. 3 Leben, steigende Schwierigkeit.' },
      { name: 'ACLS Werkstatt-Tycoon', desc: 'Idle-Manager: Mechaniker einstellen & leveln, Aufträge bearbeiten, Forschungspunkte sammeln, Technologien erforschen.' },
      { name: 'Dungeon RPG', desc: 'Rundenbasiertes Dungeon-Crawler-RPG. Klassen, Ausrüstung, Bosse.' },
      { name: 'Abschlepp-Simulator', desc: 'Fahre Abschleppwagen, befestige Fahrzeuge mit physikalischer Simulation, liefere zum Hof.' },
      { name: 'Memory', desc: 'Kartenpaare aufdecken. ACLS-Motive, Zeitangriff-Modus.' },
      { name: 'Reaktionstest', desc: 'Reflexe testen: Reagiere so schnell wie möglich auf visuelle Reize. Ranking der schnellsten Mitarbeiter.' },
    ]
  },
  {
    cat: 'Wirtschafts-Simulationen', icon: 'fa-industry', color: '#f97316', items: [
      { name: 'AutoMarkt Pro', desc: 'Fahrzeughandel-Simulator: Kaufe Autos aus dem täglichen 3er-Angebot, restauriere ihren Zustand und verkaufe mit Gewinn in einen schwankenden Markt. 11 Fahrzeuge von Common bis Legendär, Händler-Level und Profit-Rangliste. Eigene Händler-Währung schützt die Coin-Wirtschaft.' },
      { name: 'Auto Empire', desc: 'Idle-Imperium: Werkstätten bauen, Mechaniker einstellen und Produktion einsammeln – auch offline (bis 8 Stunden). Eskalierende Ausbaukosten, Imperium-Level und Produktions-Rangliste. Eigene Imperium-Währung schützt die Coin-Wirtschaft.' },
    ]
  },
  {
    cat: 'Spielbank (Casino)', icon: 'fa-dice', color: '#fbbf24', items: [
      { name: 'Blackjack', desc: 'Klassisches Blackjack mit Split (Paare aufteilen), Insurance (Versicherung gegen Dealer-Blackjack) und Double Down.' },
      { name: 'Mega Spin', desc: 'Slotmaschine mit 5 Walzen, Bonus-Symbolen und Multiplikatoren.' },
      { name: 'Plinko', desc: 'Ball fällt durch Pins, landet in Coin-Multiplikator-Slots. Physik-Simulation.' },
      { name: 'Big Bass Bonanza', desc: 'Angel-Slot im Fisch-Thema. Freispiele, Wilds und gestaffelte Multiplikatoren.' },
      { name: 'Mines', desc: 'Minesweeper-Prinzip mit Coin-Einsatz: mehr aufgedeckte Felder = höherer Multiplikator.' },
      { name: 'Rocket', desc: 'Crash-Game: Rakete steigt, Multiplikator wächst – auszahlen bevor sie crasht.' },
      { name: 'Book of Ra', desc: 'Ägypten-Slot mit Freispielen und expandierendem Bonus-Symbol. Klassisches 5-Walzen-Slot-Feeling.' },
      { name: 'Roulette', desc: 'Europäisches Roulette: auf Zahlen, Farben, Gerade/Ungerade oder Bereiche setzen. Animiertes Rad mit gestaffelten Auszahlungen.' },
      { name: 'Hi-Lo', desc: 'Karten-Ratespiel: Ist die nächste Karte höher oder niedriger? Serien erhöhen den Multiplikator – auszahlen oder weiterzocken.' },
      { name: 'Hangman', desc: 'Galgenmännchen mit Coin-Einsatz: Begriffe aus der ACLS-Welt Buchstabe für Buchstabe erraten, bevor die Versuche ausgehen.' },
    ]
  },
];

async function changelog(tab = 'changelog') {
  const data = await api('/api/changelogs');
  if (!data) return;
  const typeBadge = t => t === 'feature' ? '<span class="badge badge-g" style="font-size:.65rem">NEU</span>' : t === 'fix' ? '<span class="badge badge-r" style="font-size:.65rem">FIX</span>' : '<span class="badge" style="background:rgba(96,165,250,.15);color:#60a5fa;border-color:rgba(96,165,250,.3);font-size:.65rem">UPDATE</span>';

  const tabBtn = (id, label, icon) => `<button onclick="changelog('${id}')" style="display:flex;align-items:center;gap:.45rem;padding:.55rem 1.1rem;border-radius:8px;border:1px solid ${tab===id?'var(--orange)':'var(--border)'};background:${tab===id?'rgba(249,115,22,.12)':'var(--surface)'};color:${tab===id?'var(--orange)':'var(--muted)'};font-weight:${tab===id?'700':'400'};font-size:.83rem;cursor:pointer;font-family:inherit;transition:all .15s"><i class="fas ${icon}"></i>${label}</button>`;

  const changelogHtml = `
    ${isAdmin() ? `<div style="display:flex;justify-content:flex-end;margin-bottom:1rem"><button class="btn btn-primary btn-sm" onclick="openChangelogForm()"><i class="fas fa-plus"></i> Eintrag</button></div>` : ''}
    <div class="card">
      <div class="card-head"><div class="card-head-icon" style="background:rgba(110,231,183,.12)"><i class="fas fa-code-branch" style="color:#6ee7b7"></i></div><div><div class="card-title">Changelog</div><div class="card-sub">${data.length} Einträge</div></div></div>
      <div style="position:relative;padding-left:1.5rem">
        <div style="position:absolute;left:.6rem;top:0;bottom:0;width:2px;background:var(--border);border-radius:1px"></div>
        ${data.map(e => `
          <div style="position:relative;padding:.75rem 0 .75rem .75rem;border-bottom:1px solid var(--border)">
            <div style="position:absolute;left:-.9rem;top:1.1rem;width:10px;height:10px;border-radius:50%;background:${e.type==='feature'?'#22c55e':e.type==='fix'?'#ef4444':'#60a5fa'};border:2px solid var(--bg)"></div>
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.2rem;flex-wrap:wrap">
              <span style="font-weight:800;font-size:.9rem">${esc(e.title)}</span>
              ${typeBadge(e.type)}
              <span style="font-size:.72rem;background:var(--surface2);padding:.1rem .5rem;border-radius:99px;color:var(--muted)">v${esc(e.version)}</span>
            </div>
            <div style="font-size:.8rem;color:var(--muted);line-height:1.55;margin-bottom:.2rem">${esc(e.body)}</div>
            <div style="font-size:.7rem;color:var(--surface3)">${fmt(e.released_at)}</div>
            ${isAdmin() ? `<button class="btn btn-ghost btn-sm" style="margin-top:.3rem;color:#ef4444" onclick="deleteChangelog(${e.id})"><i class="fas fa-trash"></i></button>` : ''}
          </div>`).join('')}
      </div>
    </div>`;

  const totalFeatures = FEATURES_LIST.reduce((s, c) => s + c.items.length, 0);
  const featuresHtml = `
    <div class="card" style="margin-bottom:1rem;padding:.9rem 1.1rem;background:linear-gradient(135deg,rgba(249,115,22,.08),rgba(251,191,36,.04));border-color:rgba(249,115,22,.25)">
      <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
        <div style="font-size:2rem">🚀</div>
        <div>
          <div style="font-weight:800;font-size:1rem">ACLS Portal – Vollständige Feature-Übersicht</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.1rem">${FEATURES_LIST.length} Kategorien · ${totalFeatures} Features & Funktionen</div>
        </div>
      </div>
    </div>
    ${FEATURES_LIST.map(cat => `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-head">
          <div class="card-head-icon" style="background:${cat.color}22"><i class="fas ${cat.icon}" style="color:${cat.color}"></i></div>
          <div><div class="card-title">${esc(cat.cat)}</div><div class="card-sub">${cat.items.length} Einträge</div></div>
        </div>
        ${cat.items.map((item, i) => `
          <div style="display:flex;gap:.75rem;padding:.6rem 0;border-bottom:${i < cat.items.length-1 ? '1px solid var(--border)' : 'none'}">
            <div style="flex-shrink:0;margin-top:.15rem">
              <div style="width:8px;height:8px;border-radius:50%;background:${cat.color};margin-top:.3rem"></div>
            </div>
            <div>
              <div style="font-weight:700;font-size:.88rem">${esc(item.name)}</div>
              <div style="font-size:.78rem;color:var(--muted);line-height:1.55;margin-top:.1rem">${esc(item.desc)}</div>
            </div>
          </div>`).join('')}
      </div>`).join('')}`;

  $('pageContent').innerHTML = `
    <div style="display:flex;gap:.5rem;margin-bottom:1.25rem;flex-wrap:wrap">
      ${tabBtn('changelog', 'Changelog', 'fa-code-branch')}
      ${tabBtn('features',  'Features & Funktionen', 'fa-list-ul')}
    </div>
    ${tab === 'features' ? featuresHtml : changelogHtml}`;
}
window.openChangelogForm = () => {
  openModal(`
    <div class="modal-head"><div class="modal-icon" style="background:rgba(110,231,183,.12)"><i class="fas fa-code-branch" style="color:#6ee7b7"></i></div><div><div class="modal-title">Neuer Changelog-Eintrag</div></div><button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Version</label><input id="clVer" class="form-control" placeholder="z.B. 2.1.0"></div>
      <div class="form-group"><label class="form-label">Typ</label><select id="clType" class="form-control"><option value="feature">Feature (NEU)</option><option value="fix">Fix</option><option value="update">Update</option></select></div>
      <div class="form-group"><label class="form-label">Titel</label><input id="clTitle" class="form-control" maxlength="200"></div>
      <div class="form-group"><label class="form-label">Beschreibung</label><textarea id="clBody" class="form-control" rows="4" maxlength="2000"></textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button><button class="btn btn-primary" onclick="submitChangelog()">Speichern</button></div>`);
};
window.submitChangelog = async () => {
  const r = await api('/api/changelogs', { method: 'POST', body: { version: $('clVer').value, type: $('clType').value, title: $('clTitle').value, body: $('clBody').value } });
  if (r) { closeModal(); toast('Eintrag gespeichert!', 'ok'); changelog(); }
};
window.deleteChangelog = async id => {
  if (!confirm('Eintrag löschen?')) return;
  const r = await api(`/api/changelogs/${id}`, { method: 'DELETE' });
  if (r) { toast('Gelöscht', 'ok'); changelog(); }
};

// ════════════════════════════════════════════════════════════════
//  TRIVIA-TEAM MULTIPLAYER
// ════════════════════════════════════════════════════════════════
let _triviaRoom = null;
let _triviaTimer = null;
let _triviaTimeLeft = 20;

async function trivia() {
  const rooms = await api('/api/trivia/rooms');
  $('pageContent').innerHTML = `
    <div style="display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="createTriviaRoom()"><i class="fas fa-plus"></i> Neuer Raum</button>
      <button class="btn btn-ghost" onclick="joinTriviaByCode()"><i class="fas fa-sign-in-alt"></i> Per Code beitreten</button>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-head-icon" style="background:rgba(244,114,182,.15)"><i class="fas fa-users-cog" style="color:#f472b6"></i></div><div><div class="card-title">Offene Trivia-Räume</div><div class="card-sub">${(rooms||[]).length} verfügbar</div></div></div>
      ${(rooms||[]).length ? rooms.map(r => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-weight:700;font-size:.9rem">${esc(r.team_a_name)} <span style="color:var(--muted)">vs</span> ${esc(r.team_b_name)}</div>
            <div style="font-size:.73rem;color:var(--muted)">${r.player_count} Spieler · Code: <code style="background:var(--surface2);padding:.1rem .4rem;border-radius:4px">${r.code}</code></div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="joinTriviaRoom('${r.code}')">Beitreten</button>
        </div>`).join('') : '<div class="empty"><i class="fas fa-users-cog"></i><p>Keine offenen Räume – erstelle einen!</p></div>'}
    </div>`;
}

window.createTriviaRoom = () => {
  openModal(`
    <div class="modal-head"><div class="modal-icon" style="background:rgba(244,114,182,.15)"><i class="fas fa-users-cog" style="color:#f472b6"></i></div><div><div class="modal-title">Neuer Trivia-Raum</div></div><button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Team A Name</label><input id="tA" class="form-control" value="Team A" maxlength="30"></div>
      <div class="form-group"><label class="form-label">Team B Name</label><input id="tB" class="form-control" value="Team B" maxlength="30"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button><button class="btn btn-primary" onclick="doCreateRoom()">Erstellen</button></div>`);
};
window.doCreateRoom = async () => {
  const r = await api('/api/trivia/rooms', { method: 'POST', body: { team_a_name: $('tA').value, team_b_name: $('tB').value } });
  if (r) { closeModal(); toast(`Raum erstellt: ${r.code}`, 'ok'); openTriviaLobby(r.code); }
};
window.joinTriviaByCode = () => {
  openModal(`
    <div class="modal-head"><div class="modal-icon" style="background:rgba(244,114,182,.15)"><i class="fas fa-sign-in-alt" style="color:#f472b6"></i></div><div><div class="modal-title">Raum beitreten</div></div><button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Raum-Code</label><input id="roomCode" class="form-control" placeholder="z.B. A1B2C" maxlength="10" style="text-transform:uppercase"></div>
      <div style="display:flex;gap:.5rem;margin-top:.5rem">
        <button class="btn btn-primary" onclick="joinTriviaRoom(document.getElementById('roomCode').value,'a')">Team A</button>
        <button class="btn btn-ghost" onclick="joinTriviaRoom(document.getElementById('roomCode').value,'b')">Team B</button>
      </div>
    </div>`);
};
window.joinTriviaRoom = async (code, team = 'a') => {
  const r = await api(`/api/trivia/rooms/${code}/join`, { method: 'POST', body: { team } });
  if (r) { closeModal(); openTriviaLobby(code); }
};

async function openTriviaLobby(code) {
  _triviaRoom = null;
  const refresh = async () => {
    const room = await api(`/api/trivia/rooms/${code}`);
    if (!room) return;
    _triviaRoom = room;
    const isHost = currentUser?.discord_id === room.host_did;
    $('pageContent').innerHTML = `
      <div class="card" style="max-width:500px;margin:0 auto">
        <div class="card-head"><div class="modal-icon" style="background:rgba(244,114,182,.15)"><i class="fas fa-users-cog" style="color:#f472b6"></i></div><div><div class="card-title">Trivia Lobby – <code>${room.code}</code></div></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
          <div style="text-align:center;padding:.75rem;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);border-radius:8px">
            <div style="font-weight:800;color:#60a5fa">${esc(room.team_a_name)}</div>
            ${room.players.filter(p=>p.team==='a').map(p=>`<div style="font-size:.8rem;color:var(--muted)">${esc(p.username)}</div>`).join('')||'<div style="font-size:.75rem;color:var(--surface3)">Leer</div>'}
            <button class="btn btn-ghost btn-sm" style="margin-top:.4rem" onclick="joinTriviaRoom('${room.code}','a')">Wechseln</button>
          </div>
          <div style="text-align:center;padding:.75rem;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px">
            <div style="font-weight:800;color:#f87171">${esc(room.team_b_name)}</div>
            ${room.players.filter(p=>p.team==='b').map(p=>`<div style="font-size:.8rem;color:var(--muted)">${esc(p.username)}</div>`).join('')||'<div style="font-size:.75rem;color:var(--surface3)">Leer</div>'}
            <button class="btn btn-ghost btn-sm" style="margin-top:.4rem" onclick="joinTriviaRoom('${room.code}','b')">Wechseln</button>
          </div>
        </div>
        ${isHost
          ? `<button class="btn btn-primary" style="width:100%" onclick="startTrivia('${room.code}')"><i class="fas fa-play"></i> Spiel starten (${room.players.length} Spieler)</button>`
          : `<div style="text-align:center;color:var(--muted);font-size:.85rem"><i class="fas fa-hourglass-half" style="margin-right:.4rem"></i>Warten auf Host…</div>`}
      </div>`;
  };
  await refresh();
  navigate('trivia');
}

async function startTrivia(code) {
  const r = await api(`/api/trivia/rooms/${code}/start`, { method: 'POST' });
  if (r) toast('Spiel gestartet!', 'ok');
}

// SSE: Trivia-Events
function handleTriviaSSE(eventName, data) {
  if (!_triviaRoom || data.code !== _triviaRoom.code) return;
  if (eventName === 'trivia_lobby') { if (_activePage === 'trivia') openTriviaLobby(data.code); return; }
  if (eventName === 'trivia_question') renderTriviaQuestion(data);
  if (eventName === 'trivia_reveal') renderTriviaReveal(data);
  if (eventName === 'trivia_end') renderTriviaEnd(data);
}

function renderTriviaQuestion(data) {
  const q = data.question;
  const opts = JSON.parse(q.options || '[]');
  $('pageContent').innerHTML = `
    <div class="card" style="max-width:500px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <span style="font-size:.8rem;color:var(--muted)">Frage ${(data.q_idx||0)+1}</span>
        <span id="triviaTimer" style="font-size:1.2rem;font-weight:800;color:var(--orange)">20</span>
      </div>
      <div style="font-size:.95rem;font-weight:600;margin-bottom:1.25rem;line-height:1.55">${esc(q.q)}</div>
      <div style="display:grid;gap:.5rem">
        ${opts.map((o,i) => `<button class="btn btn-ghost" style="text-align:left;font-size:.85rem;padding:.65rem .9rem" onclick="answerTrivia('${_triviaRoom?.code}','${esc(o)}',this)">${esc(o)}</button>`).join('')}
      </div>
    </div>`;
  if (_triviaTimer) clearInterval(_triviaTimer);
  _triviaTimeLeft = 20;
  _triviaTimer = setInterval(() => {
    _triviaTimeLeft--;
    const el = $('triviaTimer');
    if (el) { el.textContent = _triviaTimeLeft; if (_triviaTimeLeft <= 5) el.style.color = '#ef4444'; }
    if (_triviaTimeLeft <= 0) clearInterval(_triviaTimer);
  }, 1000);
}

function renderTriviaReveal(data) {
  if (_triviaTimer) { clearInterval(_triviaTimer); _triviaTimer = null; }
  document.querySelectorAll('#pageContent .btn').forEach(btn => { btn.disabled = true; });
  const msg = `<div style="text-align:center;padding:.75rem;background:var(--surface2);border-radius:8px;margin-top:.75rem"><div style="font-weight:700">Richtige Antwort: <span style="color:#22c55e">${esc(data.correct_answer)}</span></div><div style="font-size:.8rem;color:var(--muted);margin-top:.3rem">Scores: ${_triviaRoom?.team_a_name||'A'} ${data.scores?.a||0} – ${data.scores?.b||0} ${_triviaRoom?.team_b_name||'B'}</div></div>`;
  const card = $('pageContent')?.querySelector('.card');
  if (card) card.insertAdjacentHTML('beforeend', msg);
}

function renderTriviaEnd(data) {
  if (_triviaTimer) { clearInterval(_triviaTimer); _triviaTimer = null; }
  const winnerName = data.winner === 'a' ? (_triviaRoom?.team_a_name||'Team A') : data.winner === 'b' ? (_triviaRoom?.team_b_name||'Team B') : null;
  $('pageContent').innerHTML = `
    <div class="card" style="max-width:400px;margin:0 auto;text-align:center;padding:2rem 1.5rem">
      <div style="font-size:3rem;margin-bottom:.5rem">${data.winner==='draw'?'🤝':'🏆'}</div>
      <div style="font-size:1.3rem;font-weight:800;margin-bottom:.5rem">${winnerName ? esc(winnerName) + ' gewinnt!' : 'Unentschieden!'}</div>
      <div style="font-size:1rem;color:var(--muted)">${data.score_a} : ${data.score_b}</div>
      ${winnerName ? `<div style="font-size:.8rem;color:#fbbf24;margin-top:.5rem">Gewinner erhalten 100 Coins!</div>` : ''}
      <button class="btn btn-primary" style="margin-top:1.25rem" onclick="_triviaRoom=null;trivia()"><i class="fas fa-arrow-left"></i> Zurück zur Lobby</button>
    </div>`;
  _triviaRoom = null;
}

window.answerTrivia = async (code, answer, btn) => {
  btn.style.opacity = '.5';
  btn.disabled = true;
  const r = await api(`/api/trivia/rooms/${code}/answer`, { method: 'POST', body: { answer } });
  if (r) {
    btn.style.borderColor = r.correct ? '#22c55e' : '#ef4444';
    btn.style.background = r.correct ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.08)';
    btn.style.opacity = '1';
    if (r.correct) toast('Richtig! 🎉', 'ok');
  }
};

// ════════════════════════════════════════════════════════════════
//  ONBOARDING-WIZARD (M2)
// ════════════════════════════════════════════════════════════════
async function onboarding() {
  const d = await api('/api/onboarding/mine');
  if (!d) return;
  const items = d.items || [];
  const doneCount = typeof d.done === 'number' ? d.done : items.filter(i => i.done).length;
  const total = d.total || items.length || 1;
  const pct = Math.round((doneCount / total) * 100);
  $('pageContent').innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-head"><div class="card-head-icon" style="background:rgba(74,222,128,.15)"><i class="fas fa-tasks" style="color:#4ade80"></i></div><div><div class="card-title">Onboarding-Wizard</div><div class="card-sub">Deine Einarbeitungs-Checkliste</div></div></div>
      <div style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;font-size:.82rem;color:var(--muted);margin-bottom:.4rem"><span>${doneCount} von ${total} erledigt</span><span>${pct}%</span></div>
        <div style="height:12px;background:var(--input);border-radius:8px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#22c55e,#4ade80);border-radius:8px;transition:width .5s"></div>
        </div>
      </div>
      ${pct >= 100 ? `<div style="text-align:center;padding:1rem;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:8px;color:#22c55e;font-weight:700"><i class="fas fa-check-circle" style="margin-right:.4rem"></i>Onboarding abgeschlossen! Willkommen im Team 🎉</div>` : ''}
      ${items.map(item => {
        const isDone = item.done === true;
        return `<div style="display:flex;align-items:flex-start;gap:.75rem;padding:.65rem 0;border-bottom:1px solid var(--border);opacity:${isDone?'.7':'1'}">
          <div style="width:22px;height:22px;border-radius:4px;border:2px solid ${isDone?'#22c55e':'var(--border)'};background:${isDone?'rgba(34,197,94,.15)':'transparent'};flex-shrink:0;margin-top:.1rem;display:flex;align-items:center;justify-content:center">
            ${isDone?'<i class="fas fa-check" style="color:#22c55e;font-size:.6rem"></i>':''}
          </div>
          <div style="flex:1">
            <div style="font-weight:${isDone?'400':'600'};font-size:.88rem;${isDone?'text-decoration:line-through;color:var(--muted)':''}">${esc(item.label)}</div>
            ${item.description?`<div style="font-size:.75rem;color:var(--muted);margin-top:.15rem">${esc(item.description)}</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ════════════════════════════════════════════════════════════════
//  PROFILBILD-UPLOAD (L1) — Profil-Seite
// ════════════════════════════════════════════════════════════════
//  MEIN ACLS – Persönlicher Hub
// ════════════════════════════════════════════════════════════════
// ── Tägliche Aufgaben + Streak (client-seitig) ──────────────────
function evalDailyStreak(allDone) {
  let st = { last: '', streak: 0 };
  try { st = JSON.parse(localStorage.getItem('acls-daily-streak') || '{"last":"","streak":0}'); } catch {}
  const today = _todayKey();
  if (allDone && st.last !== today) {
    const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    st.streak = st.last === yest ? st.streak + 1 : 1;
    st.last = today;
    localStorage.setItem('acls-daily-streak', JSON.stringify(st));
  }
  return st;
}

async function meinacls() {
  const u = currentUser;
  if (!u) { navigate('dashboard'); return; }
  const [lvl, wheel, season, badges, coins] = await Promise.all([
    api('/api/levels/me'),
    api('/api/wheel/status'),
    api('/api/season'),
    api('/api/my-badges'),
    api('/api/coins/me'),
  ]);

  const url     = avatarUrl(u);
  const level   = lvl?.level || 1;
  const xpIn    = lvl?.xp_in_level || 0;
  const xpNeed  = lvl?.xp_needed || 120;
  const prestige = lvl?.prestige || 0;
  const xpPct   = xpNeed > 0 ? Math.min((xpIn / xpNeed) * 100, 100).toFixed(1) : 100;
  const wheelOk = wheel && !wheel.spun_today;
  const sXP     = season?.xp || 0;
  const sLvl    = Math.min(Math.floor(sXP / 100) + 1, 30);
  const sPct    = ((sXP % 100)).toFixed(1);
  const earnedB = badges ? Object.values(badges).filter(b => b.earned).length : 0;
  const totalB  = badges ? Object.keys(BADGE_DEFS).length : 0;

  // ── Tägliche Aufgaben: aus Server-Daten + Seitenbesuchen ──────
  const visits = getTodayVisits();
  const today = _todayKey();
  const dailyBonusDone = !!(coins?.transactions || []).find(t => t.reason === 'daily' && String(t.created_at).slice(0, 10) === today);
  const tasks = [
    { label: 'Daily Wheel drehen',      done: wheel ? !!wheel.spun_today : false, page: 'wheel',  icon: 'fa-dharmachakra' },
    { label: 'Tagesbonus abholen',      done: dailyBonusDone,                     page: 'shop',   icon: 'fa-coins' },
    { label: 'Saison-Quests ansehen',   done: visits.includes('saison'),          page: 'saison', icon: 'fa-medal' },
    { label: 'Arcade besuchen',         done: visits.includes('arcade'),          page: 'arcade', icon: 'fa-gamepad' },
    { label: 'Marktplatz durchstöbern', done: visits.includes('marktplatz'),      page: 'marktplatz', icon: 'fa-exchange-alt' },
  ];
  const doneCount = tasks.filter(t => t.done).length;
  const streak = evalDailyStreak(doneCount === tasks.length);

  // ── 4 Säulen: Progression · Engagement · Belohnungen · Social ─
  const pillars = [
    { label: 'Progression', color: '#a855f7', icon: 'fa-arrow-trend-up', items: [
      { icon: 'fa-star',          label: 'Level & Prestige', page: 'level',      note: `Level ${level}${prestige > 0 ? ` · P${prestige}` : ''}` },
      { icon: 'fa-medal',         label: 'Saison-Pass',      page: 'saison',     note: `Level ${sLvl}/30` },
      { icon: 'fa-flag-checkered',label: 'Meilensteine',     page: 'milestones', note: 'Lebensziele' },
      { icon: 'fa-chart-line',    label: 'Aktivitäts-Log',   page: 'activity',   note: 'Verlauf' },
    ]},
    { label: 'Engagement', color: '#ec4899', icon: 'fa-fire', items: [
      { icon: 'fa-dharmachakra', label: 'Daily Wheel',   page: 'wheel',   note: wheelOk ? 'Jetzt drehen!' : 'Bereits gedreht', pulse: wheelOk },
      { icon: 'fa-crown',        label: 'Wochenturnier', page: 'turnier', note: 'Top 3 gewinnen' },
      { icon: 'fa-bolt',         label: 'Quiz-Duell',    page: 'duell',   note: '1 gegen 1' },
      { icon: 'fa-users-cog',    label: 'Trivia-Team',   page: 'trivia',  note: 'Team-Quiz' },
    ]},
    { label: 'Belohnungen', color: '#fbbf24', icon: 'fa-gift', items: [
      { icon: 'fa-coins',       label: 'Coin-Shop',    page: 'shop',         note: coins ? `${(coins.balance ?? 0).toLocaleString('de-DE')} 🪙` : 'Coins ausgeben' },
      { icon: 'fa-store-slash', label: 'Schwarzmarkt', page: 'schwarzmarkt', note: 'Nur 24h!' },
      { icon: 'fa-exchange-alt',label: 'Marktplatz',   page: 'marktplatz',   note: 'Handel' },
      { icon: 'fa-wallet',      label: 'Meine Finanzen', page: 'finanzen',   note: 'Einnahmen & Ausgaben' },
    ]},
    { label: 'Social', color: '#38bdf8', icon: 'fa-users', items: [
      { icon: 'fa-user-friends', label: 'Freunde',      page: 'freunde',     note: 'Netzwerk' },
      { icon: 'fa-envelope',     label: 'Nachrichten',  page: 'nachrichten', note: 'Posteingang' },
      { icon: 'fa-trophy',       label: 'Mitarbeiter d. Woche', page: 'eow', note: 'Abstimmen' },
      { icon: 'fa-user-circle',  label: 'Mein Profil',  page: 'profil',      note: 'Bio & Avatar' },
    ]},
  ];

  $('pageContent').innerHTML = `
    <!-- Hero-Profil-Karte -->
    <div class="card" style="margin-bottom:1rem;padding:1.5rem;background:linear-gradient(135deg,rgba(168,85,247,.09),rgba(99,102,241,.04));border-color:rgba(168,85,247,.28)">
      <div style="display:flex;align-items:center;gap:1.1rem;flex-wrap:wrap">
        <div style="position:relative;flex-shrink:0">
          ${url
            ? `<img src="${url}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2.5px solid rgba(168,85,247,.55)">`
            : `<div style="width:72px;height:72px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:1.8rem;border:2px solid rgba(168,85,247,.3)">👤</div>`}
          <div style="position:absolute;bottom:-3px;right:-3px;background:var(--bg);border-radius:999px;padding:2px 6px;font-size:.58rem;font-weight:900;color:#a855f7;border:1px solid rgba(168,85,247,.45)">Lv.${level}</div>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:1.15rem;font-weight:800;margin-bottom:.1rem">${esc(u.username || 'Mitarbeiter')}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-bottom:.6rem">${esc(u.title || u.role || 'Mitarbeiter')}${prestige > 0 ? ` · ✨ Prestige ${prestige}` : ''}</div>
          <div style="display:flex;align-items:center;gap:.55rem">
            <div style="flex:1;height:7px;background:var(--input);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${xpPct}%;background:linear-gradient(90deg,#a855f7,#6366f1);border-radius:4px;transition:width .7s ease"></div>
            </div>
            <span style="font-size:.7rem;color:#a855f7;font-weight:800;white-space:nowrap">${xpIn}/${xpNeed} XP</span>
          </div>
        </div>
        <div style="display:flex;gap:1.5rem;flex-shrink:0;flex-wrap:wrap">
          <div style="text-align:center">
            <div style="font-size:1.4rem;font-weight:900;color:#a855f7">${earnedB}</div>
            <div style="font-size:.65rem;color:var(--muted)">von ${totalB} Badges</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.4rem;font-weight:900;color:#a855f7">S${sLvl}</div>
            <div style="font-size:.65rem;color:var(--muted)">Saison-Level</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Saison-Pass Bar -->
    <div class="card" style="margin-bottom:1rem;padding:.9rem 1.1rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">
        <div style="font-size:.78rem;font-weight:700"><i class="fas fa-medal" style="color:#a855f7;margin-right:.4rem"></i>Saison-Pass – Level ${sLvl}/30</div>
        <span style="font-size:.72rem;color:var(--muted)">${sXP} XP gesamt</span>
      </div>
      <div style="height:8px;background:var(--input);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${sPct}%;background:linear-gradient(90deg,#a855f7,#ec4899);border-radius:4px;transition:width .7s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:.3rem">
        <span style="font-size:.65rem;color:var(--muted)">${sPct}% zum nächsten Level</span>
        <button onclick="navigate('saison')" style="font-size:.65rem;color:#a855f7;background:none;border:none;cursor:pointer;font-family:inherit">Zum Pass →</button>
      </div>
    </div>

    <!-- Tägliche Aufgaben + Streak -->
    <div class="card" style="margin-bottom:1rem;padding:1rem 1.2rem;border-color:rgba(236,72,153,.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.7rem;flex-wrap:wrap;gap:.5rem">
        <div style="font-size:.82rem;font-weight:800"><i class="fas fa-list-check" style="color:#ec4899;margin-right:.45rem"></i>Tägliche Aufgaben <span style="color:var(--muted);font-weight:600">· ${doneCount}/${tasks.length}</span></div>
        <div style="display:flex;align-items:center;gap:.4rem;font-size:.75rem;font-weight:800;color:${streak.streak > 0 ? '#f97316' : 'var(--muted)'}">
          <i class="fas fa-fire"></i> ${streak.streak > 0 ? `${streak.streak} Tage-Streak` : 'Noch kein Streak'}
        </div>
      </div>
      <div style="height:6px;background:var(--input);border-radius:3px;overflow:hidden;margin-bottom:.75rem">
        <div style="height:100%;width:${(doneCount / tasks.length * 100).toFixed(0)}%;background:linear-gradient(90deg,#ec4899,#f97316);border-radius:3px;transition:width .5s ease"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.45rem">
        ${tasks.map(t => `
        <button onclick="navigate('${t.page}')" style="display:flex;align-items:center;gap:.6rem;padding:.55rem .7rem;background:${t.done ? 'rgba(34,197,94,.07)' : 'var(--surface)'};border:1px solid ${t.done ? 'rgba(34,197,94,.3)' : 'var(--border)'};border-radius:var(--r);cursor:pointer;font-family:inherit;text-align:left;transition:border-color .15s">
          <i class="fas ${t.done ? 'fa-check-circle' : t.icon}" style="color:${t.done ? '#22c55e' : 'var(--muted)'};width:16px;text-align:center"></i>
          <span style="font-size:.78rem;font-weight:600;color:${t.done ? '#22c55e' : 'var(--text)'};${t.done ? 'text-decoration:line-through;opacity:.75' : ''}">${t.label}</span>
        </button>`).join('')}
      </div>
      ${doneCount === tasks.length ? '<div style="margin-top:.6rem;font-size:.75rem;color:#22c55e;font-weight:700"><i class="fas fa-trophy"></i> Alle Aufgaben erledigt – stark! Komm morgen wieder für deinen Streak. 🔥</div>' : ''}
    </div>

    <!-- 4 Säulen: Progression · Engagement · Belohnungen · Social -->
    ${pillars.map(p => `
      <div style="font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:${p.color};margin:1rem 0 .55rem"><i class="fas ${p.icon}" style="margin-right:.4rem"></i>${p.label}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.6rem">
        ${p.items.map(h => `
        <button onclick="navigate('${h.page}')" style="display:flex;flex-direction:column;align-items:center;gap:.4rem;padding:.9rem .5rem;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);cursor:pointer;transition:border-color .15s,background .15s,transform .1s;font-family:inherit;position:relative" onmouseover="this.style.borderColor='${p.color}';this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform=''">
          ${h.pulse ? `<span style="position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;background:#22c55e;animation:pulse 1.5s ease-in-out infinite"></span>` : ''}
          <i class="fas ${h.icon}" style="color:${p.color};font-size:1.15rem"></i>
          <span style="font-size:.73rem;font-weight:700;color:var(--text);text-align:center;line-height:1.2">${h.label}</span>
          <span style="font-size:.63rem;color:var(--muted);text-align:center">${h.note}</span>
        </button>`).join('')}
      </div>`).join('')}`;
}

// ════════════════════════════════════════════════════════════════
//  MEINE FINANZEN – Einnahmen, Ausgaben & Cashflow (aus Coin-Transaktionen)
// ════════════════════════════════════════════════════════════════
function txCategory(reason) {
  if (reason === 'daily') return 'Boni';
  if (reason.startsWith('game:')) return 'Arcade-Spiele';
  if (reason.startsWith('blackjack:') || reason.startsWith('slot:') || reason.startsWith('lottery:')) return 'Casino & Lotterie';
  if (reason.startsWith('shop:') || reason.startsWith('mystery:')) return 'Shop';
  if (reason.startsWith('transfer:')) return 'Transfers';
  if (reason.startsWith('exam:')) return 'Prüfungen';
  if (reason.startsWith('duel:') || reason.startsWith('bracket:') || reason.startsWith('tournament:')) return 'Turniere & Duelle';
  if (reason.startsWith('market:')) return 'Marktplatz';
  if (reason.startsWith('bet:')) return 'Wetten';
  return 'Sonstiges';
}

async function finanzen() {
  // ?days=30: echte 30-Tage-Historie statt der sonst üblichen "letzten 15 Transaktionen" –
  // Cashflow-Chart und Kategorien-Aufschlüsselung brauchen einen vollständigen Zeitraum,
  // sonst zeigen aktive Nutzer fälschlich "0" an Tagen, die nur nicht mehr mitgeladen wurden.
  const me = await api('/api/coins/me?days=30');
  if (!me) {
    $('pageContent').innerHTML = '<div class="empty"><i class="fas fa-wallet"></i><p>Finanzdaten konnten nicht geladen werden.</p></div>';
    return;
  }
  const txs = me.transactions || [];
  const fmtC = n => (n ?? 0).toLocaleString('de-DE');

  // Einnahmen / Ausgaben gesamt (aus den verfügbaren Transaktionen)
  let incomeTotal = 0, expenseTotal = 0;
  const byCat = {};
  const byDay = {};
  txs.forEach(t => {
    const cat = txCategory(t.reason);
    if (!byCat[cat]) byCat[cat] = { in: 0, out: 0 };
    if (t.amount >= 0) { incomeTotal += t.amount; byCat[cat].in += t.amount; }
    else               { expenseTotal += -t.amount; byCat[cat].out += -t.amount; }
    const day = String(t.created_at).slice(0, 10);
    byDay[day] = (byDay[day] || 0) + t.amount;
  });
  const net = incomeTotal - expenseTotal;

  // Kategorien sortiert nach Volumen
  const cats = Object.entries(byCat)
    .map(([name, v]) => ({ name, ...v, vol: v.in + v.out }))
    .sort((a, b) => b.vol - a.vol);
  const maxVol = Math.max(...cats.map(c => c.vol), 1);

  // Cashflow der letzten 7 Tage
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push({ day: d, label: new Date(d).toLocaleDateString('de-DE', { weekday: 'short' }), sum: byDay[d] || 0 });
  }
  const maxAbs = Math.max(...days.map(d => Math.abs(d.sum)), 1);

  $('pageContent').innerHTML = `
    <!-- Kontostand + Kennzahlen -->
    <div class="stats-row" style="margin-bottom:1rem">
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Kontostand</div><div class="stat-val o">${fmtC(me.balance)} 🪙</div></div>
        <div class="stat-ico o"><i class="fas fa-wallet"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Einnahmen</div><div class="stat-val g">+${fmtC(incomeTotal)}</div></div>
        <div class="stat-ico g"><i class="fas fa-arrow-down"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Ausgaben</div><div class="stat-val r">−${fmtC(expenseTotal)}</div></div>
        <div class="stat-ico r"><i class="fas fa-arrow-up"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Bilanz</div><div class="stat-val ${net >= 0 ? 'g' : 'r'}">${net >= 0 ? '+' : ''}${fmtC(net)}</div></div>
        <div class="stat-ico b"><i class="fas fa-scale-balanced"></i></div>
      </div>
    </div>
    <div style="font-size:.7rem;color:var(--muted);margin:-.4rem 0 1rem">Basierend auf den letzten 30 Tagen (${txs.length} Transaktion${txs.length === 1 ? '' : 'en'}).</div>

    <div class="dash-bottom">
      <!-- Cashflow 7 Tage -->
      <div class="card">
        <div class="card-head">
          <div class="card-head-icon blue"><i class="fas fa-chart-column"></i></div>
          <div><div class="card-title">Cashflow – letzte 7 Tage</div><div class="card-sub">Netto-Coins pro Tag</div></div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:.5rem;height:120px;padding:0 .25rem">
          ${days.map(d => {
            const h = Math.max(Math.round(Math.abs(d.sum) / maxAbs * 100), d.sum !== 0 ? 8 : 3);
            const col = d.sum > 0 ? 'var(--green)' : d.sum < 0 ? 'var(--red)' : 'var(--border)';
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:.3rem;height:100%;justify-content:flex-end">
              <span style="font-size:.62rem;font-weight:700;color:${col}">${d.sum !== 0 ? (d.sum > 0 ? '+' : '') + fmtC(d.sum) : ''}</span>
              <div style="width:100%;max-width:34px;height:${h}%;background:${col};border-radius:4px 4px 0 0;opacity:.85"></div>
              <span style="font-size:.62rem;color:var(--muted)">${d.label}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Kategorien -->
      <div class="card">
        <div class="card-head">
          <div class="card-head-icon orange"><i class="fas fa-layer-group"></i></div>
          <div><div class="card-title">Einnahmen & Ausgaben nach Kategorie</div><div class="card-sub">Wo kommen deine Coins her – und wo gehen sie hin?</div></div>
        </div>
        ${cats.length ? cats.map(c => `
        <div style="margin-bottom:.7rem">
          <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.25rem">
            <span style="font-weight:600">${esc(c.name)}</span>
            <span><span style="color:var(--green);font-weight:700">+${fmtC(c.in)}</span> · <span style="color:var(--red);font-weight:700">−${fmtC(c.out)}</span></span>
          </div>
          <div style="display:flex;height:7px;border-radius:4px;overflow:hidden;background:var(--input)">
            <div style="width:${(c.in / maxVol * 100).toFixed(1)}%;background:var(--green)"></div>
            <div style="width:${(c.out / maxVol * 100).toFixed(1)}%;background:var(--red)"></div>
          </div>
        </div>`).join('') : '<div class="empty"><i class="fas fa-coins"></i><p>Noch keine Transaktionen – spiel ein Minispiel oder hol dir den Tagesbonus!</p></div>'}
      </div>
    </div>

    <!-- Letzte Transaktionen -->
    <div class="card" style="margin-top:1rem;padding:.4rem 1rem">
      <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;padding:.7rem 0 .3rem">Letzte Transaktionen</div>
      ${txs.length ? txs.slice(0, 15).map(t => `
        <div style="display:flex;align-items:center;gap:.6rem;padding:.45rem 0;border-bottom:1px solid var(--border);font-size:.8rem">
          <span style="flex:1">${txLabel(t.reason)}</span>
          <span class="badge badge-m" style="font-size:.62rem">${esc(txCategory(t.reason))}</span>
          <span style="font-weight:700;color:${t.amount >= 0 ? '#4ade80' : '#ef4444'};min-width:60px;text-align:right">${t.amount >= 0 ? '+' : ''}${fmtC(t.amount)}</span>
          <span style="color:var(--muted);font-size:.7rem;white-space:nowrap">${ago(t.created_at)}</span>
        </div>`).join('') : '<div style="padding:.8rem 0;color:var(--muted);font-size:.8rem">Noch keine Transaktionen.</div>'}
      <div style="padding:.6rem 0">
        <button class="btn btn-ghost btn-sm" onclick="navigate('shop')"><i class="fas fa-coins"></i> Zum Coin-Shop</button>
        <button class="btn btn-ghost btn-sm" onclick="navigate('marktplatz')"><i class="fas fa-exchange-alt"></i> Zum Marktplatz</button>
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
async function profil() {
  if (!currentUser) { navigate('dashboard'); return; }
  const avUrl = currentUser.avatar_custom || (currentUser.avatar && currentUser.discord_id
    ? `https://cdn.discordapp.com/avatars/${currentUser.discord_id}/${currentUser.avatar}.png?size=128` : null);
  $('pageContent').innerHTML = `
    <div style="max-width:480px;margin:0 auto">
      <div class="card" style="text-align:center;padding:2rem 1.5rem;margin-bottom:1rem">
        <div id="profilAvBox" style="width:100px;height:100px;border-radius:50%;margin:0 auto 1rem;overflow:hidden;border:3px solid var(--orange);display:flex;align-items:center;justify-content:center;font-size:2.2rem;font-weight:700;background:var(--surface2)">
          ${avUrl ? `<img id="profilAv" src="${avUrl}" style="width:100%;height:100%;object-fit:cover">` : (currentUser.username||'?')[0].toUpperCase()}
        </div>
        <div style="font-size:1.1rem;font-weight:800">${esc(currentUser.username)}</div>
        <div style="font-size:.8rem;color:var(--muted);margin-bottom:1rem">${currentUser.role}</div>
        <input type="file" id="avatarFile" accept="image/*" style="display:none" onchange="previewAvatar(this)">
        <div style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="$('avatarFile').click()"><i class="fas fa-upload"></i> Profilbild hochladen</button>
          ${currentUser.avatar_custom ? `<button class="btn btn-ghost btn-sm" onclick="removeAvatar()"><i class="fas fa-times"></i> Zurücksetzen</button>` : ''}
        </div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:.5rem">Max. 300 KB · JPG/PNG/WebP</div>
      </div>
      <div class="card" style="padding:1.25rem">
        <div style="font-weight:700;margin-bottom:.75rem"><i class="fas fa-id-badge" style="color:var(--orange);margin-right:.4rem"></i>Mein Steckbrief</div>
        <div class="form-group"><label class="form-label">Bio</label><textarea id="prBio" class="form-control" rows="3" maxlength="500">${esc(currentUser.bio||'')}</textarea></div>
        <div class="form-group"><label class="form-label">Spezialgebiet</label><input id="prSpec" class="form-control" maxlength="200" value="${esc(currentUser.specialty||'')}"></div>
        <div class="form-group"><label class="form-label">Fun Fact</label><input id="prFun" class="form-control" maxlength="300" value="${esc(currentUser.fun_fact||'')}"></div>
        <button class="btn btn-primary" onclick="saveOwnProfile()">Speichern</button>
      </div>
    </div>`;
}

window.previewAvatar = file => {
  const f = file.files[0];
  if (!f) return;
  if (f.size > 3_000_000) { toast('Bild zu groß! Max 3 MB.', 'err'); return; }
  compressImage(f, 256, 0.85, dataUrl => {
    const box = $('profilAvBox');
    if (box) box.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover" id="profilAv">`;
    uploadAvatar(dataUrl);
  });
};
window.uploadAvatar = async dataUrl => {
  const r = await api('/api/upload/avatar', { method: 'POST', body: { dataUrl } });
  if (r) {
    toast('Profilbild gespeichert!', 'ok');
    if (currentUser) currentUser.avatar_custom = r.dataUrl;
    // User-Widget aktualisieren
    const uBox = document.querySelector('#uAvatarBox img') || document.querySelector('#uAvatarBox');
    if (uBox && uBox.tagName === 'IMG') uBox.src = r.dataUrl;
  }
};
window.removeAvatar = async () => {
  if (!confirm('Profilbild zurücksetzen?')) return;
  const r = await api('/api/upload/avatar', { method: 'DELETE' });
  if (r) { toast('Zurückgesetzt', 'ok'); if (currentUser) { currentUser.avatar_custom = null; } profil(); }
};
window.saveOwnProfile = async () => {
  const r = await api('/api/team-profiles/me', { method: 'PUT', body: { bio: $('prBio').value, specialty: $('prSpec').value, fun_fact: $('prFun').value } });
  if (r) { toast('Profil gespeichert!', 'ok'); if (currentUser) { currentUser.bio = $('prBio').value; currentUser.specialty = $('prSpec').value; currentUser.fun_fact = $('prFun').value; } }
};

// ════════════════════════════════════════════════════════════════
//  Start wird in index.html nach allen Modulen aufgerufen ─────────
