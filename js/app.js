// ═══════════════════════════════════════════
//   GraveMap – app.js
//   All app logic: routing, Firebase CRUD,
//   Leaflet map, grid map, search, QR, stats
// ═══════════════════════════════════════════

/* ── Wait for Firebase module to init ── */
function waitForFirebase(cb, tries = 0) {
  if (window.__firebase) return cb();
  if (tries > 30) return console.error('Firebase not loaded');
  setTimeout(() => waitForFirebase(cb, tries + 1), 150);
}

/* ══════════════════════════════════════
   GLOBAL STATE
══════════════════════════════════════ */
const STATE = {
  cemeteries: {},   // { id: cemetery }
  graves:     {},   // { id: grave }
  deceased:   {},   // { id: deceased }
  editingGraveId: null,
  leafletMap: null,
  leafletMarkers: {},
};

/* ══════════════════════════════════════
   FIREBASE HELPERS
══════════════════════════════════════ */
const FB = () => window.__firebase;

async function dbGet(path) {
  const { db, ref, get } = FB();
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : null;
}

async function dbSet(path, data) {
  const { db, ref, set } = FB();
  await set(ref(db, path), data);
}

async function dbPush(path, data) {
  const { db, ref, push } = FB();
  const newRef = push(ref(db, path));
  await dbSet(newRef.key ? `${path}/${newRef.key}` : path, data);
  return newRef.key;
}

async function dbRemove(path) {
  const { db, ref, remove } = FB();
  await remove(ref(db, path));
}

function dbListen(path, cb) {
  const { db, ref, onValue } = FB();
  onValue(ref(db, path), snap => cb(snap.exists() ? snap.val() : {}));
}

