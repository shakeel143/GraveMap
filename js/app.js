/* ═══════════════════════════════════════
<<<<<<< HEAD
   GraveMap v3 — app.js
   Map-first. Polygons. Wizards.
   Generate grave grid.
═══════════════════════════════════════ */

// ── Firebase boot ──
function waitFB(cb, n = 0) {
  if (window.__fb) return cb();
  if (n > 50) return console.error('Firebase not loaded');
  setTimeout(() => waitFB(cb, n + 1), 150);
}

// ═══════════════════════════
//  STATE
// ═══════════════════════════
const S = {
  cemeteries:    {},
  graves:        {},
  requests:      {},
  currentView:   'map',
  selectedCemId: null,
  // Map objects
  MAP:            null,
  boundaryLayers: {},   // cemId → L.layer
  graveLayers:    {},   // graveId → L.layer
  // Wizard state
  cemWizardData:  {},
  graveWizardData:{},
  // Mini-maps (in modals)
  locateMap:      null,
  locateMarker:   null,
  boundaryMap:    null,
  boundaryDrawn:  null,
  graveDrawMap:   null,
  graveDrawn:     null,
  // Grid preview
  gridPreviewLayers: [],
};

// ═══════════════════════════
//  FIREBASE HELPERS
// ═══════════════════════════
=======
   GraveMap v2 — app.js
   Complete cemetery management system
═══════════════════════════════════════ */

// ── Wait for Firebase ──
function waitFB(cb, n = 0) {
  if (window.__fb) return cb();
  if (n > 40) return console.error('Firebase timeout');
  setTimeout(() => waitFB(cb, n + 1), 150);
}

// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════
const S = {
  cemeteries: {},
  graves:     {},
  deceased:   {},
  requests:   {},
  editGraveId: null,
  map: null,
  markers: {},
  drawLayer: null,
  boundaryLayers: {},
};

// ══════════════════════════════════════
//  FIREBASE HELPERS
// ══════════════════════════════════════
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
const fb = () => window.__fb;

async function dbGet(path) {
  const { db, ref, get } = fb();
  const s = await get(ref(db, path));
  return s.exists() ? s.val() : null;
}
async function dbSet(path, data) {
  const { db, ref, set } = fb();
<<<<<<< HEAD
  return set(ref(db, path), data);
=======
  await set(ref(db, path), data);
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
}
async function dbPush(path, data) {
  const { db, ref, push } = fb();
  const r = push(ref(db, path));
  await dbSet(`${path}/${r.key}`, data);
  return r.key;
}
async function dbUpdate(path, data) {
  const { db, ref, update } = fb();
<<<<<<< HEAD
  return update(ref(db, path), data);
}
async function dbRemove(path) {
  const { db, ref, remove } = fb();
  return remove(ref(db, path));
=======
  await update(ref(db, path), data);
}
async function dbRemove(path) {
  const { db, ref, remove } = fb();
  await remove(ref(db, path));
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
}
function dbListen(path, cb) {
  const { db, ref, onValue } = fb();
  onValue(ref(db, path), s => cb(s.exists() ? s.val() : {}));
}

<<<<<<< HEAD
// ═══════════════════════════
//  MAIN MAP
// ═══════════════════════════
function initMainMap() {
  S.MAP = L.map('map-root', { zoomControl: false }).setView([30.3753, 69.3451], 6);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd', maxZoom: 20
  }).addTo(S.MAP);

  L.control.zoom({ position: 'bottomright' }).addTo(S.MAP);

  // Admin drawing controls (geoman)
  S.MAP.pm.setGlobalOptions({ snappable: false });
}

// ═══════════════════════════
//  AUTH
// ═══════════════════════════
document.addEventListener('authChanged', e => {
  const user = e.detail;
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !user);
  });
  if (user) {
    document.getElementById('btn-login').classList.add('hidden');
    const chip = document.getElementById('user-chip');
    chip.classList.remove('hidden');
    document.getElementById('u-avatar').src = user.photoURL || '';
    document.getElementById('u-name').textContent = user.displayName?.split(' ')[0] || 'Admin';
    // Enable draw tools on map
    enableDrawTools();
  } else {
    document.getElementById('btn-login').classList.remove('hidden');
    document.getElementById('user-chip').classList.add('hidden');
  }
});

document.getElementById('btn-login').addEventListener('click', async () => {
  const { auth, prov, signInWithPopup } = fb();
  try { await signInWithPopup(auth, prov); toast('Signed in', 'ok'); }
  catch (err) { toast(err.message, 'err'); }
});
document.getElementById('btn-logout').addEventListener('click', async () => {
=======
// ══════════════════════════════════════
//  ROUTER
// ══════════════════════════════════════
function go(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById(`page-${pageId}`);
  if (pg) pg.classList.add('active');
  const ni = document.querySelector(`[data-page="${pageId}"]`);
  if (ni) ni.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');

  if (pageId === 'map')            setTimeout(initMap, 100);
  if (pageId === 'stats')          renderStats();
  if (pageId === 'admin-graves')   renderGravesTable();
  if (pageId === 'cemeteries')     renderCemeteries();
  if (pageId === 'maintenance')    renderMaintenance();
  if (pageId === 'requests-admin') renderRequestsAdmin();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); go(el.dataset.page); });
});
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ══════════════════════════════════════
//  AUTH
// ══════════════════════════════════════
document.addEventListener('authChanged', e => {
  const user = e.detail;
  const adminEls = document.querySelectorAll('.admin-only');
  if (user) {
    adminEls.forEach(el => el.classList.remove('hidden'));
    document.getElementById('btn-signin').classList.add('hidden');
    const pill = document.getElementById('user-pill');
    pill.classList.remove('hidden');
    document.getElementById('user-avatar').src = user.photoURL || '';
    document.getElementById('user-name').textContent = user.displayName || user.email;
  } else {
    adminEls.forEach(el => el.classList.add('hidden'));
    document.getElementById('btn-signin').classList.remove('hidden');
    document.getElementById('user-pill').classList.add('hidden');
  }
});

document.getElementById('btn-signin').addEventListener('click', async () => {
  const { auth, provider, signInWithPopup } = fb();
  try { await signInWithPopup(auth, provider); toast('Signed in', 'ok'); }
  catch (err) { toast(err.message, 'err'); }
});
document.getElementById('btn-signout').addEventListener('click', async () => {
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
  await fb().signOut(fb().auth);
  toast('Signed out');
});

<<<<<<< HEAD
// ═══════════════════════════
//  NAVIGATION
// ═══════════════════════════
function switchView(view) {
  S.currentView = view;
  document.querySelectorAll('.tnav').forEach(b => b.classList.toggle('active', b.dataset.view === view));

  // Panels
  document.getElementById('panel-map').classList.toggle('hidden', view !== 'map');
  document.getElementById('panel-search').classList.toggle('hidden', view !== 'search');
  document.getElementById('panel-cemeteries').classList.toggle('hidden', view !== 'cemeteries');
  document.getElementById('panel-admin').classList.toggle('hidden', view !== 'admin');

  // Admin tools only on map view and logged in
  const tools = document.getElementById('map-tools');
  tools.classList.toggle('hidden', !(view === 'map' && window.__user));

  // Invalidate map size when switching back to map
  if (view === 'map' && S.MAP) setTimeout(() => S.MAP.invalidateSize(), 100);
  if (view === 'admin') renderAdmin();
  if (view === 'cemeteries') renderCemeteriesPanel();
}

document.querySelectorAll('.tnav').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ═══════════════════════════
//  LOAD DATA
// ═══════════════════════════
function loadData() {
  dbListen('cemeteries', data => {
    S.cemeteries = data || {};
    renderMapCemeteries();
    renderCemListPanel();
    populateSelects();
  });
  dbListen('graves', data => {
    S.graves = data || {};
    renderMapGraves();
    if (S.currentView === 'admin') renderAdmin();
  });
  dbListen('requests', data => {
    S.requests = data || {};
    const pending = Object.values(data || {}).filter(r => !r.resolved).length;
    const badge = document.getElementById('req-badge');
    badge.textContent = pending;
    badge.style.display = pending ? 'inline' : 'none';
    if (S.currentView === 'admin') renderAdmin();
  });
}

// ═══════════════════════════
//  POPULATE SELECTS
// ═══════════════════════════
function populateSelects() {
  const cems = Object.entries(S.cemeteries);
  const ids  = ['sf-cem', 'gg-cem'];
=======
// ══════════════════════════════════════
//  LOAD DATA (live listeners)
// ══════════════════════════════════════
function loadData() {
  dbListen('cemeteries', data => {
    S.cemeteries = data || {};
    populateSelects();
    renderCemeteries();
    if (document.getElementById('page-map').classList.contains('active')) {
      updateMapMarkers();
      renderBoundaries();
      renderGrid();
    }
  });
  dbListen('graves', data => {
    S.graves = data || {};
    if (document.getElementById('page-admin-graves').classList.contains('active')) renderGravesTable();
    if (document.getElementById('page-map').classList.contains('active')) { updateMapMarkers(); renderGrid(); }
    if (document.getElementById('page-stats').classList.contains('active')) renderStats();
    if (document.getElementById('page-maintenance').classList.contains('active')) renderMaintenance();
  });
  dbListen('deceased', data => {
    S.deceased = data || {};
    if (document.getElementById('page-stats').classList.contains('active')) renderStats();
  });
  dbListen('requests', data => {
    S.requests = data || {};
    const pending = Object.values(data || {}).filter(r => !r.resolved).length;
    const badge = document.getElementById('requests-count');
    if (pending > 0) { badge.textContent = pending; badge.style.display = ''; }
    else badge.style.display = 'none';
    if (document.getElementById('page-requests-admin').classList.contains('active')) renderRequestsAdmin();
  });
}

// ══════════════════════════════════════
//  POPULATE SELECTS
// ══════════════════════════════════════
function populateSelects() {
  const cems = Object.entries(S.cemeteries);
  const ids = ['f-cemetery','map-cem-sel','ag-cem-filter','stats-cem-sel',
                'gf-cem','req-cemetery','maint-cem-filter'];
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const first = el.options[0].outerHTML;
    el.innerHTML = first;
    cems.forEach(([cid, c]) => el.innerHTML += `<option value="${cid}">${esc(c.name)}</option>`);
  });
<<<<<<< HEAD

  // City filter
  const cities = [...new Set(Object.values(S.cemeteries).map(c => c.city).filter(Boolean))];
  const sfCity = document.getElementById('sf-city');
  if (sfCity) {
    sfCity.innerHTML = '<option value="">All cities</option>';
    cities.forEach(c => sfCity.innerHTML += `<option value="${c}">${esc(c)}</option>`);
  }
}

