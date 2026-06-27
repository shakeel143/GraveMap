/* ═══════════════════════════════════════
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
const fb = () => window.__fb;

async function dbGet(path) {
  const { db, ref, get } = fb();
  const s = await get(ref(db, path));
  return s.exists() ? s.val() : null;
}
async function dbSet(path, data) {
  const { db, ref, set } = fb();
  return set(ref(db, path), data);
}
async function dbPush(path, data) {
  const { db, ref, push } = fb();
  const r = push(ref(db, path));
  await dbSet(`${path}/${r.key}`, data);
  return r.key;
}
async function dbUpdate(path, data) {
  const { db, ref, update } = fb();
  return update(ref(db, path), data);
}
async function dbRemove(path) {
  const { db, ref, remove } = fb();
  return remove(ref(db, path));
}
function dbListen(path, cb) {
  const { db, ref, onValue } = fb();
  onValue(ref(db, path), s => cb(s.exists() ? s.val() : {}));
}

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
  await fb().signOut(fb().auth);
  toast('Signed out');
});

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
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const first = el.options[0].outerHTML;
    el.innerHTML = first;
    cems.forEach(([cid, c]) => el.innerHTML += `<option value="${cid}">${esc(c.name)}</option>`);
  });

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
  });
}

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
  }
  if (c.centerLat && c.centerLng) S.MAP.flyTo([c.centerLat, c.centerLng], 17);
}

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
    </div>`;
  }).join('');
}

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
      </div>
    </div>`;
  }).join('');
}

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

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeOverlay(btn.dataset.close));
});
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) closeOverlay(o.id); });
});

// ═══════════════════════════
//  TOAST
// ═══════════════════════════
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.add('show');
  clearTimeout(el._t);
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
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════
//  INIT
// ═══════════════════════════
waitFB(() => {
  initMainMap();
  loadData();
  checkDeepLink();
  switchView('map');
});