/* ══════════════════════════════════════
   ROUTER / PAGE NAVIGATION
══════════════════════════════════════ */
function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById(`page-${pageId}`);
  if (page) page.classList.add('active');

  const navItem = document.querySelector(`[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  // Page-specific init
  if (pageId === 'map') initMapPage();
  if (pageId === 'stats') renderStats();
  if (pageId === 'admin-graves') renderGravesTable();
  if (pageId === 'cemeteries') renderCemeteriesList();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigate(item.dataset.page);
  });
});

/* Hamburger */
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
document.addEventListener('authChanged', e => {
  const user = e.detail;
  const adminEls = document.querySelectorAll('.admin-only');
  const signinBtn = document.getElementById('btn-signin');
  const userInfo  = document.getElementById('user-info');

  if (user) {
    adminEls.forEach(el => el.classList.remove('hidden'));
    signinBtn.classList.add('hidden');
    userInfo.classList.remove('hidden');
    document.getElementById('user-avatar').src = user.photoURL || '';
    document.getElementById('user-name').textContent = user.displayName || user.email;
  } else {
    adminEls.forEach(el => el.classList.add('hidden'));
    signinBtn.classList.remove('hidden');
    userInfo.classList.add('hidden');
  }
});

document.getElementById('btn-signin').addEventListener('click', async () => {
  const { auth, provider, signInWithPopup } = FB();
  try {
    await signInWithPopup(auth, provider);
    toast('Signed in successfully', 'success');
  } catch (err) {
    toast('Sign-in failed: ' + err.message, 'error');
  }
});

document.getElementById('btn-signout').addEventListener('click', async () => {
  const { auth, signOut } = FB();
  await signOut(auth);
  toast('Signed out');
});

/* ══════════════════════════════════════
   LOAD DATA FROM FIREBASE (live)
══════════════════════════════════════ */
function loadData() {
  dbListen('cemeteries', data => {
    STATE.cemeteries = data || {};
    populateCemeterySelects();
    renderCemeteriesList();
  });

  dbListen('graves', data => {
    STATE.graves = data || {};
    renderGravesTable();
    updateMapMarkers();
    renderGrid();
  });

  dbListen('deceased', data => {
    STATE.deceased = data || {};
  });
}

/* ══════════════════════════════════════
   CEMETERY SELECTS – populate all
══════════════════════════════════════ */
function populateCemeterySelects() {
  const selects = [
    'filter-cemetery', 'map-cemetery-select', 'admin-cemetery-filter',
    'stats-cemetery-select', 'gf-cemetery', 'cf-name'
  ];
  const cems = Object.entries(STATE.cemeteries);

  ['filter-cemetery', 'map-cemetery-select', 'admin-cemetery-filter', 'stats-cemetery-select'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const first = el.options[0].outerHTML;
    el.innerHTML = first;
    cems.forEach(([id2, c]) => {
      el.innerHTML += `<option value="${id2}">${c.name}</option>`;
    });
  });

  const gfCem = document.getElementById('gf-cemetery');
  if (gfCem) {
    gfCem.innerHTML = '<option value="">Select cemetery…</option>';
    cems.forEach(([id2, c]) => {
      gfCem.innerHTML += `<option value="${id2}">${c.name}</option>`;
    });
  }
}

/* ══════════════════════════════════════
   SEARCH
══════════════════════════════════════ */
const searchInput   = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchEmpty   = document.getElementById('search-empty');

function doSearch() {
  const q = searchInput.value.trim().toLowerCase();
  const filterCem = document.getElementById('filter-cemetery').value;
  const filterGender = document.getElementById('filter-gender').value;

  if (!q) {
    searchResults.innerHTML = '';
    searchEmpty.classList.remove('hidden');
    return;
  }
  searchEmpty.classList.add('hidden');

  // Build index: graveId → deceased
  const deceasedByGrave = {};
  Object.entries(STATE.deceased).forEach(([did, d]) => {
    deceasedByGrave[d.graveId] = d;
  });

  const results = [];

  Object.entries(STATE.graves).forEach(([gid, g]) => {
    if (filterCem && g.cemeteryId !== filterCem) return;

    const dec = deceasedByGrave[gid];

    // Match on name, father, plot
    let matches = false;
    if (dec) {
      if ((dec.fullName || '').toLowerCase().includes(q)) matches = true;
      if ((dec.fatherName || '').toLowerCase().includes(q)) matches = true;
      if (filterGender && dec.gender !== filterGender) return;
    }
    if (gid.toLowerCase().includes(q)) matches = true;
    if ((g.plot || '').toLowerCase().includes(q)) matches = true;

    if (matches) results.push({ gid, g, dec });
  });

  if (results.length === 0) {
    searchResults.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No graves found matching your search.</p>';
    return;
  }

  searchResults.innerHTML = results.map(({ gid, g, dec }) => {
    const cem = STATE.cemeteries[g.cemeteryId] || {};
    const name = dec ? dec.fullName : 'Unknown';
    const father = dec ? dec.fatherName : '';
    const dod = dec ? (dec.deathDate || '') : '';
    return `
      <div class="grave-card" data-status="${g.status}" onclick="openGraveDetail('${gid}')">
        <div class="grave-card-name">${esc(name)}</div>
        ${father ? `<div class="grave-card-father">s/o ${esc(father)}</div>` : ''}
        <div class="grave-card-meta">
          <span class="meta-tag">📍 ${esc(cem.name || 'Unknown')}</span>
          <span class="meta-tag">§${esc(g.section || '')} R${esc(g.row || '')} P${esc(g.plot || '')}</span>
          ${dod ? `<span class="meta-tag">✝ ${dod}</span>` : ''}
          <span class="status-badge ${g.status}">${g.status}</span>
        </div>
      </div>`;
  }).join('');
}

searchInput.addEventListener('input', doSearch);
document.getElementById('filter-cemetery').addEventListener('change', doSearch);
document.getElementById('filter-gender').addEventListener('change', doSearch);
document.getElementById('btn-search-clear').addEventListener('click', () => {
  searchInput.value = '';
  doSearch();
});

/* ══════════════════════════════════════
   GRAVE DETAIL MODAL
══════════════════════════════════════ */
function openGraveDetail(graveId) {
  const g   = STATE.graves[graveId];
  const cem = STATE.cemeteries[g?.cemeteryId] || {};

  // Find deceased
  const dec = Object.values(STATE.deceased).find(d => d.graveId === graveId);

  const name   = dec ? dec.fullName    : 'Empty Grave';
  const father = dec ? dec.fatherName  : '';
  const gender = dec ? dec.gender      : '';
  const dob    = dec ? (dec.birthDate  || '–') : '–';
  const dod    = dec ? (dec.deathDate  || '–') : '–';
  const burial = dec ? (dec.burialDate || '–') : '–';
  const bio    = dec ? (dec.bio        || '')  : '';

  const pageUrl = `${location.href.split('?')[0]}?grave=${graveId}`;

  const isAdmin = !!window.__currentUser;

  document.getElementById('grave-detail-content').innerHTML = `
    <div class="grave-detail-header">
      <div class="grave-detail-icon">${gender === 'female' ? '👩' : '👤'}</div>
      <div>
        <h2>${esc(name)}</h2>
        ${father ? `<div class="father">Son/Daughter of ${esc(father)}</div>` : ''}
        <span class="status-badge ${g.status}" style="margin-top:0.4rem;display:inline-block">${g.status}</span>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-item"><label>Cemetery</label><p>${esc(cem.name || '–')}</p></div>
      <div class="detail-item"><label>Section / Row / Plot</label><p>${esc(g.section || '–')} / ${esc(g.row || '–')} / ${esc(g.plot || '–')}</p></div>
      <div class="detail-item"><label>Date of Birth</label><p>${esc(dob)}</p></div>
      <div class="detail-item"><label>Date of Death</label><p>${esc(dod)}</p></div>
      <div class="detail-item"><label>Burial Date</label><p>${esc(burial)}</p></div>
      <div class="detail-item"><label>Gender</label><p>${esc(gender || '–')}</p></div>
    </div>

    ${bio ? `<div style="background:var(--stone-light);border-radius:var(--radius);padding:1rem;margin-bottom:1rem;font-size:0.88rem;line-height:1.6;color:var(--text)">${esc(bio)}</div>` : ''}

    ${(g.latitude && g.longitude) ? `
      <div class="grave-detail-map" id="detail-mini-map"></div>
    ` : ''}

    <div style="margin-bottom:1.25rem">
      <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.75rem">Timeline</div>
      <div class="timeline">
        ${burial ? `<div class="timeline-item"><div class="timeline-date">${esc(burial)}</div><div class="timeline-label">Burial</div></div>` : ''}
        ${dod ? `<div class="timeline-item"><div class="timeline-date">${esc(dod)}</div><div class="timeline-label">Passed Away</div></div>` : ''}
        <div class="timeline-item"><div class="timeline-date">Registered</div><div class="timeline-label">Grave Record Created</div></div>
      </div>
    </div>

    <div style="margin-bottom:1.25rem">
      <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.75rem">QR Code</div>
      <div id="qr-container"></div>
    </div>

    <div class="grave-detail-actions">
      ${(g.latitude && g.longitude) ? `
        <button class="btn-navigate" onclick="navigateToGrave(${g.latitude},${g.longitude})">🧭 Navigate</button>
      ` : ''}
      ${isAdmin ? `<button class="btn-primary" onclick="editGrave('${graveId}')">Edit Grave</button>` : ''}
    </div>
  `;

  openModal('modal-grave-detail');

  // Mini map
  if (g.latitude && g.longitude) {
    setTimeout(() => {
      const miniMap = L.map('detail-mini-map', { zoomControl: false, dragging: false }).setView([g.latitude, g.longitude], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(miniMap);
      const icon = L.divIcon({ className: '', html: markerHtml(g.status), iconSize: [20, 20], iconAnchor: [10, 10] });
      L.marker([g.latitude, g.longitude], { icon }).addTo(miniMap);
    }, 100);
  }

  // QR code
  setTimeout(() => {
    const qrEl = document.getElementById('qr-container');
    if (qrEl) {
      new QRCode(qrEl, { text: pageUrl, width: 100, height: 100 });
    }
  }, 100);
}

function navigateToGrave(lat, lng) {
  window.open(`https://www.openstreetmap.org/directions?from=&to=${lat},${lng}`, '_blank');
}