// ═══════════════════════════
//  MAP — CEMETERY BOUNDARIES
// ═══════════════════════════
function renderMapCemeteries() {
  // Remove old
  Object.values(S.boundaryLayers).forEach(l => S.MAP && S.MAP.removeLayer(l));
  S.boundaryLayers = {};

  Object.entries(S.cemeteries).forEach(([cid, c]) => {
    if (c.boundary) {
      try {
        const coords = JSON.parse(c.boundary);
        const layer  = L.polygon(coords, {
          color:       '#0F1923',
          weight:      2,
          fillColor:   '#2ECC8A',
          fillOpacity: 0.06,
          dashArray:   '6 4'
        }).addTo(S.MAP);
        layer.bindTooltip(`<b>${esc(c.name)}</b>`, { permanent: false });
        layer.on('click', () => flyToCemetery(cid));
        S.boundaryLayers[cid] = layer;
      } catch(e) {}
    } else if (c.centerLat && c.centerLng) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#0F1923;color:#2ECC8A;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4)">${esc(c.name)}</div>`,
        iconAnchor: [0, 0]
      });
      const m = L.marker([c.centerLat, c.centerLng], { icon }).addTo(S.MAP);
      m.on('click', () => flyToCemetery(cid));
      S.boundaryLayers[cid] = m;
    }
=======
}

// ══════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════
function decByGrave() {
  const m = {};
  Object.values(S.deceased).forEach(d => { m[d.graveId] = d; });
  return m;
}

function doSearch() {
  const q     = document.getElementById('search-input').value.trim().toLowerCase();
  const fCem  = document.getElementById('f-cemetery').value;
  const fGen  = document.getElementById('f-gender').value;
  const fStat = document.getElementById('f-status').value;
  const hint  = document.getElementById('search-hint');
  const grid  = document.getElementById('search-results');

  if (!q && !fCem && !fGen && !fStat) {
    grid.innerHTML = ''; hint.classList.remove('hidden'); return;
  }
  hint.classList.add('hidden');

  const dbg = decByGrave();
  const results = [];

  Object.entries(S.graves).forEach(([gid, g]) => {
    if (fCem  && g.cemeteryId !== fCem)  return;
    if (fStat && g.status !== fStat)     return;
    const dec = dbg[gid];
    if (fGen && (!dec || dec.gender !== fGen)) return;

    let match = !q;
    if (q) {
      if ((dec?.fullName   || '').toLowerCase().includes(q)) match = true;
      if ((dec?.fatherName || '').toLowerCase().includes(q)) match = true;
      if (gid.toLowerCase().includes(q))                     match = true;
      if ((g.plot || '').toLowerCase().includes(q))          match = true;
      if ((g.section || '').toLowerCase().includes(q))       match = true;
    }
    if (match) results.push({ gid, g, dec });
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
  });
}

<<<<<<< HEAD
// ═══════════════════════════
//  MAP — GRAVES AS POLYGONS
// ═══════════════════════════
const STATUS_COLOR = { occupied: '#E05A5A', empty: '#2ECC8A', reserved: '#F0B429' };

function renderMapGraves() {
  Object.values(S.graveLayers).forEach(l => S.MAP && S.MAP.removeLayer(l));
  S.graveLayers = {};

  Object.entries(S.graves).forEach(([gid, g]) => {
    if (!g.polygon) return;
    try {
      const coords = JSON.parse(g.polygon);
      const color  = STATUS_COLOR[g.status] || '#9CA3AF';
      const layer  = L.polygon(coords, {
        color:       '#fff',
        weight:      1,
        fillColor:   color,
        fillOpacity: 0.8,
      }).addTo(S.MAP);

      const name = g.name || 'Empty plot';
      layer.bindTooltip(`<b>${esc(name)}</b><br>${esc(g.fatherName ? 's/o ' + g.fatherName : '')}`, { sticky: true });
      layer.on('click', () => openGraveDetail(gid));
      S.graveLayers[gid] = layer;
    } catch(e) {}
  });
}

function flyToCemetery(cemId) {
  S.selectedCemId = cemId;
  const c = S.cemeteries[cemId];
  if (!c) return;

  // Highlight in left panel
  document.querySelectorAll('.cem-list-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.cem-list-item[data-cem-id="${cemId}"]`)?.classList.add('active');

  if (S.boundaryLayers[cemId]) {
    const bounds = S.boundaryLayers[cemId].getBounds ? S.boundaryLayers[cemId].getBounds() : null;
    if (bounds) { S.MAP.fitBounds(bounds, { padding: [60, 60] }); return; }
=======
  if (!results.length) {
    grid.innerHTML = `<p style="color:var(--text-lt);padding:.5rem">No graves found.</p>`; return;
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
  }
  if (c.centerLat && c.centerLng) S.MAP.flyTo([c.centerLat, c.centerLng], 17);
}

<<<<<<< HEAD
// ═══════════════════════════
//  LEFT PANEL — CEM LIST
// ═══════════════════════════
function renderCemListPanel() {
  const el  = document.getElementById('map-cem-list');
  const cems = Object.entries(S.cemeteries);
  if (!cems.length) { el.innerHTML = '<div style="padding:1rem;color:#9CA3AF;font-size:.82rem">No cemeteries yet.</div>'; return; }

  el.innerHTML = cems.map(([cid, c]) => {
    const graves    = Object.values(S.graves).filter(g => g.cemeteryId === cid);
    const total     = graves.length;
    const occupied  = graves.filter(g => g.status === 'occupied').length;
    return `<div class="cem-list-item" data-cem-id="${cid}" onclick="flyToCemetery('${cid}')">
      <div class="cem-list-dot"></div>
      <div class="cem-list-info">
        <div class="cem-list-name">${esc(c.name)}</div>
        <div class="cem-list-loc">${[c.city, c.country].filter(Boolean).map(esc).join(', ')}</div>
      </div>
      <div class="cem-list-count">${occupied}/${total}</div>
=======
  grid.innerHTML = results.map(({ gid, g, dec }) => {
    const cem = S.cemeteries[g.cemeteryId] || {};
    return `<div class="grave-card" data-status="${g.status}" onclick="openGraveDetail('${gid}')">
      <div class="gc-name">${esc(dec?.fullName || 'Empty grave')}</div>
      ${dec?.fatherName ? `<div class="gc-father">s/o ${esc(dec.fatherName)}</div>` : ''}
      <div class="gc-meta">
        <span class="tag">📍 ${esc(cem.name || '–')}</span>
        <span class="tag">§${esc(g.section)} R${esc(g.row)} P${esc(g.plot)}</span>
        ${dec?.deathDate ? `<span class="tag">✝ ${dec.deathDate}</span>` : ''}
        <span class="sbadge ${g.status}">${g.status}</span>
        ${g.maintenanceFlag ? `<span class="maint-badge ${g.maintenanceFlag}">${g.maintenanceFlag.replace('-',' ')}</span>` : ''}
      </div>
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
    </div>`;
  }).join('');
}

<<<<<<< HEAD
// Filter
document.getElementById('map-cem-search').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll('.cem-list-item').forEach(el => {
    el.classList.toggle('hidden', !el.textContent.toLowerCase().includes(q));
  });
});

// ═══════════════════════════
//  DRAW TOOLS
// ═══════════════════════════
function enableDrawTools() {
  if (!S.MAP) return;

  document.getElementById('tool-draw-boundary').addEventListener('click', () => {
    if (!S.selectedCemId) { toast('Select a cemetery first from the left panel', 'err'); return; }
    setHint('Click points to draw the cemetery boundary. Double-click to finish.');
    S.MAP.pm.enableDraw('Polygon', { snappable: false });
    setActiveTool('tool-draw-boundary');
  });

  document.getElementById('tool-draw-grave').addEventListener('click', () => {
    if (!S.selectedCemId) { toast('Select a cemetery first from the left panel', 'err'); return; }
    setHint('Drag to draw a grave rectangle.');
    S.MAP.pm.enableDraw('Rectangle', { snappable: false });
    setActiveTool('tool-draw-grave');
  });

  document.getElementById('tool-gen-grid').addEventListener('click', () => {
    if (!S.selectedCemId) { toast('Select a cemetery first', 'err'); return; }
    document.getElementById('gg-cem').value = S.selectedCemId;
    openOverlay('ov-grid-gen');
  });

  document.getElementById('tool-delete').addEventListener('click', () => {
    S.MAP.pm.enableGlobalRemovalMode();
    setHint('Click a shape to delete it.');
  });

  // Handle drawn shapes
  S.MAP.on('pm:create', async e => {
    const layer = e.layer;
    const type  = activeTool;

    if (type === 'tool-draw-boundary') {
      // Save as cemetery boundary
      const coords = layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
      await dbUpdate(`cemeteries/${S.selectedCemId}`, { boundary: JSON.stringify(coords) });
      S.MAP.removeLayer(layer);
      toast('Cemetery boundary saved!', 'ok');
      setActiveTool(null);
    } else if (type === 'tool-draw-grave') {
      // Open grave wizard with pre-filled cemetery & polygon
      const coords = layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
      S.MAP.removeLayer(layer);
      // Set pre-selected cemetery and drawn polygon
      S.graveWizardData = { cemId: S.selectedCemId, polygon: JSON.stringify(coords) };
      openGraveWizard(true);
      setActiveTool(null);
    }

    S.MAP.pm.disableDraw();
    setHint('');
  });
}

let activeTool = null;
function setActiveTool(id) {
  activeTool = id;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  if (id) document.getElementById(id)?.classList.add('active');
}
function setHint(msg) {
  document.getElementById('tool-hint').textContent = msg;
}

// ═══════════════════════════
//  CEMETERY WIZARD
// ═══════════════════════════
let cemWizardStep = 1;

document.getElementById('btn-add-cemetery')?.addEventListener('click', () => {
  S.cemWizardData = {};
  cemWizardStep = 1;
  showCemWizardStep(1);
  openOverlay('ov-add-cem');
});

function showCemWizardStep(n) {
  [1,2,3].forEach(i => {
    document.getElementById(`cem-step-${i}`).classList.toggle('active', i === n);
    const ws = document.querySelector(`.wstep[data-step="${i}"]`);
    ws.classList.toggle('active', i === n);
    ws.classList.toggle('done', i < n);
  });
  if (n === 2) setTimeout(() => initLocateMap(), 200);
  if (n === 3) setTimeout(() => initBoundaryMap(), 200);
}

window.cemWizardNext = function(step) {
  if (step === 1) {
    const name = document.getElementById('cw-name').value.trim();
    if (!name) { toast('Cemetery name is required', 'err'); return; }
    S.cemWizardData.name     = name;
    S.cemWizardData.country  = document.getElementById('cw-country').value.trim();
    S.cemWizardData.province = document.getElementById('cw-province').value.trim();
    S.cemWizardData.district = document.getElementById('cw-district').value.trim();
    S.cemWizardData.city     = document.getElementById('cw-city').value.trim();
    S.cemWizardData.address  = document.getElementById('cw-address').value.trim();
    S.cemWizardData.description = document.getElementById('cw-desc').value.trim();
  }
  if (step === 2) {
    const lat = parseFloat(document.getElementById('cw-lat').value);
    const lng = parseFloat(document.getElementById('cw-lng').value);
    if (!lat || !lng) { toast('Click on the map to set cemetery location', 'err'); return; }
    S.cemWizardData.centerLat = lat;
    S.cemWizardData.centerLng = lng;
  }
  showCemWizardStep(step + 1);
};

window.cemWizardBack = function(step) {
  showCemWizardStep(step - 1);
};

function initLocateMap() {
  if (S.locateMap) { S.locateMap.invalidateSize(); return; }
  S.locateMap = L.map('cem-locate-map').setView([30.3753, 69.3451], 5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OSM © CARTO', subdomains: 'abcd', maxZoom: 20
  }).addTo(S.locateMap);

  S.locateMap.on('click', e => {
    if (S.locateMarker) S.locateMap.removeLayer(S.locateMarker);
    S.locateMarker = L.marker(e.latlng).addTo(S.locateMap);
    document.getElementById('cw-lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('cw-lng').value = e.latlng.lng.toFixed(6);
  });
}

document.getElementById('cw-loc-search').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (!q) return;
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`);
  const data = await res.json();
  if (!data.length) { toast('Location not found', 'err'); return; }
  const { lat, lon } = data[0];
  S.locateMap.flyTo([lat, lon], 14);
  if (S.locateMarker) S.locateMap.removeLayer(S.locateMarker);
  S.locateMarker = L.marker([lat, lon]).addTo(S.locateMap);
  document.getElementById('cw-lat').value = parseFloat(lat).toFixed(6);
  document.getElementById('cw-lng').value = parseFloat(lon).toFixed(6);
});

function initBoundaryMap() {
  const center = S.cemWizardData.centerLat
    ? [S.cemWizardData.centerLat, S.cemWizardData.centerLng]
    : [30.3753, 69.3451];

  if (S.boundaryMap) {
    S.boundaryMap.setView(center, 17);
    S.boundaryMap.invalidateSize();
    return;
  }

  S.boundaryMap = L.map('cem-boundary-map').setView(center, 17);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OSM © CARTO', subdomains: 'abcd', maxZoom: 20
  }).addTo(S.boundaryMap);

  S.boundaryMap.pm.addControls({
    position: 'topleft',
    drawMarker: false, drawCircle: false, drawCircleMarker: false,
    drawPolyline: false, drawText: false, drawRectangle: false,
    drawPolygon: true, editMode: true, dragMode: false,
    cutPolygon: false, removalMode: true,
  });

  S.boundaryMap.on('pm:create', e => {
    if (S.boundaryDrawn) S.boundaryMap.removeLayer(S.boundaryDrawn);
    S.boundaryDrawn = e.layer;
    const coords = e.layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
    S.cemWizardData.boundary = JSON.stringify(coords);
    const status = document.getElementById('boundary-status');
    status.textContent = `✓ Boundary drawn with ${coords.length} points.`;
    status.className = 'boundary-status ok';
  });

  S.boundaryMap.on('pm:remove', () => {
    S.boundaryDrawn = null;
    S.cemWizardData.boundary = null;
    document.getElementById('boundary-status').textContent = 'No boundary drawn yet.';
    document.getElementById('boundary-status').className = 'boundary-status';
  });
}

