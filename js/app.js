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
  cemeteries: {},
  graves: {},
  requests: {},
  admins: {},
  lang: localStorage.getItem('gravemap_lang') || 'en',
  currentView: 'map',
  selectedCemId: null,
  // Map objects
  MAP: null,
  boundaryLayers: {},   // cemId → L.layer
  graveLayers: {},   // graveId → L.layer
  // Wizard state
  cemWizardData: {},
  graveWizardData: {},
  isEditingGrave: false,
  editingGraveId: null,
  isEditingCem: false,
  editingCemId: null,
  // Mini-maps (in modals)
  locateMap: null,
  locateMarker: null,
  boundaryMap: null,
  boundaryDrawn: null,
  graveDrawMap: null,
  graveDrawn: null,
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
//  SCHEMA COMPAT HELPERS
//  Support both old (latitude/longitude) and new (centerLat/centerLng)
// ═══════════════════════════
function cemLat(c) { return c.centerLat ?? c.latitude ?? null; }
function cemLng(c) { return c.centerLng ?? c.longitude ?? null; }

// ═══════════════════════════
//  MAIN MAP
// ═══════════════════════════
function initMainMap() {
  S.MAP = L.map('map-root', { zoomControl: false }).setView([26.05, 68.33], 14);

  // Two tile layers: street (CARTO) and satellite (Esri)
  S.tileStreet = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd', maxZoom: 20
  });
  S.tileSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© <a href="https://www.esri.com">Esri</a> World Imagery',
    maxZoom: 20
  });
  S.tileSatelliteLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    attribution: '', maxZoom: 20
  });

  // Default to satellite
  S.tileSatellite.addTo(S.MAP);
  S.tileSatelliteLabels.addTo(S.MAP);
  S.isSatellite = true;

  // Satellite toggle button
  const satBtn = L.control({ position: 'bottomleft' });
  satBtn.onAdd = function () {
    const div = L.DomUtil.create('div', 'sat-toggle-btn');
    div.innerHTML = '🗺 Street map';
    div.title = 'Toggle satellite view';
    div.classList.add('active');
    L.DomEvent.on(div, 'click', L.DomEvent.stopPropagation);
    L.DomEvent.on(div, 'click', () => {
      S.isSatellite = !S.isSatellite;
      if (S.isSatellite) {
        S.MAP.removeLayer(S.tileStreet);
        S.tileSatellite.addTo(S.MAP);
        S.tileSatelliteLabels.addTo(S.MAP);
        div.innerHTML = '🗺 Street map';
        div.classList.add('active');
      } else {
        S.MAP.removeLayer(S.tileSatellite);
        S.MAP.removeLayer(S.tileSatelliteLabels);
        S.tileStreet.addTo(S.MAP);
        div.innerHTML = '🛰 Satellite';
        div.classList.remove('active');
      }
    });
    return div;
  };
  satBtn.addTo(S.MAP);

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
  // Hide public "request" section for admins — they can add directly
  const pubReq = document.getElementById('req-section-public');
  if (pubReq) pubReq.classList.toggle('hidden', !!user);
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
    // Auto-fly to first cemetery that has GPS coords
    const first = Object.values(S.cemeteries).find(c => cemLat(c) && cemLng(c));
    if (first && S.MAP) S.MAP.flyTo([cemLat(first), cemLng(first)], 16);
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
  dbListen('admins', data => {
    S.admins = data || {};
    if (S.currentView === 'admin') renderAdmin();
  });
}

// ═══════════════════════════
//  POPULATE SELECTS
// ═══════════════════════════
function populateSelects() {
  const cems = Object.entries(S.cemeteries);
  const ids = ['sf-cem', 'gg-cem'];
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
        const layer = L.polygon(coords, {
          color: '#0F1923',
          weight: 2,
          fillColor: '#2ECC8A',
          fillOpacity: 0.06,
          dashArray: '6 4'
        }).addTo(S.MAP);
        layer.bindTooltip(`<b>${esc(c.name)}</b>`, { permanent: false });
        layer.on('click', () => flyToCemetery(cid));
        S.boundaryLayers[cid] = layer;
      } catch (e) { }
    } else if (cemLat(c) && cemLng(c)) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#0F1923;color:#2ECC8A;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4)">${esc(c.name)}</div>`,
        iconAnchor: [0, 0]
      });
      const m = L.marker([cemLat(c), cemLng(c)], { icon }).addTo(S.MAP);
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
      const color = STATUS_COLOR[g.status] || '#9CA3AF';
      const layer = L.polygon(coords, {
        color: '#fff',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.8,
      }).addTo(S.MAP);

      const name = g.name || 'Empty plot';
      layer.bindTooltip(`<b>${esc(name)}</b><br>${esc(g.fatherName ? 's/o ' + g.fatherName : '')}`, { sticky: true });
      layer.on('click', () => openGraveDetail(gid));
      S.graveLayers[gid] = layer;
    } catch (e) { }
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
  if (cemLat(c) && cemLng(c)) S.MAP.flyTo([cemLat(c), cemLng(c)], 17);
}