/* ══════════════════════════════════════
   LEAFLET MAP
══════════════════════════════════════ */
function initMapPage() {
  if (!STATE.leafletMap) {
    const defaultCenter = [30.3753, 69.3451]; // Pakistan center
    STATE.leafletMap = L.map('leaflet-map').setView(defaultCenter, 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 20
    }).addTo(STATE.leafletMap);
  }
  updateMapMarkers();
  renderGrid();
}

function markerHtml(status) {
  const colors = { occupied: '#B5655A', empty: '#6B8F71', reserved: '#D4A843' };
  const c = colors[status] || '#6B7A8A';
  return `<div style="width:16px;height:16px;background:${c};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`;
}

function updateMapMarkers() {
  if (!STATE.leafletMap) return;

  const filterCem = document.getElementById('map-cemetery-select')?.value || '';

  // Clear old markers
  Object.values(STATE.leafletMarkers).forEach(m => STATE.leafletMap.removeLayer(m));
  STATE.leafletMarkers = {};

  const deceasedByGrave = {};
  Object.values(STATE.deceased).forEach(d => { deceasedByGrave[d.graveId] = d; });

  const coords = [];

  Object.entries(STATE.graves).forEach(([gid, g]) => {
    if (filterCem && g.cemeteryId !== filterCem) return;
    if (!g.latitude || !g.longitude) return;

    const dec = deceasedByGrave[gid];
    const name = dec ? dec.fullName : 'Empty';
    const cem = STATE.cemeteries[g.cemeteryId] || {};

    const icon = L.divIcon({
      className: '',
      html: markerHtml(g.status),
      iconSize: [16, 16], iconAnchor: [8, 8]
    });

    const marker = L.marker([g.latitude, g.longitude], { icon })
      .addTo(STATE.leafletMap)
      .bindPopup(`<b>${name}</b><br>${cem.name || ''}<br>§${g.section} R${g.row} P${g.plot}<br>
        <a href="#" onclick="openGraveDetail('${gid}');return false">View Details →</a>`);

    STATE.leafletMarkers[gid] = marker;
    coords.push([g.latitude, g.longitude]);
  });

  if (coords.length > 0) {
    STATE.leafletMap.fitBounds(coords, { padding: [40, 40] });
  }

  // Also show cemetery markers
  Object.entries(STATE.cemeteries).forEach(([cid, c]) => {
    if (filterCem && cid !== filterCem) return;
    if (!c.latitude || !c.longitude) return;
    const icon = L.divIcon({
      className: '',
      html: `<div style="background:var(--slate,#1C2B3A);color:#C9A84C;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.3)">${c.name}</div>`,
      iconAnchor: [0, 0]
    });
    L.marker([c.latitude, c.longitude], { icon }).addTo(STATE.leafletMap);
  });
}

