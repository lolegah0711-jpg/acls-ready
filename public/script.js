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
};

function renderBadge(key, b, earned, isNext, date, stats) {
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
function initSidebar() {
  if (localStorage.getItem('acls-sidebar') === '1')
    document.querySelector('.sidebar').classList.add('collapsed');
}

// ── Globals ─────────────────────────────────────────────────────
let currentUser = null;
let leafletMap  = null;   // active Leaflet instance
let activeQuiz  = null;

const $ = id => document.getElementById(id);
const PAGES = {
  dashboard: { title: 'Dashboard',              sub: 'Willkommen zurück' },
  activity:  { title: 'Aktivität',              sub: 'Letzte Ereignisse' },
  eow:       { title: 'Mitarbeiter der Woche',  sub: 'Wöchentliche Abstimmung' },
  exams:     { title: 'Prüfung starten',        sub: 'Theorie & Praxis' },
  registry:  { title: 'Bürgerregister',          sub: 'Alle Führerschein-Inhaber' },
  factions:  { title: 'Fraktionsfarben',        sub: 'Fahrzeugfarben der Fraktionen' },
  map:       { title: 'Abschlepphöfe',          sub: 'Interaktive GTA V Karte' },
  iczeit:    { title: 'IC-Zeit Tracking',       sub: 'Discord Voice-Kanal Anwesenheit' },
  prices:    { title: 'Preisliste',             sub: 'Fahrschule & Servicepreise' },
  carmarket: { title: 'Fahrzeugmarkt',          sub: 'Private Fahrzeuginserate' },
  admin:      { title: 'Admin-Panel',            sub: 'Verwaltung & Kontrolle' },
  ausbildung: { title: 'Ausbildung',             sub: 'Gesellen- & Meisterprüfungen' },
  bans:       { title: 'Aktive Sperren',         sub: 'Hausverbot-Verwaltung' },
  search:     { title: 'Globale Suche',          sub: 'Sperren, Mitarbeiter & Register durchsuchen' },
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
}
function closeModal() { $('modalOverlay').classList.add('hidden'); }
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });

// ── Helpers ──────────────────────────────────────────────────────
const isAdmin      = () => currentUser?.role === 'admin';
const isAusbilder  = () => currentUser?.role === 'ausbilder' || currentUser?.role === 'admin';
const initials = n => (n || '?').split(/[_\s]/).map(p => p[0]).join('').toUpperCase().slice(0, 2);
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
window.previewListingImage = (inputId, thumbId, wrapId, clearId) => {
  const file = document.getElementById(inputId)?.files?.[0];
  if (!file) return;
  compressImage(file, 600, 0.65, b64 => {
    if (b64.length > 900000) { toast('Bild zu groß – bitte kleineres Foto wählen.', 'err'); return; }
    const t = document.getElementById(thumbId);
    const w = document.getElementById(wrapId);
    const c = document.getElementById(clearId);
    if (t) { t.src = b64; if (w) w.style.display = ''; }
    if (c) c.style.display = '';
    document.getElementById(inputId + 'Data').value = b64;
  });
};
window.clearListingImage = (inputId, thumbId, wrapId, clearId) => {
  const inp = document.getElementById(inputId);
  const w   = document.getElementById(wrapId);
  const c   = document.getElementById(clearId);
  if (inp) inp.value = '';
  if (w) w.style.display = 'none';
  if (c) c.style.display = 'none';
  document.getElementById(inputId + 'Data').value = '';
};

const avatarUrl = u => (u?.avatar && u?.discord_id)
  ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=64`
  : null;
function avatarEl(u, size = 36, cls = '') {
  const url = avatarUrl(u);
  if (url) return `<img src="${url}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover${cls?';'+cls:''}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--orange);display:none;align-items:center;justify-content:center;font-weight:700;font-size:${size*0.35}px;flex-shrink:0">${initials(u.username)}</div>`;
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${size*0.35}px;flex-shrink:0">${initials(u.username)}</div>`;
}
const loading = () => '<div class="loader-wrap"><div class="loader"></div></div>';

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
}

async function bootVoterApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.add('hidden');
  $('voterScreen').classList.remove('hidden');
  renderVoterScreen();
}

const _voterPageMeta = {
  price:     { title: 'Preisliste',       sub: 'Aktuelle Fahrschul- & Servicepreise' },
  vote:      { title: 'MdW-Abstimmung',   sub: 'Mitarbeiter der Woche wählen' },
  complaint: { title: 'Beschwerde',       sub: 'Anliegen an einen Admin senden' },
  market:    { title: 'Fahrzeugmarkt',    sub: 'Private Fahrzeuginserate von Bürgern' },
};

async function renderVoterScreen() {
  const [users, cv] = await Promise.all([
    fetch('/api/users/public').then(r => r.json()),
    fetch('/api/citizen-votes').then(r => r.json()),
  ]);
  const myVote = cv.myVoteFor;
  const tally  = {};
  cv.counts.forEach(c => { tally[c.nominee_id] = c.votes; });

  const avUrl = (currentUser.avatar && currentUser.discord_id)
    ? `https://cdn.discordapp.com/avatars/${currentUser.discord_id}/${currentUser.avatar}.png?size=64`
    : null;

  $('voterScreen').innerHTML = `
  <div class="app" style="height:100vh">

    <!-- ===== SIDEBAR ===== -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-label">Navigation</span>
      </div>
      <nav class="sidebar-nav">
        <a class="nav-item active" id="vnPrice"     onclick="voterTab('price')"    style="cursor:pointer"><i class="fas fa-tags"></i><span>Preisliste</span></a>
        <a class="nav-item"        id="vnVote"      onclick="voterTab('vote')"     style="cursor:pointer"><i class="fas fa-trophy"></i><span>MdW-Abstimmung</span></a>
        <a class="nav-item"        id="vnComplaint" onclick="voterTab('complaint')" style="cursor:pointer"><i class="fas fa-comment-alt"></i><span>Beschwerde</span></a>
        <a class="nav-item"        id="vnMarket"    onclick="voterTab('market')"   style="cursor:pointer;color:var(--muted)"><i class="fas fa-car-side" style="color:#f97316"></i><span>Fahrzeugmarkt</span></a>
        <a class="nav-item" href="/quiz" target="_blank" style="color:#22c55e"><i class="fas fa-graduation-cap" style="color:#22c55e"></i><span>Prüfungsvorbereitung</span></a>

        <!-- Minispiele -->
        <div id="vGamesToggle" onclick="(function(){var l=document.getElementById('vGamesList'),o=l.style.maxHeight!=='0px';l.style.maxHeight=o?'0px':'700px';document.getElementById('vGamesChev').style.transform=o?'rotate(-90deg)':'';})()" style="margin:.6rem .8rem .15rem;font-size:.6rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.08em;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding-right:.4rem;user-select:none">
          <span>Minispiele</span>
          <i id="vGamesChev" class="fas fa-chevron-down" style="font-size:.55rem;transition:transform .2s"></i>
        </div>
        <div id="vGamesList" style="overflow:hidden;transition:max-height .22s ease;max-height:700px">
          <a class="nav-item" href="/game"   target="_blank"><i class="fas fa-car"></i><span>Autorennen</span></a>
          <a class="nav-item" href="/game2"  target="_blank"><i class="fas fa-th-large"></i><span>Brick Breaker</span></a>
          <a class="nav-item" href="/game3"  target="_blank" style="color:#ef4444"><i class="fas fa-biohazard" style="color:#ef4444"></i><span>Dead Zone</span></a>
          <a class="nav-item" href="/game4"  target="_blank"><i class="fas fa-snake"></i><span>Snake</span></a>
          <a class="nav-item" href="/game5"  target="_blank"><i class="fas fa-th-large"></i><span>Tetris</span></a>
          <a class="nav-item" href="/game6"  target="_blank" style="color:#fbbf24"><i class="fas fa-dice" style="color:#fbbf24"></i><span>Book of Ra</span></a>
          <a class="nav-item" href="/game7"  target="_blank" style="color:#60a5fa"><i class="fas fa-helicopter" style="color:#60a5fa"></i><span>Sky Cop</span></a>
          <a class="nav-item" href="/game8"  target="_blank" style="color:#4ade80"><i class="fas fa-frog" style="color:#4ade80"></i><span>Doodle Jump</span></a>
          <a class="nav-item" href="/game9"  target="_blank" style="color:#f97316"><i class="fas fa-shield-alt" style="color:#f97316"></i><span>Tower Defense</span></a>
          <a class="nav-item" href="/game10" target="_blank" style="color:#f59e0b"><i class="fas fa-th" style="color:#f59e0b"></i><span>2048</span></a>
        </div>
      </nav>
      <div class="sidebar-bottom">
        <a class="nav-item" onclick="voterLogout()" style="cursor:pointer"><i class="fas fa-sign-out-alt"></i><span>Abmelden</span></a>
      </div>
    </aside>

    <!-- ===== MAIN ===== -->
    <div class="main-wrapper">
      <header class="topbar">
        <div>
          <h1 id="vPageTitle">Preisliste</h1>
          <p id="vPageSubtitle">Aktuelle Fahrschul- & Servicepreise</p>
        </div>
        <div class="user-widget">
          ${avUrl
            ? `<img class="u-avatar" src="${avUrl}" style="object-fit:cover" onerror="this.outerHTML='<div class=u-avatar>${(currentUser.username||'?')[0].toUpperCase()}</div>'">`
            : `<div class="u-avatar">${(currentUser.username||'?')[0].toUpperCase()}</div>`}
          <div class="u-info">
            <div class="u-name">${currentUser.username}</div>
            <div class="u-role">Bürger</div>
          </div>
        </div>
      </header>

      <div id="twitch-widget" style="padding:.6rem 1.5rem;border-bottom:1px solid var(--border);background:var(--surface)">
        <div class="twitch-card"><div class="twitch-offline-dot"></div><div style="font-size:.8rem;color:#9ca3af;margin-left:.5rem">Wird geladen…</div></div>
      </div>

      <main style="flex:1;overflow-y:auto;padding:1.25rem 1.5rem 5rem">

        <!-- Preisliste -->
        <div id="priceSection">
          <div id="voterPrices"><div style="text-align:center;padding:2rem;color:var(--muted)">Wird geladen…</div></div>
        </div>

        <!-- MdW-Abstimmung -->
        <div id="voteSection" style="display:none">
          <p style="color:var(--muted);font-size:.85rem;margin-bottom:1.25rem">
            ${myVote ? 'Du hast diese Woche bereits abgestimmt.' : 'Wähle einen ACLS-Mitarbeiter dieser Woche.'}
          </p>
          <div style="display:flex;flex-direction:column;gap:.6rem;max-width:600px">
          ${(users || []).map(u => {
            const av = (u.avatar && u.discord_id)
              ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=64` : null;
            const voted = myVote === u.id;
            const votes = tally[u.id] || 0;
            return `<div class="vote-item${voted ? ' voted' : ''}" ${!myVote ? `onclick="castCitizenVote(${u.id})"` : ''} style="cursor:${!myVote ? 'pointer' : 'default'}">
              ${av
                ? `<img src="${av}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`
                : `<div style="width:40px;height:40px;border-radius:50%;background:var(--orange);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;flex-shrink:0">${(u.username||'?')[0].toUpperCase()}</div>`}
              <div style="flex:1;min-width:0">
                <div class="vote-name">${u.username}</div>
                <div class="vote-count">${votes} Bürgerstimme${votes !== 1 ? 'n' : ''}</div>
              </div>
              ${voted
                ? '<span style="background:#f9731622;color:var(--orange);font-size:.72rem;font-weight:700;padding:.2rem .65rem;border-radius:20px;flex-shrink:0"><i class="fas fa-check"></i> Gewählt</span>'
                : (!myVote ? '<i class="fas fa-chevron-right" style="color:var(--muted);font-size:.75rem;flex-shrink:0"></i>' : '')}
            </div>`;
          }).join('')}
          </div>
        </div>

        <!-- Beschwerde -->
        <div id="complaintSection" style="display:none">
          <div style="max-width:600px">
            <div class="card" style="margin-bottom:1.25rem">
              <form onsubmit="submitComplaintForm(event)">
                <div class="form-group"><label>Dein Name (IC)</label><input class="form-control" id="cName" value="${currentUser.username||''}" required></div>
                <div class="form-group"><label>Betreff</label><input class="form-control" id="cSubject" placeholder="Kurze Zusammenfassung" required></div>
                <div class="form-group"><label>Nachricht</label><textarea class="form-control" id="cMessage" rows="4" placeholder="Beschreibe dein Anliegen ausführlich…" required style="resize:vertical"></textarea></div>
                <button type="submit" class="btn btn-primary" style="width:100%"><i class="fas fa-paper-plane"></i> Absenden</button>
              </form>
            </div>
            <div style="font-size:.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.75rem">Meine Beschwerden</div>
            <div id="my-complaints-list"><div style="color:var(--muted);font-size:.85rem">Wird geladen…</div></div>
          </div>
        </div>

        <!-- Fahrzeugmarkt -->
        <div id="marketSection" style="display:none">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;flex-wrap:wrap;gap:.75rem">
            <div></div>
            <button class="btn btn-primary btn-sm" onclick="openAddListing()"><i class="fas fa-plus"></i> Inserat erstellen</button>
          </div>
          <div id="voterListings" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem">
            <div style="text-align:center;padding:2rem;color:var(--muted)">Wird geladen…</div>
          </div>
        </div>

      </main>
    </div><!-- /main-wrapper -->
  </div>`;

  loadVoterPrices();
  loadTwitchWidget();
}