document.getElementById('btn-save-cemetery').addEventListener('click', async () => {
  const d = S.cemWizardData;
  if (!d.name) { toast('Go back and fill cemetery name', 'err'); return; }
  try {
    await dbPush('cemeteries', { ...d, createdAt: Date.now() });
    toast('Cemetery saved!', 'ok');
    closeOverlay('ov-add-cem');
    // Reset wizard
    S.cemWizardData = {};
    S.boundaryDrawn = null;
    if (S.boundaryMap) { S.boundaryMap.remove(); S.boundaryMap = null; }
    if (S.locateMap)   { S.locateMap.remove(); S.locateMap = null; }
  } catch(err) { toast(err.message, 'err'); }
});

// ═══════════════════════════
//  GRAVE WIZARD
// ═══════════════════════════
function openGraveWizard(skipToStep3 = false) {
  if (!skipToStep3) S.graveWizardData = {};
  showGraveWizardStep(skipToStep3 ? 3 : 1);
  openOverlay('ov-add-grave');
}

function showGraveWizardStep(n) {
  [1,2,3].forEach(i => {
    document.getElementById(`gw-step-${i}`).classList.toggle('active', i === n);
    const ws = document.querySelector(`#ov-add-grave .wstep[data-step="${i}"]`);
    ws.classList.toggle('active', i === n);
    ws.classList.toggle('done', i < n);
  });
  if (n === 2) renderGraveCemOptions();
  if (n === 3) setTimeout(() => initGraveDrawMap(), 200);
}

window.graveWizardNext = function(step) {
  if (step === 1) {
    const name = document.getElementById('gw-name').value.trim();
    if (!name) { toast('Name is required', 'err'); return; }
    S.graveWizardData.name      = name;
    S.graveWizardData.fatherName= document.getElementById('gw-father').value.trim();
    S.graveWizardData.gender    = document.getElementById('gw-gender').value;
    S.graveWizardData.dob       = document.getElementById('gw-dob').value;
    S.graveWizardData.dod       = document.getElementById('gw-dod').value;
    S.graveWizardData.burialDate= document.getElementById('gw-burial').value;
    S.graveWizardData.section   = document.getElementById('gw-section').value.trim();
    S.graveWizardData.row       = document.getElementById('gw-row').value.trim();
    S.graveWizardData.plot      = document.getElementById('gw-plot').value.trim();
    S.graveWizardData.bio       = document.getElementById('gw-bio').value.trim();
    S.graveWizardData.status    = document.getElementById('gw-status').value;
    // Auto-calc age
    if (S.graveWizardData.dob && S.graveWizardData.dod) {
      const age = Math.floor((new Date(S.graveWizardData.dod) - new Date(S.graveWizardData.dob)) / (365.25*24*3600*1000));
      S.graveWizardData.age = age > 0 ? age : null;
    } else {
      S.graveWizardData.age = parseInt(document.getElementById('gw-age').value) || null;
    }
  }
  if (step === 2) {
    if (!S.graveWizardData.cemId) { toast('Select a cemetery', 'err'); return; }
  }
  showGraveWizardStep(step + 1);
};

window.graveWizardBack = function(step) {
  showGraveWizardStep(step - 1);
};

function renderGraveCemOptions() {
  const el = document.getElementById('gw-cem-options');
  const cems = Object.entries(S.cemeteries);
  el.innerHTML = cems.map(([cid, c]) => `
    <div class="cem-radio ${S.graveWizardData.cemId === cid ? 'selected' : ''}" onclick="selectGraveCem('${cid}')">
      <div>
        <div class="cem-radio-name">${esc(c.name)}</div>
        <div class="cem-radio-loc">${[c.city, c.country].filter(Boolean).map(esc).join(', ')}</div>
      </div>
    </div>`).join('');
}

window.selectGraveCem = function(cemId) {
  S.graveWizardData.cemId = cemId;
  document.querySelectorAll('.cem-radio').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.cem-radio').forEach(el => {
    if (el.textContent.includes(S.cemeteries[cemId]?.name)) el.classList.add('selected');
  });
};

function initGraveDrawMap() {
  const cem    = S.cemeteries[S.graveWizardData.cemId] || {};
  const center = cem.centerLat ? [cem.centerLat, cem.centerLng] : [30.3753, 69.3451];

  if (S.graveDrawMap) {
    S.graveDrawMap.setView(center, 19);
    S.graveDrawMap.invalidateSize();
    // If polygon already set from main map drawing, show it
    if (S.graveWizardData.polygon && !S.graveDrawn) {
      try {
        const coords = JSON.parse(S.graveWizardData.polygon);
        S.graveDrawn = L.polygon(coords, { color:'#E05A5A', fillOpacity:.5 }).addTo(S.graveDrawMap);
        const status = document.getElementById('grave-draw-status');
        status.textContent = '✓ Grave location set from map drawing.';
        status.className = 'boundary-status ok';
        S.graveDrawMap.fitBounds(S.graveDrawn.getBounds(), { padding: [40,40] });
      } catch(e) {}
    }
    return;
  }

  S.graveDrawMap = L.map('gw-draw-map').setView(center, 19);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OSM © CARTO', subdomains: 'abcd', maxZoom: 21
  }).addTo(S.graveDrawMap);

  // Show cemetery boundary if exists
  const cemData = S.cemeteries[S.graveWizardData.cemId];
  if (cemData?.boundary) {
    try {
      const coords = JSON.parse(cemData.boundary);
      L.polygon(coords, { color:'#0F1923', weight:2, fillOpacity:.04, dashArray:'6 4' }).addTo(S.graveDrawMap);
      S.graveDrawMap.fitBounds(L.polygon(coords).getBounds(), { padding:[20,20] });
    } catch(e) {}
  }

  // Show existing graves
  Object.entries(S.graves).filter(([,g]) => g.cemeteryId === S.graveWizardData.cemId).forEach(([,g]) => {
    if (!g.polygon) return;
    try {
      const coords = JSON.parse(g.polygon);
      L.polygon(coords, { color:'#fff', weight:1, fillColor: STATUS_COLOR[g.status]||'#9CA3AF', fillOpacity:.7 }).addTo(S.graveDrawMap);
    } catch(e) {}
  });

  S.graveDrawMap.pm.addControls({
    position: 'topleft',
    drawMarker:false, drawCircle:false, drawCircleMarker:false,
    drawPolyline:false, drawText:false, drawPolygon:false,
    drawRectangle:true, editMode:true, dragMode:false,
    cutPolygon:false, removalMode:true,
  });

  S.graveDrawMap.on('pm:create', e => {
    if (S.graveDrawn) S.graveDrawMap.removeLayer(S.graveDrawn);
    S.graveDrawn = e.layer;
    const coords = e.layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
    S.graveWizardData.polygon = JSON.stringify(coords);
    const center  = e.layer.getBounds().getCenter();
    S.graveWizardData.lat = center.lat;
    S.graveWizardData.lng = center.lng;
    const status = document.getElementById('grave-draw-status');
    status.textContent = '✓ Grave location drawn.';
    status.className = 'boundary-status ok';
  });

  // Pre-fill if polygon already set
  if (S.graveWizardData.polygon) {
    try {
      const coords = JSON.parse(S.graveWizardData.polygon);
      S.graveDrawn = L.polygon(coords, { color:'#E05A5A', fillOpacity:.5 }).addTo(S.graveDrawMap);
      S.graveDrawMap.fitBounds(S.graveDrawn.getBounds(), { padding:[40,40] });
      document.getElementById('grave-draw-status').textContent = '✓ Grave location set.';
      document.getElementById('grave-draw-status').className = 'boundary-status ok';
    } catch(e) {}
  }
}

