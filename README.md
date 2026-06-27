# GraveMap

**Digitally preserving cemeteries for future generations.**

> Find any grave. Preserve every memory.

## The Problem

Most cemeteries still rely on:
- Paper registers
- Old notebooks
- People's memory
- Cemetery caretakers

When someone asks *"Where is my grandfather buried?"* the answer is often *"Ask the old caretaker."* Years later, nobody knows. Many graves disappear, and many cemeteries become full but nobody knows where empty land still exists.

## The Solution

GraveMap creates a **digital map of every cemetery**. Every cemetery has:
- Exact boundary (polygon)
- Exact location (coordinates)
- Every grave with location and status
- Every empty plot

**Visitors** can search graves and view cemeteries without login.

**Administrators** can manage cemeteries and approve community contributions.

## Technology Stack

### Frontend
- HTML, CSS, JavaScript (vanilla)
- Leaflet.js for interactive maps
- OpenStreetMap/Carto for map data

### Backend & Database
- Firebase Authentication (Google login, admins only)
- Firebase Realtime Database
- GitHub Pages (hosting)

**No backend server needed. Everything is free.**

## Key Features

### Public Features
- Search graves by name, father name, cemetery, or city
- View cemetery boundaries and grave locations
- View grave details with photos
- Navigate to graves
- Share grave locations
- No login required

### Admin Features
- Create and manage cemeteries with boundary polygons
- Register graves with rectangular plots
- Mark grave status: Occupied (red), Empty (green), Reserved (yellow)
- View color-coded cemetery map
- Approve/reject community cemetery and grave requests
- Dashboard with statistics

### Community Features
- Submit requests for new cemeteries
- Submit requests for new graves
- Submit corrections for existing information
- Admins review and approve contributions

## Database Structure

```
users/
cemeteries/
  - name, city, province, country
  - centerLat, centerLng
  - boundary (polygon coordinates)
graves/
  - cemeteryId
  - name, fatherName, dob, deathDate, burialDate
  - status (Occupied/Empty/Reserved)
  - polygon (rectangular grave coordinates)
requests/
  - cemetery requests
  - grave requests
  - correction requests
admins/
settings/
```

## MVP Roadmap

### Phase 1: Foundation ✅
- Google Authentication
- Firebase RTDB setup
- GitHub Pages hosting
- Leaflet.js integration
- Basic search
- Public map view

### Phase 2: Core Features
- Cemetery creation wizard with polygon boundary drawing
- Grave registration wizard with rectangular plot drawing
- Store and display cemetery boundaries
- Store and display grave boundaries
- Color-coded grave status visualization
- Search improvements

### Phase 3: Community
- Request new cemetery workflow
- Request new grave workflow
- Request corrections workflow
- Admin approval dashboard
- Statistics dashboard

### Phase 4: Advanced
- QR code for each grave
- Shareable grave URLs
- Occupancy analytics
- FCM notifications for requests

## Smart Feature: Generate Grave Grid

Instead of drawing every grave manually with GPS (tedious for large cemeteries), admins can:
1. Draw the cemetery boundary
2. Optionally draw internal roads/paths
3. Click **"Generate Grave Grid"**
4. System auto-fills with evenly spaced rectangular plots
5. Admin marks status and enters deceased information

This saves hours of manual work and ensures neat alignment.

## Getting Started

1. Open `index.html` in your web browser
2. The application will load and be ready to use

## Project Structure

```
GraveMap/
├── index.html       # Main HTML file
├── css/
│   └── style.css    # Styling
├── js/
│   └── app.js       # Application logic
└── README.md        # This file
```
