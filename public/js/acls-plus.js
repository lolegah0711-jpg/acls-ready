/**
 * ACLS Plus — Papierkram-Suite, Fahrzeugakten, Bürgerakte & Karriere.
 * Eigenständiges Modul (Muster wie social.js): registriert seine Seiten
 * über window.ACLSPlusPages, script.js bindet sie in navigate() ein.
 */
(function () {
  'use strict';
  const { $, esc, fmt, loading } = window.ACLSCore;
  const me = () => window.ACLSCore.user;
  const isAdmin = () => window.ACLSCore.isAdmin();

  // ═══════════════════════════════════════════════════════════════
  //  DOKUMENT-SPEZIFIKATIONEN
  // ═══════════════════════════════════════════════════════════════
  const DOC_SPECS = {
    auftrag: {
      label: 'Werkstattauftrag', icon: 'fa-wrench', color: '#f97316',
      fields: [
        { k: 'citizen_name', l: 'Kunde', req: 1 },
        { k: 'kennzeichen',  l: 'Kennzeichen' },
        { k: 'fahrzeug',     l: 'Fahrzeug (Marke/Modell)' },
        { k: 'telefon',      l: 'Telefon (IC)' },
        { k: 'mechaniker',   l: 'Zuständiger Mechaniker' },
        { k: 'notizen',      l: 'Notizen / Kundenwunsch', t: 'textarea' },
      ],
      items: { label: 'Arbeitspositionen', cols: [{ k: 'bez', l: 'Bezeichnung' }, { k: 'preis', l: 'Preis ($)', num: 1 }] },
    },
    kv: {
      label: 'Kostenvoranschlag', icon: 'fa-calculator', color: '#38bdf8',
      fields: [
        { k: 'citizen_name', l: 'Kunde', req: 1 },
        { k: 'kennzeichen',  l: 'Kennzeichen' },
        { k: 'fahrzeug',     l: 'Fahrzeug' },
        { k: 'stunden',      l: 'Arbeitsstunden', num: 1 },
        { k: 'satz',         l: 'Stundensatz ($)', num: 1 },
        { k: 'gueltig',      l: 'Gültig bis (Datum)' },
      ],
      items: { label: 'Material / Teile', cols: [{ k: 'bez', l: 'Bezeichnung' }, { k: 'menge', l: 'Menge', num: 1 }, { k: 'preis', l: 'Einzelpreis ($)', num: 1 }] },
    },
    rechnung: {
      label: 'Rechnung', icon: 'fa-file-invoice-dollar', color: '#22c55e',
      fields: [
        { k: 'citizen_name', l: 'Kunde', req: 1 },
        { k: 'kennzeichen',  l: 'Kennzeichen' },
        { k: 'rabatt',       l: 'Rabatt (%)', num: 1 },
        { k: 'zahlung',      l: 'Zahlungsart (bar/Karte)' },
      ],
      items: { label: 'Positionen', cols: [{ k: 'bez', l: 'Bezeichnung' }, { k: 'menge', l: 'Menge', num: 1 }, { k: 'preis', l: 'Einzelpreis ($)', num: 1 }] },
    },
    tuev: {
      label: 'TÜV-/Prüfbericht', icon: 'fa-clipboard-check', color: '#a855f7',
      fields: [
        { k: 'kennzeichen',  l: 'Kennzeichen', req: 1 },
        { k: 'citizen_name', l: 'Halter' },
        { k: 'fahrzeug',     l: 'Fahrzeug' },
        { k: 'km',           l: 'Kilometerstand', num: 1 },
        { k: 'ergebnis',     l: 'Ergebnis', t: 'select', opts: ['Bestanden', 'Bestanden mit Mängeln', 'Durchgefallen'] },
        { k: 'maengel',      l: 'Festgestellte Mängel', t: 'textarea' },
        { k: 'naechster',    l: 'Nächste Prüfung (Datum)' },
      ],
      check: ['Bremsen', 'Beleuchtung', 'Reifen & Räder', 'Lenkung', 'Fahrwerk', 'Karosserie & Rahmen', 'Abgasanlage', 'Verglasung & Spiegel', 'Hupe & Signale', 'Flüssigkeitsstände', 'Sicherheitsgurte'],
    },
    zertifikat: {
      label: 'Prüfungs-Zertifikat', icon: 'fa-award', color: '#fbbf24',
      fields: [
        { k: 'citizen_name', l: 'Name des Absolventen', req: 1 },
        { k: 'kategorie',    l: 'Führerschein-Klasse', t: 'select', opts: ['PKW', 'Motorrad', 'LKW', 'Boot', 'Flugschein'] },
        { k: 'pruefung',     l: 'Prüfungsart', t: 'select', opts: ['Theorie', 'Praxis', 'Theorie & Praxis'] },
        { k: 'bewertung',    l: 'Bewertung', t: 'select', opts: ['Mit Auszeichnung bestanden', 'Bestanden', 'Knapp bestanden'] },
      ],
    },
    fuehrerschein: {
      label: 'Führerschein-Karte', icon: 'fa-id-card', color: '#ec4899',
      fields: [
        { k: 'citizen_name', l: 'Name', req: 1 },
        { k: 'geburtsdatum', l: 'Geburtsdatum (RP)' },
        { k: 'klassen',      l: 'Klassen (z.B. B, BE, C)', req: 1 },
        { k: 'ausgestellt',  l: 'Ausgestellt am', t: 'date' },
      ],
    },
    wartung: {
      label: 'Wartungsheft-Eintrag', icon: 'fa-book', color: '#6b7280',
      fields: [
        { k: 'kennzeichen',  l: 'Kennzeichen', req: 1 },
        { k: 'km',           l: 'Kilometerstand', num: 1 },
        { k: 'arbeiten',     l: 'Durchgeführte Arbeiten', t: 'textarea', req: 1 },
        { k: 'naechster',    l: 'Nächster Service (Datum/km)' },
      ],
    },
    gutachten: {
      label: 'Schadensgutachten', icon: 'fa-car-crash', color: '#ef4444',
      fields: [
        { k: 'kennzeichen',  l: 'Kennzeichen', req: 1 },
        { k: 'citizen_name', l: 'Halter' },
        { k: 'fahrzeug',     l: 'Fahrzeug' },
        { k: 'hergang',      l: 'Schadenshergang', t: 'textarea' },
        { k: 'summe',        l: 'Geschätzte Schadenshöhe ($)', num: 1 },
      ],
      items: { label: 'Einzelschäden', cols: [{ k: 'bez', l: 'Schaden / Bauteil' }, { k: 'preis', l: 'Kosten ($)', num: 1 }] },
    },
  };
  const STATUS_LABELS = { offen: 'Offen', in_arbeit: 'In Arbeit', fertig: 'Fertig', storniert: 'Storniert' };
  const STATUS_COLORS = { offen: '#38bdf8', in_arbeit: '#fbbf24', fertig: '#22c55e', storniert: '#6b7280' };

  const money = n => (isFinite(+n) ? (+n).toLocaleString('de-DE', { minimumFractionDigits: 0 }) : '0') + ' $';

  // ═══════════════════════════════════════════════════════════════
  //  SEITE: DOKUMENTE
  // ═══════════════════════════════════════════════════════════════
  // Filter-State auf window, weil Inline-Handler (onclick/oninput) dort schreiben
  window.docFilter = window.docFilter || '';
  window.docSearch = window.docSearch || '';

  async function dokumente() {
    const docFilter = window.docFilter, docSearch = window.docSearch;
    const qs = new URLSearchParams();
    if (docFilter) qs.set('type', docFilter);
    if (docSearch) qs.set('q', docSearch);
    const docs = await api('/api/documents?' + qs.toString());
    if (!docs) return;

    const chips = Object.entries(DOC_SPECS).map(([t, s]) => `
      <button class="btn btn-sm ${docFilter === t ? 'btn-primary' : 'btn-ghost'}" onclick="docFilter='${t}'===docFilter?'':'${t}';window.ACLSPlusPages.dokumente()" style="white-space:nowrap">
        <i class="fas ${s.icon}" style="color:${docFilter === t ? '' : s.color}"></i> ${s.label}
      </button>`).join('');

    $('pageContent').innerHTML = `
      <div class="pg-header">
        <div class="pg-header-left"><h2>Dokumente</h2><p>${docs.length} Dokumente ${docFilter ? '· gefiltert' : ''}</p></div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <div class="search-bar"><i class="fas fa-search"></i>
            <input placeholder="Nr., Kunde, Kennzeichen…" value="${esc(docSearch)}" oninput="docSearch=this.value;clearTimeout(window._dst);window._dst=setTimeout(window.ACLSPlusPages.dokumente,300)">
          </div>
          <button class="btn btn-primary" onclick="openNewDocPicker()"><i class="fas fa-plus"></i> Neues Dokument</button>
        </div>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem">${chips}</div>
      ${docs.length ? `
      <div class="card" style="padding:0;overflow-x:auto">
        <table class="data-tbl doc-tbl" style="width:100%">
          <thead><tr><th>Nummer</th><th>Typ</th><th>Kunde / Fahrzeug</th><th>Status</th><th>Erstellt</th><th style="text-align:right">Aktionen</th></tr></thead>
          <tbody>
          ${docs.map(d => {
            const s = DOC_SPECS[d.type] || { label: d.type, icon: 'fa-file', color: '#6b7280' };
            return `<tr>
              <td data-l="Nummer"><b style="font-family:monospace">${esc(d.doc_no)}</b></td>
              <td data-l="Typ"><span style="display:inline-flex;align-items:center;gap:.35rem;font-size:.75rem;font-weight:700;padding:.15rem .5rem;border-radius:20px;background:${s.color}22;color:${s.color}"><i class="fas ${s.icon}"></i>${s.label}</span></td>
              <td data-l="Kunde">${esc(d.citizen_name || '—')}${d.kennzeichen ? ` <span style="font-family:monospace;font-size:.75rem;background:var(--input);padding:.1rem .4rem;border-radius:4px">${esc(d.kennzeichen)}</span>` : ''}</td>
              <td data-l="Status">
                <select onchange="setDocStatus(${d.id},this.value)" style="background:var(--input);color:${STATUS_COLORS[d.status] || 'var(--text)'};border:1px solid var(--border);border-radius:6px;padding:.2rem .4rem;font-size:.75rem;font-weight:700">
                  ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${d.status === v ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
              </td>
              <td data-l="Erstellt" style="font-size:.78rem;color:var(--muted)">${fmt(d.created_at)}<br>${esc(d.creator_name || '')}</td>
              <td style="text-align:right;white-space:nowrap">
                <button class="btn btn-ghost btn-sm" onclick="openDocument(${d.id})" title="Öffnen"><i class="fas fa-eye"></i></button>
                <button class="btn btn-ghost btn-sm" onclick="printDocument(${d.id})" title="Drucken / PDF"><i class="fas fa-print"></i></button>
                ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="deleteDocument(${d.id})" title="Löschen" style="color:var(--red)"><i class="fas fa-trash"></i></button>` : ''}
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="card" style="text-align:center;padding:3rem 1rem;color:var(--muted)">
        <i class="fas fa-file-signature" style="font-size:2.4rem;margin-bottom:.8rem;opacity:.4"></i>
        <p style="margin:0">Noch keine Dokumente${docFilter ? ' von diesem Typ' : ''}.<br>Erstelle den ersten Werkstattauftrag oder eine Rechnung!</p>
      </div>`}
    `;
  }

  window.setDocStatus = async (id, status) => {
    const r = await api('/api/documents/' + id, { method: 'PUT', body: { status } });
    if (r) toast('Status aktualisiert', 'ok');
  };
  window.deleteDocument = async (id) => {
    if (!confirm('Dokument wirklich löschen?')) return;
    const r = await api('/api/documents/' + id, { method: 'DELETE' });
    if (r) { toast('Gelöscht', 'ok'); dokumente(); }
  };

  // ── Neues Dokument: Typ-Auswahl ─────────────────────────────────
  window.openNewDocPicker = (preset = {}) => {
    openModal(`
      <h3 style="margin:0 0 .4rem"><i class="fas fa-file-medical" style="color:var(--orange)"></i> Neues Dokument</h3>
      <p style="color:var(--muted);font-size:.85rem;margin:0 0 1rem">Welches Dokument möchtest du erstellen?</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.6rem">
        ${Object.entries(DOC_SPECS).map(([t, s]) => `
          <button class="btn btn-ghost" style="flex-direction:column;padding:1rem .6rem;gap:.4rem;height:auto" onclick='openDocForm("${t}", ${JSON.stringify(preset).replace(/'/g, "&#39;")})'>
            <i class="fas ${s.icon}" style="font-size:1.3rem;color:${s.color}"></i>
            <span style="font-size:.8rem">${s.label}</span>
          </button>`).join('')}
      </div>`);
  };

  // ── Dokument-Formular (generisch aus Spec) ──────────────────────
  window.openDocForm = (type, preset = {}, existing = null) => {
    const spec = DOC_SPECS[type];
    if (!spec) return;
    const p = existing?.payload || preset || {};

    const fieldHtml = spec.fields.map(f => {
      const val = p[f.k] ?? (existing?.[f.k] ?? preset[f.k] ?? '');
      if (f.t === 'textarea') return `<div style="grid-column:1/-1"><label class="doc-lbl">${f.l}${f.req ? ' *' : ''}</label><textarea id="df_${f.k}" rows="3" style="width:100%">${esc(val)}</textarea></div>`;
      if (f.t === 'select') return `<div><label class="doc-lbl">${f.l}</label><select id="df_${f.k}" style="width:100%">${f.opts.map(o => `<option ${val === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
      return `<div><label class="doc-lbl">${f.l}${f.req ? ' *' : ''}</label><input id="df_${f.k}" type="${f.t === 'date' ? 'date' : (f.num ? 'number' : 'text')}" value="${esc(val)}" style="width:100%"></div>`;
    }).join('');

    const itemsHtml = spec.items ? `
      <div style="grid-column:1/-1;margin-top:.4rem">
        <label class="doc-lbl">${spec.items.label}</label>
        <table class="data-tbl" id="df_items" style="font-size:.82rem">
          <thead><tr>${spec.items.cols.map(c => `<th>${c.l}</th>`).join('')}<th style="width:36px"></th></tr></thead>
          <tbody>${(p.items || [{}]).map(row => docItemRow(spec, row)).join('')}</tbody>
        </table>
        <button class="btn btn-ghost btn-sm" style="margin-top:.4rem" onclick="addDocItemRow('${type}')"><i class="fas fa-plus"></i> Position</button>
      </div>` : '';

    const checkHtml = spec.check ? `
      <div style="grid-column:1/-1;margin-top:.4rem">
        <label class="doc-lbl">Prüf-Checkliste</label>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.35rem">
          ${spec.check.map((c, i) => {
            const v = (p.check || {})[c] || 'ok';
            return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--input);border-radius:6px;padding:.35rem .6rem">
              <span style="font-size:.8rem">${c}</span>
              <select id="dfc_${i}" data-check="${esc(c)}" style="font-size:.72rem;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text)">
                <option value="ok" ${v === 'ok' ? 'selected' : ''}>✓ OK</option>
                <option value="mangel" ${v === 'mangel' ? 'selected' : ''}>⚠ Mangel</option>
                <option value="schwer" ${v === 'schwer' ? 'selected' : ''}>✗ Erheblich</option>
              </select>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    openModal(`
      <h3 style="margin:0 0 1rem"><i class="fas ${spec.icon}" style="color:${spec.color}"></i> ${existing ? esc(existing.doc_no) + ' bearbeiten' : spec.label + ' erstellen'}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem;max-height:60vh;overflow-y:auto;padding-right:.3rem">
        ${fieldHtml}${itemsHtml}${checkHtml}
      </div>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.1rem">
        <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="saveDocForm('${type}', ${existing ? existing.id : 'null'})"><i class="fas fa-save"></i> ${existing ? 'Speichern' : 'Erstellen'}</button>
      </div>`);
  };

  function docItemRow(spec, row = {}) {
    return `<tr>${spec.items.cols.map(c =>
      `<td><input data-ik="${c.k}" type="${c.num ? 'number' : 'text'}" value="${esc(row[c.k] ?? '')}" style="width:100%;background:var(--input);border:1px solid var(--border);border-radius:5px;padding:.3rem .45rem;color:var(--text);font-size:.8rem"></td>`
    ).join('')}<td><button class="btn btn-ghost btn-sm" onclick="this.closest('tr').remove()" style="color:var(--red)"><i class="fas fa-times"></i></button></td></tr>`;
  }
  window.addDocItemRow = (type) => {
    const tb = document.querySelector('#df_items tbody');
    if (tb) tb.insertAdjacentHTML('beforeend', docItemRow(DOC_SPECS[type]));
  };

  window.saveDocForm = async (type, existingId) => {
    const spec = DOC_SPECS[type];
    const payload = {};
    for (const f of spec.fields) {
      const el = $('df_' + f.k);
      const v = (el?.value || '').trim();
      if (f.req && !v) return toast(`„${f.l}" ist erforderlich`, 'err');
      payload[f.k] = v;
    }
    if (spec.items) {
      payload.items = [...document.querySelectorAll('#df_items tbody tr')].map(tr => {
        const row = {};
        tr.querySelectorAll('input[data-ik]').forEach(i => row[i.dataset.ik] = i.value.trim());
        return row;
      }).filter(r => Object.values(r).some(v => v));
    }
    if (spec.check) {
      payload.check = {};
      document.querySelectorAll('[id^="dfc_"]').forEach(s => payload.check[s.dataset.check] = s.value);
    }

    const body = {
      type,
      kennzeichen: payload.kennzeichen || null,
      citizen_name: payload.citizen_name || null,
      title: spec.label + (payload.citizen_name ? ' – ' + payload.citizen_name : (payload.kennzeichen ? ' – ' + payload.kennzeichen : '')),
      payload,
    };
    const r = existingId
      ? await api('/api/documents/' + existingId, { method: 'PUT', body: { payload, title: body.title } })
      : await api('/api/documents', { method: 'POST', body });
    if (!r) return;
    closeModal();
    toast(existingId ? 'Dokument gespeichert' : `Dokument ${r.doc_no} erstellt`, 'ok');
    if (document.querySelector('.nav-item.active')?.dataset.page === 'dokumente') dokumente();
    if (!existingId && confirm('Dokument jetzt drucken / als PDF speichern?')) printDocument(r.id);
  };

  // ── Dokument ansehen ────────────────────────────────────────────
  window.openDocument = async (id) => {
    const d = await api('/api/documents/' + id);
    if (!d) return;
    const spec = DOC_SPECS[d.type] || { label: d.type, icon: 'fa-file', color: '#888', fields: [] };
    const p = d.payload || {};
    openModal(`
      <div style="display:flex;justify-content:space-between;align-items:start;gap:1rem;flex-wrap:wrap">
        <h3 style="margin:0"><i class="fas ${spec.icon}" style="color:${spec.color}"></i> ${spec.label}</h3>
        <span style="font-family:monospace;font-weight:700;color:var(--orange)">${esc(d.doc_no)}</span>
      </div>
      <div style="margin:1rem 0;display:grid;grid-template-columns:1fr 1fr;gap:.5rem;font-size:.85rem;max-height:50vh;overflow-y:auto">
        ${spec.fields.map(f => p[f.k] ? `<div><span style="color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.04em">${f.l}</span><br><b>${esc(p[f.k])}</b></div>` : '').join('')}
        ${p.items?.length ? `<div style="grid-column:1/-1"><span style="color:var(--muted);font-size:.72rem;text-transform:uppercase">${spec.items?.label || 'Positionen'}</span>
          ${p.items.map(i => `<div style="display:flex;justify-content:space-between;border-bottom:1px dashed var(--border);padding:.25rem 0"><span>${esc(i.bez || '')}</span><span>${i.menge ? esc(i.menge) + ' × ' : ''}${i.preis ? money(i.preis) : ''}</span></div>`).join('')}</div>` : ''}
        ${p.check ? `<div style="grid-column:1/-1"><span style="color:var(--muted);font-size:.72rem;text-transform:uppercase">Checkliste</span><br>
          ${Object.entries(p.check).map(([k, v]) => `<span style="display:inline-block;margin:.15rem .25rem .15rem 0;font-size:.72rem;padding:.15rem .5rem;border-radius:20px;background:${v === 'ok' ? 'rgba(34,197,94,.13)' : v === 'mangel' ? 'rgba(251,191,36,.13)' : 'rgba(239,68,68,.13)'};color:${v === 'ok' ? '#22c55e' : v === 'mangel' ? '#fbbf24' : '#ef4444'}">${v === 'ok' ? '✓' : v === 'mangel' ? '⚠' : '✗'} ${esc(k)}</span>`).join('')}</div>` : ''}
      </div>
      <div style="font-size:.75rem;color:var(--muted)">Erstellt von ${esc(d.creator_name || '?')} am ${fmt(d.created_at)}</div>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-ghost" onclick="closeModal()">Schließen</button>
        <button class="btn btn-ghost" onclick='openDocForm("${d.type}", {}, ${JSON.stringify({ id: d.id, doc_no: d.doc_no, payload: p }).replace(/'/g, "&#39;")})'><i class="fas fa-edit"></i> Bearbeiten</button>
        <button class="btn btn-primary" onclick="printDocument(${d.id})"><i class="fas fa-print"></i> Drucken / PDF</button>
      </div>`);
  };

  // ═══════════════════════════════════════════════════════════════
  //  DRUCK-SYSTEM: amtliche Dokumente im Popup (→ Drucken/PDF)
  // ═══════════════════════════════════════════════════════════════
  function printShell(title, body, extraCss = '') {
    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#f3f3f3;padding:24px}
  .sheet{background:#fff;max-width:800px;margin:0 auto;padding:46px 52px;box-shadow:0 2px 14px rgba(0,0,0,.18)}
  .head{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #f97316;padding-bottom:14px;margin-bottom:22px}
  .brand{font-size:26px;font-weight:800;letter-spacing:.5px}.brand span{color:#f97316}
  .brand small{display:block;font-size:11px;font-weight:400;color:#555;letter-spacing:.14em;text-transform:uppercase;margin-top:2px}
  .docmeta{text-align:right;font-size:12px;color:#333}
  .docmeta b{font-size:15px;font-family:'Courier New',monospace;display:block}
  h1{font-size:19px;margin:18px 0 14px;text-transform:uppercase;letter-spacing:.06em}
  table.fields{width:100%;border-collapse:collapse;margin-bottom:14px}
  table.fields td{padding:7px 10px;border:1px solid #ccc;font-size:13px;vertical-align:top}
  table.fields td.lbl{width:34%;background:#f6f6f6;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#444}
  table.items{width:100%;border-collapse:collapse;margin:8px 0 4px}
  table.items th{background:#1a1a1a;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:7px 10px;text-align:left}
  table.items td{padding:7px 10px;border-bottom:1px solid #ddd;font-size:13px}
  .sum{display:flex;justify-content:flex-end;margin-top:8px}
  .sum table td{padding:4px 12px;font-size:13px}
  .sum .total td{font-weight:800;font-size:15px;border-top:2px solid #111}
  .sig{display:flex;gap:40px;margin-top:56px}
  .sig div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:11px;color:#555;text-align:center}
  .stamp{margin-top:36px;display:flex;justify-content:flex-end}
  .stamp .box{width:170px;height:90px;border:2px dashed #bbb;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.1em}
  .footer{margin-top:34px;border-top:1px solid #ddd;padding-top:10px;font-size:10px;color:#888;display:flex;justify-content:space-between}
  .noprint{max-width:800px;margin:0 auto 16px;display:flex;gap:10px;justify-content:flex-end}
  .noprint button{padding:9px 18px;border:none;border-radius:7px;font-weight:700;cursor:pointer}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
  ${extraCss}
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;max-width:none;padding:20px 30px}.noprint{display:none}}
</style></head><body>
<div class="noprint"><button style="background:#f97316;color:#fff" onclick="window.print()">🖨 Drucken / Als PDF speichern</button><button style="background:#ddd" onclick="window.close()">Schließen</button></div>
<div class="sheet">
  <div class="head">
    <div class="brand">AC<span>LS</span><small>Automobil-Club Los Santos · Werkstatt &amp; Fahrschule</small></div>
    <div class="docmeta">${body.meta || ''}</div>
  </div>
  ${body.html}
  <div class="footer"><span>ACLS Automobil-Club · Hauptquartier Los Santos</span><span>Im LS-Telefonbuch unter „ACLS"</span></div>
</div>
<script>setTimeout(()=>window.print(),350)</script>
</body></html>`;
  }

  function fieldsTable(spec, p) {
    return `<table class="fields">${spec.fields.filter(f => p[f.k]).map(f =>
      `<tr><td class="lbl">${f.l}</td><td>${esc(p[f.k])}</td></tr>`).join('')}</table>`;
  }

  function itemsTable(spec, p, opts = {}) {
    if (!p.items?.length) return '';
    let sum = 0;
    const rows = p.items.map(i => {
      const menge = +i.menge || 1, preis = +i.preis || 0;
      const line = spec.items.cols.some(c => c.k === 'menge') ? menge * preis : preis;
      sum += line;
      return `<tr><td>${esc(i.bez || '')}</td>${spec.items.cols.some(c => c.k === 'menge') ? `<td style="text-align:center">${menge}</td>` : ''}<td style="text-align:right">${money(preis)}</td><td style="text-align:right">${money(line)}</td></tr>`;
    }).join('');
    const stunden = (+p.stunden || 0) * (+p.satz || 0);
    if (stunden) sum += stunden;
    const rabatt = Math.min(Math.max(+p.rabatt || 0, 0), 100);
    const rabattVal = sum * rabatt / 100;
    const total = sum - rabattVal;
    return `<table class="items">
      <thead><tr><th>${spec.items.cols[0].l}</th>${spec.items.cols.some(c => c.k === 'menge') ? '<th style="text-align:center">Menge</th>' : ''}<th style="text-align:right">Einzelpreis</th><th style="text-align:right">Summe</th></tr></thead>
      <tbody>${rows}
      ${stunden ? `<tr><td>Arbeitszeit (${esc(p.stunden)} Std. × ${money(p.satz)})</td>${spec.items.cols.some(c => c.k === 'menge') ? '<td></td>' : ''}<td></td><td style="text-align:right">${money(stunden)}</td></tr>` : ''}
      </tbody></table>
      <div class="sum"><table>
        ${rabatt ? `<tr><td>Zwischensumme</td><td style="text-align:right">${money(sum)}</td></tr><tr><td>Rabatt (${rabatt}%)</td><td style="text-align:right">−${money(rabattVal)}</td></tr>` : ''}
        <tr class="total"><td>Gesamt</td><td style="text-align:right">${money(total)}</td></tr>
      </table></div>`;
  }

  window.printDocument = async (id) => {
    const d = await api('/api/documents/' + id);
    if (!d) return;
    const spec = DOC_SPECS[d.type];
    const p = d.payload || {};
    const meta = `<b>${esc(d.doc_no)}</b>Datum: ${fmt(d.created_at)}<br>Bearbeiter: ${esc(d.creator_name || '')}`;
    let inner = '';

    if (d.type === 'fuehrerschein') {
      const klassen = String(p.klassen || '').split(/[,\s]+/).filter(Boolean);
      inner = `
        <h1>Führerschein</h1>
        <div style="display:flex;justify-content:center;margin:30px 0">
          <div style="width:430px;height:270px;border-radius:16px;background:linear-gradient(135deg,#181818,#2d2d2d);color:#fff;padding:22px 26px;position:relative;box-shadow:0 4px 18px rgba(0,0,0,.35)">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="font-size:15px;font-weight:800;letter-spacing:.08em">FÜHRERSCHEIN <span style="color:#f97316">LS</span></div>
              <div style="font-size:10px;color:#aaa;font-family:monospace">${esc(d.doc_no)}</div>
            </div>
            <div style="display:flex;gap:18px;margin-top:18px">
              <div style="width:86px;height:106px;border-radius:8px;background:#f97316;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:800">${esc((p.citizen_name || '?')[0].toUpperCase())}</div>
              <div style="font-size:12px;line-height:1.9">
                <div><span style="color:#999">1.</span> <b style="font-size:15px">${esc(p.citizen_name || '')}</b></div>
                ${p.geburtsdatum ? `<div><span style="color:#999">3.</span> ${esc(p.geburtsdatum)}</div>` : ''}
                <div><span style="color:#999">4a.</span> ${esc(p.ausgestellt || fmt(d.created_at))}</div>
                <div><span style="color:#999">4c.</span> ACLS Los Santos</div>
              </div>
            </div>
            <div style="position:absolute;bottom:18px;left:26px;right:26px;display:flex;gap:7px">
              ${klassen.map(k => `<span style="background:#f97316;color:#111;font-weight:800;font-size:13px;padding:3px 12px;border-radius:5px">${esc(k)}</span>`).join('')}
            </div>
          </div>
        </div>
        <p style="text-align:center;font-size:11px;color:#777">Ausgestellt durch den ACLS Automobil-Club Los Santos · Gültig auf ColdRP</p>
        <div class="sig"><div>Unterschrift Inhaber</div><div>Unterschrift Fahrlehrer</div></div>`;
    } else if (d.type === 'zertifikat') {
      inner = `
        <div style="text-align:center;padding:26px 10px;border:3px double #b98a2c;margin-top:8px">
          <div style="font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#b98a2c">Zertifikat</div>
          <h1 style="font-size:26px;margin:16px 0 4px;border:none">${esc(p.citizen_name || '')}</h1>
          <p style="font-size:13px;margin:10px 0">hat die Prüfung</p>
          <div style="font-size:18px;font-weight:800">${esc(p.kategorie || '')} · ${esc(p.pruefung || '')}</div>
          <p style="font-size:14px;margin:14px 0"><span class="badge" style="background:#e9f7ec;color:#1c7c31">${esc(p.bewertung || 'Bestanden')}</span></p>
          <p style="font-size:12px;color:#555">Los Santos, ${fmt(d.created_at)} · Prüfer: ${esc(d.creator_name || '')}</p>
        </div>
        <div class="sig"><div>Prüfer</div><div>Leitung ACLS Fahrschule</div></div>
        <div class="stamp"><div class="box">Amtliches Siegel</div></div>`;
    } else if (d.type === 'tuev') {
      const chk = p.check || {};
      const sym = { ok: ['✓', '#1c7c31'], mangel: ['⚠', '#b98a2c'], schwer: ['✗', '#c0392b'] };
      inner = `
        <h1>Prüfbericht – Hauptuntersuchung</h1>
        ${fieldsTable(spec, p)}
        <table class="items"><thead><tr><th>Prüfpunkt</th><th style="width:110px;text-align:center">Ergebnis</th></tr></thead>
        <tbody>${(spec.check || []).map(c => {
          const v = chk[c] || 'ok', s = sym[v] || sym.ok;
          return `<tr><td>${c}</td><td style="text-align:center;color:${s[1]};font-weight:800">${s[0]} ${v === 'ok' ? 'OK' : v === 'mangel' ? 'Mangel' : 'Erheblich'}</td></tr>`;
        }).join('')}</tbody></table>
        <p style="margin-top:14px;font-size:14px">Gesamtergebnis:
          <span class="badge" style="background:${p.ergebnis === 'Durchgefallen' ? '#fdeaea' : p.ergebnis === 'Bestanden' ? '#e9f7ec' : '#fdf6e3'};color:${p.ergebnis === 'Durchgefallen' ? '#c0392b' : p.ergebnis === 'Bestanden' ? '#1c7c31' : '#b98a2c'}">${esc(p.ergebnis || 'Bestanden')}</span>
        </p>
        <div class="sig"><div>Prüfingenieur</div><div>Fahrzeughalter</div></div>
        <div class="stamp"><div class="box">Prüfplakette</div></div>`;
    } else {
      inner = `
        <h1>${spec.label}</h1>
        ${fieldsTable(spec, p)}
        ${spec.items ? itemsTable(spec, p) : ''}
        <div class="sig"><div>${d.type === 'rechnung' ? 'Kunde' : 'Auftraggeber'}</div><div>ACLS ${d.type === 'wartung' ? 'Werkstatt' : 'Mitarbeiter'}</div></div>`;
    }

    const w = window.open('', '_blank');
    if (!w) return toast('Popup blockiert – bitte erlauben', 'err');
    w.document.write(printShell(`${d.doc_no} – ${spec.label}`, { meta, html: inner }));
    w.document.close();
  };

  // ═══════════════════════════════════════════════════════════════
  //  SEITE: FAHRZEUGAKTEN
  // ═══════════════════════════════════════════════════════════════
  window.vehSearch = window.vehSearch || '';

  async function fahrzeugakte() {
    const vehSearch = window.vehSearch;
    const vehicles = await api('/api/vehicles?q=' + encodeURIComponent(vehSearch));
    if (!vehicles) return;
    $('pageContent').innerHTML = `
      <div class="pg-header">
        <div class="pg-header-left"><h2>Fahrzeugakten</h2><p>${vehicles.length} Akten</p></div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <div class="search-bar"><i class="fas fa-search"></i>
            <input placeholder="Kennzeichen, Halter…" value="${esc(vehSearch)}" oninput="vehSearch=this.value;clearTimeout(window._vst);window._vst=setTimeout(window.ACLSPlusPages.fahrzeugakte,300)">
          </div>
          <button class="btn btn-primary" onclick="openVehicleForm()"><i class="fas fa-plus"></i> Neue Akte</button>
        </div>
      </div>
      ${vehicles.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:.8rem">
        ${vehicles.map(v => `
          <div class="card" style="cursor:pointer" onclick="openVehicleFile('${esc(v.kennzeichen)}')">
            <div style="display:flex;align-items:center;gap:.7rem">
              <div style="background:#fff;color:#111;font-family:monospace;font-weight:800;font-size:.95rem;padding:.25rem .6rem;border-radius:5px;border:2px solid #111;letter-spacing:.05em">${esc(v.kennzeichen)}</div>
            </div>
            <div style="margin-top:.6rem;font-weight:700">${esc([v.marke, v.modell].filter(Boolean).join(' ') || 'Unbekanntes Fahrzeug')}</div>
            <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem">
              ${v.owner_name ? `<i class="fas fa-user" style="margin-right:.3rem"></i>${esc(v.owner_name)}` : 'Kein Halter hinterlegt'}
              ${v.farbe ? ` · ${esc(v.farbe)}` : ''}
            </div>
          </div>`).join('')}
      </div>` : `
      <div class="card" style="text-align:center;padding:3rem 1rem;color:var(--muted)">
        <i class="fas fa-car" style="font-size:2.4rem;margin-bottom:.8rem;opacity:.4"></i>
        <p style="margin:0">Noch keine Fahrzeugakten. Lege die erste an –<br>oder erstelle ein Dokument mit Kennzeichen, die Akte entsteht automatisch.</p>
      </div>`}`;
  }

  window.openVehicleForm = (v = {}) => {
    openModal(`
      <h3 style="margin:0 0 1rem"><i class="fas fa-car" style="color:var(--orange)"></i> ${v.kennzeichen ? 'Akte bearbeiten' : 'Neue Fahrzeugakte'}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem">
        <div><label class="doc-lbl">Kennzeichen *</label><input id="vf_kz" value="${esc(v.kennzeichen || '')}" ${v.kennzeichen ? 'readonly style="opacity:.6;width:100%"' : 'style="width:100%"'} placeholder="LS-AB 123"></div>
        <div><label class="doc-lbl">Halter</label><input id="vf_owner" value="${esc(v.owner_name || '')}" style="width:100%"></div>
        <div><label class="doc-lbl">Marke</label><input id="vf_marke" value="${esc(v.marke || '')}" style="width:100%"></div>
        <div><label class="doc-lbl">Modell</label><input id="vf_modell" value="${esc(v.modell || '')}" style="width:100%"></div>
        <div><label class="doc-lbl">Farbe</label><input id="vf_farbe" value="${esc(v.farbe || '')}" style="width:100%"></div>
        <div style="grid-column:1/-1"><label class="doc-lbl">Notizen</label><textarea id="vf_notes" rows="3" style="width:100%">${esc(v.notes || '')}</textarea></div>
      </div>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="saveVehicle()"><i class="fas fa-save"></i> Speichern</button>
      </div>`);
  };

  window.saveVehicle = async () => {
    const kz = $('vf_kz').value.trim();
    if (!kz) return toast('Kennzeichen erforderlich', 'err');
    const r = await api('/api/vehicles', { method: 'POST', body: {
      kennzeichen: kz, owner_name: $('vf_owner').value, marke: $('vf_marke').value,
      modell: $('vf_modell').value, farbe: $('vf_farbe').value, notes: $('vf_notes').value,
    }});
    if (!r) return;
    closeModal(); toast('Akte gespeichert', 'ok'); fahrzeugakte();
  };

  window.openVehicleFile = async (kz) => {
    const f = await api('/api/vehicles/' + encodeURIComponent(kz) + '/file');
    if (!f) return;
    const v = f.vehicle;
    const lastTuev = f.documents.find(d => d.type === 'tuev');
    openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <div style="background:#fff;color:#111;font-family:monospace;font-weight:800;font-size:1.1rem;padding:.3rem .8rem;border-radius:6px;border:2px solid #111">${esc(v.kennzeichen)}</div>
        <button class="btn btn-ghost btn-sm" onclick='openVehicleForm(${JSON.stringify(v).replace(/'/g, "&#39;")})'><i class="fas fa-edit"></i> Bearbeiten</button>
      </div>
      <div style="margin:.9rem 0;font-size:.9rem">
        <b>${esc([v.marke, v.modell].filter(Boolean).join(' ') || 'Unbekanntes Fahrzeug')}</b>${v.farbe ? ` · ${esc(v.farbe)}` : ''}<br>
        <span style="color:var(--muted);font-size:.8rem">Halter: ${esc(v.owner_name || '—')}</span>
        ${lastTuev ? `<br><span style="font-size:.78rem">Letzter TÜV: ${fmt(lastTuev.created_at)}</span>` : ''}
      </div>
      ${v.notes ? `<div style="background:var(--input);border-radius:8px;padding:.6rem .8rem;font-size:.82rem;margin-bottom:.8rem">${esc(v.notes)}</div>` : ''}
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem">
        <button class="btn btn-ghost btn-sm" onclick='closeModal();openDocForm("auftrag",{kennzeichen:"${esc(v.kennzeichen)}",citizen_name:"${esc(v.owner_name || '')}"})'><i class="fas fa-wrench" style="color:#f97316"></i> Auftrag</button>
        <button class="btn btn-ghost btn-sm" onclick='closeModal();openDocForm("wartung",{kennzeichen:"${esc(v.kennzeichen)}"})'><i class="fas fa-book" style="color:#6b7280"></i> Wartungseintrag</button>
        <button class="btn btn-ghost btn-sm" onclick='closeModal();openDocForm("tuev",{kennzeichen:"${esc(v.kennzeichen)}",citizen_name:"${esc(v.owner_name || '')}"})'><i class="fas fa-clipboard-check" style="color:#a855f7"></i> TÜV</button>
      </div>
      <h4 style="margin:.4rem 0 .5rem;font-size:.85rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Dokumente & Wartungsheft (${f.documents.length})</h4>
      <div style="max-height:36vh;overflow-y:auto">
      ${f.documents.length ? f.documents.map(d => {
        const s = DOC_SPECS[d.type] || { label: d.type, icon: 'fa-file', color: '#888' };
        return `<div style="display:flex;align-items:center;gap:.6rem;padding:.45rem 0;border-bottom:1px solid var(--border)">
          <i class="fas ${s.icon}" style="color:${s.color};width:18px;text-align:center"></i>
          <div style="flex:1;min-width:0"><b style="font-size:.82rem">${s.label}</b> <span style="font-family:monospace;font-size:.72rem;color:var(--muted)">${esc(d.doc_no)}</span><br><span style="font-size:.72rem;color:var(--muted)">${fmt(d.created_at)} · ${esc(d.creator_name || '')}</span></div>
          <button class="btn btn-ghost btn-sm" onclick="closeModal();openDocument(${d.id})"><i class="fas fa-eye"></i></button>
          <button class="btn btn-ghost btn-sm" onclick="printDocument(${d.id})"><i class="fas fa-print"></i></button>
        </div>`;
      }).join('') : '<p style="color:var(--muted);font-size:.85rem">Noch keine Dokumente zu diesem Fahrzeug.</p>'}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:1rem"><button class="btn btn-ghost" onclick="closeModal()">Schließen</button></div>`);
  };

  // ═══════════════════════════════════════════════════════════════
  //  BÜRGERAKTE (ersetzt showCitizenHistory aus script.js)
  // ═══════════════════════════════════════════════════════════════
  window.showCitizenHistory = (name) => window.openCitizenFile(name);

  window.openCitizenFile = async (name) => {
    const f = await api('/api/citizen-file?name=' + encodeURIComponent(name));
    if (!f) return;

    const timeline = [
      ...f.registry.map(r => ({ ts: r.registered_at, icon: r.passed ? 'fa-check-circle' : 'fa-times-circle', color: r.passed ? '#22c55e' : '#ef4444',
        text: `${r.exam_type || 'Prüfung'} ${r.category_name || ''} ${r.passed ? 'bestanden' : 'nicht bestanden'} <span style="color:var(--muted)">· Prüfer: ${esc(r.examiner_name || '?')}</span>` })),
      ...f.points.map(p => ({ ts: p.created_at, icon: 'fa-exclamation-triangle', color: p.expired ? '#6b7280' : '#fbbf24',
        text: `${p.points} Punkt${p.points > 1 ? 'e' : ''}: ${esc(p.reason)}${p.fine ? ` <span style="color:var(--muted)">(${esc(p.fine)})</span>` : ''}${p.expired ? ' <i style="color:var(--muted)">(verfallen)</i>' : ''}` })),
      ...f.bans.map(b => ({ ts: b.issued_at, icon: 'fa-ban', color: '#ef4444',
        text: `Hausverbot: ${esc(b.reason)}${b.is_active ? '' : ' <i style="color:var(--muted)">(aufgehoben)</i>'}` })),
      ...f.documents.map(d => ({ ts: d.created_at, icon: DOC_SPECS[d.type]?.icon || 'fa-file', color: DOC_SPECS[d.type]?.color || '#888',
        text: `${DOC_SPECS[d.type]?.label || d.type} <span style="font-family:monospace;font-size:.72rem">${esc(d.doc_no)}</span>`, docId: d.id })),
    ].sort((a, b) => new Date(b.ts) - new Date(a.ts));

    openModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h3 style="margin:0"><i class="fas fa-folder-open" style="color:var(--orange)"></i> Bürgerakte: ${esc(f.name)}</h3>
        <span style="font-weight:800;font-size:.85rem;padding:.25rem .7rem;border-radius:20px;background:${f.activePoints >= 8 ? 'rgba(239,68,68,.15)' : f.activePoints >= 4 ? 'rgba(251,191,36,.15)' : 'rgba(34,197,94,.15)'};color:${f.activePoints >= 8 ? '#ef4444' : f.activePoints >= 4 ? '#fbbf24' : '#22c55e'}">
          ${f.activePoints} Punkte
        </span>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:.8rem 0">
        <button class="btn btn-ghost btn-sm" onclick="openAddPoints('${esc(f.name).replace(/'/g, "\\'")}')"><i class="fas fa-exclamation-triangle" style="color:#fbbf24"></i> Punkte eintragen</button>
        <button class="btn btn-ghost btn-sm" onclick="openAddCitizenNote('${esc(f.name).replace(/'/g, "\\'")}')"><i class="fas fa-sticky-note" style="color:#a855f7"></i> Notiz</button>
        <button class="btn btn-ghost btn-sm" onclick='closeModal();openDocForm("fuehrerschein",{citizen_name:"${esc(f.name)}"})'><i class="fas fa-id-card" style="color:#ec4899"></i> Führerschein</button>
        <button class="btn btn-ghost btn-sm" onclick='closeModal();openDocForm("zertifikat",{citizen_name:"${esc(f.name)}"})'><i class="fas fa-award" style="color:#fbbf24"></i> Zertifikat</button>
      </div>
      ${f.notes.length ? `
      <h4 style="margin:.6rem 0 .4rem;font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em"><i class="fas fa-lock" style="font-size:.65rem"></i> Interne Notizen</h4>
      ${f.notes.map(n => `<div style="background:rgba(168,85,247,.07);border-left:3px solid #a855f7;border-radius:6px;padding:.5rem .7rem;margin-bottom:.4rem;font-size:.82rem">${esc(n.note)}<br><span style="font-size:.7rem;color:var(--muted)">${esc(n.author)} · ${fmt(n.created_at)}</span></div>`).join('')}` : ''}
      <h4 style="margin:.8rem 0 .4rem;font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Akten-Timeline (${timeline.length})</h4>
      <div style="max-height:38vh;overflow-y:auto">
        ${timeline.length ? timeline.map(t => `
          <div style="display:flex;gap:.6rem;padding:.4rem 0;border-bottom:1px solid var(--border);align-items:start;${t.docId ? 'cursor:pointer' : ''}" ${t.docId ? `onclick="closeModal();openDocument(${t.docId})"` : ''}>
            <i class="fas ${t.icon}" style="color:${t.color};width:18px;text-align:center;margin-top:.15rem"></i>
            <div style="flex:1;font-size:.83rem">${t.text}<br><span style="font-size:.7rem;color:var(--muted)">${fmt(t.ts)}</span></div>
          </div>`).join('') : '<p style="color:var(--muted);font-size:.85rem">Noch keine Einträge.</p>'}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:1rem"><button class="btn btn-ghost" onclick="closeModal()">Schließen</button></div>`);
  };

  window.openAddPoints = (name) => {
    openModal(`
      <h3 style="margin:0 0 1rem"><i class="fas fa-exclamation-triangle" style="color:#fbbf24"></i> Punkte eintragen – ${esc(name)}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem">
        <div><label class="doc-lbl">Punkte (1–8)</label><input id="pt_points" type="number" min="1" max="8" value="1" style="width:100%"></div>
        <div><label class="doc-lbl">Bußgeld (optional)</label><input id="pt_fine" placeholder="z.B. 500 $" style="width:100%"></div>
        <div style="grid-column:1/-1"><label class="doc-lbl">Verstoß / Grund *</label><input id="pt_reason" placeholder="z.B. Geschwindigkeitsüberschreitung" style="width:100%"></div>
        <div><label class="doc-lbl">Verfällt nach (Monate)</label><input id="pt_months" type="number" min="1" max="60" value="12" style="width:100%"></div>
      </div>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="savePoints('${esc(name).replace(/'/g, "\\'")}')"><i class="fas fa-save"></i> Eintragen</button>
      </div>`);
  };
  window.savePoints = async (name) => {
    const reason = $('pt_reason').value.trim();
    if (!reason) return toast('Grund erforderlich', 'err');
    const r = await api('/api/points', { method: 'POST', body: {
      citizen_name: name, points: +$('pt_points').value || 1, reason,
      fine: $('pt_fine').value, expires_months: +$('pt_months').value || 12,
    }});
    if (!r) return;
    toast('Punkte eingetragen', 'ok');
    window.openCitizenFile(name);
  };

  window.openAddCitizenNote = (name) => {
    openModal(`
      <h3 style="margin:0 0 1rem"><i class="fas fa-sticky-note" style="color:#a855f7"></i> Interne Notiz – ${esc(name)}</h3>
      <textarea id="cn_note" rows="4" style="width:100%" placeholder="Nur für Mitarbeiter sichtbar…"></textarea>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
        <button class="btn btn-primary" onclick="saveCitizenNote('${esc(name).replace(/'/g, "\\'")}')"><i class="fas fa-save"></i> Speichern</button>
      </div>`);
  };
  window.saveCitizenNote = async (name) => {
    const note = $('cn_note').value.trim();
    if (!note) return toast('Notiz ist leer', 'err');
    const r = await api('/api/citizen-notes', { method: 'POST', body: { citizen_name: name, note } });
    if (!r) return;
    toast('Notiz gespeichert', 'ok');
    window.openCitizenFile(name);
  };

  // ═══════════════════════════════════════════════════════════════
  //  SEITE: KARRIERE
  // ═══════════════════════════════════════════════════════════════
  async function karriere() {
    const [rank, tasks, certs, pruefer, absolventen, catalog, mine] = await Promise.all([
      api('/api/karriere/me'), api('/api/karriere/tagesaufgaben'), api('/api/karriere/zertifikate'),
      api('/api/karriere/pruefer-top'), api('/api/karriere/absolventen'),
      api('/api/vouchers/catalog'), api('/api/vouchers/mine'),
    ]);
    if (!rank) return;

    const prog = rank.next ? Math.min(1, (rank.score - rank.rank.min) / (rank.next.min - rank.rank.min)) : 1;

    $('pageContent').innerHTML = `
      <!-- Rang -->
      <div class="card" style="display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem">
        <div style="width:74px;height:74px;border-radius:50%;background:var(--orange-dim);display:flex;align-items:center;justify-content:center;font-size:1.9rem;color:var(--orange);flex-shrink:0">
          <i class="fas ${rank.rank.icon}"></i>
        </div>
        <div style="flex:1;min-width:220px">
          <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Werkstatt-Rang</div>
          <div style="font-size:1.5rem;font-weight:800">${rank.rank.name}</div>
          <div style="background:var(--input);border-radius:99px;height:9px;margin:.5rem 0;overflow:hidden"><div style="height:100%;width:${Math.round(prog * 100)}%;background:linear-gradient(90deg,var(--orange),#fbbf24);border-radius:99px"></div></div>
          <div style="font-size:.75rem;color:var(--muted)">${rank.score} Punkte${rank.next ? ` · noch ${rank.next.min - rank.score} bis ${rank.next.name}` : ' · Maximaler Rang erreicht!'}</div>
        </div>
        <div style="display:flex;gap:1.2rem;text-align:center">
          <div><div style="font-size:1.25rem;font-weight:800;color:#22c55e">${rank.exams}</div><div style="font-size:.68rem;color:var(--muted)">Prüfungen</div></div>
          <div><div style="font-size:1.25rem;font-weight:800;color:#38bdf8">${rank.docs}</div><div style="font-size:.68rem;color:var(--muted)">Dokumente</div></div>
          <div><div style="font-size:1.25rem;font-weight:800;color:#a855f7">${rank.icHours}</div><div style="font-size:.68rem;color:var(--muted)">IC-Stunden</div></div>
        </div>
      </div>

      <!-- Tagesaufgaben -->
      <h3 style="margin:1.2rem 0 .6rem;font-size:1rem"><i class="fas fa-tasks" style="color:var(--orange)"></i> RP-Tagesaufgaben <span style="font-size:.72rem;color:var(--muted);font-weight:400">· täglich neu aus echten Aktionen</span></h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.7rem">
        ${(tasks?.tasks || []).map(t => `
          <div class="card" style="display:flex;flex-direction:column;gap:.5rem">
            <div style="font-weight:700;font-size:.88rem">${esc(t.label)}</div>
            <div style="background:var(--input);border-radius:99px;height:7px;overflow:hidden"><div style="height:100%;width:${Math.round(t.progress / t.goal * 100)}%;background:${t.done ? '#22c55e' : 'var(--orange)'}"></div></div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:.75rem;color:var(--muted)">${t.progress}/${t.goal} · +${t.reward} Coins</span>
              ${t.claimed ? '<span style="font-size:.75rem;color:#22c55e;font-weight:700"><i class="fas fa-check"></i> Abgeholt</span>'
                : t.done ? `<button class="btn btn-primary btn-sm" onclick="claimRpTask('${t.id}')"><i class="fas fa-gift"></i> Abholen</button>`
                : '<span style="font-size:.72rem;color:var(--muted)">Offen</span>'}
            </div>
          </div>`).join('')}
      </div>

      <!-- Zertifikate -->
      <h3 style="margin:1.4rem 0 .6rem;font-size:1rem"><i class="fas fa-certificate" style="color:#fbbf24"></i> Fach-Zertifikate <span style="font-size:.72rem;color:var(--muted);font-weight:400">· aus den Werkstatt-Minispielen</span></h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.7rem">
        ${(certs || []).map(c => `
          <div class="card" style="text-align:center;${c.earned ? 'border-color:#fbbf24' : 'opacity:.75'}">
            <i class="fas ${c.icon}" style="font-size:1.6rem;color:${c.earned ? '#fbbf24' : 'var(--muted)'}"></i>
            <div style="font-weight:800;margin:.4rem 0 .2rem;font-size:.9rem">${c.name}</div>
            <div style="font-size:.72rem;color:var(--muted)">${c.desc}</div>
            <div style="background:var(--input);border-radius:99px;height:6px;margin:.5rem 0;overflow:hidden"><div style="height:100%;width:${Math.round(c.progress * 100)}%;background:${c.earned ? '#fbbf24' : 'var(--orange)'}"></div></div>
            <div style="font-size:.72rem;${c.earned ? 'color:#fbbf24;font-weight:700' : 'color:var(--muted)'}">${c.earned ? '✓ Freigeschaltet' : `Bester Score: ${c.best.toLocaleString('de-DE')}`}</div>
          </div>`).join('')}
      </div>

      <!-- Gutscheine -->
      <h3 style="margin:1.4rem 0 .6rem;font-size:1rem"><i class="fas fa-ticket-alt" style="color:#22c55e"></i> Rabatt-Gutscheine <span style="font-size:.72rem;color:var(--muted);font-weight:400">· Coins gegen echten RP-Nutzen</span></h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.7rem">
        ${(catalog || []).map(v => `
          <div class="card" style="display:flex;flex-direction:column;gap:.5rem">
            <div style="font-weight:700;font-size:.85rem">${esc(v.label)}</div>
            <button class="btn btn-primary btn-sm" style="align-self:start" onclick="buyVoucher('${v.kind}')"><i class="fas fa-coins"></i> ${v.cost} Coins</button>
          </div>`).join('')}
      </div>
      ${mine?.length ? `
      <h4 style="margin:1rem 0 .4rem;font-size:.8rem;color:var(--muted);text-transform:uppercase">Meine Gutscheine</h4>
      ${mine.map(v => `
        <div style="display:flex;align-items:center;gap:.7rem;padding:.45rem .2rem;border-bottom:1px solid var(--border);font-size:.85rem;flex-wrap:wrap">
          <code style="background:var(--input);padding:.2rem .55rem;border-radius:5px;font-weight:700;${v.redeemed_at ? 'text-decoration:line-through;opacity:.5' : 'color:#22c55e'}">${esc(v.code)}</code>
          <span style="flex:1">${esc(v.label)}</span>
          <span style="font-size:.72rem;color:var(--muted)">${v.redeemed_at ? 'Eingelöst ' + fmt(v.redeemed_at) : 'Gültig'}</span>
        </div>`).join('')}` : ''}
      <div class="card" style="margin-top:.8rem;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
        <i class="fas fa-cash-register" style="color:var(--orange)"></i>
        <b style="font-size:.85rem">Gutschein einlösen (Mitarbeiter):</b>
        <input id="vredeem" placeholder="ACLS-XXXX-XXXX" style="flex:1;min-width:160px;text-transform:uppercase">
        <button class="btn btn-primary btn-sm" onclick="redeemVoucher()"><i class="fas fa-check"></i> Einlösen</button>
      </div>

      <!-- Bestenlisten -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem;margin-top:1.4rem">
        <div class="card">
          <h3 style="margin:0 0 .7rem;font-size:.95rem"><i class="fas fa-user-check" style="color:#22c55e"></i> Prüfer-Bestenliste</h3>
          ${(pruefer || []).slice(0, 10).map((p, i) => `
            <div style="display:flex;align-items:center;gap:.6rem;padding:.35rem 0;border-bottom:1px solid var(--border);font-size:.84rem">
              <span style="width:22px;text-align:center;font-weight:800;color:${i < 3 ? '#fbbf24' : 'var(--muted)'}">${i + 1}</span>
              <span style="flex:1">${esc(p.username)}</span>
              <span style="font-size:.72rem;color:var(--muted)">${p.last30} in 30T</span>
              <b>${p.total}</b>
              <span style="font-size:.72rem;color:${p.passRate >= 70 ? '#22c55e' : '#fbbf24'}">${p.passRate}%</span>
            </div>`).join('') || '<p style="color:var(--muted);font-size:.85rem">Noch keine Prüfungen.</p>'}
        </div>
        <div class="card">
          <h3 style="margin:0 0 .7rem;font-size:.95rem"><i class="fas fa-graduation-cap" style="color:#38bdf8"></i> Absolventen-Wall</h3>
          <div style="display:flex;flex-wrap:wrap;gap:.4rem">
            ${(absolventen || []).map(a => `
              <span title="${esc(a.category || '')} · Prüfer: ${esc(a.examiner || '?')} · ${fmt(a.registered_at)}" style="font-size:.75rem;font-weight:700;padding:.25rem .6rem;border-radius:20px;background:rgba(56,189,248,.1);color:#38bdf8;border:1px solid rgba(56,189,248,.25)">
                🎉 ${esc(a.citizen_name)} <span style="opacity:.7">${esc(a.category || '')}</span>
              </span>`).join('') || '<p style="color:var(--muted);font-size:.85rem">Noch keine Absolventen.</p>'}
          </div>
        </div>
      </div>`;
  }

  window.claimRpTask = async (taskId) => {
    const r = await api(`/api/karriere/tagesaufgaben/${taskId}/claim`, { method: 'POST', body: {} });
    if (!r) return;
    toast(`+${r.reward} Coins!`, 'ok');
    karriere();
  };
  window.buyVoucher = async (kind) => {
    const r = await api('/api/vouchers/buy', { method: 'POST', body: { kind } });
    if (!r) return;
    toast(`Gutschein gekauft: ${r.code}`, 'ok');
    karriere();
  };
  window.redeemVoucher = async () => {
    const code = $('vredeem').value.trim().toUpperCase();
    if (!code) return;
    const info = await api('/api/vouchers/lookup/' + encodeURIComponent(code));
    if (!info) return;
    if (info.redeemed_at) return toast('Bereits eingelöst am ' + fmt(info.redeemed_at), 'err');
    if (!confirm(`Einlösen: „${info.label}" von ${info.owner_name}?`)) return;
    const r = await api('/api/vouchers/redeem', { method: 'POST', body: { code } });
    if (!r) return;
    toast('Gutschein eingelöst ✓', 'ok');
    karriere();
  };

  // ── Seiten registrieren ──────────────────────────────────────────
  window.ACLSPlusPages = { dokumente, fahrzeugakte, karriere };
})();