document.getElementById('btn-save-grave').addEventListener('click', async () => {
  const d = S.graveWizardData;
  if (!d.name)   { toast('Go back and fill person name', 'err'); return; }
  if (!d.cemId)  { toast('Go back and select a cemetery', 'err'); return; }
  if (!d.polygon) { toast('Draw the grave location on the map', 'err'); return; }

  const graveData = {
    cemeteryId:  d.cemId,
    name:        d.name,
    fatherName:  d.fatherName || null,
    gender:      d.gender     || null,
    dob:         d.dob        || null,
    deathDate:   d.dod        || null,
    burialDate:  d.burialDate || null,
    age:         d.age        || null,
    section:     d.section    || null,
    row:         d.row        || null,
    plot:        d.plot       || null,
    bio:         d.bio        || null,
    status:      d.status     || 'occupied',
    polygon:     d.polygon,
    lat:         d.lat        || null,
    lng:         d.lng        || null,
    createdAt:   Date.now()
  };

  try {
    await dbPush('graves', graveData);
    toast('Grave registered!', 'ok');
    closeOverlay('ov-add-grave');
    S.graveWizardData = {};
    S.graveDrawn = null;
    if (S.graveDrawMap) { S.graveDrawMap.remove(); S.graveDrawMap = null; }
    // Fly to grave on main map
    if (d.cemId) flyToCemetery(d.cemId);
  } catch(err) { toast(err.message, 'err'); }
});

// ═══════════════════════════
//  GENERATE GRAVE GRID
// ═══════════════════════════
function metersToLatLng(lat, meters) {
  return meters / 111320;
}
function metersToLng(lat, meters) {
  return meters / (111320 * Math.cos(lat * Math.PI / 180));
}

window.previewGrid = function() {
  const cemId = document.getElementById('gg-cem').value;
  const c     = S.cemeteries[cemId];
  if (!cemId || !c?.boundary) { toast('Select a cemetery with a drawn boundary', 'err'); return; }

  const w   = parseFloat(document.getElementById('gg-w').value)   || 2;
  const l   = parseFloat(document.getElementById('gg-l').value)   || 3;
  const gap = parseFloat(document.getElementById('gg-gap').value) || 0.5;

  const cells = computeGrid(c, w, l, gap);
  document.getElementById('gg-preview-info').innerHTML =
    `<b>Preview:</b> ~${cells.length} grave plots will be generated inside the boundary.`;
};

function computeGrid(c, graveW, graveL, gap) {
  let boundaryCoords;
  try { boundaryCoords = JSON.parse(c.boundary); } catch(e) { return []; }
  if (!boundaryCoords?.length) return [];

  const lats = boundaryCoords.map(p => p[0]);
  const lngs = boundaryCoords.map(p => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const centerLat = (minLat + maxLat) / 2;

  const dLat = metersToLatLng(centerLat, graveL + gap);
  const dLng = metersToLng(centerLat, graveW + gap);
  const gLat = metersToLatLng(centerLat, graveL);
  const gLng = metersToLng(centerLat, graveW);

  const boundary = L.polygon(boundaryCoords);
  const cells = [];

  let lat = minLat + metersToLatLng(centerLat, gap);
  while (lat + gLat < maxLat) {
    let lng = minLng + metersToLng(centerLat, gap);
    while (lng + gLng < maxLng) {
      const cellCenter = L.latLng(lat + gLat / 2, lng + gLng / 2);
      if (boundary.getBounds().contains(cellCenter)) {
        // Simple point-in-polygon check using leaflet
        cells.push([
          [lat, lng], [lat + gLat, lng],
          [lat + gLat, lng + gLng], [lat, lng + gLng]
        ]);
      }
      lng += dLng;
    }
    lat += dLat;
  }
  return cells;
}

document.getElementById('btn-gen-grid').addEventListener('click', async () => {
  const cemId = document.getElementById('gg-cem').value;
  const c     = S.cemeteries[cemId];
  if (!cemId || !c?.boundary) { toast('Select a cemetery with a drawn boundary', 'err'); return; }

  const w   = parseFloat(document.getElementById('gg-w').value)   || 2;
  const l   = parseFloat(document.getElementById('gg-l').value)   || 3;
  const gap = parseFloat(document.getElementById('gg-gap').value) || 0.5;

  const cells = computeGrid(c, w, l, gap);
  if (!cells.length) { toast('No cells generated — check boundary', 'err'); return; }
  if (!confirm(`Generate ${cells.length} empty grave plots inside ${c.name}? This may take a moment.`)) return;

  toast(`Generating ${cells.length} graves…`);

  let count = 0;
  for (const coords of cells) {
    const center = [(coords[0][0]+coords[2][0])/2, (coords[0][1]+coords[2][1])/2];
    await dbPush('graves', {
      cemeteryId: cemId,
      status:     'empty',
      name:       null,
      polygon:    JSON.stringify(coords),
      lat:        center[0],
      lng:        center[1],
      section:    null, row: null, plot: `${++count}`,
      createdAt:  Date.now()
    });
  }

  toast(`${count} grave plots generated!`, 'ok');
  closeOverlay('ov-grid-gen');
  flyToCemetery(cemId);
});

// ═══════════════════════════
//  SEARCH
// ═══════════════════════════
function doSearch() {
  const q     = (document.getElementById('search-q')?.value || '').trim().toLowerCase();
  const fCem  = document.getElementById('sf-cem')?.value    || '';
  const fCity = document.getElementById('sf-city')?.value   || '';
  const fGen  = document.getElementById('sf-gender')?.value || '';
  const hint  = document.getElementById('search-empty');
  const grid  = document.getElementById('search-results');

  if (!q && !fCem && !fCity && !fGen) {
    grid.innerHTML = ''; hint.classList.remove('hidden'); return;
  }
  hint.classList.add('hidden');

  const results = Object.entries(S.graves).filter(([gid, g]) => {
    if (fCem && g.cemeteryId !== fCem)        return false;
    if (fGen && g.gender !== fGen)             return false;
    if (fCity) {
      const cem = S.cemeteries[g.cemeteryId] || {};
      if (cem.city !== fCity)                  return false;
    }
    if (!q) return true;
    return (g.name       || '').toLowerCase().includes(q) ||
           (g.fatherName || '').toLowerCase().includes(q) ||
           (g.plot       || '').toLowerCase().includes(q) ||
           (g.section    || '').toLowerCase().includes(q);
  });

  if (!results.length) { grid.innerHTML = `<p style="color:#9CA3AF;font-size:.85rem">No graves found.</p>`; return; }

  grid.innerHTML = results.map(([gid, g]) => {
    const cem = S.cemeteries[g.cemeteryId] || {};
    return `<div class="result-card" data-status="${g.status}" onclick="openGraveDetail('${gid}')">
      <div class="rc-name">${esc(g.name || 'Empty plot')}</div>
      ${g.fatherName ? `<div class="rc-father">s/o ${esc(g.fatherName)}</div>` : ''}
      <div class="rc-meta">
        <span class="chip">📍 ${esc(cem.name || '–')}</span>
        ${g.deathDate ? `<span class="chip">✝ ${g.deathDate}</span>` : ''}
        ${g.section ? `<span class="chip">§${esc(g.section)}</span>` : ''}
        <span class="status-pill ${g.status}">${g.status}</span>
=======
['search-input','f-cemetery','f-gender','f-status'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', doSearch);
  document.getElementById(id)?.addEventListener('change', doSearch);
});
document.getElementById('search-clear').addEventListener('click', () => {
  document.getElementById('search-input').value = '';
  doSearch();
});

// ══════════════════════════════════════
//  GRAVE DETAIL MODAL
// ══════════════════════════════════════
window.openGraveDetail = function(gid) {
  const g   = S.graves[gid];
  if (!g) return;
  const cem = S.cemeteries[g.cemeteryId] || {};
  const dec = Object.values(S.deceased).find(d => d.graveId === gid);
  const isAdmin = !!window.__user;
  const url = `${location.href.split('?')[0]}?grave=${gid}`;

  document.getElementById('grave-detail').innerHTML = `
    <div class="gd-header">
      <div class="gd-icon">${dec?.gender === 'female' ? '♀' : '♂'}</div>
      <div>
        <div class="gd-name">${esc(dec?.fullName || 'Empty plot')}</div>
        ${dec?.fatherName ? `<div class="gd-father">s/o ${esc(dec.fatherName)}</div>` : ''}
        <span class="sbadge ${g.status}" style="margin-top:.35rem;display:inline-block">${g.status}</span>
        ${g.maintenanceFlag ? `<span class="maint-badge ${g.maintenanceFlag}" style="margin-left:.4rem">${g.maintenanceFlag.replace('-',' ')}</span>` : ''}
      </div>
    </div>

    <div class="gd-grid">
      <div class="gd-item"><label>Cemetery</label><p>${esc(cem.name || '–')}</p></div>
      <div class="gd-item"><label>Section / Row / Plot</label><p>${esc(g.section||'–')} / ${esc(g.row||'–')} / ${esc(g.plot||'–')}</p></div>
      <div class="gd-item"><label>Date of birth</label><p>${esc(dec?.birthDate || '–')}</p></div>
      <div class="gd-item"><label>Date of death</label><p>${esc(dec?.deathDate || '–')}</p></div>
      <div class="gd-item"><label>Burial date</label><p>${esc(dec?.burialDate || '–')}</p></div>
      <div class="gd-item"><label>Gender</label><p>${esc(dec?.gender || '–')}</p></div>
      ${g.latitude  ? `<div class="gd-item"><label>GPS</label><p>${g.latitude.toFixed(5)}, ${g.longitude.toFixed(5)}</p></div>` : ''}
      ${dec?.age ? `<div class="gd-item"><label>Age</label><p>${dec.age}</p></div>` : ''}
    </div>

    ${dec?.bio ? `<div class="gd-bio">${esc(dec.bio)}</div>` : ''}

    ${g.latitude && g.longitude ? `<div class="gd-mini-map" id="gd-mini-map"></div>` : ''}

    <div style="margin-bottom:1rem">
      <div class="gd-qr-label">Timeline</div>
      <div class="gd-timeline">
        ${dec?.burialDate ? `<div class="gd-titem"><div class="gd-tdate">${dec.burialDate}</div><div class="gd-tlabel">Buried</div></div>` : ''}
        ${dec?.deathDate  ? `<div class="gd-titem"><div class="gd-tdate">${dec.deathDate}</div><div class="gd-tlabel">Passed away</div></div>` : ''}
        <div class="gd-titem"><div class="gd-tdate">–</div><div class="gd-tlabel">Grave registered</div></div>
      </div>
    </div>

    <div class="gd-qr">
      <div class="gd-qr-label">QR Code — scan to open this grave</div>
      <div id="gd-qr-box"></div>
    </div>

    <div class="gd-actions" style="margin-top:1rem">
      ${g.latitude && g.longitude ? `<button class="btn-moss" onclick="navTo(${g.latitude},${g.longitude})">🧭 Navigate</button>` : ''}
      ${isAdmin ? `<button class="btn-primary" onclick="editGrave('${gid}')">Edit</button>` : ''}
      ${isAdmin ? `<button class="btn-secondary" onclick="openMaintModal('${gid}')">Flag maintenance</button>` : ''}
    </div>
  `;

  openOverlay('overlay-grave');

  if (g.latitude && g.longitude) {
    setTimeout(() => {
      const mm = L.map('gd-mini-map', { zoomControl: false, dragging: false }).setView([g.latitude, g.longitude], 17);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 20
      }).addTo(mm);
      L.marker([g.latitude, g.longitude], { icon: markerIcon(g.status) }).addTo(mm);
    }, 120);
  }

  setTimeout(() => {
    const qrEl = document.getElementById('gd-qr-box');
    if (qrEl) new QRCode(qrEl, { text: url, width: 90, height: 90 });
  }, 120);
};

window.navTo = (lat, lng) =>
  window.open(`https://www.openstreetmap.org/directions?from=&to=${lat},${lng}`, '_blank');

// ══════════════════════════════════════
//  LEAFLET MAP
// ══════════════════════════════════════
function initMap() {
  if (!S.map) {
    S.map = L.map('leaflet-map').setView([30.3753, 69.3451], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd', maxZoom: 20
    }).addTo(S.map);

    // Geoman draw controls (admin only)
    if (window.__user) {
      S.map.pm.addControls({
        position: 'topleft',
        drawMarker: false,
        drawCircle: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawText: false,
        drawPolygon: true,
        drawRectangle: true,
        editMode: true,
        dragMode: true,
        cutPolygon: false,
        removalMode: true,
      });

      S.map.on('pm:create', async e => {
        const cemId = document.getElementById('map-cem-sel').value;
        if (!cemId) { toast('Select a cemetery first to save its boundary', 'err'); S.map.removeLayer(e.layer); return; }
        const coords = e.layer.toGeoJSON().geometry;
        await dbUpdate(`cemeteries/${cemId}`, { boundary: JSON.stringify(coords) });
        toast('Cemetery boundary saved!', 'ok');
        S.map.removeLayer(e.layer);
        renderBoundaries();
      });
    }
  }

  updateMapMarkers();
  renderBoundaries();
  renderGrid();
}

function markerIcon(status) {
  const colors = { occupied: '#A84848', empty: '#4A7C59', reserved: '#C4922A', blocked: '#8B9BB4' };
  const c = colors[status] || '#8B9BB4';
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;background:${c};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7]
  });
}