document.getElementById('map-cemetery-select')?.addEventListener('change', () => {
  updateMapMarkers();
  renderGrid();
});

/* ══════════════════════════════════════
   GRID MAP
══════════════════════════════════════ */
function renderGrid() {
  const gridEl = document.getElementById('grid-map');
  if (!gridEl) return;

  const filterCem = document.getElementById('map-cemetery-select')?.value || '';

  // Group graves by cemetery → section → row
  const tree = {};
  Object.entries(STATE.graves).forEach(([gid, g]) => {
    if (filterCem && g.cemeteryId !== filterCem) return;
    const cemName = (STATE.cemeteries[g.cemeteryId] || {}).name || g.cemeteryId;
    if (!tree[cemName]) tree[cemName] = {};
    const sec = g.section || 'A';
    if (!tree[cemName][sec]) tree[cemName][sec] = {};
    const row = g.row || '1';
    if (!tree[cemName][sec][row]) tree[cemName][sec][row] = [];
    tree[cemName][sec][row].push({ gid, g });
  });

  if (Object.keys(tree).length === 0) {
    gridEl.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:.5rem">No graves to display. Select a cemetery or add graves.</p>';
    return;
  }

  let html = '';
  Object.entries(tree).forEach(([cemName, sections]) => {
    html += `<div style="font-size:.7rem;font-weight:700;color:var(--slate);margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.06em">${esc(cemName)}</div>`;
    Object.entries(sections).forEach(([sec, rows]) => {
      html += `<div class="grid-section">
        <div class="grid-section-label">Section ${esc(sec)}</div>`;
      Object.entries(rows).sort(([a],[b]) => a.localeCompare(b,undefined,{numeric:true})).forEach(([row, plots]) => {
        html += `<div class="grid-row">
          <div class="grid-row-label">${esc(row)}</div>`;
        plots.forEach(({ gid, g }) => {
          const dec = Object.values(STATE.deceased).find(d => d.graveId === gid);
          const tip = dec ? dec.fullName : `P${g.plot}`;
          html += `<div class="grid-cell ${g.status}" title="${esc(tip)} – ${g.status}" onclick="openGraveDetail('${gid}')"></div>`;
        });
        html += `</div>`;
      });
      html += `</div>`;
    });
  });

  gridEl.innerHTML = html;
}

