# GraveMap 🗺️

> **Find any grave. Preserve every memory.**

**GraveMap** is an open-source platform for digitally mapping and preserving cemeteries. Every cemetery, every grave, and every empty plot — searchable and locatable by anyone, forever.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-gravemap143.web.app-2ECC8A?style=flat-square)](https://gravemap143.web.app)
[![GitHub Pages](https://img.shields.io/badge/Hosted%20on-GitHub%20Pages-181717?style=flat-square&logo=github)](https://shakeel143.github.io/GraveMap)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

---

## 🧭 The Problem

Most cemeteries around the world still rely on:

- 📄 Paper registers and old notebooks
- 🧠 The memory of elderly caretakers
- 🗝️ Word-of-mouth knowledge passed down generations

When someone asks *"Where is my grandfather buried?"* the answer is often *"Ask the old caretaker."* Years later, nobody knows. Many graves disappear entirely. Cemeteries fill up, but nobody can find the empty plots.

**GraveMap solves this.**

---

## ✅ Features

### 🌍 Public (No Login Required)

| Feature | Description |
|---|---|
| **Interactive satellite map** | Full-screen map with cemetery boundaries and color-coded grave plots |
| **Grave search** | Search by name, father's name, cemetery, city, or gender |
| **Grave detail** | View name, dates, biography, section/row/plot, photo, and status |
| **Shareable links** | Every grave has a unique URL (`#grave-ID`) — share on WhatsApp instantly |
| **QR code** | Auto-generated QR code on every grave detail page |
| **Navigate to grave** | One tap opens Google Maps with driving directions |
| **Print grave card** | Professional printable record with QR code and all details |
| **Cemetery directory** | Browse all registered cemeteries with occupancy stats |
| **Request a cemetery** | Submit a request for a new cemetery to be added |
| **Report corrections** | Flag wrong grave information for admin review |

### 🔐 Admin (Google Sign-In Required)

| Feature | Description |
|---|---|
| **Cemetery wizard** | 3-step wizard: Info → Pin location → Draw boundary polygon |
| **Grave wizard** | 3-step wizard: Person info → Select cemetery → Draw grave rectangle |
| **Generate Grave Grid** | Auto-fill a cemetery with evenly-spaced grave plots from boundary |
| **CSV bulk import** | Upload a spreadsheet to register hundreds of graves at once |
| **Photo via URL** | Link an external photo (Imgur, Google Photos, etc.) to any grave |
| **Dashboard** | Stats tiles: total graves, cemeteries, occupied, available, reserved, pending |
| **Request management** | Review and approve/reject cemetery + correction requests |
| **Quick status update** | Mark any grave as Occupied / Reserved / Empty from detail view |
| **Satellite/street toggle** | Switch between satellite imagery and street map |

---

## 🛠️ Technology Stack

### Frontend
- **HTML5, CSS3, JavaScript (Vanilla)** — no framework, no build step
- **[Leaflet.js](https://leafletjs.com/)** — interactive maps
- **[Leaflet Geoman](https://geoman.io/)** — polygon and rectangle drawing tools
- **[Esri World Imagery](https://www.arcgis.com/)** — satellite tile layer
- **[qrcodejs](https://davidshimjs.github.io/qrcodejs/)** — QR code generation
- **[Outfit](https://fonts.google.com/specimen/Outfit)** — Google Fonts typography

### Backend & Database
- **[Firebase Authentication](https://firebase.google.com/products/auth)** — Google Sign-In (admins only)
- **[Firebase Realtime Database](https://firebase.google.com/products/realtime-database)** — all data stored here
- **[GitHub Pages](https://pages.github.com/)** — static hosting

> 💡 **Zero server cost.** Everything runs on Firebase free tier + GitHub Pages. No backend server, no Docker, no VPS.

---

## 🗄️ Database Schema

```
Firebase Realtime Database
│
├── cemeteries/
│   └── {id}/
│       ├── name, city, province, district, country
│       ├── address, description
│       ├── centerLat, centerLng
│       └── boundary          ← JSON polygon coordinates
│
├── graves/
│   └── {id}/
│       ├── cemeteryId
│       ├── name, fatherName, gender
│       ├── dob, deathDate, burialDate, age
│       ├── section, row, plot
│       ├── bio
│       ├── status            ← "occupied" | "empty" | "reserved"
│       ├── photoUrl          ← external image URL (no storage cost)
│       ├── polygon           ← JSON rectangle coordinates
│       ├── lat, lng          ← grave center coordinates
│       └── createdAt
│
├── requests/
│   └── {id}/
│       ├── type              ← "new-cemetery" | "correction"
│       ├── resolved          ← boolean
│       └── ...fields
│
└── admins/
    └── {uid}: true
```

---

## 🚀 Getting Started

### Run Locally

```bash
# Clone the repo
git clone https://github.com/shakeel143/GraveMap.git
cd GraveMap

# Serve with Python (no install needed)
python -m http.server 8000

# Open in browser
# http://localhost:8000
```

> No `npm install`, no build step. Just open and run.

### Firebase Setup (for your own instance)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Realtime Database** and **Authentication → Google provider**
3. Replace the `firebaseConfig` object in `index.html` with your own credentials
4. Set Realtime Database rules to allow authenticated writes and public reads

---

## 📁 Project Structure

```
GraveMap/
├── index.html        # Single-page app — all HTML structure
├── css/
│   └── style.css     # All styles (dark topbar, panels, modals, responsive)
├── js/
│   └── app.js        # All application logic (~1,500 lines)
│       ├── Firebase helpers
│       ├── Map initialization (Leaflet + Geoman)
│       ├── Auth & navigation
│       ├── Cemetery wizard (3-step)
│       ├── Grave wizard (3-step)
│       ├── Generate Grave Grid
│       ├── Search
│       ├── Grave detail modal
│       ├── Print grave card
│       ├── CSV import (inline parser)
│       ├── Admin dashboard
│       └── Deep link handler (#grave-ID)
└── README.md
```

---

## 🗺️ Roadmap

### ✅ Phase 1 — Foundation
- [x] Google Authentication (admin only)
- [x] Firebase Realtime Database
- [x] Leaflet.js interactive map
- [x] Public map view with cemetery boundaries
- [x] Basic search

### ✅ Phase 2 — Core Features
- [x] 3-step Cemetery creation wizard (info → location → draw boundary)
- [x] 3-step Grave registration wizard (person → cemetery → draw plot)
- [x] Color-coded grave status: 🟢 Available · 🔴 Occupied · 🟡 Reserved
- [x] Satellite imagery as default map layer
- [x] Satellite / Street map toggle

### ✅ Phase 3 — Community & Admin
- [x] Cemetery request workflow (public → admin review)
- [x] Correction report workflow
- [x] Admin dashboard with statistics tiles
- [x] Generate Grave Grid (auto-fill boundary with plots)
- [x] Approve / reject requests

### ✅ Phase 4 — Sharing & Convenience
- [x] QR code on every grave
- [x] Shareable grave URLs (`#grave-ID`)
- [x] 🔗 Copy link button
- [x] 🖨️ Print grave card (with QR code)
- [x] 🧭 Google Maps navigation
- [x] 📥 CSV bulk import with preview table
- [x] 🖼️ External photo URL (no storage cost)
- [x] OG/Twitter meta tags for social sharing previews
- [x] Escape key closes modals
- [x] Full mobile responsive layout

### 🔜 Phase 5 — Planned
- [ ] Multi-admin management (add/remove admin UIDs from dashboard)
- [ ] Urdu / RTL language support
- [ ] PWA / offline mode (service worker)
- [ ] Family tree linking between related graves
- [ ] FCM push notifications for new requests
- [ ] Occupancy analytics charts

---

## 🎨 Design

- **Dark topbar** with glassmorphism backdrop filter
- **Map-first** layout — the map is always full-screen behind all panels
- **Floating panels** — left sidebar + right tools float over the map
- **Modals as wizards** — multi-step forms with clear progress indicators
- **Color system**: `#2ECC8A` Available · `#E05A5A` Occupied · `#F0B429` Reserved
- **Mobile** — panels collapse to bottom sheets, modals slide up from bottom

---

## 📸 CSV Import Format

Download the template from **Admin → Graves → 📥 Import CSV**, or use this column layout:

```csv
name,fatherName,gender,dob,deathDate,burialDate,age,section,row,plot,bio,status,photoUrl
Ahmed Ali,Muhammad Ali,male,1945-03-12,2020-11-05,2020-11-06,75,A,3,12,A beloved father,occupied,
```

| Column | Format | Required |
|---|---|---|
| `name` | Full name | ✅ |
| `fatherName` | Father's full name | — |
| `gender` | `male` or `female` | — |
| `dob` | `YYYY-MM-DD` | — |
| `deathDate` | `YYYY-MM-DD` | — |
| `burialDate` | `YYYY-MM-DD` | — |
| `age` | Number | — |
| `section`, `row`, `plot` | Alphanumeric | — |
| `bio` | Free text | — |
| `status` | `occupied`, `empty`, or `reserved` | — |
| `photoUrl` | Public image URL | — |

> Imported graves are **fully searchable** immediately. They appear on the map once a polygon is drawn for them.

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

1. Fork the repo
2. Create your branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'feat: add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT © [Shakeel](https://github.com/shakeel143)