function updateMapMarkers() {
  if (!S.map) return;
  Object.values(S.markers).forEach(m => S.map.removeLayer(m));
  S.markers = {};

  const filterCem = document.getElementById('map-cem-sel')?.value || '';
  const dbg = decByGrave();
  const coords = [];

  Object.entries(S.graves).forEach(([gid, g]) => {
    if (filterCem && g.cemeteryId !== filterCem) return;
    if (!g.latitude || !g.longitude) return;
    const dec = dbg[gid];
    const cem = S.cemeteries[g.cemeteryId] || {};
    const m = L.marker([g.latitude, g.longitude], { icon: markerIcon(g.status) })
      .addTo(S.map)
      .bindPopup(`<b>${esc(dec?.fullName || 'Empty')}</b><br>
        ${esc(cem.name || '')}<br>§${g.section} R${g.row} P${g.plot}<br>
        <a href="#" onclick="openGraveDetail('${gid}');return false" style="color:#4A7C59;font-weight:600">View details →</a>`);
    S.markers[gid] = m;
    coords.push([g.latitude, g.longitude]);
  });

  // Cemetery markers
  Object.entries(S.cemeteries).forEach(([cid, c]) => {
    if (filterCem && cid !== filterCem) return;
    if (!c.latitude || !c.longitude) return;
    const icon = L.divIcon({
      className: '',
      html: `<div style="background:#1A2744;color:#E4DDD4;border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35)">${esc(c.name)}</div>`,
      iconAnchor: [0, 0]
    });
    L.marker([c.latitude, c.longitude], { icon }).addTo(S.map);
    coords.push([c.latitude, c.longitude]);
  });

  if (coords.length > 0) {
    try { S.map.fitBounds(coords, { padding: [40, 40], maxZoom: 16 }); } catch(e) {}
  }
}

function renderBoundaries() {
  if (!S.map) return;
  Object.values(S.boundaryLayers).forEach(l => S.map.removeLayer(l));
  S.boundaryLayers = {};

  const filterCem = document.getElementById('map-cem-sel')?.value || '';
  Object.entries(S.cemeteries).forEach(([cid, c]) => {
    if (filterCem && cid !== filterCem) return;
    if (!c.boundary) return;
    try {
      const geo = JSON.parse(c.boundary);
      const layer = L.geoJSON({ type: 'Feature', geometry: geo }, {
        style: { color: '#1A2744', weight: 2, fillColor: '#4A7C59', fillOpacity: 0.07, dashArray: '6 4' }
      }).addTo(S.map);
      S.boundaryLayers[cid] = layer;
    } catch(e) {}
  });
}

['map-cem-sel'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => {
    updateMapMarkers(); renderBoundaries(); renderGrid();
  });
});

// View toggle
document.querySelectorAll('.vtoggle').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.vtoggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const v = btn.dataset.view;
    const gps  = document.getElementById('pane-gps');
    const grid = document.getElementById('pane-grid');
    if (v === 'gps')  { gps.classList.remove('hidden'); grid.classList.add('hidden'); }
    if (v === 'grid') { gps.classList.add('hidden'); grid.classList.remove('hidden'); }
    if (v === 'both') { gps.classList.remove('hidden'); grid.classList.remove('hidden'); }
    if (S.map) setTimeout(() => S.map.invalidateSize(), 50);
  });
});

// ══════════════════════════════════════
//  SECTION GRID MAP
// ══════════════════════════════════════
function renderGrid() {
  const el = document.getElementById('grid-map');
  if (!el) return;
  const filterCem = document.getElementById('map-cem-sel')?.value || '';
  const dbg = decByGrave();

  // Build tree: cemName → section → row → [graves]
  const tree = {};
  Object.entries(S.graves).forEach(([gid, g]) => {
    if (filterCem && g.cemeteryId !== filterCem) return;
    const cn = (S.cemeteries[g.cemeteryId] || {}).name || g.cemeteryId;
    if (!tree[cn]) tree[cn] = {};
    const sec = g.section || 'A';
    if (!tree[cn][sec]) tree[cn][sec] = {};
    const row = g.row || '1';
    if (!tree[cn][sec][row]) tree[cn][sec][row] = [];
    tree[cn][sec][row].push({ gid, g });
  });

  if (!Object.keys(tree).length) {
    el.innerHTML = '<p style="color:var(--text-lt);font-size:.82rem">No graves to display. Select a cemetery or add graves.</p>';
    return;
  }

  let html = '';
  Object.entries(tree).forEach(([cn, sections]) => {
    html += `<div class="grid-cem-label">${esc(cn)}</div>`;
    Object.entries(sections).sort().forEach(([sec, rows]) => {
      html += `<div class="grid-section"><div class="grid-sec-label">Section ${esc(sec)}</div>`;
      Object.entries(rows).sort((a,b) => a[0].localeCompare(b[0],undefined,{numeric:true})).forEach(([row, plots]) => {
        html += `<div class="grid-row"><div class="grid-row-lbl">${esc(row)}</div>`;
        plots.forEach(({ gid, g }) => {
          const dec = dbg[gid];
          const tip = `${dec?.fullName || 'Empty'} — §${g.section} R${g.row} P${g.plot} — ${g.status}`;
          html += `<div class="grid-cell ${g.status}" title="${esc(tip)}" onclick="openGraveDetail('${gid}')"></div>`;
        });
        html += `</div>`;
      });
      html += `</div>`;
    });
  });
  el.innerHTML = html;
}

// ══════════════════════════════════════
//  CEMETERIES PAGE
// ══════════════════════════════════════
function renderCemeteries() {
  const el = document.getElementById('cemeteries-list');
  if (!el) return;
  const cems = Object.entries(S.cemeteries);
  if (!cems.length) { el.innerHTML = '<p style="color:var(--text-lt)">No cemeteries registered yet.</p>'; return; }

  el.innerHTML = cems.map(([cid, c]) => {
    const graves   = Object.values(S.graves).filter(g => g.cemeteryId === cid);
    const total    = graves.length;
    const occupied = graves.filter(g => g.status === 'occupied').length;
    const avail    = graves.filter(g => g.status === 'empty').length;
    const loc      = [c.city, c.district, c.province, c.country].filter(Boolean).map(esc).join(', ');
    return `<div class="cem-card">
      <div class="cem-card-name">${esc(c.name)}</div>
      ${loc ? `<div class="cem-card-loc">📍 ${loc}</div>` : ''}
      ${c.description ? `<div class="cem-card-desc">${esc(c.description)}</div>` : ''}
      <div class="cem-card-footer">
        <div class="cem-stats">
          <div class="cem-stat"><div class="n">${total}</div><div class="l">Total</div></div>
          <div class="cem-stat"><div class="n" style="color:var(--rose)">${occupied}</div><div class="l">Occupied</div></div>
          <div class="cem-stat"><div class="n" style="color:var(--moss)">${avail}</div><div class="l">Available</div></div>
        </div>
        <button class="btn-map" onclick="viewCemMap('${cid}')">View map</button>
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
      </div>
    </div>`;
  }).join('');
}

<<<<<<< HEAD
['search-q','sf-cem','sf-city','sf-gender'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', doSearch);
  document.getElementById(id)?.addEventListener('change', doSearch);
});
document.getElementById('search-clear-btn').addEventListener('click', () => {
  document.getElementById('search-q').value = '';
  doSearch();
});