/* ══════════════════════════════════════
   CEMETERIES LIST
══════════════════════════════════════ */
function renderCemeteriesList() {
  const el = document.getElementById('cemeteries-list');
  if (!el) return;

  const cems = Object.entries(STATE.cemeteries);
  if (cems.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted)">No cemeteries registered yet.</p>';
    return;
  }

  el.innerHTML = cems.map(([cid, c]) => {
    const graves = Object.values(STATE.graves).filter(g => g.cemeteryId === cid);
    const total    = graves.length;
    const occupied = graves.filter(g => g.status === 'occupied').length;
    const avail    = graves.filter(g => g.status === 'empty').length;

    return `<div class="cemetery-card">
      <h3>${esc(c.name)}</h3>
      <div class="location">📍 ${[c.city, c.province, c.country].filter(Boolean).map(esc).join(', ')}</div>
      ${c.description ? `<div class="desc">${esc(c.description)}</div>` : ''}
      <div class="cemetery-card-footer">
        <div class="cemetery-stats-mini">
          <div class="stat-mini"><span class="val">${total}</span><span class="lbl">Total</span></div>
          <div class="stat-mini"><span class="val" style="color:var(--rose)">${occupied}</span><span class="lbl">Occupied</span></div>
          <div class="stat-mini"><span class="val" style="color:var(--sage)">${avail}</span><span class="lbl">Available</span></div>
        </div>
        <button class="btn-view-map" onclick="viewCemeteryMap('${cid}')">View Map</button>
      </div>
    </div>`;
  }).join('');
}

function viewCemeteryMap(cid) {
  document.getElementById('map-cemetery-select').value = cid;
  navigate('map');
  setTimeout(() => {
    updateMapMarkers();
    renderGrid();
  }, 200);
}

document.getElementById('btn-add-cemetery')?.addEventListener('click', () => {
  openModal('modal-cemetery-form');
});

/* Cemetery form submit */
document.getElementById('cemetery-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    name:        document.getElementById('cf-name').value.trim(),
    country:     document.getElementById('cf-country').value.trim(),
    province:    document.getElementById('cf-province').value.trim(),
    city:        document.getElementById('cf-city').value.trim(),
    address:     document.getElementById('cf-address').value.trim(),
    description: document.getElementById('cf-desc').value.trim(),
    latitude:    parseFloat(document.getElementById('cf-lat').value) || null,
    longitude:   parseFloat(document.getElementById('cf-lng').value) || null,
    createdAt:   Date.now()
  };
  try {
    await dbPush('cemeteries', data);
    toast('Cemetery added!', 'success');
    closeModal('modal-cemetery-form');
    e.target.reset();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
});