// ═══════════════════════════
//  LEFT PANEL — CEM LIST
// ═══════════════════════════
function renderCemListPanel() {
  const el = document.getElementById('map-cem-list');
  const cems = Object.entries(S.cemeteries);
  if (!cems.length) { el.innerHTML = '<div style="padding:1rem;color:#9CA3AF;font-size:.82rem">No cemeteries yet.</div>'; return; }

  el.innerHTML = cems.map(([cid, c]) => {
    const graves = Object.values(S.graves).filter(g => g.cemeteryId === cid);
    const total = graves.length;
    const occupied = graves.filter(g => g.status === 'occupied').length;
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
document.getElementById('map-cem-search').addEventListener('input', function () {
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
    const type = activeTool;

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
  S.isEditingCem = false;
  S.editingCemId = null;
  clearCemWizardFields();
  cemWizardStep = 1;
  showCemWizardStep(1);
  openOverlay('ov-add-cem');
});

function showCemWizardStep(n) {
  [1, 2, 3].forEach(i => {
    document.getElementById(`cem-step-${i}`).classList.toggle('active', i === n);
    const ws = document.querySelector(`.wstep[data-step="${i}"]`);
    ws.classList.toggle('active', i === n);
    ws.classList.toggle('done', i < n);
  });
  if (n === 2) setTimeout(() => initLocateMap(), 200);
  if (n === 3) setTimeout(() => initBoundaryMap(), 200);
}

window.cemWizardNext = function (step) {
  if (step === 1) {
    const name = document.getElementById('cw-name').value.trim();
    if (!name) { toast('Cemetery name is required', 'err'); return; }
    S.cemWizardData.name = name;
    S.cemWizardData.country = document.getElementById('cw-country').value.trim();
    S.cemWizardData.province = document.getElementById('cw-province').value.trim();
    S.cemWizardData.district = document.getElementById('cw-district').value.trim();
    S.cemWizardData.city = document.getElementById('cw-city').value.trim();
    S.cemWizardData.address = document.getElementById('cw-address').value.trim();
    S.cemWizardData.description = document.getElementById('cw-desc').value.trim();
  }
  if (step === 2) {
    const lat = parseFloat(document.getElementById('cw-lat').value);
    const lng = parseFloat(document.getElementById('cw-lng').value);
    if (!lat || !lng) { toast('Click on the map to set cemetery location', 'err'); return; }
    S.cemWizardData.centerLat = lat;
    S.cemWizardData.centerLng = lng;
    // Also save as latitude/longitude for compatibility with v2 data
    S.cemWizardData.latitude = lat;
    S.cemWizardData.longitude = lng;
  }
  showCemWizardStep(step + 1);
};

window.cemWizardBack = function (step) {
  showCemWizardStep(step - 1);
};

function initLocateMap() {
  const lat = S.cemWizardData.centerLat || S.cemWizardData.latitude;
  const lng = S.cemWizardData.centerLng || S.cemWizardData.longitude;
  const center = lat && lng ? [lat, lng] : [30.3753, 69.3451];
  const zoom = lat && lng ? 16 : 5;

  if (S.locateMap) {
    S.locateMap.setView(center, zoom);
    S.locateMap.invalidateSize();
    if (S.locateMarker) S.locateMap.removeLayer(S.locateMarker);
    if (lat && lng) S.locateMarker = L.marker([lat, lng]).addTo(S.locateMap);
    return;
  }

  S.locateMap = L.map('cem-locate-map').setView(center, zoom);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri World Imagery', maxZoom: 21
  }).addTo(S.locateMap);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 21
  }).addTo(S.locateMap);

  if (lat && lng) S.locateMarker = L.marker([lat, lng]).addTo(S.locateMap);

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
    : [30.3753, 69.3451]; // Pakistan default

  if (S.boundaryMap) {
    S.boundaryMap.setView(center, 17);
    S.boundaryMap.invalidateSize();
    if (S.boundaryDrawn) S.boundaryMap.removeLayer(S.boundaryDrawn);
    if (S.cemWizardData.boundary) {
      try {
        const coords = JSON.parse(S.cemWizardData.boundary);
        S.boundaryDrawn = L.polygon(coords, { color: '#0F1923', weight: 2, fillOpacity: .06 }).addTo(S.boundaryMap);
        S.boundaryMap.fitBounds(S.boundaryDrawn.getBounds(), { padding: [20, 20] });
        document.getElementById('boundary-status').textContent = `✓ Boundary loaded with ${coords.length} points.`;
        document.getElementById('boundary-status').className = 'boundary-status ok';
      } catch (e) {}
    }
    return;
  }

  S.boundaryMap = L.map('cem-boundary-map').setView(center, 17);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri World Imagery', maxZoom: 21
  }).addTo(S.boundaryMap);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 21
  }).addTo(S.boundaryMap);

  if (S.cemWizardData.boundary) {
    try {
      const coords = JSON.parse(S.cemWizardData.boundary);
      S.boundaryDrawn = L.polygon(coords, { color: '#0F1923', weight: 2, fillOpacity: .06 }).addTo(S.boundaryMap);
      S.boundaryMap.fitBounds(S.boundaryDrawn.getBounds(), { padding: [20, 20] });
      const status = document.getElementById('boundary-status');
      status.textContent = `✓ Boundary loaded with ${coords.length} points.`;
      status.className = 'boundary-status ok';
    } catch (e) {}
  }

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
    if (S.isEditingCem) {
      await dbUpdate(`cemeteries/${S.editingCemId}`, { ...d, updatedAt: Date.now() });
      toast('Cemetery updated!', 'ok');
    } else {
      await dbPush('cemeteries', { ...d, createdAt: Date.now() });
      toast('Cemetery saved!', 'ok');
    }
    closeOverlay('ov-add-cem');
    // Reset wizard
    S.cemWizardData = {};
    S.boundaryDrawn = null;
    if (S.boundaryMap) { S.boundaryMap.remove(); S.boundaryMap = null; }
    if (S.locateMap) { S.locateMap.remove(); S.locateMap = null; }
  } catch (err) { toast(err.message, 'err'); }
});

// ═══════════════════════════
//  GRAVE WIZARD
// ═══════════════════════════
function openGraveWizard(skipToStep3 = false) {
  if (!skipToStep3) {
    S.graveWizardData = {};
    S.isEditingGrave = false;
    S.editingGraveId = null;
    clearGraveWizardFields();
  }
  showGraveWizardStep(skipToStep3 ? 3 : 1);
  openOverlay('ov-add-grave');
}

function showGraveWizardStep(n) {
  [1, 2, 3].forEach(i => {
    document.getElementById(`gw-step-${i}`).classList.toggle('active', i === n);
    const ws = document.querySelector(`#ov-add-grave .wstep[data-step="${i}"]`);
    ws.classList.toggle('active', i === n);
    ws.classList.toggle('done', i < n);
  });
  if (n === 2) renderGraveCemOptions();
  if (n === 3) setTimeout(() => initGraveDrawMap(), 200);
}

window.graveWizardNext = function (step) {
  if (step === 1) {
    const name = document.getElementById('gw-name').value.trim();
    if (!name) { toast('Name is required', 'err'); return; }
    S.graveWizardData.name = name;
    S.graveWizardData.fatherName = document.getElementById('gw-father').value.trim();
    S.graveWizardData.gender = document.getElementById('gw-gender').value;
    S.graveWizardData.dob = document.getElementById('gw-dob').value;
    S.graveWizardData.dod = document.getElementById('gw-dod').value;
    S.graveWizardData.burialDate = document.getElementById('gw-burial').value;
    S.graveWizardData.section = document.getElementById('gw-section').value.trim();
    S.graveWizardData.row = document.getElementById('gw-row').value.trim();
    S.graveWizardData.plot = document.getElementById('gw-plot').value.trim();
    S.graveWizardData.bio = document.getElementById('gw-bio').value.trim();
    S.graveWizardData.status = document.getElementById('gw-status').value;
    // Auto-calc age
    if (S.graveWizardData.dob && S.graveWizardData.dod) {
      const age = Math.floor((new Date(S.graveWizardData.dod) - new Date(S.graveWizardData.dob)) / (365.25 * 24 * 3600 * 1000));
      S.graveWizardData.age = age > 0 ? age : null;
    } else {
      S.graveWizardData.age = parseInt(document.getElementById('gw-age').value) || null;
    }
    S.graveWizardData.photoUrl = document.getElementById('gw-photo')?.value.trim() || null;
  }
  if (step === 2) {
    if (!S.graveWizardData.cemId) { toast('Select a cemetery', 'err'); return; }
  }
  showGraveWizardStep(step + 1);
};

window.graveWizardBack = function (step) {
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

window.selectGraveCem = function (cemId) {
  S.graveWizardData.cemId = cemId;
  document.querySelectorAll('.cem-radio').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.cem-radio').forEach(el => {
    if (el.textContent.includes(S.cemeteries[cemId]?.name)) el.classList.add('selected');
  });
};