// ═══════════════════════════
//  CEMETERIES PANEL
// ═══════════════════════════
function renderCemeteriesPanel() {
  const el   = document.getElementById('cem-cards-list');
  const cems = Object.entries(S.cemeteries);
  if (!cems.length) { el.innerHTML = '<p style="color:#9CA3AF;font-size:.85rem">No cemeteries yet.</p>'; return; }

  el.innerHTML = cems.map(([cid, c]) => {
    const graves    = Object.values(S.graves).filter(g => g.cemeteryId === cid);
    const total     = graves.length;
    const occupied  = graves.filter(g => g.status === 'occupied').length;
    const avail     = graves.filter(g => g.status === 'empty').length;
    const loc       = [c.city, c.province, c.country].filter(Boolean).map(esc).join(', ');
    return `<div class="cem-card">
      <div class="cem-card-name">${esc(c.name)}</div>
      ${loc ? `<div class="cem-card-loc">📍 ${loc}</div>` : ''}
      ${c.description ? `<div style="font-size:.8rem;color:#6B7280;margin-bottom:.65rem;line-height:1.5">${esc(c.description)}</div>` : ''}
      <div class="cem-card-row">
        <div class="cem-mini-stats">
          <div class="cms-item"><div class="cms-num">${total}</div><div class="cms-lbl">Total</div></div>
          <div class="cms-item"><div class="cms-num" style="color:var(--occupied)">${occupied}</div><div class="cms-lbl">Occupied</div></div>
          <div class="cms-item"><div class="cms-num" style="color:var(--available)">${avail}</div><div class="cms-lbl">Available</div></div>
        </div>
        <button class="btn-view" onclick="viewOnMap('${cid}')">View on map</button>
      </div>
    </div>`;
  }).join('');
}

window.viewOnMap = function(cemId) {
  switchView('map');
  setTimeout(() => flyToCemetery(cemId), 200);
};

document.getElementById('btn-req-cemetery').addEventListener('click', () => openOverlay('ov-req-cem'));

// ═══════════════════════════
//  GRAVE DETAIL
// ═══════════════════════════
window.openGraveDetail = function(gid) {
  const g   = S.graves[gid];
  if (!g) return;
  const cem = S.cemeteries[g.cemeteryId] || {};
  const isAdmin = !!window.__user;
  const url = `${location.origin}${location.pathname}?grave=${gid}`;

  document.getElementById('grave-detail-body').innerHTML = `
    <div class="gd-hero">
      <div class="gd-avatar ${g.gender||'male'}">${g.gender === 'female' ? '♀' : '♂'}</div>
      <div>
        <div class="gd-name">${esc(g.name || 'Empty plot')}</div>
        ${g.fatherName ? `<div class="gd-father">s/o ${esc(g.fatherName)}</div>` : ''}
        <span class="status-pill ${g.status}" style="margin-top:.35rem;display:inline-block">${g.status}</span>
      </div>
    </div>

    <div class="gd-grid">
      <div class="gd-item"><label>Cemetery</label><p>${esc(cem.name||'–')}</p></div>
      <div class="gd-item"><label>Location</label><p>${[cem.city,cem.country].filter(Boolean).map(esc).join(', ')||'–'}</p></div>
      <div class="gd-item"><label>Date of birth</label><p>${esc(g.dob||'–')}</p></div>
      <div class="gd-item"><label>Date of death</label><p>${esc(g.deathDate||'–')}</p></div>
      <div class="gd-item"><label>Burial date</label><p>${esc(g.burialDate||'–')}</p></div>
      <div class="gd-item"><label>Age</label><p>${g.age ? esc(String(g.age)) : '–'}</p></div>
      ${g.section ? `<div class="gd-item"><label>Section / Row / Plot</label><p>${esc(g.section)} / ${esc(g.row||'–')} / ${esc(g.plot||'–')}</p></div>` : ''}
    </div>

    ${g.bio ? `<div class="gd-bio">${esc(g.bio)}</div>` : ''}

    <div class="gd-actions">
      ${g.lat && g.lng ? `<button class="btn-green" onclick="navToGrave(${g.lat},${g.lng})">🧭 Navigate</button>` : ''}
      <button class="btn-view" onclick="showOnMainMap('${gid}')">📍 Show on map</button>
      <button class="btn-secondary" style="font-size:.78rem" onclick="openCorrection('${gid}')">Report correction</button>
      ${isAdmin ? `<button class="btn-red" onclick="deleteGrave('${gid}')">Delete</button>` : ''}
    </div>

    <div style="margin-top:1rem">
      <div class="gd-qr-label">QR Code</div>
      <div id="gd-qr"></div>
    </div>

    ${isAdmin ? `
    <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
      <div class="gd-qr-label">Quick status update</div>
      <div style="display:flex;gap:.4rem;margin-top:.4rem;flex-wrap:wrap">
        <button class="btn-green" onclick="setGraveStatus('${gid}','empty')">Mark empty</button>
        <button style="background:var(--reserved);color:#fff;border:none;border-radius:6px;padding:.42rem .85rem;font-family:inherit;font-size:.78rem;font-weight:600;cursor:pointer" onclick="setGraveStatus('${gid}','reserved')">Mark reserved</button>
        <button class="btn-red" onclick="setGraveStatus('${gid}','occupied')">Mark occupied</button>
      </div>
    </div>` : ''}
  `;

  openOverlay('ov-grave');

  setTimeout(() => {
    const qrEl = document.getElementById('gd-qr');
    if (qrEl) new QRCode(qrEl, { text: url, width: 86, height: 86 });
  }, 100);
=======
window.viewCemMap = cid => {
  document.getElementById('map-cem-sel').value = cid;
  go('map');
};

document.getElementById('btn-add-cemetery')?.addEventListener('click', () => openOverlay('overlay-cem-form'));

document.getElementById('cem-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    name:     document.getElementById('cf-name').value.trim(),
    country:  document.getElementById('cf-country').value.trim(),
    province: document.getElementById('cf-province').value.trim(),
    district: document.getElementById('cf-district').value.trim(),
    city:     document.getElementById('cf-city').value.trim(),
    address:  document.getElementById('cf-address').value.trim(),
    description: document.getElementById('cf-desc').value.trim(),
    latitude:  parseFloat(document.getElementById('cf-lat').value) || null,
    longitude: parseFloat(document.getElementById('cf-lng').value) || null,
    createdAt: Date.now()
  };
  try {
    await dbPush('cemeteries', data);
    toast('Cemetery added!', 'ok');
    closeOverlay('overlay-cem-form');
    e.target.reset();
  } catch(err) { toast(err.message, 'err'); }
});

// ══════════════════════════════════════
//  GRAVES TABLE (admin)
// ══════════════════════════════════════
function renderGravesTable() {
  const tbody = document.getElementById('graves-tbody');
  if (!tbody) return;
  const fCem   = document.getElementById('ag-cem-filter')?.value || '';
  const fStat  = document.getElementById('ag-status-filter')?.value || '';
  const fQ     = (document.getElementById('ag-search')?.value || '').toLowerCase();
  const dbg    = decByGrave();

  const rows = Object.entries(S.graves).filter(([gid, g]) => {
    if (fCem  && g.cemeteryId !== fCem)  return false;
    if (fStat && g.status !== fStat)     return false;
    if (fQ) {
      const dec = dbg[gid];
      if (!(dec?.fullName||'').toLowerCase().includes(fQ) &&
          !(g.plot||'').toLowerCase().includes(fQ) &&
          !(g.section||'').toLowerCase().includes(fQ)) return false;
    }
    return true;
  });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-lt);padding:2rem">No graves found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(([gid, g]) => {
    const cem = S.cemeteries[g.cemeteryId] || {};
    const dec = dbg[gid];
    return `<tr>
      <td style="font-family:monospace;font-size:.75rem;color:var(--text-lt)">${esc(g.plot||gid.slice(-6))}</td>
      <td>${esc(cem.name||'–')}</td>
      <td>§${esc(g.section||'–')} / R${esc(g.row||'–')}</td>
      <td><span class="sbadge ${g.status}">${g.status}</span></td>
      <td>${dec ? esc(dec.fullName) : '<span style="color:var(--text-lt)">—</span>'}</td>
      <td style="font-size:.8rem">${dec?.deathDate||'—'}</td>
      <td>${g.maintenanceFlag ? `<span class="maint-badge ${g.maintenanceFlag}">${g.maintenanceFlag.replace('-',' ')}</span>` : '<span style="color:var(--text-lt)">—</span>'}</td>
      <td>
        <button class="ico-btn" onclick="openGraveDetail('${gid}')" title="View">👁</button>
        <button class="ico-btn" onclick="editGrave('${gid}')" title="Edit">✏️</button>
        <button class="ico-btn" onclick="deleteGrave('${gid}')" title="Delete">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

['ag-cem-filter','ag-status-filter','ag-search'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', renderGravesTable);
  document.getElementById(id)?.addEventListener('change', renderGravesTable);
});

// ══════════════════════════════════════
//  ADD / EDIT GRAVE
// ══════════════════════════════════════
document.getElementById('btn-add-grave').addEventListener('click', () => {
  S.editGraveId = null;
  document.getElementById('grave-form-title').textContent = 'Register grave';
  document.getElementById('grave-submit-btn').textContent = 'Save grave';
  document.getElementById('grave-form').reset();
  toggleDecFields('empty');
  openOverlay('overlay-grave-form');
});

document.getElementById('gf-status').addEventListener('change', e => toggleDecFields(e.target.value));

function toggleDecFields(status) {
  const show = status === 'occupied';
  document.getElementById('dec-section-lbl').classList.toggle('hidden', !show);
  document.getElementById('dec-fields').classList.toggle('hidden', !show);
}

window.editGrave = function(gid) {
  closeOverlay('overlay-grave');
  const g = S.graves[gid];
  if (!g) return;
  S.editGraveId = gid;
  document.getElementById('grave-form-title').textContent = 'Edit grave';
  document.getElementById('grave-submit-btn').textContent = 'Update grave';

  document.getElementById('gf-cem').value     = g.cemeteryId || '';
  document.getElementById('gf-section').value = g.section    || '';
  document.getElementById('gf-row').value      = g.row        || '';
  document.getElementById('gf-plot').value     = g.plot       || '';
  document.getElementById('gf-lat').value      = g.latitude   || '';
  document.getElementById('gf-lng').value      = g.longitude  || '';
  document.getElementById('gf-status').value   = g.status     || 'empty';
  document.getElementById('gf-maint').value    = g.maintenanceFlag || '';
  document.getElementById('gf-maint-note').value = g.maintenanceNote || '';
  toggleDecFields(g.status);

  const dec = Object.values(S.deceased).find(d => d.graveId === gid);
  if (dec) {
    document.getElementById('gf-name').value   = dec.fullName   || '';
    document.getElementById('gf-father').value = dec.fatherName || '';
    document.getElementById('gf-gender').value = dec.gender     || '';
    document.getElementById('gf-dob').value    = dec.birthDate  || '';
    document.getElementById('gf-dod').value    = dec.deathDate  || '';
    document.getElementById('gf-burial').value = dec.burialDate || '';
    document.getElementById('gf-bio').value    = dec.bio        || '';
  }
  openOverlay('overlay-grave-form');
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
};

window.navToGrave = (lat, lng) =>
  window.open(`https://www.openstreetmap.org/directions?from=&to=${lat},${lng}`, '_blank');