window.voterTab = tab => {
  ['price','vote','complaint','market'].forEach(t => {
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
  if (tab === 'market')    loadVoterMarket();
  if (tab === 'price')     loadVoterPrices();
  if (tab === 'complaint') loadMyComplaints();
};

async function loadVoterPrices() {
  const el = document.getElementById('voterPrices');
  if (!el || el.dataset.loaded) return;
  const rows = await fetch('/api/prices').then(r => r.json()).catch(() => []);
  if (!rows.length) { el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)">Keine Preise hinterlegt.</div>'; return; }

  const CAT_META = {
    'Fahrschule':   { icon: 'fa-graduation-cap', col: '#f97316', sub: 'Automatischer Kontoabzug' },
    'Kundenpreise': { icon: 'fa-hand-holding-usd', col: '#22c55e', sub: 'Bar auf Hand' },
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
          <div style="font-size:.83rem;font-weight:600">${item.name}</div>
          ${item.notes ? `<div style="font-size:.7rem;color:var(--muted)">${item.notes}</div>` : ''}
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
        ? `<div class="listing-img-wrap"><img class="listing-img" src="${l.image_data}" alt="${l.car}" loading="lazy"></div>`
        : `<div class="listing-no-img"><i class="fas fa-${isRent ? 'key' : 'car-side'}" style="color:var(--orange);font-size:1.6rem;opacity:.5"></i></div>`}
      <div style="padding:.85rem;display:flex;flex-direction:column;gap:.4rem;flex:1">
        <div>
          <div style="font-weight:800;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${l.car}">${l.car}</div>
          <div style="font-size:1.05rem;font-weight:800;color:#f97316">${l.price}$${isRent && dur ? `<span style="font-size:.72rem;font-weight:600;color:var(--muted);margin-left:.35rem">/ ${dur}</span>` : ''}</div>
        </div>
        <div>${listingTypeBadge(l)}</div>
        <div style="font-size:.8rem;color:var(--muted);display:flex;flex-direction:column;gap:.2rem">
          <div><i class="fas fa-user" style="width:14px;text-align:center;margin-right:.35rem"></i>${l.name}</div>
          <div><i class="fas fa-phone" style="width:14px;text-align:center;margin-right:.35rem"></i>${l.phone}</div>
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

window.submitComplaintForm = async e => {
  e.preventDefault();
  const r = await fetch('/api/complaints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ citizen_name: $('cName').value.trim(), citizen_discord_id: currentUser.discord_id, subject: $('cSubject').value.trim(), message: $('cMessage').value.trim() }),
  });
  if (r.ok) { toast('Beschwerde eingereicht!', 'ok'); $('cSubject').value = ''; $('cMessage').value = ''; loadMyComplaints(); }
  else toast('Fehler beim Senden', 'err');
};

async function loadMyComplaints() {
  const el = document.getElementById('my-complaints-list');
  if (!el) return;
  try {
    const data = await (await fetch('/api/my-complaints')).json();
    if (!data.length) { el.innerHTML = '<div style="color:var(--muted);font-size:.85rem">Noch keine Beschwerden eingereicht.</div>'; return; }
    const statusColor = s => s === 'offen' ? '#f59e0b' : s === 'in_bearbeitung' ? '#3b82f6' : '#22c55e';
    const statusLabel = s => s === 'offen' ? 'Offen' : s === 'in_bearbeitung' ? 'In Bearbeitung' : 'Gelöst';
    el.innerHTML = data.map(c => `
      <div style="border:1px solid var(--border);border-radius:var(--r);padding:.75rem 1rem;margin-bottom:.5rem">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
          <span style="font-weight:700;font-size:.9rem">${c.subject}</span>
          <span style="font-size:.72rem;font-weight:700;padding:.15rem .5rem;border-radius:20px;background:${statusColor(c.status)}22;color:${statusColor(c.status)}">${statusLabel(c.status)}</span>
        </div>
        <div style="font-size:.75rem;color:var(--muted)">${new Date(c.created_at).toLocaleDateString('de-DE')}</div>
        ${c.admin_response ? `<div style="margin-top:.5rem;padding:.5rem .75rem;background:var(--surface2);border-radius:6px;font-size:.82rem;border-left:3px solid #3b82f6"><span style="color:#3b82f6;font-weight:700;font-size:.72rem">Admin-Antwort:</span><br>${c.admin_response}</div>` : ''}
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
  if (r.ok) { toast('Stimme abgegeben!', 'ok'); renderVoterScreen(); }
  else toast(data.error || 'Fehler', 'err');
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
  renderUserWidget();
  $('adminNavItem').style.display     = isAdmin()     ? '' : 'none';
  $('ausbildungNavItem').style.display = isAusbilder() ? '' : 'none';
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      if (el.getAttribute('href') && !el.dataset.page) return; // external links open normally
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });
  navigate('dashboard');
  // Abzeichen alle 30 Minuten neu laden wenn Dashboard aktiv
  setInterval(() => { if (_activePage === 'dashboard') dashboard(); }, 30 * 60 * 1000);
}

function renderUserWidget() {
  const u = currentUser;
  const url = avatarUrl(u);
  $('userWidget').innerHTML = `
    <div class="u-avatar" style="${url ? 'background:transparent;padding:0' : ''}">
      ${url ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentElement.textContent='${initials(u.username)}'">` : initials(u.username)}
    </div>
    <div class="u-info">
      <div class="u-name">${u.username}</div>
      <div class="u-role">${u.role === 'admin' ? 'Administrator' : 'Mitarbeiter'}</div>
    </div>
    <button class="icon-btn" onclick="openProfileModal(${u.id})" title="Profil"><i class="fas fa-chevron-down"></i></button>
    <button class="icon-btn" onclick="logout()" title="Abmelden"><i class="fas fa-sign-out-alt"></i></button>`;
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  location.reload();
}

// ── Router ────────────────────────────────────────────────────────
function navigate(page) {
  if (page === 'admin'     && !isAdmin())     { toast('Kein Zugriff', 'err'); return; }
  if (page === 'ausbildung' && !isAusbilder()) { toast('Kein Zugriff', 'err'); return; }
  _activePage = page;
  if (leafletMap && page !== 'map') { leafletMap.remove(); leafletMap = null; }

  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  const p = PAGES[page] || PAGES.dashboard;
  $('pageTitle').textContent    = p.title;
  $('pageSubtitle').textContent = p.sub;
  $('pageContent').innerHTML    = loading();

  const renders = { dashboard, activity, eow, exams, registry, factions, map, iczeit, prices, carmarket, admin, ausbildung, bans, search };
  (renders[page] || dashboard)();
}

// ════════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════════
async function loadTwitchWidget() {
  try {
    const t = await (await fetch('/api/twitch-status')).json();
    const el = document.getElementById('twitch-widget');
    if (!el) return;
    const channelUrl = `https://www.twitch.tv/${t.channel}`;
    if (t.live) {
      el.innerHTML = `<div class="twitch-card">
        <div class="twitch-live-dot"></div>
        ${t.thumbnail ? `<img class="twitch-thumb" src="${t.thumbnail}" alt="Stream">` : ''}
        <div class="twitch-info">
          <div style="margin-bottom:.25rem">
            <span class="twitch-badge-live">LIVE</span>
            <span style="font-weight:700;font-size:.95rem;color:#c084fc">${t.channel}</span>
          </div>
          <div style="font-size:.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px" title="${t.title}">${t.title || ''}</div>
          <div style="font-size:.75rem;color:#9ca3af;margin-top:.2rem">
            ${t.game ? `<i class="fas fa-gamepad" style="margin-right:.3rem"></i>${t.game} &nbsp;·&nbsp; ` : ''}
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
            <span style="font-weight:700;font-size:.9rem;color:#9ca3af">${t.channel}</span>
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
  } catch {}
}

async function dashboard() {
  const [d, announcements, myBadgesRes] = await Promise.all([api('/api/dashboard'), api('/api/announcements'), api('/api/my-badges')]);
  if (!d) return;
  const myBadgesList = myBadgesRes?.badges || [];
  const badgeStats   = myBadgesRes?.stats  || { conducted: 0, eowWins: 0, icTotal: 0 };
  const earnedSet    = new Set(myBadgesList.map(b => b.badge_type));
  const badgeMap     = Object.fromEntries(myBadgesList.map(b => [b.badge_type, b.earned_at]));

  const eow      = d.eowWinner;
  const isCurWk  = d.isCurrentWeekWinner;
  const curWk    = d.currentWeek ? `KW ${isoWeek(d.currentWeek)}` : '';
  const top      = d.eowStandings?.[0];
  const rankBadge = i => `<div class="rank-badge${i === 1 ? '' : i === 2 ? ' r2' : ' r3'}"${i > 3 ? ' style="background:#2a2a2a;color:var(--muted)"' : ''}>${i}</div>`;

  // Karte 1: letzter/aktueller Gewinner
  const winnerCard = eow
    ? `<div class="eow-banner" style="flex:1">
         <div class="eow-av">${avatarUrl(eow) ? `<img src="${avatarUrl(eow)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(eow.username)}</div>
         <div class="eow-info">
           <div class="eow-label"><i class="fas fa-trophy" style="margin-right:.3rem"></i>Mitarbeiter der Woche · KW ${isoWeek(eow.week)}</div>
           <div class="eow-name">${eow.username}</div>
           <div style="font-size:.73rem;color:var(--muted);margin-top:.1rem">${eow.vote_count} Stimmen${isCurWk ? ' · Diese Woche' : ' · Letzte Woche'}</div>
         </div>
         <div class="eow-ml"><button class="btn btn-ghost btn-sm" onclick="navigate('eow')"><i class="fas fa-list"></i> Details</button></div>
       </div>`
    : `<div class="eow-banner" style="flex:1">
         <div class="eow-av" style="background:var(--surface2);color:var(--muted);font-size:1.4rem"><i class="fas fa-trophy"></i></div>
         <div class="eow-info">
           <div class="eow-label"><i class="fas fa-trophy" style="margin-right:.3rem"></i>Mitarbeiter der Woche</div>
           <div class="eow-name" style="color:var(--muted)">Noch kein Gewinner</div>
         </div>
       </div>`;

  // Karte 2: immer aktuellen Führenden zeigen; Label je nachdem ob schon ausgezählt
  const voteLabel = isCurWk ? 'Nächste Abstimmung' : 'Abstimmung läuft';
  const voteCard = top
    ? `<div class="eow-banner" style="flex:1;border-color:rgba(249,115,22,.25)">
         <div class="eow-av" style="border-color:rgba(249,115,22,.4)">${avatarUrl(top) ? `<img src="${avatarUrl(top)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials(top.username)}</div>
         <div class="eow-info">
           <div class="eow-label"><i class="fas fa-vote-yea" style="margin-right:.3rem"></i>${voteLabel} · ${curWk}</div>
           <div class="eow-name">${top.username} führt</div>
           <div style="font-size:.73rem;color:var(--muted);margin-top:.1rem">${top.votes} Stimmen · Auszählung Sonntag 18:00</div>
         </div>
         <div class="eow-ml"><button class="btn btn-primary btn-sm" onclick="navigate('eow')"><i class="fas fa-vote-yea"></i> Abstimmen</button></div>
       </div>`
    : `<div class="eow-banner" style="flex:1">
         <div class="eow-av" style="background:var(--surface2);color:var(--muted);font-size:1.4rem"><i class="fas fa-vote-yea"></i></div>
         <div class="eow-info">
           <div class="eow-label"><i class="fas fa-vote-yea" style="margin-right:.3rem"></i>${voteLabel} · ${curWk}</div>
           <div class="eow-name" style="color:var(--muted)">Noch keine Stimmen</div>
           <div style="font-size:.73rem;color:var(--muted);margin-top:.1rem">Auszählung: Sonntag 18:00 Uhr</div>
         </div>
         <div class="eow-ml"><button class="btn btn-primary btn-sm" onclick="navigate('eow')"><i class="fas fa-vote-yea"></i> Jetzt abstimmen</button></div>
       </div>`;

  $('pageContent').innerHTML = `
    <!-- Ankündigungen -->
    ${announcements?.length ? announcements.slice(0,3).map(a => `
    <div style="display:flex;align-items:flex-start;gap:1rem;padding:1rem 1.1rem;border-radius:var(--r);margin-bottom:.6rem;background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(249,115,22,.04));border:1px solid rgba(249,115,22,.3);border-left:4px solid var(--orange)">
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(249,115,22,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:.1rem">
        <i class="fas ${a.is_pinned ? 'fa-thumbtack' : 'fa-bullhorn'}" style="color:var(--orange);font-size:.85rem"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.3rem">
          <span style="font-weight:700;font-size:.95rem">${a.title}</span>
          ${a.is_pinned ? '<span style="font-size:.68rem;font-weight:700;padding:.1rem .4rem;border-radius:20px;background:rgba(249,115,22,.2);color:var(--orange);text-transform:uppercase;letter-spacing:.05em">Angeheftet</span>' : ''}
          <span style="font-size:.72rem;color:var(--muted);margin-left:auto">${a.author} · ${new Date(a.created_at).toLocaleDateString('de-DE')}</span>
        </div>
        <div style="font-size:.85rem;color:var(--fg);opacity:.85;white-space:pre-wrap;line-height:1.5">${a.content}</div>
      </div>
      ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="navigate('admin')" title="Verwalten" style="flex-shrink:0"><i class="fas fa-cog"></i></button>` : ''}
    </div>`).join('') : ''}

    <!-- EoW Banner (zwei Karten) -->
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:0">
      ${winnerCard}
      ${voteCard}
    </div>

    <!-- Twitch -->
    <div id="twitch-widget">
      <div class="twitch-card">
        <div class="twitch-offline-dot"></div>
        <div class="twitch-info">
          <div style="font-size:.8rem;color:#9ca3af">Wird geladen…</div>
        </div>
      </div>
    </div>

    <!-- 4 Stat cards -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Gesamt Prüfungen</div><div class="stat-val" data-countup="${d.total}">0</div></div>
        <div class="stat-ico o"><i class="fas fa-clipboard-list"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Bestanden</div><div class="stat-val g" data-countup="${d.passed}">0</div></div>
        <div class="stat-ico g"><i class="fas fa-check-circle"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Durchgefallen</div><div class="stat-val r" data-countup="${d.failed}">0</div></div>
        <div class="stat-ico r"><i class="fas fa-times-circle"></i></div>
      </div>
      <div class="stat-card">
        <div class="stat-info"><div class="stat-lbl">Erfolgsquote</div><div class="stat-val o" data-countup="${d.rate}" data-suffix="%">0%</div></div>
        <div class="stat-ico b"><i class="fas fa-chart-line"></i></div>
      </div>
    </div>

    <!-- Time cards -->
    <div class="time-row">
      <div class="time-card"><div class="time-lbl">Heute</div><div class="time-val" data-countup="${d.todayCount}">0</div></div>
      <div class="time-card"><div class="time-lbl">Diese Woche</div><div class="time-val" data-countup="${d.weekCount}">0</div></div>
      <div class="time-card"><div class="time-lbl">Dieser Monat</div><div class="time-val" data-countup="${d.monthCount}">0</div></div>
    </div>

    <!-- Letzte 3 Prüfungen — prominent -->
    ${d.lastExams.length ? `
    <div class="card last-exam-card">
      <div class="card-head">
        <div class="card-head-icon orange"><i class="fas fa-clipboard-check"></i></div>
        <div><div class="card-title">Zuletzt abgenommene Prüfungen</div><div class="card-sub">Die letzten 3 Prüfungen</div></div>
      </div>
      ${d.lastExams.slice(0,3).map(ex => `
      <div style="display:flex;align-items:center;gap:1rem;padding:.75rem 0;border-bottom:1px solid var(--border);last-child:border-bottom:none">
        <span class="badge ${ex.passed ? 'badge-g' : 'badge-r'}" style="min-width:100px;text-align:center">${ex.passed ? '✓ Bestanden' : '✗ Nicht bestanden'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ex.citizen_name}${ex.citizen_id ? ` <span style="font-size:.75rem;color:var(--muted);font-weight:400">${ex.citizen_id}</span>` : ''}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.1rem"><i class="fas ${ex.icon}" style="margin-right:.3rem"></i>${ex.category_name} – ${ex.exam_type} · Prüfer: ${ex.examiner_name}</div>
        </div>
        <div style="font-size:.78rem;color:var(--muted);white-space:nowrap">${ago(ex.registered_at)}</div>
      </div>`).join('')}
    </div>` : ''}

    <!-- Bottom grid -->
    <div class="dash-bottom">
      <!-- Top 5 -->
      <div class="card">
        <div class="card-head">
          <div class="card-head-icon green"><i class="fas fa-trophy"></i></div>
          <div><div class="card-title">Top 5 Mitarbeiter</div><div class="card-sub">Meiste Prüfungen</div></div>
        </div>
        ${d.top5.length ? d.top5.map((e, i) => `
          <div class="lb-item">
            ${rankBadge(i + 1)}
            <div style="display:flex;align-items:center;gap:.6rem;flex:1">
              <div style="width:30px;height:30px;flex-shrink:0">${avatarEl(e, 30)}</div>
              <div><div class="lb-name">${e.username}</div><div class="lb-sub">${e.count} Prüfungen</div></div>
            </div>
            <div class="lb-score"><i class="fas fa-fire"></i>${e.count}</div>
          </div>`).join('') : '<div class="empty"><i class="fas fa-trophy"></i><p>Keine Einträge</p></div>'}
      </div>

      <!-- Letzte Prüfungen Liste -->
      <div class="card">
        <div class="card-head">
          <div class="card-head-icon blue"><i class="fas fa-history"></i></div>
          <div><div class="card-title">Letzte Prüfungen</div><div class="card-sub">Aktuelle Aktivität</div></div>
        </div>
        ${d.lastExams.map(r => `
          <div class="re-item">
            <div class="re-ico ${r.passed ? 'pass' : 'fail'}"><i class="fas ${r.passed ? 'fa-check' : 'fa-times'}"></i></div>
            <div class="re-info">
              <div class="re-name">${r.citizen_name}</div>
              <div class="re-meta">
                <i class="fas ${r.icon}" style="font-size:.65rem"></i> ${r.exam_type}
                <span class="sep"></span>${r.category_name}
                <span class="sep"></span>${r.examiner_name}
              </div>
            </div>
            <div class="re-time">${ago(r.registered_at)}</div>
          </div>`).join('') || '<div class="empty"><i class="fas fa-history"></i><p>Keine Einträge</p></div>'}
      </div>
    </div>

    <!-- Meine Abzeichen -->
    <div class="card" style="margin-top:1.1rem">
      <div class="card-head">
        <div class="card-head-icon" style="background:rgba(250,204,21,.15)"><i class="fas fa-medal" style="color:#facc15"></i></div>
        <div><div class="card-title">Meine Abzeichen</div><div class="card-sub">${earnedSet.size} von ${Object.keys(BADGE_DEFS).length} freigeschaltet</div></div>
      </div>
      ${[
        { label: 'Prüfungen', icon: 'fa-clipboard-check', color: '#f97316', keys: ['cat_pkw','cat_motorrad','cat_boot','cat_lkw','cat_flugschein','exams_10','exams_50','exams_100'] },
        { label: 'IC-Zeit',   icon: 'fa-clock',           color: '#22c55e', keys: ['ic_10','ic_50','ic_100','ic_250','ic_500'] },
        { label: 'Mitarbeiter der Woche', icon: 'fa-trophy', color: '#facc15', keys: ['eow_1','eow_3','eow_5'] },
      ].map(group => {
        // Index des ersten noch nicht verdienten Abzeichens = nächstes Ziel
        const nextGoalIdx = group.keys.findIndex(k => !earnedSet.has(k));
        return `
        <div style="margin-bottom:1rem">
          <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.65rem;padding-bottom:.4rem;border-bottom:1px solid var(--border)">
            <i class="fas ${group.icon}" style="color:${group.color};font-size:.8rem"></i>
            <span style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)">${group.label}</span>
            ${nextGoalIdx === -1 ? `<span style="margin-left:auto;font-size:.65rem;font-weight:700;color:#22c55e"><i class="fas fa-check-circle"></i> Alle freigeschaltet</span>` : ''}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.75rem">
            ${group.keys.map((key, i) => {
              const b      = BADGE_DEFS[key];
              const earned = earnedSet.has(key);
              const isNext = i === nextGoalIdx;
              const date   = badgeMap[key] ? new Date(badgeMap[key]).toLocaleDateString('de-DE') : null;
              return renderBadge(key, b, earned, isNext, date, badgeStats);
            }).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- IC-Zeit Widget -->
    ${d.icWeekTop?.some(u => u.hours > 0) ? `
    <div class="card" style="margin-top:1.1rem">
      <div class="card-head">
        <div class="card-head-icon orange"><i class="fas fa-clock"></i></div>
        <div><div class="card-title">IC-Zeit diese Woche</div><div class="card-sub">Top Mitarbeiter</div></div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('iczeit')" style="margin-left:auto">Alle anzeigen</button>
      </div>
      ${d.icWeekTop.filter(u => u.hours > 0).map((u, i) => `
        <div class="lb-item">
          <div class="rank-badge${i === 0 ? '' : i === 1 ? ' r2' : ' r3'}">${i + 1}</div>
          <div style="display:flex;align-items:center;gap:.6rem;flex:1">
            <div style="width:30px;height:30px;flex-shrink:0">${avatarEl(u, 30)}</div>
            <div class="lb-name">${u.username}</div>
          </div>
          <div class="lb-score"><i class="fas fa-clock"></i>${(+u.hours).toFixed(1)}h</div>
        </div>`).join('')}
    </div>` : ''}`;
  animateCountUps();
  requestAnimationFrame(() => requestAnimationFrame(animateBadgeRings));
  loadTwitchWidget();
  clearInterval(dashboard._twitchPoll);
  dashboard._twitchPoll = setInterval(loadTwitchWidget, 2 * 60 * 1000);
  connectSSE();
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
    _sseSource.onerror = () => { _sseSource.close(); _sseSource = null; setTimeout(connectSSE, 30_000); };
  } catch {}
}

// ════════════════════════════════════════════════════════════════
//  GLOBALE SUCHE
// ════════════════════════════════════════════════════════════════
async function search() {
  $('pageContent').innerHTML = `
    <div class="pg-header"><div class="pg-header-left"><h2>Globale Suche</h2><p>Durchsuche Sperren, Mitarbeiter und Prüfungsregister</p></div></div>
    <div style="display:flex;gap:.75rem;margin-bottom:1.5rem">
      <input class="form-control" id="search-input" placeholder="Name, Discord-ID, Sperrgrund…" style="max-width:480px;flex:1" oninput="runSearch(this.value)">
    </div>
    <div id="search-results"><div style="color:var(--muted);font-size:.9rem;padding:1rem 0">Mindestens 2 Zeichen eingeben…</div></div>`;
  setTimeout(() => $('search-input')?.focus(), 50);
}

let _searchTimer = null;
window.runSearch = q => {
  clearTimeout(_searchTimer);
  if (q.length < 2) { $('search-results').innerHTML = '<div style="color:var(--muted);font-size:.9rem;padding:1rem 0">Mindestens 2 Zeichen eingeben…</div>'; return; }
  $('search-results').innerHTML = '<div style="color:var(--muted);font-size:.9rem;padding:1rem 0"><i class="fas fa-spinner fa-spin"></i> Suche läuft…</div>';
  _searchTimer = setTimeout(async () => {
    const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (!data) return;
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
            <div style="font-weight:700;font-size:.9rem">${b.person_name}${b.person_id ? ` <span style="color:var(--muted);font-weight:400;font-size:.8rem">${b.person_id}</span>` : ''}</div>
            <div style="font-size:.78rem;color:var(--muted);margin-top:.15rem">${b.reason}</div>
          </div>
          <span class="badge ${b.is_active ? 'badge-r' : ''}" style="${!b.is_active ? 'background:var(--surface2);color:var(--muted)' : ''}">${b.is_active ? 'Aktiv' : 'Aufgehoben'}</span>
          <span style="font-size:.75rem;color:var(--muted);white-space:nowrap">von ${b.issued_by_name}</span>
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
          <div style="flex:1"><div style="font-weight:600;font-size:.9rem">${u.username}</div><div style="font-size:.75rem;color:var(--muted)">${u.role} · ${u.rank || '—'}</div></div>
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
            <div style="font-weight:600;font-size:.9rem">${r.citizen_name}${r.citizen_id ? ` <span style="color:var(--muted);font-weight:400">${r.citizen_id}</span>` : ''}</div>
            <div style="font-size:.75rem;color:var(--muted)">${r.category_name} · ${r.exam_type} · Prüfer: ${r.examiner_name}</div>
          </div>
          <span class="badge ${r.passed ? 'badge-g' : 'badge-r'}">${r.passed ? 'Bestanden' : 'Nicht bestanden'}</span>
          <span style="font-size:.75rem;color:var(--muted);white-space:nowrap">${new Date(r.registered_at).toLocaleDateString('de-DE')}</span>
        </div>`).join('')}
      </div>`;
    }

    if (!data.bans.length && !data.users.length && !data.registry.length) {
      html = '<div style="color:var(--muted);font-size:.9rem;padding:1rem 0">Keine Ergebnisse gefunden.</div>';
    }
    $('search-results').innerHTML = html;
  }, 300);
};

// ════════════════════════════════════════════════════════════════
//  ACTIVITY
// ════════════════════════════════════════════════════════════════
async function activity() {
  const [reg, bansData, ic] = await Promise.all([
    api('/api/registry'), api('/api/bans'), api('/api/ic-log'),
  ]);
  if (!reg) return;

  const events = [
    ...(reg || []).map(r => ({ date: r.registered_at, dot: r.passed ? 'g' : 'r', text: `<b>${r.citizen_name}</b> – ${r.category_name} ${r.exam_type} (${r.passed ? 'Bestanden' : 'Nicht bestanden'}) | Prüfer: ${r.examiner_name}` })),
    ...(bansData || []).map(b => ({ date: b.issued_at, dot: 'r', text: `Hausverbot: <b>${b.person_name}</b> – ${b.reason}` })),
    ...(ic || []).filter(e => e.auto).map(e => ({ date: e.created_at, dot: 'o', text: `IC-Zeit: <b>${e.user_name}</b> – ${(+e.hours).toFixed(1)}h ${e.notes ? '(' + e.notes + ')' : ''}` })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 60);

  $('pageContent').innerHTML = `
    <div class="pg-header"><div class="pg-header-left"><h2>Aktivitätslog</h2><p>${events.length} Einträge</p></div></div>
    <div class="card">
      ${events.length ? events.map(ev => `
        <div class="act-item">
          <div class="act-dot ${ev.dot}"></div>
          <div class="act-text">${ev.text}</div>
          <div class="act-time">${ago(ev.date)}</div>
        </div>`).join('') : '<div class="empty"><i class="fas fa-stream"></i><p>Keine Aktivitäten</p></div>'}
    </div>`;
}

// ════════════════════════════════════════════════════════════════
//  EMPLOYEE OF THE WEEK
// ════════════════════════════════════════════════════════════════
async function eow() {
  const [data, users] = await Promise.all([api('/api/eow'), api('/api/users')]);
  if (!data) return;

  const candidates = (users || []).filter(u => u.is_active);
  const myVote     = data.myVoteFor;
  const tally      = {};
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
              <div style="font-weight:700;font-size:.88rem">${w.username}</div>
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
            <div class="card-sub">${myVote ? 'Du hast bereits abgestimmt' : 'Klicke auf einen Mitarbeiter um deine Stimme abzugeben'} · Auszählung: Sonntag 18:00 Uhr</div>
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
            const canVote = !myVote && !isSelf;
            const total   = (tally[u.id] || 0) + (citTally[u.id] || 0);
            return `
            <div onclick="${canVote ? `confirmVote(${u.id},'${u.username.replace(/'/g,"\\'")}')` : ''}"
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
              <div style="font-weight:700;font-size:.9rem">${u.username}${isSelf ? ' <span style="font-size:.7rem;font-weight:400;color:var(--muted)">(Du)</span>' : ''}</div>
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

window.confirmVote = (nominee_id, username) => {
  openModal(`
    <div class="modal-head">
      <div class="modal-title"><i class="fas fa-vote-yea" style="margin-right:.5rem;color:var(--orange)"></i>Stimme abgeben</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="padding:.75rem 0;text-align:center">
      <p style="font-size:1rem;margin-bottom:.5rem">Möchtest du <strong>${username}</strong> als</p>
      <p style="font-size:1rem">Mitarbeiter der Woche wählen?</p>
      <p style="font-size:.8rem;color:var(--muted);margin-top:.75rem">Diese Entscheidung kann nicht rückgängig gemacht werden.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="castVote(${nominee_id})"><i class="fas fa-check"></i> Ja, wählen</button>
    </div>`);
};
window.castVote = async nominee_id => {
  closeModal();
  const r = await api('/api/eow/vote', { method: 'POST', body: { nominee_id } });
  if (r) { toast('Stimme abgegeben!', 'ok'); eow(); }
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
    <p style="font-size:.85rem;color:var(--muted);margin-bottom:1rem">
      Fülle die Daten des Prüflings aus. Die Person wird nach Bestehen automatisch ins Bürgerregister eingetragen.
    </p>
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
          <div style="font-size:.85rem"><span style="color:var(--muted)">Grund:</span> ${b.reason}</div>
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
      <div class="quiz-q">${qst.question}</div>
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
            <div class="opt-letter">${'ABCD'[i]}</div><div>${opt}</div>
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
  const ROUTE_IMGS = { PKW: '/pkw-route.png', LKW: '/lkw-route.png', Motorrad: '/bike-route.png', Flugschein: '/heli-route.png' };
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
    ${citizens.length ? citizens.map(c => {
      const passed   = c.entries.filter(e => e.passed);
      const licenses = [...new Map(passed.map(e => [e.category_name, e])).values()];
      const latest   = c.entries.reduce((a, b) => new Date(a.registered_at) > new Date(b.registered_at) ? a : b);
      return `
      <div class="card" style="margin-bottom:.75rem">
        <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;cursor:pointer" onclick="this.parentElement.querySelector('.reg-detail').classList.toggle('hidden')">
          <div style="width:42px;height:42px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;color:var(--orange);flex-shrink:0">
            ${c.name.trim()[0].toUpperCase()}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.98rem">${c.name}${c.citizenId ? ` <span style="font-size:.75rem;color:var(--muted);font-weight:400">${c.citizenId}</span>` : ''}</div>
            <div style="font-size:.75rem;color:var(--muted);margin-top:.15rem">Letzter Eintrag: ${fmt(latest.registered_at)}</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.4rem;align-items:center">
            ${licenses.length ? licenses.map(e => `
              <span title="${e.category_name} – Bestanden" style="display:inline-flex;align-items:center;gap:.3rem;font-size:.72rem;font-weight:700;padding:.2rem .55rem;border-radius:20px;background:${(CAT_COLORS[e.category_name]||'#6b7280')}22;color:${CAT_COLORS[e.category_name]||'#6b7280'};border:1px solid ${(CAT_COLORS[e.category_name]||'#6b7280')}44">
                <i class="fas ${e.icon}"></i>${e.category_name}
              </span>`).join('') : `<span style="font-size:.72rem;color:var(--muted)">Keine Lizenz</span>`}
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
                  <td><i class="fas ${e.icon}" style="color:${CAT_COLORS[e.category_name]||'var(--orange)'};margin-right:.35rem"></i>${e.category_name}</td>
                  <td><span class="badge ${e.exam_type === 'Praxis' ? 'badge-b' : 'badge-m'}">${e.exam_type}</span></td>
                  <td>${e.examiner_name}</td>
                  <td>${fmt(e.registered_at)}</td>
                  <td><span class="badge ${e.passed ? 'badge-g' : 'badge-r'}">${e.passed ? 'Bestanden' : 'Nicht bestanden'}</span></td>
                  ${isAdmin() ? `<td><button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteRegistry(${e.id})"><i class="fas fa-trash"></i></button></td>` : ''}
                </tr>${wrongQs.length ? `<tr style="background:rgba(239,68,68,.04)">
                  <td colspan="${cols}" style="padding:.45rem .9rem .6rem">
                    <div style="font-size:.72rem;font-weight:700;color:#ef4444;margin-bottom:.3rem"><i class="fas fa-times-circle" style="margin-right:.3rem"></i>Falsch beantwortet (${wrongQs.length})</div>
                    <ul style="margin:0;padding-left:1.1rem;font-size:.78rem;color:#fca5a5;line-height:1.6">${wrongQs.map(q => `<li>${q}</li>`).join('')}</ul>
                  </td>
                </tr>` : ''}`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    }).join('') : `<div class="empty"><i class="fas fa-id-card"></i><p>Keine Einträge gefunden</p></div>`}`;

  window._regCats = cats;
  const si = $('regSearch');
  if (si && document.activeElement !== si) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
}

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
          <select class="form-control" id="rCat">${cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
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
            <td style="font-weight:600;color:var(--text)">${f.name}</td>
            <td><div style="display:flex;align-items:center;gap:.4rem"><span class="swatch" style="background:${f.primary_color || '#333'}"></span>${f.primary_color || '—'}</div></td>
            <td><div style="display:flex;align-items:center;gap:.4rem"><span class="swatch" style="background:${f.secondary_color || '#333'}"></span>${f.secondary_color || '—'}</div></td>
            <td><div style="display:flex;align-items:center;gap:.4rem"><span class="swatch" style="background:${f.pearl_color || '#333'}"></span>${f.pearl_color || '—'}</div></td>
            <td style="color:var(--muted)">${f.notes || '—'}</td>
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
      <div class="form-group"><label>Name</label><input class="form-control" id="fName" value="${f?.name || ''}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Primärfarbe</label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <input type="color" id="fPC" value="${f?.primary_color || '#f97316'}" style="width:42px;height:38px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background:var(--input)">
            <input class="form-control" id="fPrim" value="${f?.primary_color || '#f97316'}">
          </div>
        </div>
        <div class="form-group"><label>Sekundärfarbe</label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <input type="color" id="fSC" value="${f?.secondary_color || '#1c1c1c'}" style="width:42px;height:38px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background:var(--input)">
            <input class="form-control" id="fSec" value="${f?.secondary_color || '#1c1c1c'}">
          </div>
        </div>
      </div>
      <div class="form-group"><label>Pearl-Farbe</label>
        <div style="display:flex;gap:.5rem;align-items:center">
          <input type="color" id="fLC" value="${f?.pearl_color || '#ffffff'}" style="width:42px;height:38px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background:var(--input)">
          <input class="form-control" id="fPrl" value="${f?.pearl_color || '#ffffff'}">
        </div>
      </div>
      <div class="form-group"><label>Notizen</label><input class="form-control" id="fNotes" value="${f?.notes || ''}"></div>
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
  const spots = await api('/api/map-spots');
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
        ${[['tow','#f97316','Abschlepphof'],['exam','#22c55e','Prüfungsort'],['Felder','#3b82f6','Felder'],['Hotspot','#ec4899','Hotspot'],['Gangs/Familien','#eab308','Gangs/Familien'],['other','#6b7280','Sonstiges']].map(([type,color,label])=>`
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
              <td style="font-weight:600;color:var(--text)">${s.name}</td>
              <td>${s.description || '—'}</td>
              <td><span style="font-size:.75rem;padding:.15rem .55rem;border-radius:6px;font-weight:600;background:${({'tow':'#f9731622','exam':'#22c55e22','Felder':'#3b82f622','Hotspot':'#ec4b9922','Gangs/Familien':'#eab30822'}[s.spot_type]||'#6b728022')};color:${({'tow':'#f97316','exam':'#22c55e','Felder':'#3b82f6','Hotspot':'#ec4899','Gangs/Familien':'#eab308'}[s.spot_type]||'#6b7280')}">${s.spot_type}</span></td>
              <td>${s.created_by_name || '—'}</td>
              <td>${isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="deleteSpot(${s.id})"><i class="fas fa-trash"></i></button>` : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  initLeafletMap(spots);
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
  L.imageOverlay('/gta-map.png', bounds, { opacity: 1, zIndex: 1, className: 'gta-map-img' }).addTo(leafletMap);

  leafletMap.fitBounds(bounds, { padding: [4, 4] });

  const spotColor = t => ({ tow:'#f97316', exam:'#22c55e', Felder:'#3b82f6', Hotspot:'#ec4899', 'Gangs/Familien':'#eab308' }[t] || '#6b7280');

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
        <div style="font-weight:700;margin-bottom:.25rem">${s.name}</div>
        ${s.description ? `<div style="font-size:.8rem;color:#888;margin-bottom:.35rem">${s.description}</div>` : ''}
        <span style="font-size:.75rem;background:${color}22;color:${color};border-radius:4px;padding:.1rem .4rem;border:1px solid ${color}44">${s.spot_type}</span>
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
        <select class="form-control" id="spType"><option>tow</option><option>exam</option><option>Felder</option><option>Hotspot</option><option>Gangs/Familien</option><option>other</option></select>
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
            <span style="font-weight:600">${s.username}</span>
            <span style="color:var(--muted)">${s.channelName}</span>
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
              <div style="flex:1;font-size:.87rem;font-weight:600">${u.username}</div>
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
                <td style="font-weight:600;color:var(--text)">${u.username}</td>
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
              <td style="font-weight:600;color:var(--text)">${e.user_name}</td>
              <td style="color:var(--orange);font-weight:700">${(+e.hours).toFixed(1)}h</td>
              <td style="color:var(--muted)">${e.notes || '—'}</td>
              <td>${e.auto ? '<span class="badge badge-b"><i class="fab fa-discord"></i> Bot</span>' : `<span class="badge badge-m">${e.logged_by_name || 'Manuell'}</span>`}</td>
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
        <select class="form-control" id="icUser">${(users || []).map(u => `<option value="${u.id}">${u.username}</option>`).join('')}</select>
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
            <td style="font-weight:600;color:var(--text)">${b.person_name}</td>
            <td>${b.person_id || '—'}</td>
            <td>${b.reason}</td>
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
    'Fahrschule':   { icon: 'fa-graduation-cap', col: '#f97316', sub: 'Rechnungspreis – wird automatisch vom Konto abgezogen' },
    'Kundenpreise': { icon: 'fa-hand-holding-usd', col: '#22c55e', sub: 'Bar auf Hand' },
  };

  const canEdit = isAdmin() || currentUser?.role === 'member' || currentUser?.role === 'ausbilder';

  $('pageContent').innerHTML = `
    <div class="pg-header">
      <div class="pg-header-left"><h2>Preisliste</h2><p>${rows.length} Einträge in ${Object.keys(cats).length} Kategorien</p></div>
      ${canEdit ? `<button class="btn btn-primary" onclick="openAddPrice()"><i class="fas fa-plus"></i> Preis hinzufügen</button>` : ''}
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
                <div style="font-weight:600;font-size:.88rem">${item.name}</div>
                ${item.notes ? `<div style="font-size:.72rem;color:var(--muted);margin-top:.1rem">${item.notes}</div>` : ''}
              </div>
              <div style="font-size:.95rem;font-weight:800;color:${m.col};white-space:nowrap">${item.price}</div>
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
        <div class="form-group"><label>Kategorie</label><input class="form-control" id="epCat" value="${item.category}" required></div>
        <div class="form-group"><label>Bezeichnung</label><input class="form-control" id="epName" value="${item.name}" required></div>
      </div>
      <div class="form-group"><label>Preis</label><input class="form-control" id="epPrice" value="${item.price}" required></div>
      <div class="form-group"><label>Hinweis (optional)</label><input class="form-control" id="epNotes" value="${item.notes||''}"></div>
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
        <img src="${l.image_data}" style="width:100%;max-height:290px;object-fit:cover;display:block;border-radius:var(--rl) var(--rl) 0 0">
        <button onclick="closeModal()" style="position:absolute;top:.65rem;right:.65rem;background:rgba(0,0,0,.55);border:none;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.9rem;backdrop-filter:blur(4px)"><i class="fas fa-times"></i></button>
      </div>` : `
      <div class="modal-head">
        <div class="modal-title"><i class="fas fa-car-side" style="color:var(--orange);margin-right:.5rem"></i>${l.car}</div>
        <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
      </div>`}
    <div style="padding:1.25rem 1.5rem 1.5rem">
      ${l.image_data ? `<h2 style="font-size:1.25rem;font-weight:800;margin:0 0 .2rem;padding-right:1rem">${l.car}</h2>` : ''}
      <div style="font-size:1.45rem;font-weight:800;color:#f97316;margin-bottom:.5rem">
        ${l.price}$${isRent && dur ? `<span style="font-size:.85rem;font-weight:600;color:var(--muted);margin-left:.4rem">/ ${dur}</span>` : ''}
      </div>
      <div style="margin-bottom:1rem">${listingTypeBadge(l)}</div>
      <div style="display:flex;flex-direction:column;gap:.7rem;border-top:1px solid var(--border);padding-top:1rem">
        <div style="display:flex;align-items:center;gap:.85rem">
          <div style="width:36px;height:36px;border-radius:9px;background:#f9731618;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-user" style="color:#f97316;font-size:.85rem"></i></div>
          <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.1rem">Anbieter</div><div style="font-weight:700">${l.name}</div></div>
        </div>
        <div style="display:flex;align-items:center;gap:.85rem">
          <div style="width:36px;height:36px;border-radius:9px;background:#f9731618;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-phone" style="color:#f97316;font-size:.85rem"></i></div>
          <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.1rem">Telefon</div><div style="font-weight:700">${l.phone}</div></div>
        </div>
        ${l.notes ? `
        <div style="display:flex;align-items:flex-start;gap:.85rem">
          <div style="width:36px;height:36px;border-radius:9px;background:#f9731618;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-align-left" style="color:#f97316;font-size:.85rem"></i></div>
          <div><div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.1rem">Beschreibung</div><div style="line-height:1.55">${l.notes}</div></div>
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
      ? `<div class="listing-img-wrap"><img class="listing-img" src="${l.image_data}" alt="${l.car}" loading="lazy"></div>`
      : `<div class="listing-no-img"><i class="fas fa-${isRent ? 'key' : 'car-side'}" style="color:var(--orange);font-size:1.6rem;opacity:.45"></i></div>`}
    <div style="padding:.9rem;display:flex;flex-direction:column;gap:.45rem;flex:1">
      <div>
        <div style="font-weight:800;font-size:1.05rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${l.car}">${l.car}</div>
        <div style="font-size:1.1rem;font-weight:800;color:#f97316">${l.price}$${isRent && dur ? `<span style="font-size:.75rem;font-weight:600;color:var(--muted);margin-left:.3rem">/ ${dur}</span>` : ''}</div>
      </div>
      <div>${listingTypeBadge(l)}</div>
      <div style="display:flex;flex-direction:column;gap:.2rem;font-size:.83rem;color:var(--muted)">
        <div><i class="fas fa-user" style="width:14px;text-align:center;margin-right:.35rem"></i>${l.name}</div>
        <div><i class="fas fa-phone" style="width:14px;text-align:center;margin-right:.35rem"></i>${l.phone}</div>
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
      <div class="form-group"><label>Dein Name *</label><input class="form-control" id="lName" placeholder="Vor- und Nachname (IC)" required value="${currentUser?.username || ''}"></div>
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
  const imgData = document.getElementById('lImageData')?.value || null;
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
      <div class="form-group"><label>Fahrzeug *</label><input class="form-control" id="elCar" value="${l.car}" required></div>
      <div class="form-row">
        <div class="form-group"><label id="elPriceLabel">${isRent ? 'Mietpreis *' : 'Wunschpreis *'}</label><input class="form-control" id="elPrice" value="${l.price}" oninput="fmtListingPrice(this)" required></div>
        <div class="form-group"><label>Telefonnummer *</label><input class="form-control" id="elPhone" value="${l.phone}" required></div>
      </div>
      <div class="form-group"><label>Name *</label><input class="form-control" id="elName" value="${l.name}" required></div>
      <div class="form-group"><label>Notizen</label><textarea class="form-control" id="elNotes" rows="3" style="resize:vertical">${l.notes || ''}</textarea></div>
      <div class="form-group">
        <label>Fahrzeugfoto</label>
        <input type="hidden" id="elImageData" value="">
        <div id="elImgPreview" style="display:none;margin-bottom:.5rem">
          <img id="elImgThumb" style="width:100%;max-height:140px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">
        </div>
        <div style="display:flex;gap:.5rem">
          <div class="img-upload-area" style="flex:1" onclick="document.getElementById('elImage').click()">
            <i class="fas fa-camera" style="color:var(--orange);margin-bottom:.3rem;display:block;font-size:1rem"></i>
            <div style="font-size:.78rem;color:var(--muted)">Neues Foto hochladen</div>
          </div>
          <button type="button" id="elImgClear" class="btn btn-ghost btn-sm" style="display:none;color:#ef4444;align-self:center" onclick="clearListingImage('elImage','elImgThumb','elImgPreview','elImgClear')">
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
  const imgData = document.getElementById('elImageData')?.value || undefined;
  const r = await api(`/api/car-listings/${id}`, { method: 'PATCH', body: {
    car:          document.getElementById('elCar').value,
    price:        document.getElementById('elPrice').value,
    phone:        document.getElementById('elPhone').value,
    name:         document.getElementById('elName').value,
    notes:        document.getElementById('elNotes').value,
    listing_type: document.getElementById('elTypeVal').value,
    duration:     document.getElementById('elDuration')?.value || null,
    ...(imgData !== undefined && { image_data: imgData || null }),
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

  $('pageContent').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:1rem">
      <button class="btn btn-ghost" onclick="enterCitizenView()"><i class="fas fa-eye" style="margin-right:.4rem"></i>Bürgeransicht</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;align-items:start">
      <div style="display:flex;flex-direction:column;gap:1rem"><!-- col-left -->
      <div class="card">
        <div class="card-head"><div class="card-head-icon orange"><i class="fas fa-users"></i></div>
        <div><div class="card-title">Benutzerverwaltung</div><div class="card-sub">${users.filter(u => u.is_active).length} Nutzer</div></div></div>
        <button class="btn btn-primary btn-sm" onclick="openAddUser()" style="margin-bottom:.85rem"><i class="fas fa-user-plus"></i> Nutzer hinzufügen</button>
        <div class="tbl-wrap" style="max-height:340px;overflow-y:auto">
          <table class="data-tbl">
            <thead><tr><th>Name</th><th>Rolle / Rang</th><th></th><th></th></tr></thead>
            <tbody>
              ${users.filter(u => u.is_active).map(u => `<tr>
                <td>
                  <div style="display:flex;align-items:center;gap:.6rem">
                    ${avatarEl(u, 26)}
                    <span style="font-weight:600;font-size:.85rem">${u.username}</span>
                  </div>
                </td>
                <td>
                  <div style="display:flex;flex-direction:column;gap:.3rem">
                    <select class="form-control" style="padding:.2rem .4rem;height:auto;font-size:.8rem;width:auto"
                      onchange="setRole(${u.id}, this.value)">
                      <option value="member"    ${u.role === 'member'    ? 'selected' : ''}>Mitarbeiter</option>
                      <option value="ausbilder" ${u.role === 'ausbilder' ? 'selected' : ''}>Ausbilder</option>
                      <option value="admin"     ${u.role === 'admin'     ? 'selected' : ''}>Admin</option>
                      <option value="citizen"   ${u.role === 'citizen'   ? 'selected' : ''}>Bürger</option>
                    </select>
                    <select class="form-control" style="padding:.2rem .4rem;height:auto;font-size:.8rem;width:auto"
                      onchange="setRank(${u.id}, this.value)">
                      ${['Azubi','Mitarbeiter','Senior','Führungskraft'].map(r => `<option ${(u.rank||'Mitarbeiter')===r?'selected':''}>${r}</option>`).join('')}
                    </select>
                  </div>
                </td>
                <td style="display:flex;gap:.35rem;align-items:center">
                  <button class="btn btn-ghost btn-sm" onclick="openProfileModal(${u.id})" title="Statistiken">
                    <i class="fas fa-chart-bar"></i>
                  </button>
                  <button class="btn btn-ghost btn-sm" onclick="openRenameUser(${u.id},'${u.username.replace(/'/g,"\\'")}')" title="Namen ändern">
                    <i class="fas fa-pen"></i>
                  </button>
                </td>
                <td>
                  <button class="btn btn-danger btn-sm" onclick="removeUser(${u.id})"><i class="fas fa-trash"></i></button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-head-icon" style="background:rgba(239,68,68,.15)"><i class="fas fa-comment-alt" style="color:#ef4444"></i></div>
        <div><div class="card-title">Beschwerden</div><div class="card-sub">${(complaints||[]).filter(c=>c.status==='offen').length} offen</div></div></div>
        ${(complaints || []).length ? `
        <div class="tbl-wrap" style="max-height:340px;overflow-y:auto"><table class="data-tbl">
          <thead><tr><th>Bürger</th><th>Betreff</th><th>Nachricht</th><th>Datum</th><th>Status</th><th></th></tr></thead>
          <tbody>${complaints.map(c => `<tr style="cursor:pointer" onclick="openComplaint(${c.id})">
            <td style="font-weight:600">${c.citizen_name}</td>
            <td>${c.subject}</td>
            <td style="font-size:.8rem;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.message}</td>
            <td style="font-size:.78rem;color:var(--muted)">${new Date(c.created_at).toLocaleDateString('de-DE')}</td>
            <td><span style="font-size:.75rem;padding:.15rem .5rem;border-radius:6px;font-weight:600;background:${c.status==='offen'?'rgba(239,68,68,.15)':'rgba(34,197,94,.15)'};color:${c.status==='offen'?'#ef4444':'#22c55e'}">${c.status}</span></td>
            <td onclick="event.stopPropagation()" style="display:flex;gap:.3rem">
              ${c.status==='offen'?`<button class="btn btn-ghost btn-sm" onclick="resolveComplaint(${c.id},'erledigt')"><i class="fas fa-check"></i></button>`:`<button class="btn btn-ghost btn-sm" onclick="resolveComplaint(${c.id},'offen')"><i class="fas fa-undo"></i></button>`}
            </td>
          </tr>`).join('')}</tbody>
        </table></div>` : '<div class="empty" style="padding:1rem"><p>Keine Beschwerden eingereicht</p></div>'}
      </div>
    </div><!-- /col-left -->

    <div style="display:flex;flex-direction:column;gap:1rem"><!-- col-right -->
      <div class="card">
        <div class="card-head"><div class="card-head-icon blue"><i class="fas fa-question-circle"></i></div>
        <div><div class="card-title">Fragenverwaltung</div><div class="card-sub">${cats?.reduce((s,c)=>s+c.question_count,0)||0} Fragen total</div></div></div>
        <button class="btn btn-primary btn-sm" onclick="openAddQuestion()" style="margin-bottom:.85rem"><i class="fas fa-plus"></i> Frage hinzufügen</button>
        ${(cats || []).map(cat => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:.55rem .75rem;background:var(--input);border-radius:var(--r);margin-bottom:.4rem">
            <div style="display:flex;align-items:center;gap:.6rem">
              <i class="fas ${cat.icon}" style="color:var(--orange);width:16px;text-align:center"></i>
              <span style="font-size:.88rem;font-weight:600">${cat.name}</span>
            </div>
            <div style="display:flex;align-items:center;gap:.5rem">
              <span class="badge badge-m">${cat.question_count} Fragen</span>
              <button class="btn btn-ghost btn-sm" onclick="manageQuestions(${cat.id},'${cat.name}','${cat.icon}')"><i class="fas fa-cog"></i></button>
            </div>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-head"><div class="card-head-icon orange"><i class="fas fa-bullhorn"></i></div>
        <div><div class="card-title">Schwarzes Brett</div><div class="card-sub">${announcements?.length || 0} Ankündigungen</div></div></div>
        <button class="btn btn-primary btn-sm" onclick="openAnnouncementModal()" style="margin-bottom:.85rem"><i class="fas fa-plus"></i> Ankündigung erstellen</button>
        ${(announcements || []).length ? (announcements || []).map(a => `
          <div style="padding:.6rem .75rem;background:var(--input);border-radius:var(--r);margin-bottom:.4rem${a.is_pinned ? ';border-left:3px solid var(--orange)' : ''}">
            <div style="display:flex;align-items:center;gap:.5rem">
              ${a.is_pinned ? '<i class="fas fa-thumbtack" style="color:var(--orange);font-size:.72rem"></i>' : ''}
              <div style="font-weight:600;font-size:.88rem;flex:1">${a.title}</div>
              <button class="btn btn-ghost btn-sm" onclick="pinAnnouncement(${a.id})" title="${a.is_pinned ? 'Loslösen' : 'Anheften'}"><i class="fas fa-thumbtack"></i></button>
              <button class="btn btn-danger btn-sm" onclick="deleteAnnouncement(${a.id})"><i class="fas fa-trash"></i></button>
            </div>
            <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem">${a.content.slice(0,80)}${a.content.length>80?'…':''}</div>
          </div>`).join('') : '<div class="empty" style="padding:1rem"><p>Keine Ankündigungen</p></div>'}
      </div>
    </div><!-- /col-right -->
    </div>
    <!-- Audit-Log -->
    <div class="card" style="margin-top:1rem">
      <div class="card-head">
        <div class="card-head-icon" style="background:rgba(168,85,247,.15)"><i class="fas fa-shield-alt" style="color:#a855f7"></i></div>
        <div><div class="card-title">Audit-Log</div><div class="card-sub">Letzte Admin-Aktionen</div></div>
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="loadAuditLog()"><i class="fas fa-sync-alt"></i></button>
      </div>
      <div id="audit-log-list"><div style="text-align:center;padding:1rem;color:var(--muted);font-size:.85rem">Wird geladen…</div></div>
    </div>`;
  loadAuditLog();
}

async function loadAuditLog() {
  const el = document.getElementById('audit-log-list');
  if (!el) return;
  const data = await api('/api/audit-log');
  if (!data?.length) { el.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted);font-size:.85rem">Keine Einträge</div>'; return; }
  const actionLabel = a => ({
    user_update:'Nutzer bearbeitet', user_deactivate:'Nutzer deaktiviert',
    ban_create:'Sperre erteilt', ban_lift:'Sperre aufgehoben', ban_delete:'Sperre gelöscht',
    eow_reset:'EOW zurückgesetzt', complaint_update:'Beschwerde aktualisiert'
  }[a] || a);
  const actionColor = a => a.startsWith('ban') ? '#ef4444' : a.startsWith('eow') ? '#f59e0b' : a.startsWith('user_deactivate') ? '#ef4444' : '#a855f7';
  el.innerHTML = `<div class="tbl-wrap" style="max-height:320px;overflow-y:auto">
    <table class="data-tbl">
      <thead><tr><th>Zeit</th><th>Admin</th><th>Aktion</th><th>Details</th><th>IP</th></tr></thead>
      <tbody>${data.map(r => `<tr>
        <td style="white-space:nowrap;font-size:.78rem;color:var(--muted)">${new Date(r.created_at).toLocaleString('de-DE')}</td>
        <td style="font-weight:600;font-size:.85rem">${r.username||'–'}</td>
        <td><span style="font-size:.75rem;font-weight:700;padding:.15rem .45rem;border-radius:4px;background:${actionColor(r.action)}22;color:${actionColor(r.action)}">${actionLabel(r.action)}</span></td>
        <td style="font-size:.78rem;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.details||''}">${r.details||'–'}</td>
        <td style="font-size:.75rem;color:var(--muted)">${r.ip||'–'}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

window.openAddUser = () => openModal(`
  <div class="modal-head"><div class="modal-title">Nutzer hinzufügen</div>
  <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
  <form onsubmit="submitUser(event)">
    <div class="form-group"><label>Benutzername</label><input class="form-control" id="uName" required></div>
    <div class="form-group"><label>Discord-ID (18-stellig)</label><input class="form-control" id="uDid" placeholder="102938475610293847" required></div>
    <div class="form-group"><label>Rolle</label>
      <select class="form-control" id="uRole"><option value="member">Mitarbeiter</option><option value="ausbilder">Ausbilder</option><option value="admin">Admin</option></select>
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

window.openRenameUser = (id, currentName) => openModal(`
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
  </form>`);

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
        <span><i class="fas fa-user" style="margin-right:.3rem"></i><b style="color:var(--fg)">${c.citizen_name}</b></span>
        <span><i class="fas fa-calendar" style="margin-right:.3rem"></i>${new Date(c.created_at).toLocaleDateString('de-DE')}</span>
        <span style="padding:.15rem .5rem;border-radius:6px;font-weight:600;font-size:.75rem;background:${statusColor(c.status)}22;color:${statusColor(c.status)}">${statusLabel(c.status)}</span>
      </div>
      <div style="font-weight:700;font-size:1rem">${c.subject}</div>
      <div style="background:var(--input);border-radius:var(--r);padding:.85rem 1rem;font-size:.87rem;line-height:1.65;white-space:pre-wrap;color:var(--fg)">${c.message}</div>
      ${c.admin_response ? `<div style="padding:.6rem .8rem;background:rgba(59,130,246,.1);border-left:3px solid #3b82f6;border-radius:6px;font-size:.85rem"><b style="color:#3b82f6">Bisherige Antwort:</b><br>${c.admin_response}</div>` : ''}
      <div class="form-group" style="margin:0">
        <label style="font-size:.8rem">Antwort an Bürger (optional)</label>
        <textarea class="form-control" id="complaint-response" rows="3" placeholder="Diese Antwort wird dem Bürger angezeigt…" style="resize:vertical">${c.admin_response||''}</textarea>
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
};
const RANK_COLOR = { Azubi: '#6b7280', Mitarbeiter: '#3b82f6', Senior: '#f97316', Führungskraft: '#a855f7' };

window.openProfileModal = async id => {
  const d = await api(`/api/profile/${id}`);
  if (!d) return;
  const { user: u, stats: st, recentExams, badges } = d;
  const url = avatarUrl(u);
  const rank = u.rank || 'Mitarbeiter';
  const rankColor = RANK_COLOR[rank] || '#6b7280';

  openModal(`
    <div class="modal-head"><div class="modal-title">Profil</div>
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button></div>
    <div class="profile-header">
      <div class="profile-av" style="${url ? 'background:transparent;padding:0;overflow:hidden' : ''}">
        ${url ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='${initials(u.username)}'">` : initials(u.username)}
      </div>
      <div>
        <div class="profile-name">${u.username}</div>
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
  stopExamPolling();
  _lastExamSig = '';
  examPollTimer = setInterval(async () => {
    if (!activeRankExam) return stopExamPolling();
    let resp, state;
    try { resp = await fetch('/api/rank-exam/state', { headers: { 'Content-Type': 'application/json' } }); } catch { return; }
    if (resp.status === 404 || resp.status === 403) {
      // Prüfung wurde vom anderen Prüfer abgeschlossen oder Session ungültig
      stopExamPolling();
      activeRankExam = null;
      closeModal();
      toast('Prüfung wurde abgeschlossen.', 'info');
      return;
    }
    if (!resp.ok) return;
    try { state = await resp.json(); } catch { return; }
    if (!state || !activeRankExam) return;

    // Signatur um unnötige Re-renders zu vermeiden
    const sig = JSON.stringify([state.m1_data, state.m2_answers, state.m3_ratings, state.m3_notes, state.current_module, state.current_m2_idx]);
    const changed = sig !== _lastExamSig;
    _lastExamSig = sig;

    // State immer mergen
    if (state.m1_data    !== null)      activeRankExam.m1Data    = state.m1_data;
    if (state.m2_answers)               activeRankExam.m2Answers = state.m2_answers;
    if (state.m3_ratings)               activeRankExam.m3Ratings = state.m3_ratings;
    if (state.m3_notes   !== undefined) activeRankExam.m3Notes   = state.m3_notes;

    if (!changed) return; // nichts geändert → kein Re-render

    // Fragen-Index aus Server übernehmen
    const serverM2Idx = state.current_m2_idx ?? currentRankM2Idx;

    // Modulwechsel → automatisch navigieren
    if (state.current_module && state.current_module !== currentRankModule) {
      currentRankModule = state.current_module;
      if (state.current_module === 'm1') window.renderRankM1();
      if (state.current_module === 'm2') { currentRankM2Idx = serverM2Idx; window.renderRankM2(serverM2Idx); }
      if (state.current_module === 'm3') window.renderRankM3();
    } else {
      // Gleiche Ansicht mit neuem Stand aktualisieren
      if (currentRankModule === 'm1') window.renderRankM1();
      if (currentRankModule === 'm2') { currentRankM2Idx = serverM2Idx; window.renderRankM2(serverM2Idx); }
      if (currentRankModule === 'm3') {
        // Textarea-Inhalt retten falls gerade fokussiert
        const ta = document.getElementById('rM3Notes');
        if (ta && document.activeElement === ta) activeRankExam.m3Notes = ta.value;
        window.renderRankM3();
      }
    }
  }, 2000);
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
  const [exams, qs] = await Promise.all([api('/api/rank-exams'), api('/api/rank-questions')]);
  const total  = exams?.length || 0;
  const passed = exams?.filter(e => e.passed).length || 0;
  $('pageContent').innerHTML = `
    <div class="stats-row" style="margin-bottom:1.25rem">
      <div class="stat-card"><div class="stat-val">${total}</div><div class="stat-lab">Gesamtprüfungen</div></div>
      <div class="stat-card"><div class="stat-val">${passed}</div><div class="stat-lab">Bestanden</div></div>
      <div class="stat-card"><div class="stat-val">${total ? Math.round(passed/total*100) : 0}%</div><div class="stat-lab">Bestehensquote</div></div>
    </div>
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
          <td><b>${e.examinee_name}</b>${e.examinee_id?` <span style="font-size:.72rem;color:var(--muted)">${e.examinee_id}</span>`:''}</td>
          <td>${e.examiner_name}${e.examiner2_name?`<br><span style="font-size:.72rem;color:var(--muted)">+ ${e.examiner2_name}</span>`:''}</td>
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

window.startRankExamSetup = async function() {
  const members = await api('/api/users') || [];
  const ausbilder = members.filter(u => u.is_active && (u.role === 'ausbilder' || u.role === 'admin'));
  const selfId = currentUser?.id;
  const memberOptions = ausbilder
    .filter(u => u.id !== selfId)
    .map(u => `<option value="${u.id}">${u.username}</option>`)
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
      <textarea id="rM3Notes" class="form-input" rows="2" placeholder="Freitext..." style="resize:vertical">${exam.m3Notes||''}</textarea>
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

// ── Start ─────────────────────────────────────────────────────────
init();