function initGraveDrawMap() {
  const cem = S.cemeteries[S.graveWizardData.cemId] || {};
  const center = cemLat(cem) ? [cemLat(cem), cemLng(cem)] : [30.3753, 69.3451];

  if (S.graveDrawMap) {
    S.graveDrawMap.setView(center, 19);
    S.graveDrawMap.invalidateSize();
    // If polygon already set from main map drawing, show it
    if (S.graveWizardData.polygon && !S.graveDrawn) {
      try {
        const coords = JSON.parse(S.graveWizardData.polygon);
        S.graveDrawn = L.polygon(coords, { color: '#E05A5A', fillOpacity: .5 }).addTo(S.graveDrawMap);
        const status = document.getElementById('grave-draw-status');
        status.textContent = '✓ Grave location set from map drawing.';
        status.className = 'boundary-status ok';
        S.graveDrawMap.fitBounds(S.graveDrawn.getBounds(), { padding: [40, 40] });
      } catch (e) { }
    }
    return;
  }

  S.graveDrawMap = L.map('gw-draw-map').setView(center, 19);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri World Imagery', maxZoom: 21
  }).addTo(S.graveDrawMap);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 21
  }).addTo(S.graveDrawMap);

  // Show cemetery boundary if exists
  const cemData = S.cemeteries[S.graveWizardData.cemId];
  if (cemData?.boundary) {
    try {
      const coords = JSON.parse(cemData.boundary);
      L.polygon(coords, { color: '#0F1923', weight: 2, fillOpacity: .04, dashArray: '6 4' }).addTo(S.graveDrawMap);
      S.graveDrawMap.fitBounds(L.polygon(coords).getBounds(), { padding: [20, 20] });
    } catch (e) { }
  }

  // Show existing graves
  Object.entries(S.graves).filter(([, g]) => g.cemeteryId === S.graveWizardData.cemId).forEach(([, g]) => {
    if (!g.polygon) return;
    try {
      const coords = JSON.parse(g.polygon);
      L.polygon(coords, { color: '#fff', weight: 1, fillColor: STATUS_COLOR[g.status] || '#9CA3AF', fillOpacity: .7 }).addTo(S.graveDrawMap);
    } catch (e) { }
  });

  S.graveDrawMap.pm.addControls({
    position: 'topleft',
    drawMarker: false, drawCircle: false, drawCircleMarker: false,
    drawPolyline: false, drawText: false, drawPolygon: false,
    drawRectangle: true, editMode: true, dragMode: false,
    cutPolygon: false, removalMode: true,
  });

  S.graveDrawMap.on('pm:create', e => {
    if (S.graveDrawn) S.graveDrawMap.removeLayer(S.graveDrawn);
    S.graveDrawn = e.layer;
    const coords = e.layer.getLatLngs()[0].map(ll => [ll.lat, ll.lng]);
    S.graveWizardData.polygon = JSON.stringify(coords);
    const center = e.layer.getBounds().getCenter();
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
      S.graveDrawn = L.polygon(coords, { color: '#E05A5A', fillOpacity: .5 }).addTo(S.graveDrawMap);
      S.graveDrawMap.fitBounds(S.graveDrawn.getBounds(), { padding: [40, 40] });
      document.getElementById('grave-draw-status').textContent = '✓ Grave location set.';
      document.getElementById('grave-draw-status').className = 'boundary-status ok';
    } catch (e) { }
  }
}

