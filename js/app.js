/* ═══════════════════════════════════════
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
const fb = () => window.__fb;

async function dbGet(path) {
  const { db, ref, get } = fb();
  const s = await get(ref(db, path));
  return s.exists() ? s.val() : null;
}
async function dbSet(path, data) {
  const { db, ref, set } = fb();
  await set(ref(db, path), data);
}
async function dbPush(path, data) {
  const { db, ref, push } = fb();
  const r = push(ref(db, path));
  await dbSet(`${path}/${r.key}`, data);
  return r.key;
}
async function dbUpdate(path, data) {
  const { db, ref, update } = fb();
  await update(ref(db, path), data);
}
async function dbRemove(path) {
  const { db, ref, remove } = fb();
  await remove(ref(db, path));
}
function dbListen(path, cb) {
  const { db, ref, onValue } = fb();
  onValue(ref(db, path), s => cb(s.exists() ? s.val() : {}));
}

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
  await fb().signOut(fb().auth);
  toast('Signed out');
});

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
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const first = el.options[0].outerHTML;
    el.innerHTML = first;
    cems.forEach(([cid, c]) => el.innerHTML += `<option value="${cid}">${esc(c.name)}</option>`);
  });
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
  });

  if (!results.length) {
    grid.innerHTML = `<p style="color:var(--text-lt);padding:.5rem">No graves found.</p>`; return;
  }

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
    </div>`;
  }).join('');
}

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
      </div>
    </div>`;
  }).join('');
}

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
};

document.getElementById('grave-form').addEventListener('submit', async e => {
  e.preventDefault();
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

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeOverlay(btn.dataset.close));
});
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) closeOverlay(o.id); });
});

// ══════════════════════════════════════
//  TOAST
// ══════════════════════════════════════
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.add('show');
  clearTimeout(el._t);
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
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
waitFB(() => {
  loadData();
  checkDeepLink();
  toggleDecFields('empty');
});