window.showOnMainMap = function(gid) {
  closeOverlay('ov-grave');
  switchView('map');
  const g = S.graves[gid];
  if (!g?.lat || !g?.lng) return;
  setTimeout(() => {
    S.MAP.flyTo([g.lat, g.lng], 20);
    S.graveLayers[gid]?.openTooltip();
  }, 200);
};

window.setGraveStatus = async (gid, status) => {
  await dbUpdate(`graves/${gid}`, { status });
  toast(`Status updated to ${status}`, 'ok');
  closeOverlay('ov-grave');
};

window.deleteGrave = async gid => {
  if (!confirm('Delete this grave record?')) return;
  await dbRemove(`graves/${gid}`);
  toast('Grave deleted', 'ok');
  closeOverlay('ov-grave');
};

// ═══════════════════════════
//  CORRECTION REQUEST
// ═══════════════════════════
window.openCorrection = function(gid) {
  document.getElementById('corr-grave-id').value = gid;
  openOverlay('ov-correction');
};

document.getElementById('correction-form').addEventListener('submit', async e => {
  e.preventDefault();
<<<<<<< HEAD
  const gid = document.getElementById('corr-grave-id').value;
  const g   = S.graves[gid] || {};
  await dbPush('requests', {
    type:       'correction',
    graveId:    gid,
    graveName:  g.name || '',
    cemeteryId: g.cemeteryId || '',
    issue:      document.getElementById('corr-type').value,
    message:    document.getElementById('corr-msg').value.trim(),
    submitter:  document.getElementById('corr-name').value.trim() || 'Anonymous',
    contact:    document.getElementById('corr-contact').value.trim(),
    resolved:   false,
    createdAt:  Date.now()
  });
  toast('Report submitted. Thank you!', 'ok');
  closeOverlay('ov-correction');
  e.target.reset();
});

// ═══════════════════════════
//  REQUEST CEMETERY
// ═══════════════════════════
document.getElementById('req-cem-form').addEventListener('submit', async e => {
  e.preventDefault();
  await dbPush('requests', {
    type:      'new-cemetery',
    name:      document.getElementById('rc-name').value.trim(),
    city:      document.getElementById('rc-city').value.trim(),
    country:   document.getElementById('rc-country').value.trim(),
    desc:      document.getElementById('rc-desc').value.trim(),
    submitter: document.getElementById('rc-submitter').value.trim() || 'Anonymous',
    contact:   document.getElementById('rc-contact').value.trim(),
    resolved:  false,
    createdAt: Date.now()
  });
  toast('Request submitted!', 'ok');
  closeOverlay('ov-req-cem');
  e.target.reset();
});

// ═══════════════════════════
//  ADMIN PANEL
// ═══════════════════════════
function renderAdmin() {
  // Tiles
  const graves    = Object.values(S.graves);
  const reqs      = Object.values(S.requests);
  const total     = graves.length;
  const occupied  = graves.filter(g => g.status === 'occupied').length;
  const avail     = graves.filter(g => g.status === 'empty').length;
  const reserved  = graves.filter(g => g.status === 'reserved').length;
  const pending   = reqs.filter(r => !r.resolved).length;
  const cems      = Object.keys(S.cemeteries).length;

  document.getElementById('dash-tiles').innerHTML = `
    <div class="dash-tile"><div class="dn">${cems}</div><div class="dl">Cemeteries</div></div>
    <div class="dash-tile"><div class="dn">${total}</div><div class="dl">Total graves</div></div>
    <div class="dash-tile occ"><div class="dn">${occupied}</div><div class="dl">Occupied</div></div>
    <div class="dash-tile avl"><div class="dn">${avail}</div><div class="dl">Available</div></div>
    <div class="dash-tile res"><div class="dn">${reserved}</div><div class="dl">Reserved</div></div>
    <div class="dash-tile req"><div class="dn">${pending}</div><div class="dl">Pending requests</div></div>
  `;

  renderAdminTab('graves');
}

// Admin tabs
document.querySelectorAll('.atab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.atab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.atab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`atab-${btn.dataset.atab}`).classList.remove('hidden');
    renderAdminTab(btn.dataset.atab);
  });
});

function renderAdminTab(tab) {
  if (tab === 'graves') renderAdminGraves();
  if (tab === 'requests') renderAdminRequests();
  if (tab === 'cemeteries-admin') renderAdminCemeteries();
}

function renderAdminGraves() {
  const el = document.getElementById('atab-graves');
  const graves = Object.entries(S.graves).sort((a,b) => (b[1].createdAt||0)-(a[1].createdAt||0));
  if (!graves.length) { el.innerHTML = '<p style="color:#9CA3AF;font-size:.83rem;padding:.5rem">No graves yet. Use the map to register graves.</p>'; return; }

  el.innerHTML = `
    <div style="margin-bottom:.75rem;display:flex;gap:.4rem">
      <button class="btn-primary" style="font-size:.78rem" onclick="openGraveWizard()">+ Register grave</button>
    </div>` +
    graves.map(([gid, g]) => {
      const cem   = S.cemeteries[g.cemeteryId] || {};
      const color = STATUS_COLOR[g.status] || '#9CA3AF';
      return `<div class="ag-row">
        <div class="ag-status-dot" style="background:${color}"></div>
        <div class="ag-name">${esc(g.name || 'Empty plot')}</div>
        <div class="ag-cem">${esc(cem.name || '–')}</div>
        <div class="ag-actions">
          <button class="ibt" onclick="openGraveDetail('${gid}')" title="View">👁</button>
          <button class="ibt" onclick="deleteGrave('${gid}')" title="Delete">🗑</button>
        </div>
      </div>`;
    }).join('');
}