document.getElementById('btn-save-grave').addEventListener('click', async () => {
  const d = S.graveWizardData;
  if (!d.name) { toast('Go back and fill person name', 'err'); return; }
  if (!d.cemId) { toast('Go back and select a cemetery', 'err'); return; }
  if (!d.polygon) { toast('Draw the grave location on the map', 'err'); return; }

  const graveData = {
    cemeteryId: d.cemId,
    name: d.name,
    fatherName: d.fatherName || null,
    gender: d.gender || null,
    dob: d.dob || null,
    deathDate: d.dod || null,
    burialDate: d.burialDate || null,
    age: d.age || null,
    section: d.section || null,
    row: d.row || null,
    plot: d.plot || null,
    bio: d.bio || null,
    status: d.status || 'occupied',
    polygon: d.polygon,
    lat: d.lat || null,
    lng: d.lng || null,
    photoUrl: d.photoUrl || null,
    createdAt: Date.now()
  };

  try {
    if (S.isEditingGrave) {
      await dbUpdate(`graves/${S.editingGraveId}`, graveData);
      toast('Grave updated!', 'ok');
    } else {
      await dbPush('graves', graveData);
      toast('Grave registered!', 'ok');
    }
    closeOverlay('ov-add-grave');
    S.graveWizardData = {};
    S.graveDrawn = null;
    if (S.graveDrawMap) { S.graveDrawMap.remove(); S.graveDrawMap = null; }
    // Fly to grave on main map
    if (d.cemId) flyToCemetery(d.cemId);
  } catch (err) { toast(err.message, 'err'); }
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

window.previewGrid = function () {
  const cemId = document.getElementById('gg-cem').value;
  const c = S.cemeteries[cemId];
  if (!cemId || !c?.boundary) { toast('Select a cemetery with a drawn boundary', 'err'); return; }

  const w = parseFloat(document.getElementById('gg-w').value) || 2;
  const l = parseFloat(document.getElementById('gg-l').value) || 3;
  const gap = parseFloat(document.getElementById('gg-gap').value) || 0.5;

  const cells = computeGrid(c, w, l, gap);
  document.getElementById('gg-preview-info').innerHTML =
    `<b>Preview:</b> ~${cells.length} grave plots will be generated inside the boundary.`;
};

function computeGrid(c, graveW, graveL, gap) {
  let boundaryCoords;
  try { boundaryCoords = JSON.parse(c.boundary); } catch (e) { return []; }
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
  const c = S.cemeteries[cemId];
  if (!cemId || !c?.boundary) { toast('Select a cemetery with a drawn boundary', 'err'); return; }

  const w = parseFloat(document.getElementById('gg-w').value) || 2;
  const l = parseFloat(document.getElementById('gg-l').value) || 3;
  const gap = parseFloat(document.getElementById('gg-gap').value) || 0.5;

  const cells = computeGrid(c, w, l, gap);
  if (!cells.length) { toast('No cells generated — check boundary', 'err'); return; }
  if (!confirm(`Generate ${cells.length} empty grave plots inside ${c.name}? This may take a moment.`)) return;

  toast(`Generating ${cells.length} graves…`);

  let count = 0;
  for (const coords of cells) {
    const center = [(coords[0][0] + coords[2][0]) / 2, (coords[0][1] + coords[2][1]) / 2];
    await dbPush('graves', {
      cemeteryId: cemId,
      status: 'empty',
      name: null,
      polygon: JSON.stringify(coords),
      lat: center[0],
      lng: center[1],
      section: null, row: null, plot: `${++count}`,
      createdAt: Date.now()
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
  const q = (document.getElementById('search-q')?.value || '').trim().toLowerCase();
  const fCem = document.getElementById('sf-cem')?.value || '';
  const fCity = document.getElementById('sf-city')?.value || '';
  const fGen = document.getElementById('sf-gender')?.value || '';
  const hint = document.getElementById('search-empty');
  const grid = document.getElementById('search-results');

  if (!q && !fCem && !fCity && !fGen) {
    grid.innerHTML = ''; hint.classList.remove('hidden'); return;
  }
  hint.classList.add('hidden');

  const results = Object.entries(S.graves).filter(([gid, g]) => {
    if (fCem && g.cemeteryId !== fCem) return false;
    if (fGen && g.gender !== fGen) return false;
    if (fCity) {
      const cem = S.cemeteries[g.cemeteryId] || {};
      if (cem.city !== fCity) return false;
    }
    if (!q) return true;
    return (g.name || '').toLowerCase().includes(q) ||
      (g.fatherName || '').toLowerCase().includes(q) ||
      (g.plot || '').toLowerCase().includes(q) ||
      (g.section || '').toLowerCase().includes(q);
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

['search-q', 'sf-cem', 'sf-city', 'sf-gender'].forEach(id => {
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
  const el = document.getElementById('cem-cards-list');
  const cems = Object.entries(S.cemeteries);
  if (!cems.length) { el.innerHTML = '<p style="color:#9CA3AF;font-size:.85rem">No cemeteries yet.</p>'; return; }

  el.innerHTML = cems.map(([cid, c]) => {
    const graves = Object.values(S.graves).filter(g => g.cemeteryId === cid);
    const total = graves.length;
    const occupied = graves.filter(g => g.status === 'occupied').length;
    const avail = graves.filter(g => g.status === 'empty').length;
    const loc = [c.city, c.province, c.country].filter(Boolean).map(esc).join(', ');
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

window.viewOnMap = function (cemId) {
  switchView('map');
  setTimeout(() => flyToCemetery(cemId), 200);
};

document.getElementById('btn-req-cemetery').addEventListener('click', () => openOverlay('ov-req-cem'));

// ═══════════════════════════
//  GRAVE DETAIL
// ═══════════════════════════
window.openGraveDetail = function (gid) {
  const g = S.graves[gid];
  if (!g) return;
  const cem = S.cemeteries[g.cemeteryId] || {};
  const isAdmin = !!window.__user;

  // ── Shareable URL: set hash so the link is copyable ──
  history.replaceState(null, '', `#grave-${gid}`);
  const shareUrl = `${location.origin}${location.pathname}#grave-${gid}`;

  document.getElementById('grave-detail-body').innerHTML = `
    ${g.photoUrl ? `<img class="gd-photo" src="${esc(g.photoUrl)}" alt="Grave photo" onerror="this.style.display='none'" />` : ''}
    <div class="gd-hero">
      <div class="gd-avatar ${g.gender || 'male'}">${g.gender === 'female' ? '♀' : '♂'}</div>
      <div>
        <div class="gd-name">${esc(g.name || 'Empty plot')}</div>
        ${g.fatherName ? `<div class="gd-father">s/o ${esc(g.fatherName)}</div>` : ''}
        <span class="status-pill ${g.status}" style="margin-top:.35rem;display:inline-block">${g.status}</span>
      </div>
    </div>

    <div class="gd-grid">
      <div class="gd-item"><label>Cemetery</label><p>${esc(cem.name || '–')}</p></div>
      <div class="gd-item"><label>Location</label><p>${[cem.city, cem.country].filter(Boolean).map(esc).join(', ') || '–'}</p></div>
      <div class="gd-item"><label>Date of birth</label><p>${esc(g.dob || '–')}</p></div>
      <div class="gd-item"><label>Date of death</label><p>${esc(g.deathDate || '–')}</p></div>
      <div class="gd-item"><label>Burial date</label><p>${esc(g.burialDate || '–')}</p></div>
      <div class="gd-item"><label>Age</label><p>${g.age ? esc(String(g.age)) : '–'}</p></div>
      ${g.section ? `<div class="gd-item"><label>Section / Row / Plot</label><p>${esc(g.section)} / ${esc(g.row || '–')} / ${esc(g.plot || '–')}</p></div>` : ''}
    </div>

    ${g.bio ? `<div class="gd-bio">${esc(g.bio)}</div>` : ''}

    <!-- ─── Family Tree Section ─── -->
    <div id="gd-family-section" style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">
      ${renderFamilySection(gid, isAdmin)}
    </div>

    <div class="gd-actions">
      ${g.lat && g.lng ? `<button class="btn-green" onclick="navToGrave(${g.lat},${g.lng})">🧭 Navigate</button>` : ''}
      <button class="btn-view" onclick="showOnMainMap('${gid}')">📍 Show on map</button>
      <button class="btn-copy-link" id="btn-copy-link" onclick="copyGraveLink('${gid}')">🔗 Copy link</button>
      <button class="btn-secondary" style="font-size:.78rem" onclick="printGraveCard('${gid}')">🖨️ Print card</button>
      <button class="btn-secondary" style="font-size:.78rem" onclick="openCorrection('${gid}')">Report correction</button>
      ${isAdmin ? `
        <button class="btn-green" onclick="editGrave('${gid}')">✏️ Edit</button>
        <button class="btn-red" onclick="deleteGrave('${gid}')">Delete</button>
      ` : ''}
    </div>

    <div style="margin-top:1rem">
      <div class="gd-qr-label">QR Code — scan to open this grave</div>
      <div id="gd-qr"></div>
      <div class="gd-share-url" id="gd-share-url">${shareUrl}</div>
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
    if (qrEl) new QRCode(qrEl, { text: shareUrl, width: 86, height: 86 });
  }, 100);
};

// Copy shareable link to clipboard
window.copyGraveLink = function (gid) {
  const url = `${location.origin}${location.pathname}#grave-${gid}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => toast('Link copied!', 'ok'));
  } else {
    const el = document.createElement('textarea');
    el.value = url;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    toast('Link copied!', 'ok');
  }
};

// Navigate: prefer Google Maps, fall back to OSM
window.navToGrave = (lat, lng) => {
  const gmUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  window.open(gmUrl, '_blank');
};

window.showOnMainMap = function (gid) {
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
window.openCorrection = function (gid) {
  document.getElementById('corr-grave-id').value = gid;
  openOverlay('ov-correction');
};

document.getElementById('correction-form').addEventListener('submit', async e => {
  e.preventDefault();
  const gid = document.getElementById('corr-grave-id').value;
  const g = S.graves[gid] || {};
  await dbPush('requests', {
    type: 'correction',
    graveId: gid,
    graveName: g.name || '',
    cemeteryId: g.cemeteryId || '',
    issue: document.getElementById('corr-type').value,
    message: document.getElementById('corr-msg').value.trim(),
    submitter: document.getElementById('corr-name').value.trim() || 'Anonymous',
    contact: document.getElementById('corr-contact').value.trim(),
    resolved: false,
    createdAt: Date.now()
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
    type: 'new-cemetery',
    name: document.getElementById('rc-name').value.trim(),
    city: document.getElementById('rc-city').value.trim(),
    country: document.getElementById('rc-country').value.trim(),
    desc: document.getElementById('rc-desc').value.trim(),
    submitter: document.getElementById('rc-submitter').value.trim() || 'Anonymous',
    contact: document.getElementById('rc-contact').value.trim(),
    resolved: false,
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
  const graves = Object.values(S.graves);
  const reqs = Object.values(S.requests);
  const total = graves.length;
  const occupied = graves.filter(g => g.status === 'occupied').length;
  const avail = graves.filter(g => g.status === 'empty').length;
  const reserved = graves.filter(g => g.status === 'reserved').length;
  const pending = reqs.filter(r => !r.resolved).length;
  const cems = Object.keys(S.cemeteries).length;

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
  if (tab === 'admins') renderAdminAdmins();
}

function renderAdminGraves() {
  const el = document.getElementById('atab-graves');
  const graves = Object.entries(S.graves).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  // Action bar always shown — even when no graves yet
  const actionBar = `
    <div style="margin-bottom:.75rem;display:flex;gap:.4rem;flex-wrap:wrap">
      <button class="btn-primary" style="font-size:.78rem" onclick="openGraveWizard()">+ Register grave</button>
      <button class="btn-secondary" style="font-size:.78rem" onclick="openCsvImport()">📥 Import CSV</button>
    </div>`;

  if (!graves.length) {
    el.innerHTML = actionBar + '<p style="color:#9CA3AF;font-size:.83rem;padding:.5rem 0">No graves yet. Register one above or import from CSV.</p>';
    return;
  }

  el.innerHTML = actionBar +
    graves.map(([gid, g]) => {
      const cem = S.cemeteries[g.cemeteryId] || {};
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
  const el = document.getElementById('atab-requests');
  const reqs = Object.entries(S.requests).sort((a, b) => b[1].createdAt - a[1].createdAt);
  if (!reqs.length) { el.innerHTML = '<p style="color:#9CA3AF;font-size:.83rem;padding:.5rem">No requests yet.</p>'; return; }

  el.innerHTML = reqs.map(([rid, r]) => {
    const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '–';
    return `<div class="req-card" style="${r.resolved ? 'opacity:.5' : ''}">
      <div class="req-card-top">
        <span class="req-card-type">${esc(r.type?.replace('-', ' ') || '–')}</span>
        <span class="req-card-date">${date}</span>
      </div>
      <div class="req-card-msg">${esc(r.message || r.desc || '–')}</div>
      <div class="req-card-meta">
        ${r.graveName ? `Grave: ${esc(r.graveName)} · ` : ''}
        ${r.name ? esc(r.name) : esc(r.submitter || 'Anonymous')}
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
        <div class="ag-cem">${esc(c.city || '–')} · ${graves} graves</div>
        <div class="ag-actions">
          <button class="ibt" onclick="viewOnMap('${cid}')" title="View on map">🗺</button>
          <button class="ibt" onclick="editCemetery('${cid}')" title="Edit">✏️</button>
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
window.openOverlay = id => document.getElementById(id).classList.add('open');
window.closeOverlay = id => {
  document.getElementById(id).classList.remove('open');
  // Clear the grave hash when the grave modal is closed
  if (id === 'ov-grave') history.replaceState(null, '', location.pathname);
};

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeOverlay(btn.dataset.close));
});
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) closeOverlay(o.id); });
});

// Escape key closes topmost open overlay
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.overlay.open')];
  if (open.length) closeOverlay(open[open.length - 1].id);
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
//  WIZARD INPUT UTILITIES
// ═══════════════════════════
window.fillGraveWizardFields = function(d) {
  document.getElementById('gw-name').value = d.name || '';
  document.getElementById('gw-father').value = d.fatherName || '';
  document.getElementById('gw-gender').value = d.gender || '';
  document.getElementById('gw-dob').value = d.dob || '';
  document.getElementById('gw-dod').value = d.deathDate || d.dod || '';
  document.getElementById('gw-burial').value = d.burialDate || '';
  document.getElementById('gw-age').value = d.age || '';
  document.getElementById('gw-status').value = d.status || 'occupied';
  document.getElementById('gw-section').value = d.section || '';
  document.getElementById('gw-row').value = d.row || '';
  document.getElementById('gw-plot').value = d.plot || '';
  document.getElementById('gw-bio').value = d.bio || '';
  document.getElementById('gw-photo').value = d.photoUrl || '';
};

window.clearGraveWizardFields = function() {
  fillGraveWizardFields({});
};

window.fillCemWizardFields = function(d) {
  document.getElementById('cw-name').value = d.name || '';
  document.getElementById('cw-country').value = d.country || '';
  document.getElementById('cw-province').value = d.province || '';
  document.getElementById('cw-district').value = d.district || '';
  document.getElementById('cw-city').value = d.city || '';
  document.getElementById('cw-address').value = d.address || '';
  document.getElementById('cw-desc').value = d.description || d.desc || '';
  document.getElementById('cw-lat').value = d.centerLat || d.latitude || '';
  document.getElementById('cw-lng').value = d.centerLng || d.longitude || '';
};

window.clearCemWizardFields = function() {
  fillCemWizardFields({});
  if (S.locateMarker && S.locateMap) { S.locateMap.removeLayer(S.locateMarker); S.locateMarker = null; }
  if (S.boundaryDrawn && S.boundaryMap) { S.boundaryMap.removeLayer(S.boundaryDrawn); S.boundaryDrawn = null; }
};

window.editGrave = function (gid) {
  closeOverlay('ov-grave');
  const g = S.graves[gid];
  if (!g) return;
  S.graveWizardData = { ...g, dod: g.deathDate };
  S.isEditingGrave = true;
  S.editingGraveId = gid;
  fillGraveWizardFields(S.graveWizardData);
  showGraveWizardStep(1);
  openOverlay('ov-add-grave');
};

window.editCemetery = function (cid) {
  const c = S.cemeteries[cid];
  if (!c) return;
  S.cemWizardData = { ...c };
  S.isEditingCem = true;
  S.editingCemId = cid;
  fillCemWizardFields(c);
  cemWizardStep = 1;
  showCemWizardStep(1);
  openOverlay('ov-add-cem');
};

// ═══════════════════════════
//  DEEP LINK  #grave-ID  or  ?grave=ID (legacy)
// ═══════════════════════════
function checkDeepLink() {
  // Support hash-based links: #grave-GRAVEID
  const hashMatch = location.hash.match(/^#grave-(.+)$/);
  const gid = hashMatch ? hashMatch[1]
    : new URLSearchParams(location.search).get('grave');
  if (gid) setTimeout(() => { if (S.graves[gid]) openGraveDetail(gid); }, 1200);
}

// ═══════════════════════════
//  UTILS
// ═══════════════════════════
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════
//  PRINT GRAVE CARD
// ═══════════════════════════
window.printGraveCard = function (gid) {
  const g = S.graves[gid];
  if (!g) return;
  const cem = S.cemeteries[g.cemeteryId] || {};
  const shareUrl = `${location.origin}${location.pathname}#grave-${gid}`;
  const loc = [cem.city, cem.country].filter(Boolean).join(', ') || '–';
  const srp = row => row ? `<tr><td>${row[0]}</td><td>${row[1]}</td></tr>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Grave Card — ${g.name || 'Unknown'}</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;padding:2cm;color:#111;font-size:13px}
    .header{border-bottom:2px solid #111;padding-bottom:.8rem;margin-bottom:1.2rem;display:flex;justify-content:space-between;align-items:flex-start}
    h1{font-size:1.5rem;margin-bottom:.15rem}
    .sub{font-size:.9rem;color:#555}
    .brand{font-size:.7rem;color:#999;text-align:right}
    .status{display:inline-block;padding:.15rem .5rem;border-radius:3px;font-size:.72rem;font-weight:bold;margin-top:.35rem}
    .occupied{background:#fde;color:#c00}.empty{background:#dfd;color:#060}.reserved{background:#ffe;color:#a60}
    table{width:100%;border-collapse:collapse;margin-bottom:1.2rem}
    td{padding:.35rem .6rem;border:1px solid #ddd;font-size:.82rem;vertical-align:top}
    td:first-child{font-weight:bold;width:38%;background:#f9f9f9}
    .bio{font-size:.82rem;line-height:1.65;color:#333;border-left:3px solid #ccc;padding-left:.75rem;margin-bottom:1.2rem}
    .photo{width:100%;max-height:180px;object-fit:cover;border-radius:4px;margin-bottom:1.2rem}
    .footer{display:flex;gap:1.5rem;align-items:flex-start;border-top:1px solid #ddd;padding-top:.8rem;margin-top:.5rem}
    .footer-text{font-size:.68rem;color:#888;line-height:1.8}
    .url{font-size:.6rem;word-break:break-all;color:#aaa}
    @media print{body{padding:1cm}}
  </style>
</head><body>
  <div class="header">
    <div>
      <h1>${g.name || 'Empty plot'}</h1>
      ${g.fatherName ? `<div class="sub">s/o ${g.fatherName}</div>` : ''}
      <span class="status ${g.status || 'occupied'}">${g.status || 'occupied'}</span>
    </div>
    <div class="brand"><b>GraveMap</b><br>Digital Grave Record</div>
  </div>
  ${g.photoUrl ? `<img class="photo" src="${g.photoUrl}" onerror="this.style.display='none'" />` : ''}
  <table>
    ${srp(['Cemetery', cem.name || '–'])}
    ${srp(['Location', loc])}
    ${srp(['Date of Birth', g.dob || '–'])}
    ${srp(['Date of Death', g.deathDate || '–'])}
    ${srp(['Burial Date', g.burialDate || '–'])}
    ${g.age ? srp(['Age at Death', g.age + ' years']) : ''}
    ${g.section ? srp(['Section / Row / Plot', `${g.section} / ${g.row || '–'} / ${g.plot || '–'}`]) : ''}
  </table>
  ${g.bio ? `<div class="bio">${g.bio}</div>` : ''}
  <div class="footer">
    <div id="qr"></div>
    <div class="footer-text">
      <div><b>Scan to view online</b></div>
      <div>Printed: ${new Date().toLocaleDateString()}</div>
      <div class="url">${shareUrl}</div>
    </div>
  </div>
  <script>window.onload=function(){new QRCode(document.getElementById('qr'),{text:'${shareUrl}',width:80,height:80});setTimeout(()=>window.print(),700)};<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=800,height=700');
  w.document.write(html);
  w.document.close();
};

// ═══════════════════════════
//  CSV IMPORT
// ═══════════════════════════
let _csvRows = [];
const CSV_FIELDS = ['name', 'fatherName', 'gender', 'dob', 'deathDate', 'burialDate', 'age', 'section', 'row', 'plot', 'bio', 'status', 'photoUrl'];

// Lightweight CSV parser — handles quoted fields
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  let headers = null;
  const rows = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const fields = [];
    let i = 0;
    while (i <= raw.length) {
      if (i === raw.length) { fields.push(''); break; }
      if (raw[i] === '"') {
        i++; let f = '';
        while (i < raw.length) {
          if (raw[i] === '"' && raw[i + 1] === '"') { f += '"'; i += 2; }
          else if (raw[i] === '"') { i++; break; }
          else f += raw[i++];
        }
        fields.push(f.trim());
        if (raw[i] === ',') i++;
      } else {
        const end = raw.indexOf(',', i);
        const val = end === -1 ? raw.slice(i) : raw.slice(i, end);
        fields.push(val.trim());
        i = end === -1 ? raw.length + 1 : end + 1;
      }
    }
    if (!headers) { headers = fields.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '')); continue; }
    const obj = {};
    headers.forEach((h, idx) => obj[h] = fields[idx] || '');
    rows.push(obj);
  }
  return rows;
}

window.openCsvImport = function () {
  const el = document.getElementById('csv-cem-sel');
  el.innerHTML = '<option value="">Select cemetery…</option>';
  Object.entries(S.cemeteries).forEach(([cid, c]) => {
    el.innerHTML += `<option value="${cid}">${esc(c.name)}</option>`;
  });
  _csvRows = [];
  document.getElementById('csv-file-inp').value = '';
  document.getElementById('csv-preview-wrap').style.display = 'none';
  document.getElementById('btn-do-csv-import').style.display = 'none';
  openOverlay('ov-csv-import');
};

window.downloadCsvTemplate = function () {
  const header = CSV_FIELDS.join(',');
  const ex = ['Ahmed Ali', 'Muhammad Ali', 'male', '1945-03-12', '2020-11-05', '2020-11-06', '75', 'A', '3', '12', 'A beloved father and teacher', 'occupied', ''].join(',');
  const blob = new Blob([header + '\n' + ex], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'gravemap_template.csv' });
  a.click();
};

document.getElementById('csv-file-inp').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _csvRows = parseCSV(e.target.result);
    const wrap = document.getElementById('csv-preview-wrap');
    const importBtn = document.getElementById('btn-do-csv-import');
    if (!_csvRows.length) {
      wrap.innerHTML = '<p style="color:#E05A5A;font-size:.83rem">No valid rows found.</p>';
      wrap.style.display = 'block';
      importBtn.style.display = 'none';
      return;
    }
    const preview = _csvRows.slice(0, 5);
    const cols = Object.keys(preview[0]);
    wrap.innerHTML = `
      <div style="font-size:.82rem;margin-bottom:.5rem;color:var(--text-mid)">
        <b>${_csvRows.length}</b> record${_csvRows.length > 1 ? 's' : ''} found. Showing first ${Math.min(5, _csvRows.length)}:
      </div>
      <div style="overflow-x:auto">
        <table class="csv-tbl">
          <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
          <tbody>${preview.map(r => `<tr>${cols.map(c => `<td>${esc(r[c] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
    wrap.style.display = 'block';
    importBtn.style.display = 'inline-block';
  };
  reader.readAsText(file);
});

document.getElementById('btn-do-csv-import').addEventListener('click', async () => {
  const cemId = document.getElementById('csv-cem-sel').value;
  if (!cemId) { toast('Select a cemetery first', 'err'); return; }
  if (!_csvRows.length) { toast('No rows to import', 'err'); return; }

  const btn = document.getElementById('btn-do-csv-import');
  btn.disabled = true;
  btn.textContent = `Importing 0 / ${_csvRows.length}…`;

  const validStatus = ['occupied', 'empty', 'reserved'];
  let count = 0;
  for (const row of _csvRows) {
    const name = (row.name || row.fullname || '').trim();
    const statusRaw = (row.status || '').toLowerCase().trim();
    await dbPush('graves', {
      cemeteryId: cemId,
      name: name || null,
      fatherName: (row.fathername || row.father || '').trim() || null,
      gender: (row.gender || '').toLowerCase().trim() || null,
      dob: (row.dob || row.dateofbirth || '').trim() || null,
      deathDate: (row.deathdate || row.dateofdeath || '').trim() || null,
      burialDate: (row.burialdate || '').trim() || null,
      age: parseInt(row.age) || null,
      section: (row.section || '').trim() || null,
      row: (row.row || '').trim() || null,
      plot: (row.plot || '').trim() || null,
      bio: (row.bio || row.biography || '').trim() || null,
      status: validStatus.includes(statusRaw) ? statusRaw : 'occupied',
      photoUrl: (row.photourl || row.photo || '').trim() || null,
      polygon: null, lat: null, lng: null,
      createdAt: Date.now()
    });
    count++;
    btn.textContent = `Importing ${count} / ${_csvRows.length}…`;
  }

  toast(`✓ ${count} graves imported!`, 'ok');
  closeOverlay('ov-csv-import');
  _csvRows = [];
  btn.disabled = false;
  btn.textContent = 'Import graves';
  btn.style.display = 'none';
});

// ═══════════════════════════
//  ADMINS MANAGEMENT
// ═══════════════════════════
function renderAdminAdmins() {
  const el = document.getElementById('atab-admins');
  const admins = Object.entries(S.admins || {});

  const formHtml = `
    <form id="add-admin-form" style="margin-bottom:1.25rem;background:var(--stone);padding:1rem;border:1px solid var(--border);border-radius:var(--r);max-width:480px">
      <h4 style="margin-bottom:.75rem;font-size:.85rem;color:var(--text-mid)">Add New Administrator</h4>
      <div class="field">
        <label>Google User ID (UID) *</label>
        <input id="adm-uid" type="text" placeholder="Paste user's Google UID here" required style="width:100%;padding:.45rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem" />
      </div>
      <div class="field-row" style="margin-top:.5rem">
        <div class="field">
          <label>Display Name (optional)</label>
          <input id="adm-name" type="text" placeholder="e.g. John Doe" style="width:100%;padding:.45rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem" />
        </div>
        <div class="field">
          <label>Email (optional)</label>
          <input id="adm-email" type="email" placeholder="e.g. john@example.com" style="width:100%;padding:.45rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem" />
        </div>
      </div>
      <button type="submit" class="btn-primary" style="margin-top:.75rem;font-size:.78rem">Add Administrator</button>
    </form>
  `;

  if (!admins.length) {
    el.innerHTML = formHtml + '<p style="color:#9CA3AF;font-size:.83rem;padding:.5rem 0">No other administrators registered.</p>';
    attachAddAdminSubmit();
    return;
  }

  el.innerHTML = formHtml + `
    <div style="font-size:.85rem;font-weight:700;margin-bottom:.5rem;color:var(--text-mid)">Active Administrators</div>
    <div style="overflow-x:auto">
      <table class="csv-tbl" style="font-size:.8rem">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Google UID</th>
            <th>Added Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${admins.map(([uid, a]) => {
            const date = a.addedAt ? new Date(a.addedAt).toLocaleDateString() : '–';
            const isSelf = window.__user && window.__user.uid === uid;
            return `<tr>
              <td><b>${esc(a.name || 'Admin')}</b> ${isSelf ? ' <span style="font-size:.7rem;color:var(--accent)">(You)</span>' : ''}</td>
              <td>${esc(a.email || '–')}</td>
              <td style="font-family:monospace;font-size:.72rem">${esc(uid)}</td>
              <td>${date}</td>
              <td>
                <button class="ibt" onclick="deleteAdmin('${uid}')" title="Remove Admin" style="color:var(--occupied)">🗑</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  attachAddAdminSubmit();
}

function attachAddAdminSubmit() {
  const form = document.getElementById('add-admin-form');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const uid = document.getElementById('adm-uid').value.trim();
    const name = document.getElementById('adm-name').value.trim();
    const email = document.getElementById('adm-email').value.trim();
    if (!uid) return;

    try {
      await dbUpdate(`admins/${uid}`, {
        name: name || 'Admin',
        email: email || null,
        addedAt: Date.now()
      });
      toast('Administrator added successfully!', 'ok');
      form.reset();
    } catch (err) {
      toast(err.message, 'err');
    }
  });
}

window.deleteAdmin = async uid => {
  if (window.__user && window.__user.uid === uid) {
    if (!confirm('Warning: You are about to remove yourself as administrator! If you proceed, you will lose access. Continue?')) return;
  } else {
    if (!confirm('Remove this user from administrators?')) return;
  }
  try {
    await dbRemove(`admins/${uid}`);
    toast('Administrator removed', 'ok');
    if (window.__user && window.__user.uid === uid) {
      location.reload();
    }
  } catch (err) {
    toast(err.message, 'err');
  }
};

// Handle unauthorized login access
document.addEventListener('authUnauthorized', e => {
  const uid = e.detail;
  const modalHtml = `
    <div style="text-align:center;padding:1.5rem">
      <div style="font-size:2.5rem;margin-bottom:1rem">🚫</div>
      <h3 style="margin-bottom:.5rem;color:var(--occupied)">Access Denied</h3>
      <p style="font-size:.85rem;color:var(--text-mid);line-height:1.5;margin-bottom:1.2rem">
        You are not registered as an administrator. Please copy your Google User ID (UID) below and send it to an existing administrator to request access.
      </p>
      <div style="background:var(--stone);padding:.6rem;border:1px solid var(--border);border-radius:6px;font-family:monospace;font-size:.8rem;word-break:break-all;user-select:all;margin-bottom:1.2rem">
        ${uid}
      </div>
      <button class="btn-primary" onclick="closeOverlay('ov-grave')">Dismiss</button>
    </div>
  `;
  document.getElementById('grave-detail-body').innerHTML = modalHtml;
  openOverlay('ov-grave');
});

// ═══════════════════════════
//  URDU / ENGLISH TRANSLATIONS & RTL
// ═══════════════════════════
const TR = {
  en: {
    brand_tag: "Digitally preserving cemeteries",
    nav_map: "🗺 Map",
    nav_search: "🔍 Search",
    nav_cemeteries: "🏛 Cemeteries",
    nav_admin: "⚙ Admin",
    btn_login: "Sign in as Admin",
    cems_title: "Cemeteries",
    filter_placeholder: "Filter cemeteries…",
    legend_avail: "Available",
    legend_occupied: "Occupied",
    legend_reserved: "Reserved",
    search_title: "Search graves",
    search_sub: "Find anyone across all registered cemeteries",
    search_placeholder: "Name, father's name, cemetery…",
    all_cems: "All cemeteries",
    all_cities: "All cities",
    any_gender: "Any gender",
    male: "Male",
    female: "Female",
    search_empty: "Enter a name to search across all cemeteries.",
    cems_panel_title: "All cemeteries",
    cems_panel_sub: "Registered cemeteries on GraveMap",
    no_cems: "No cemeteries yet.",
    req_title: "Don't see your cemetery?",
    req_btn: "+ Request to add a cemetery",
    manage_cems: "Manage cemeteries",
    add_cem: "+ Add cemetery",
    admin_dash: "Admin dashboard",
    admin_graves: "Graves",
    admin_requests: "Requests",
    admin_cemeteries: "Cemeteries",
    admin_admins: "Admins",
    register_grave: "+ Register grave",
    import_csv: "📥 Import CSV",
    no_graves_yet: "No graves yet. Register one above or import from CSV.",
    gender_male: "Male",
    gender_female: "Female",
    empty_plot: "Empty plot",
    occupied: "occupied",
    reserved: "reserved",
    empty: "empty",
    navigate: "🧭 Navigate",
    show_on_map: "📍 Show on map",
    copy_link: "🔗 Copy link",
    print_card: "🖨️ Print card",
    report_correction: "Report correction"
  },
  ur: {
    brand_tag: "قبرستانوں کا ڈیجیٹل تحفظ",
    nav_map: "🗺 نقشہ",
    nav_search: "🔍 تلاش",
    nav_cemeteries: "🏛 قبرستان",
    nav_admin: "⚙ ایڈمن",
    btn_login: "ایڈمن لاگ ان",
    cems_title: "قبرستان",
    filter_placeholder: "قبرستان تلاش کریں…",
    legend_avail: "خالی جگہ",
    legend_occupied: "بھرا ہوا",
    legend_reserved: "محفوظ",
    search_title: "قبر تلاش کریں",
    search_sub: "تمام رجسٹرڈ قبرستانوں میں کسی کو بھی تلاش کریں",
    search_placeholder: "نام، والد کا نام، قبرستان…",
    all_cems: "تمام قبرستان",
    all_cities: "تمام شہر",
    any_gender: "کوئی بھی جنس",
    male: "مرد",
    female: "عورت",
    search_empty: "تمام قبرستانوں میں تلاش کرنے کے لیے نام درج کریں۔",
    cems_panel_title: "تمام قبرستان",
    cems_panel_sub: "GraveMap پر رجسٹرڈ قبرستان",
    no_cems: "ابھی تک کوئی قبرستان نہیں ہے۔",
    req_title: "آپ کا قبرستان نظر نہیں آ رہا؟",
    req_btn: "+ قبرستان شامل کرنے کی درخواست کریں",
    manage_cems: "قبرستانوں کا انتظام",
    add_cem: "+ قبرستان شامل کریں",
    admin_dash: "ایڈمن ڈیش بورڈ",
    admin_graves: "قبریں",
    admin_requests: "درخواستیں",
    admin_cemeteries: "قبرستان",
    admin_admins: "ایڈمنز",
    register_grave: "+ قبر رجسٹر کریں",
    import_csv: "📥 فائل امپورٹ کریں",
    no_graves_yet: "ابھی تک کوئی قبر نہیں ہے۔ اوپر سے رجسٹر کریں یا فائل امپورٹ کریں۔",
    gender_male: "مرد",
    gender_female: "عورت",
    empty_plot: "خالی پلاٹ",
    occupied: "بھرا ہوا",
    reserved: "محفوظ",
    empty: "خالی",
    navigate: "🧭 راستہ دکھائیں",
    show_on_map: "📍 نقشے پر دیکھیں",
    copy_link: "🔗 لنک کاپی کریں",
    print_card: "🖨️ پرنٹ کریں",
    report_correction: "درستی کی درخوست کریں"
  }
};

window.toggleLanguage = function() {
  S.lang = S.lang === 'en' ? 'ur' : 'en';
  localStorage.setItem('gravemap_lang', S.lang);
  applyLanguage();
};

window.applyLanguage = function() {
  const lang = S.lang;
  const t = TR[lang];
  document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
  
  const btn = document.getElementById('btn-lang');
  if (btn) btn.innerHTML = lang === 'en' ? '🌐 اردو' : '🌐 English';

  const mappings = {
    'brand-tag-el': t.brand_tag,
    'btn-login': t.btn_login,
    'legend-avail-el': t.legend_avail,
    'legend-occupied-el': t.legend_occupied,
    'legend-reserved-el': t.legend_reserved,
    'search-title-el': t.search_title,
    'search-sub-el': t.search_sub,
    'search-empty-p': t.search_empty,
    'cems-title-el': t.cems_panel_title,
    'cems-sub-el': t.cems_panel_sub,
    'req-title-el': t.req_title,
    'btn-req-cemetery': t.req_btn,
    'req-title-admin-el': t.manage_cems,
    'cems-sidebar-title-el': t.cems_title
  };

  for (const [id, text] of Object.entries(mappings)) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  const placeholders = {
    'map-cem-search': t.filter_placeholder,
    'search-q': t.search_placeholder
  };
  for (const [id, text] of Object.entries(placeholders)) {
    const el = document.getElementById(id);
    if (el) el.placeholder = text;
  }

  const sfCem = document.getElementById('sf-cem');
  if (sfCem && sfCem.options[0]) sfCem.options[0].textContent = t.all_cems;
  const sfCity = document.getElementById('sf-city');
  if (sfCity && sfCity.options[0]) sfCity.options[0].textContent = t.all_cities;
  const sfGender = document.getElementById('sf-gender');
  if (sfGender) {
    if (sfGender.options[0]) sfGender.options[0].textContent = t.any_gender;
    if (sfGender.options[1]) sfGender.options[1].textContent = t.male;
    if (sfGender.options[2]) sfGender.options[2].textContent = t.female;
  }

  const navs = document.querySelectorAll('.tnav');
  navs.forEach(nav => {
    const view = nav.dataset.view;
    if (view === 'map') nav.textContent = t.nav_map;
    if (view === 'search') nav.textContent = t.nav_search;
    if (view === 'cemeteries') nav.textContent = t.nav_cemeteries;
    if (view === 'admin') nav.textContent = t.nav_admin;
  });

  renderCemListPanel();
  renderCemeteriesPanel();
  doSearch();
};

// ═══════════════════════════
//  FAMILY TREE LINKING
// ═══════════════════════════
const RELATIONS = [
  { value: 'spouse',  label: '💍 Spouse' },
  { value: 'parent',  label: '👴 Parent' },
  { value: 'child',   label: '👶 Child' },
  { value: 'sibling', label: '🤝 Sibling' },
  { value: 'other',   label: '🔗 Other' },
];

// Opposite relation for bidirectional linking
const OPPOSITE = { spouse: 'spouse', parent: 'child', child: 'parent', sibling: 'sibling', other: 'other' };

function renderFamilySection(gid, isAdmin) {
  const g = S.graves[gid];
  if (!g) return '';
  const relatives = Object.entries(g.relatives || {});

  const relCards = relatives.map(([relId, relData]) => {
    const rel = S.graves[relId];
    if (!rel) return '';
    const relation = typeof relData === 'string' ? relData : (relData?.relation || 'other');
    const relLabel = RELATIONS.find(r => r.value === relation)?.label || '🔗 Related';
    return `
      <div class="family-card" onclick="openGraveDetail('${relId}')" title="Open grave detail">
        <div class="family-avatar ${rel.gender || 'male'}">${rel.gender === 'female' ? '♀' : '♂'}</div>
        <div class="family-info">
          <div class="family-name">${esc(rel.name || 'Unknown')}</div>
          <div class="family-rel">${relLabel}</div>
        </div>
        ${isAdmin ? `<button class="family-unlink" onclick="event.stopPropagation();unlinkRelative('${gid}','${relId}')" title="Remove link">✕</button>` : ''}
      </div>`;
  }).join('');

  const adminAdd = isAdmin ? `
    <div id="family-add-section" style="margin-top:.75rem">
      <button class="btn-secondary" style="font-size:.78rem" onclick="toggleFamilySearch('${gid}')" id="btn-toggle-family-${gid}">+ Link relative</button>
      <div id="family-search-box-${gid}" style="display:none;margin-top:.6rem">
        <input id="family-search-input-${gid}" type="text" placeholder="Search name…"
          style="width:100%;padding:.4rem .6rem;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--stone);color:var(--text)"
          oninput="familySearchInput('${gid}', this.value)" />
        <div style="margin-top:.4rem">
          <label style="font-size:.75rem;color:var(--text-mid)">Relationship:</label>
          <select id="family-rel-select-${gid}" style="width:100%;padding:.35rem;border:1px solid var(--border);border-radius:6px;font-size:.78rem;background:var(--stone);color:var(--text);margin-top:.3rem">
            ${RELATIONS.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
          </select>
        </div>
        <div id="family-search-results-${gid}" style="margin-top:.5rem;max-height:180px;overflow-y:auto"></div>
      </div>
    </div>` : '';

  return `
    <div class="gd-qr-label" style="margin-bottom:.6rem">👨‍👩‍👧 Family</div>
    ${relatives.length === 0 ? '<p style="font-size:.8rem;color:var(--text-mid);margin-bottom:.5rem">No family links yet.</p>' : ''}
    <div class="family-tree" id="family-tree-${gid}">${relCards}</div>
    ${adminAdd}
  `;
}

window.toggleFamilySearch = function(gid) {
  const box = document.getElementById(`family-search-box-${gid}`);
  if (!box) return;
  const isHidden = box.style.display === 'none';
  box.style.display = isHidden ? 'block' : 'none';
  if (isHidden) document.getElementById(`family-search-input-${gid}`)?.focus();
};

window.familySearchInput = function(gid, query) {
  const results = document.getElementById(`family-search-results-${gid}`);
  if (!results) return;
  const q = query.trim().toLowerCase();
  if (!q) { results.innerHTML = ''; return; }

  const g = S.graves[gid];
  const existingLinks = new Set(Object.keys(g?.relatives || {}));

  const matches = Object.entries(S.graves)
    .filter(([id, gr]) => id !== gid && !existingLinks.has(id) && (
      (gr.name || '').toLowerCase().includes(q) ||
      (gr.fatherName || '').toLowerCase().includes(q)
    ))
    .slice(0, 8);

  if (!matches.length) {
    results.innerHTML = `<p style="font-size:.78rem;color:var(--text-mid);padding:.3rem 0">No results found.</p>`;
    return;
  }

  results.innerHTML = matches.map(([id, gr]) => {
    const cem = S.cemeteries[gr.cemeteryId] || {};
    return `
      <div class="family-search-result" onclick="linkRelative('${gid}','${id}')" title="Link this person">
        <div class="family-avatar ${gr.gender || 'male'}" style="width:28px;height:28px;font-size:.7rem">${gr.gender === 'female' ? '♀' : '♂'}</div>
        <div>
          <div style="font-size:.82rem;font-weight:600">${esc(gr.name || 'Unknown')}</div>
          <div style="font-size:.72rem;color:var(--text-mid)">${esc(gr.fatherName ? 's/o ' + gr.fatherName : '')} ${esc(cem.name || '')}</div>
        </div>
      </div>`;
  }).join('');
};

window.linkRelative = async function(gid, relId) {
  const relSelect = document.getElementById(`family-rel-select-${gid}`);
  const relation = relSelect ? relSelect.value : 'other';
  const opposite = OPPOSITE[relation] || 'other';

  try {
    // Bidirectional: write both sides
    await dbUpdate(`graves/${gid}/relatives/${relId}`, { relation });
    await dbUpdate(`graves/${relId}/relatives/${gid}`, { relation: opposite });
    toast('✓ Family link added', 'ok');

    // Refresh family section in the open detail view
    const section = document.getElementById('gd-family-section');
    if (section) section.innerHTML = renderFamilySection(gid, true);
  } catch(err) {
    toast('Error: ' + err.message, 'err');
  }
};

window.unlinkRelative = async function(gid, relId) {
  if (!confirm('Remove this family link?')) return;
  try {
    // Remove both sides
    await dbRemove(`graves/${gid}/relatives/${relId}`);
    await dbRemove(`graves/${relId}/relatives/${gid}`);
    toast('Family link removed', 'ok');

    const section = document.getElementById('gd-family-section');
    if (section) section.innerHTML = renderFamilySection(gid, true);
  } catch(err) {
    toast('Error: ' + err.message, 'err');
  }
};

// ═══════════════════════════
//  INIT
// ═══════════════════════════
waitFB(() => {
  initMainMap();
  loadData();
  applyLanguage();
  checkDeepLink();
  switchView('map');
});