/* ══════════════════════════════════════
   GRAVES TABLE (admin)
══════════════════════════════════════ */
function renderGravesTable() {
  const tbody = document.getElementById('graves-tbody');
  if (!tbody) return;

  const filterCem    = document.getElementById('admin-cemetery-filter')?.value || '';
  const filterStatus = document.getElementById('admin-status-filter')?.value   || '';

  const deceasedByGrave = {};
  Object.values(STATE.deceased).forEach(d => { deceasedByGrave[d.graveId] = d; });

  const rows = Object.entries(STATE.graves).filter(([gid, g]) => {
    if (filterCem    && g.cemeteryId !== filterCem)  return false;
    if (filterStatus && g.status     !== filterStatus) return false;
    return true;
  });

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:2rem">No graves found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(([gid, g]) => {
    const cem = STATE.cemeteries[g.cemeteryId] || {};
    const dec = deceasedByGrave[gid];
    return `<tr>
      <td style="font-size:.78rem;color:var(--text-muted);font-family:monospace">${gid.slice(-6)}</td>
      <td>${esc(cem.name || '–')}</td>
      <td>${esc(g.section || '–')}</td>
      <td>${esc(g.row || '–')}</td>
      <td>${esc(g.plot || '–')}</td>
      <td><span class="status-badge ${g.status}">${g.status}</span></td>
      <td>${dec ? esc(dec.fullName) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>
        <button class="btn-icon edit" onclick="editGrave('${gid}')" title="Edit">✏️</button>
        <button class="btn-icon del"  onclick="deleteGrave('${gid}')" title="Delete">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

['admin-cemetery-filter', 'admin-status-filter'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', renderGravesTable);
});

/* ══════════════════════════════════════
   ADD / EDIT GRAVE
══════════════════════════════════════ */
document.getElementById('btn-add-grave').addEventListener('click', () => {
  STATE.editingGraveId = null;
  document.getElementById('grave-form-title').textContent = 'Register Grave';
  document.getElementById('grave-form-submit').textContent = 'Save Grave';
  document.getElementById('grave-form').reset();
  toggleDeceasedFields('empty');
  openModal('modal-grave-form');
});

document.getElementById('gf-status').addEventListener('change', e => {
  toggleDeceasedFields(e.target.value);
});

function toggleDeceasedFields(status) {
  const section = document.getElementById('deceased-section-label');
  const fields  = document.getElementById('deceased-fields');
  if (status === 'occupied') {
    section.classList.remove('hidden');
    fields.classList.remove('hidden');
  } else {
    section.classList.add('hidden');
    fields.classList.add('hidden');
  }
}

window.editGrave = function(graveId) {
  const g = STATE.graves[graveId];
  if (!g) return;
  closeModal('modal-grave-detail');

  STATE.editingGraveId = graveId;
  document.getElementById('grave-form-title').textContent = 'Edit Grave';
  document.getElementById('grave-form-submit').textContent = 'Update Grave';

  document.getElementById('gf-cemetery').value = g.cemeteryId || '';
  document.getElementById('gf-section').value  = g.section    || '';
  document.getElementById('gf-row').value       = g.row        || '';
  document.getElementById('gf-plot').value      = g.plot       || '';
  document.getElementById('gf-lat').value       = g.latitude   || '';
  document.getElementById('gf-lng').value       = g.longitude  || '';
  document.getElementById('gf-status').value    = g.status     || 'empty';
  toggleDeceasedFields(g.status);

  const dec = Object.values(STATE.deceased).find(d => d.graveId === graveId);
  if (dec) {
    document.getElementById('gf-name').value   = dec.fullName   || '';
    document.getElementById('gf-father').value = dec.fatherName || '';
    document.getElementById('gf-gender').value = dec.gender     || '';
    document.getElementById('gf-dob').value    = dec.birthDate  || '';
    document.getElementById('gf-dod').value    = dec.deathDate  || '';
    document.getElementById('gf-burial').value = dec.burialDate || '';
    document.getElementById('gf-bio').value    = dec.bio        || '';
  }

  openModal('modal-grave-form');
};

document.getElementById('grave-form').addEventListener('submit', async e => {
  e.preventDefault();

  const graveData = {
    cemeteryId: document.getElementById('gf-cemetery').value,
    section:    document.getElementById('gf-section').value.trim(),
    row:        document.getElementById('gf-row').value.trim(),
    plot:       document.getElementById('gf-plot').value.trim(),
    latitude:   parseFloat(document.getElementById('gf-lat').value) || null,
    longitude:  parseFloat(document.getElementById('gf-lng').value) || null,
    status:     document.getElementById('gf-status').value,
    updatedAt:  Date.now()
  };

  const status = graveData.status;

  try {
    let graveId = STATE.editingGraveId;

    if (graveId) {
      await dbSet(`graves/${graveId}`, graveData);
    } else {
      graveId = await dbPush('graves', graveData);
    }

    // Handle deceased
    if (status === 'occupied') {
      const decData = {
        graveId,
        fullName:   document.getElementById('gf-name').value.trim(),
        fatherName: document.getElementById('gf-father').value.trim(),
        gender:     document.getElementById('gf-gender').value,
        birthDate:  document.getElementById('gf-dob').value,
        deathDate:  document.getElementById('gf-dod').value,
        burialDate: document.getElementById('gf-burial').value,
        bio:        document.getElementById('gf-bio').value.trim(),
        updatedAt:  Date.now()
      };

      // Find existing deceased record for this grave
      const existingDec = Object.entries(STATE.deceased).find(([, d]) => d.graveId === graveId);
      if (existingDec) {
        await dbSet(`deceased/${existingDec[0]}`, decData);
      } else {
        await dbPush('deceased', decData);
      }
    }

    toast(STATE.editingGraveId ? 'Grave updated!' : 'Grave registered!', 'success');
    closeModal('modal-grave-form');
    e.target.reset();
    STATE.editingGraveId = null;
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
});

window.deleteGrave = async function(graveId) {
  if (!confirm('Delete this grave record? This cannot be undone.')) return;
  try {
    await dbRemove(`graves/${graveId}`);
    // Remove deceased record too
    const dec = Object.entries(STATE.deceased).find(([, d]) => d.graveId === graveId);
    if (dec) await dbRemove(`deceased/${dec[0]}`);
    toast('Grave deleted', 'success');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

/* ══════════════════════════════════════
   STATISTICS
══════════════════════════════════════ */
function renderStats() {
  const filterCem = document.getElementById('stats-cemetery-select')?.value || '';
  const graves = Object.values(STATE.graves).filter(g => !filterCem || g.cemeteryId === filterCem);
  const dec    = Object.values(STATE.deceased).filter(d => {
    if (!filterCem) return true;
    const g = STATE.graves[d.graveId];
    return g && g.cemeteryId === filterCem;
  });

  const total    = graves.length;
  const occupied = graves.filter(g => g.status === 'occupied').length;
  const avail    = graves.filter(g => g.status === 'empty').length;
  const reserved = graves.filter(g => g.status === 'reserved').length;
  const male     = dec.filter(d => d.gender === 'male').length;
  const female   = dec.filter(d => d.gender === 'female').length;

  const thisYear = new Date().getFullYear().toString();
  const burialThisYear = dec.filter(d => (d.burialDate || '').startsWith(thisYear)).length;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card total"><div class="num">${total}</div><div class="label">Total Graves</div></div>
    <div class="stat-card occ"><div class="num">${occupied}</div><div class="label">Occupied</div></div>
    <div class="stat-card avail"><div class="num">${avail}</div><div class="label">Available</div></div>
    <div class="stat-card res"><div class="num">${reserved}</div><div class="label">Reserved</div></div>
    <div class="stat-card male"><div class="num">${male}</div><div class="label">Male</div></div>
    <div class="stat-card female"><div class="num">${female}</div><div class="label">Female</div></div>
    <div class="stat-card yr"><div class="num">${burialThisYear}</div><div class="label">Burials ${thisYear}</div></div>
  `;

  // Simple bar chart
  const maxVal = Math.max(total, 1);
  const bars = [
    { label: 'Total',    val: total,    color: 'var(--slate)' },
    { label: 'Occupied', val: occupied, color: 'var(--rose)' },
    { label: 'Available',val: avail,    color: 'var(--sage)' },
    { label: 'Reserved', val: reserved, color: 'var(--amber)' },
    { label: 'Male',     val: male,     color: '#5A9BC9' },
    { label: 'Female',   val: female,   color: '#C97BA0' },
  ];

  document.getElementById('stats-chart').innerHTML = `
    <h3>Overview</h3>
    <div class="bar-chart">
      ${bars.map(b => `
        <div class="bar-item">
          <div class="bar-val">${b.val}</div>
          <div class="bar" style="height:${Math.round((b.val/maxVal)*100)}px;background:${b.color}"></div>
          <div class="bar-label">${b.label}</div>
        </div>`).join('')}
    </div>
  `;
}

document.getElementById('stats-cemetery-select')?.addEventListener('change', renderStats);

/* ══════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════ */
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

/* ══════════════════════════════════════
   DEEP LINK: ?grave=ID
══════════════════════════════════════ */
function checkDeepLink() {
  const params = new URLSearchParams(location.search);
  const graveId = params.get('grave');
  if (graveId && STATE.graves[graveId]) {
    setTimeout(() => openGraveDetail(graveId), 500);
  }
}

/* ══════════════════════════════════════
   UTILITY
══════════════════════════════════════ */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
waitForFirebase(() => {
  loadData();
  checkDeepLink();
  toggleDeceasedFields('empty');
});