function renderAdminRequests() {
  const el   = document.getElementById('atab-requests');
  const reqs = Object.entries(S.requests).sort((a,b) => b[1].createdAt - a[1].createdAt);
  if (!reqs.length) { el.innerHTML = '<p style="color:#9CA3AF;font-size:.83rem;padding:.5rem">No requests yet.</p>'; return; }

  el.innerHTML = reqs.map(([rid, r]) => {
    const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '–';
    return `<div class="req-card" style="${r.resolved ? 'opacity:.5' : ''}">
      <div class="req-card-top">
        <span class="req-card-type">${esc(r.type?.replace('-', ' ')||'–')}</span>
        <span class="req-card-date">${date}</span>
      </div>
      <div class="req-card-msg">${esc(r.message || r.desc || '–')}</div>
      <div class="req-card-meta">
        ${r.graveName ? `Grave: ${esc(r.graveName)} · ` : ''}
        ${r.name ? esc(r.name) : esc(r.submitter||'Anonymous')}
        ${r.contact ? ` · ${esc(r.contact)}` : ''}
      </div>
      <div class="req-card-actions">
        ${!r.resolved ? `<button class="btn-green" style="font-size:.75rem;padding:.3rem .65rem" onclick="resolveRequest('${rid}')">✓ Resolve</button>` : '<span style="color:var(--available);font-size:.75rem;font-weight:600">✓ Resolved</span>'}
        <button class="btn-secondary" style="font-size:.75rem;padding:.3rem .65rem" onclick="deleteRequest('${rid}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function renderAdminCemeteries() {
  const el = document.getElementById('atab-cemeteries-admin');
  const cems = Object.entries(S.cemeteries);
  if (!cems.length) { el.innerHTML = '<p style="color:#9CA3AF;font-size:.83rem;padding:.5rem">No cemeteries yet.</p>'; return; }

  el.innerHTML = `
    <div style="margin-bottom:.75rem">
      <button class="btn-primary" style="font-size:.78rem" onclick="openOverlay('ov-add-cem')">+ Add cemetery</button>
    </div>` +
    cems.map(([cid, c]) => {
      const graves = Object.values(S.graves).filter(g => g.cemeteryId === cid).length;
      return `<div class="ag-row">
        <div class="ag-status-dot" style="background:var(--available)"></div>
        <div class="ag-name">${esc(c.name)}</div>
        <div class="ag-cem">${esc(c.city||'–')} · ${graves} graves</div>
        <div class="ag-actions">
          <button class="ibt" onclick="viewOnMap('${cid}')" title="View on map">🗺</button>
          <button class="ibt" onclick="deleteCemetery('${cid}')" title="Delete">🗑</button>
        </div>
      </div>`;
    }).join('');
}

window.resolveRequest = async rid => {
  await dbUpdate(`requests/${rid}`, { resolved: true });
  toast('Marked resolved', 'ok');
};
window.deleteRequest = async rid => {
  if (!confirm('Delete this request?')) return;
  await dbRemove(`requests/${rid}`);
  toast('Deleted', 'ok');
};
window.deleteCemetery = async cid => {
  if (!confirm('Delete this cemetery? All graves inside will remain in the database.')) return;
  await dbRemove(`cemeteries/${cid}`);
  toast('Cemetery deleted', 'ok');
};

// ═══════════════════════════
//  OVERLAY HELPERS
// ═══════════════════════════
window.openOverlay  = id => document.getElementById(id).classList.add('open');
window.closeOverlay = id => document.getElementById(id).classList.remove('open');
=======
  const status = document.getElementById('gf-status').value;
  const gData = {
    cemeteryId: document.getElementById('gf-cem').value,
    section:    document.getElementById('gf-section').value.trim(),
    row:        document.getElementById('gf-row').value.trim(),
    plot:       document.getElementById('gf-plot').value.trim(),
    latitude:   parseFloat(document.getElementById('gf-lat').value) || null,
    longitude:  parseFloat(document.getElementById('gf-lng').value) || null,
    status,
    maintenanceFlag: document.getElementById('gf-maint').value || null,
    maintenanceNote: document.getElementById('gf-maint-note').value.trim() || null,
    updatedAt: Date.now()
  };
  try {
    let gid = S.editGraveId;
    if (gid) { await dbSet(`graves/${gid}`, gData); }
    else { gid = await dbPush('graves', gData); }

    if (status === 'occupied') {
      const dData = {
        graveId:    gid,
        fullName:   document.getElementById('gf-name').value.trim(),
        fatherName: document.getElementById('gf-father').value.trim(),
        gender:     document.getElementById('gf-gender').value,
        birthDate:  document.getElementById('gf-dob').value,
        deathDate:  document.getElementById('gf-dod').value,
        burialDate: document.getElementById('gf-burial').value,
        bio:        document.getElementById('gf-bio').value.trim(),
        updatedAt:  Date.now()
      };
      const existing = Object.entries(S.deceased).find(([,d]) => d.graveId === gid);
      if (existing) await dbSet(`deceased/${existing[0]}`, dData);
      else await dbPush('deceased', dData);
    }
    toast(S.editGraveId ? 'Grave updated!' : 'Grave registered!', 'ok');
    closeOverlay('overlay-grave-form');
    e.target.reset();
    S.editGraveId = null;
  } catch(err) { toast(err.message, 'err'); }
});

window.deleteGrave = async gid => {
  if (!confirm('Delete this grave record permanently?')) return;
  try {
    await dbRemove(`graves/${gid}`);
    const dec = Object.entries(S.deceased).find(([,d]) => d.graveId === gid);
    if (dec) await dbRemove(`deceased/${dec[0]}`);
    toast('Grave deleted', 'ok');
  } catch(err) { toast(err.message, 'err'); }
};

// ══════════════════════════════════════
//  MAINTENANCE
// ══════════════════════════════════════
function renderMaintenance() {
  const tbody = document.getElementById('maint-tbody');
  if (!tbody) return;
  const fCem   = document.getElementById('maint-cem-filter')?.value || '';
  const fFlag  = document.getElementById('maint-status-filter')?.value || '';
  const dbg    = decByGrave();

  const rows = Object.entries(S.graves).filter(([gid, g]) => {
    if (fCem  && g.cemeteryId !== fCem)   return false;
    if (fFlag && g.maintenanceFlag !== fFlag) return false;
    if (!fFlag && !g.maintenanceFlag)     return false;
    return true;
  });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-lt);padding:2rem">No maintenance flags found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(([gid, g]) => {
    const cem = S.cemeteries[g.cemeteryId] || {};
    const dec = dbg[gid];
    return `<tr>
      <td>§${esc(g.section)} R${esc(g.row)} P${esc(g.plot)}</td>
      <td>${esc(cem.name||'–')}</td>
      <td>${dec ? esc(dec.fullName) : '—'}</td>
      <td>${g.maintenanceFlag ? `<span class="maint-badge ${g.maintenanceFlag}">${g.maintenanceFlag.replace('-',' ')}</span>` : '—'}</td>
      <td style="font-size:.8rem">${esc(g.maintenanceNote||'—')}</td>
      <td>
        <button class="ico-btn" onclick="openMaintModal('${gid}')" title="Update">✏️</button>
        <button class="ico-btn" onclick="clearMaint('${gid}')" title="Clear flag">✅</button>
      </td>
    </tr>`;
  }).join('');
}

['maint-cem-filter','maint-status-filter'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', renderMaintenance);
});

window.openMaintModal = function(gid) {
  closeOverlay('overlay-grave');
  const g = S.graves[gid];
  document.getElementById('mf-grave-id').value = gid;
  document.getElementById('mf-flag').value    = g?.maintenanceFlag || '';
  document.getElementById('mf-note').value    = g?.maintenanceNote || '';
  openOverlay('overlay-maint');
};

document.getElementById('maint-form').addEventListener('submit', async e => {
  e.preventDefault();
  const gid  = document.getElementById('mf-grave-id').value;
  const flag = document.getElementById('mf-flag').value;
  const note = document.getElementById('mf-note').value.trim();
  try {
    await dbUpdate(`graves/${gid}`, { maintenanceFlag: flag || null, maintenanceNote: note || null });
    toast('Maintenance flag saved', 'ok');
    closeOverlay('overlay-maint');
    renderMaintenance();
  } catch(err) { toast(err.message, 'err'); }
});

window.clearMaint = async gid => {
  await dbUpdate(`graves/${gid}`, { maintenanceFlag: null, maintenanceNote: null });
  toast('Flag cleared', 'ok');
  renderMaintenance();
};

// ══════════════════════════════════════
//  CORRECTION REQUESTS
// ══════════════════════════════════════
document.getElementById('correction-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    cemeteryId: document.getElementById('req-cemetery').value,
    grave:      document.getElementById('req-grave').value.trim(),
    type:       document.getElementById('req-type').value,
    message:    document.getElementById('req-message').value.trim(),
    name:       document.getElementById('req-name').value.trim() || 'Anonymous',
    contact:    document.getElementById('req-contact').value.trim(),
    resolved:   false,
    createdAt:  Date.now()
  };
  try {
    await dbPush('requests', data);
    toast('Report submitted. Thank you!', 'ok');
    e.target.reset();
  } catch(err) { toast(err.message, 'err'); }
});

function renderRequestsAdmin() {
  const tbody = document.getElementById('requests-tbody');
  if (!tbody) return;
  const reqs = Object.entries(S.requests).sort((a,b) => b[1].createdAt - a[1].createdAt);
  if (!reqs.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-lt);padding:2rem">No requests yet.</td></tr>';
    return;
  }
  tbody.innerHTML = reqs.map(([rid, r]) => {
    const cem = S.cemeteries[r.cemeteryId] || {};
    const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '–';
    return `<tr style="${r.resolved ? 'opacity:.5' : ''}">
      <td style="font-size:.8rem">${date}</td>
      <td>${esc(cem.name||r.cemeteryId||'–')}</td>
      <td>${esc(r.grave||'–')}</td>
      <td><span class="tag">${esc(r.type?.replace('-',' ')||'–')}</span></td>
      <td style="max-width:200px;font-size:.82rem">${esc(r.message||'–')}</td>
      <td style="font-size:.8rem">${esc(r.name||'–')}${r.contact ? ` — ${esc(r.contact)}` : ''}</td>
      <td>
        ${!r.resolved ? `<button class="ico-btn" onclick="resolveRequest('${rid}')" title="Mark resolved">✅</button>` : '<span style="color:var(--moss);font-size:.75rem">Resolved</span>'}
        <button class="ico-btn" onclick="deleteRequest('${rid}')" title="Delete">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

window.resolveRequest = async rid => {
  await dbUpdate(`requests/${rid}`, { resolved: true });
  toast('Marked as resolved', 'ok');
};
window.deleteRequest = async rid => {
  if (!confirm('Delete this request?')) return;
  await dbRemove(`requests/${rid}`);
  toast('Deleted', 'ok');
};

// ══════════════════════════════════════
//  STATISTICS
// ══════════════════════════════════════
function renderStats() {
  const fCem  = document.getElementById('stats-cem-sel')?.value || '';
  const graves = Object.values(S.graves).filter(g => !fCem || g.cemeteryId === fCem);
  const decs   = Object.values(S.deceased).filter(d => {
    if (!fCem) return true;
    return (S.graves[d.graveId]||{}).cemeteryId === fCem;
  });

  const total    = graves.length;
  const occupied = graves.filter(g => g.status === 'occupied').length;
  const avail    = graves.filter(g => g.status === 'empty').length;
  const reserved = graves.filter(g => g.status === 'reserved').length;
  const blocked  = graves.filter(g => g.status === 'blocked').length;
  const male     = decs.filter(d => d.gender === 'male').length;
  const female   = decs.filter(d => d.gender === 'female').length;
  const yr       = new Date().getFullYear().toString();
  const thisYr   = decs.filter(d => (d.burialDate||'').startsWith(yr)).length;

  document.getElementById('stats-tiles').innerHTML = `
    <div class="stat-tile"><div class="num">${total}</div><div class="lbl">Total graves</div></div>
    <div class="stat-tile s-occ"><div class="num">${occupied}</div><div class="lbl">Occupied</div></div>
    <div class="stat-tile s-avail"><div class="num">${avail}</div><div class="lbl">Available</div></div>
    <div class="stat-tile s-res"><div class="num">${reserved}</div><div class="lbl">Reserved</div></div>
    <div class="stat-tile"><div class="num">${blocked}</div><div class="lbl">Blocked</div></div>
    <div class="stat-tile s-male"><div class="num">${male}</div><div class="lbl">Male</div></div>
    <div class="stat-tile s-fem"><div class="num">${female}</div><div class="lbl">Female</div></div>
    <div class="stat-tile s-yr"><div class="num">${thisYr}</div><div class="lbl">Burials ${yr}</div></div>
  `;

  const mx = Math.max(total, 1);
  renderBarChart('chart-occ', [
    { label: 'Occupied', val: occupied, color: 'var(--rose)' },
    { label: 'Available', val: avail, color: 'var(--moss)' },
    { label: 'Reserved', val: reserved, color: 'var(--amber)' },
    { label: 'Blocked', val: blocked, color: 'var(--slate)' },
  ], mx);
  renderBarChart('chart-gender', [
    { label: 'Male', val: male, color: '#3A6EA5' },
    { label: 'Female', val: female, color: '#A5536E' },
  ], Math.max(male, female, 1));

  // Burials per year
  const byYear = {};
  decs.forEach(d => {
    if (!d.burialDate) return;
    const y = d.burialDate.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + 1;
  });
  const yrEntries = Object.entries(byYear).sort();
  const mxYr = Math.max(...Object.values(byYear), 1);
  renderBarChart('chart-years', yrEntries.map(([y, v]) => ({ label: y, val: v, color: 'var(--moss)' })), mxYr);
}

function renderBarChart(id, items, maxVal) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = items.map(item => `
    <div class="bc-item">
      <div class="bc-val">${item.val}</div>
      <div class="bc-bar" style="height:${Math.max(Math.round((item.val/maxVal)*80), item.val > 0 ? 4 : 0)}px;background:${item.color}"></div>
      <div class="bc-lbl">${esc(item.label)}</div>
    </div>`).join('');
}

document.getElementById('stats-cem-sel')?.addEventListener('change', renderStats);

// ══════════════════════════════════════
//  MODAL / OVERLAY HELPERS
// ══════════════════════════════════════
function openOverlay(id)  { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeOverlay(btn.dataset.close));
});
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) closeOverlay(o.id); });
});

<<<<<<< HEAD
// ═══════════════════════════
//  TOAST
// ═══════════════════════════
=======
// ══════════════════════════════════════
//  TOAST
// ══════════════════════════════════════
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.add('show');
  clearTimeout(el._t);
<<<<<<< HEAD
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

// ═══════════════════════════
//  DEEP LINK  ?grave=ID
// ═══════════════════════════
function checkDeepLink() {
  const gid = new URLSearchParams(location.search).get('grave');
  if (gid) setTimeout(() => { if (S.graves[gid]) openGraveDetail(gid); }, 1000);
}

// ═══════════════════════════
//  UTILS
// ═══════════════════════════
=======
  el._t = setTimeout(() => el.classList.remove('show'), 3200);
}

// ══════════════════════════════════════
//  DEEP LINK  ?grave=ID
// ══════════════════════════════════════
function checkDeepLink() {
  const gid = new URLSearchParams(location.search).get('grave');
  if (gid) setTimeout(() => { if (S.graves[gid]) openGraveDetail(gid); }, 800);
}

// ══════════════════════════════════════
//  UTILITY
// ══════════════════════════════════════
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

<<<<<<< HEAD
// ═══════════════════════════
//  INIT
// ═══════════════════════════
waitFB(() => {
  initMainMap();
  loadData();
  checkDeepLink();
  switchView('map');
});
=======
// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
waitFB(() => {
  loadData();
  checkDeepLink();
  toggleDecFields('empty');
});
>>>>>>> 9a9b71585bc91b90d14019bca1b7d8c19af9cfde
