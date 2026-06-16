// ════════════════════════════════════════════════════════════════
//  MODUL: social.js — Direktnachrichten & Marktplatz
//  Lädt nach script.js; nutzt globale Helpers (api, toast, $, esc, etc.)
// ════════════════════════════════════════════════════════════════

// ── DIREKTNACHRICHTEN ────────────────────────────────────────────
let _dmCurrentPartner = null;

async function nachrichten() {
  $('pageContent').innerHTML = loading();
  const inbox = await api('/api/dm/inbox');
  if (!inbox) return;

  $('pageContent').innerHTML = `
    <div style="display:flex;gap:1rem;height:calc(100vh - 140px);min-height:400px">
      <div id="dm-inbox" style="width:260px;flex-shrink:0;background:var(--card);border-radius:12px;border:1px solid var(--border);overflow-y:auto;display:flex;flex-direction:column">
        <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);font-weight:700;font-size:.85rem">Unterhaltungen</div>
        <div id="dm-conv-list" style="flex:1;overflow-y:auto"></div>
        <div style="padding:.75rem 1rem;border-top:1px solid var(--border)">
          <button class="btn btn-sm btn-primary" style="width:100%" onclick="openNewDM()">+ Neue Nachricht</button>
        </div>
      </div>
      <div id="dm-chat" style="flex:1;background:var(--card);border-radius:12px;border:1px solid var(--border);display:flex;flex-direction:column">
        <div id="dm-chat-header" style="padding:.75rem 1rem;border-bottom:1px solid var(--border);font-weight:700;font-size:.85rem;color:var(--muted)">Wähle eine Unterhaltung</div>
        <div id="dm-messages" style="flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.5rem"></div>
        <div id="dm-input-area" style="display:none;padding:.75rem 1rem;border-top:1px solid var(--border);display:none">
          <div style="display:flex;gap:.5rem">
            <input id="dm-input" class="input" style="flex:1" placeholder="Nachricht schreiben…" maxlength="1000" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendDMMsg();}">
            <button class="btn btn-primary btn-sm" onclick="sendDMMsg()"><i class="fas fa-paper-plane"></i></button>
          </div>
        </div>
      </div>
    </div>`;

  renderDMConvList(inbox);
}

function renderDMConvList(inbox) {
  const el = $('dm-conv-list');
  if (!inbox.length) { el.innerHTML = '<div style="padding:1rem;color:var(--muted);font-size:.8rem;text-align:center">Keine Unterhaltungen</div>'; return; }
  el.innerHTML = inbox.map(c => `
    <div class="dm-conv" onclick="openDMChat('${esc(c.other_id)}','${esc(c.other_name)}')"
         style="padding:.7rem 1rem;cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s;${_dmCurrentPartner===c.other_id?'background:rgba(56,189,248,.08)':''}">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:700;font-size:.85rem">${esc(c.other_name)}</span>
        ${c.unread>0?`<span style="background:#ef4444;color:#fff;border-radius:999px;padding:1px 7px;font-size:10px">${c.unread}</span>`:''}
      </div>
      ${c.last_msg?`<div style="font-size:.75rem;color:var(--muted);margin-top:.2rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.last_msg.slice(0,60))}</div>`:''}
    </div>`).join('');
}

window.openDMChat = async function(did, name) {
  _dmCurrentPartner = did;
  $('dm-chat-header').textContent = name;
  $('dm-input-area').style.display = 'flex';
  $('dm-messages').innerHTML = '<div style="color:var(--muted);font-size:.8rem;text-align:center">Laden…</div>';
  const msgs = await api(`/api/dm/history/${did}`);
  if (!msgs) return;
  const me = currentUser?.discord_id;
  $('dm-messages').innerHTML = msgs.length ? msgs.map(m => {
    const mine = m.sender_id === me;
    return `<div style="display:flex;${mine?'justify-content:flex-end':'justify-content:flex-start'}">
      <div style="max-width:70%;background:${mine?'var(--primary)':'rgba(255,255,255,.06)'};border-radius:12px;padding:.5rem .8rem;font-size:.85rem">
        <div>${esc(m.content)}</div>
        <div style="font-size:.65rem;color:${mine?'rgba(255,255,255,.55)':'var(--muted)'};margin-top:.25rem;text-align:right">${fmtTime(m.created_at)}</div>
      </div>
    </div>`;
  }).join('') : '<div style="color:var(--muted);font-size:.8rem;text-align:center;padding-top:2rem">Beginne die Unterhaltung…</div>';
  $('dm-messages').scrollTop = $('dm-messages').scrollHeight;
  updateDMBadge();
};

async function sendDMMsg() {
  const input = $('dm-input');
  const msg = input?.value.trim();
  if (!msg || !_dmCurrentPartner) return;
  input.value = '';
  const r = await api('/api/dm/send', { method: 'POST', body: { to: _dmCurrentPartner, message: msg } });
  if (r) openDMChat(_dmCurrentPartner, $('dm-chat-header').textContent);
}

window.openNewDM = function() {
  openModal(`
    <div class="modal-head">
      <div class="modal-title">Neue Nachricht</div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div style="display:flex;flex-direction:column;gap:.8rem">
      <input id="dm-new-search" class="input" placeholder="Mitarbeiter suchen…" oninput="dmSearchUser(this.value)">
      <div id="dm-new-results" style="min-height:60px"></div>
    </div>`);
};

window.dmSearchUser = async function(q) {
  if (q.length < 2) return;
  const r = await api(`/api/search?q=${encodeURIComponent(q)}&type=users`);
  const el = $('dm-new-results');
  if (!el || !r?.users?.length) { if(el) el.innerHTML = '<div style="color:var(--muted);font-size:.8rem">Keine Ergebnisse</div>'; return; }
  el.innerHTML = r.users.slice(0,8).map(u => `
    <div onclick="closeModal();openDMChat('${esc(u.discord_id)}','${esc(u.username)}')" style="padding:.5rem .6rem;cursor:pointer;border-radius:8px;display:flex;align-items:center;gap:.6rem;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700">${initials(u.username)}</div>
      <span style="font-size:.85rem;font-weight:600">${esc(u.username)}</span>
    </div>`).join('');
};

async function updateDMBadge() {
  try {
    const r = await api('/api/dm/unread');
    const badge = $('dmBadge');
    if (!badge) return;
    if (r?.count > 0) { badge.textContent = r.count; badge.style.display = ''; }
    else badge.style.display = 'none';
  } catch {}
}

// ── MARKTPLATZ (Kosmetika-Handel) ────────────────────────────────
async function marktplatz() {
  $('pageContent').innerHTML = loading();
  const [listings, mine] = await Promise.all([api('/api/market'), api('/api/market/my')]);
  if (!listings) return;

  const tabs = [
    { id: 'tab-all', label: 'Alle Angebote', fn: () => renderMarketListings(listings) },
    { id: 'tab-mine', label: 'Meine Listings', fn: () => renderMyListings(mine || []) },
    { id: 'tab-sell', label: 'Item einstellen', fn: renderMarketSellForm },
  ];

  $('pageContent').innerHTML = `
    <div style="display:flex;gap:.5rem;margin-bottom:1.25rem;flex-wrap:wrap">
      ${tabs.map(t => `<button class="btn btn-sm btn-ghost" id="${t.id}" onclick="mktTab('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div id="mkt-body"></div>`;

  window._mktTabs = tabs;
  mktTab('tab-all');
}

window.mktTab = function(id) {
  document.querySelectorAll('#tab-all,#tab-mine,#tab-sell').forEach(b => b.classList.remove('btn-primary'));
  const tab = document.getElementById(id);
  if (tab) tab.classList.add('btn-primary');
  const t = window._mktTabs?.find(x => x.id === id);
  if (t) t.fn();
};

function renderMarketListings(listings) {
  const el = $('mkt-body');
  if (!listings.length) { el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:2rem">Keine Angebote im Marktplatz</div>'; return; }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.8rem">
    ${listings.map(l => `
    <div class="card" style="padding:1rem;display:flex;flex-direction:column;gap:.5rem">
      <div style="font-weight:700">${esc(l.item_name)}</div>
      <div style="font-size:.78rem;color:var(--muted)">Verkäufer: ${esc(l.seller_name)}</div>
      <div style="font-weight:800;color:#fbbf24;font-size:1.05rem">${l.price.toLocaleString('de-DE')} 🪙</div>
      <div style="font-size:.72rem;color:var(--muted)">Eingestellt: ${fmt(l.created_at)}</div>
      <button class="btn btn-sm btn-primary" onclick="mktBuy(${l.id},'${esc(l.item_name)}',${l.price})">Kaufen</button>
    </div>`).join('')}
  </div>`;
}

function renderMyListings(mine) {
  const el = $('mkt-body');
  if (!mine.length) { el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:2rem">Keine aktiven Listings</div>'; return; }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.8rem">
    ${mine.map(l => `
    <div class="card" style="padding:1rem;display:flex;flex-direction:column;gap:.5rem">
      <div style="font-weight:700">${esc(l.item_name)}</div>
      <div style="font-weight:800;color:#fbbf24">${l.price.toLocaleString('de-DE')} 🪙</div>
      <div style="font-size:.72rem;color:var(--muted)">Eingestellt: ${fmt(l.created_at)}</div>
      <button class="btn btn-sm btn-ghost" style="color:#ef4444;border-color:#ef4444" onclick="mktCancel(${l.id})">Zurückziehen</button>
    </div>`).join('')}
  </div>`;
}

async function renderMarketSellForm() {
  const el = $('mkt-body');
  const [owned, shopData] = await Promise.all([api('/api/shop/owned'), api('/api/shop')]);
  if (!owned) return;
  const itemMap = Object.fromEntries((shopData?.items || []).map(i => [i.id, i.name]));
  if (!owned.length) { el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:2rem">Du besitzt keine handelbaren Items</div>'; return; }
  el.innerHTML = `
    <div class="card" style="max-width:420px;padding:1.5rem">
      <h3 style="margin-bottom:1rem">Item einstellen</h3>
      <div style="display:flex;flex-direction:column;gap:.8rem">
        <div>
          <label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:.3rem">Item auswählen</label>
          <select id="mkt-item-key" class="input">
            <option value="">– auswählen –</option>
            ${owned.map(k => `<option value="${esc(k)}">${esc(itemMap[k] || k)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:.3rem">Preis (Coins)</label>
          <input id="mkt-price" type="number" class="input" min="1" max="100000" placeholder="z.B. 400">
        </div>
        <button class="btn btn-primary" onclick="mktList()">Einstellen</button>
      </div>
    </div>`;
}

window.mktBuy = async function(id, name, price) {
  if (!confirm(`${name} für ${price.toLocaleString('de-DE')} Coins kaufen?`)) return;
  const r = await api(`/api/market/buy/${id}`, { method: 'POST' });
  if (r) { toast(`${name} gekauft!`, 'ok'); marktplatz(); }
};

window.mktCancel = async function(id) {
  if (!confirm('Listing zurückziehen?')) return;
  const r = await api(`/api/market/${id}`, { method: 'DELETE' });
  if (r) { toast('Listing entfernt', 'ok'); marktplatz(); }
};

window.mktList = async function() {
  const item_key = $('mkt-item-key')?.value;
  const price = +($('mkt-price')?.value || 0);
  if (!item_key) { toast('Item auswählen', 'err'); return; }
  if (!price || price < 1) { toast('Preis angeben', 'err'); return; }
  const r = await api('/api/market/list', { method: 'POST', body: { item_key, price } });
  if (r) { toast('Item eingestellt!', 'ok'); marktplatz(); }
};
