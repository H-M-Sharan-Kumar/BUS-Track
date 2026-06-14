# BusTrack — Real-Time College Bus Tracking

Live app: [bustrack-gcyf.onrender.com](https://bustrack-gcyf.onrender.com)

BusTrack is a real-time college bus tracking web app (installable as a PWA). A driver broadcasts their live GPS from a phone browser, and students see where the bus is, how fast it is moving, and when it will arrive. Positions refresh every 4 seconds. The app is built with Node.js, Express, PostgreSQL, Socket.io, and React + Vite, and is deployed on Render with a Neon PostgreSQL database.

## Features

- Live GPS tracking with positions updating every 4 seconds on an interactive map.
- ETA and arrival time for each bus, both to the student and to upcoming stops.
- Street, Satellite, and Hybrid map views.
- Three roles — Student, Driver, and Admin — each with its own dashboard.
- Real-time presence so users can see who else is online.
- Stops management: admins add a stop by typing a place name and the backend pins it to exact coordinates. Students get an alert when the bus is approaching a stop.
- Installable PWA that can be added to a phone's home screen.
- JWT authentication with role-based access control.

## Screenshots

### Sign In
A split-screen login. Students, drivers, and admins sign in here and are routed to the correct dashboard.

![Login page](docs/screenshots/01-login.png)

### Register
The user picks a role. Students are asked for academic details (USN, roll number, section, year, branch); drivers and admins get a shorter form.

![Register page](docs/screenshots/02-register.png)

### Student Dashboard
A live map showing the student's location and nearby buses, with a sidebar listing each bus's speed, ETA, and arrival time. The map supports Street, Satellite, and Hybrid views.

![Student dashboard](docs/screenshots/03-student-dashboard.png)

### Driver Dashboard
The driver selects their bus and starts a trip. The phone's GPS is then broadcast live to every student tracking that bus. Trip stats (duration, pings sent, speed) are shown.

![Driver dashboard](docs/screenshots/04-driver-dashboard.png)

### Admin — Fleet
An overview of the system: total users, students, drivers, active buses, trips, and routes. Each bus shows its number, plate, route, LIVE or OFFLINE status, and a driver-assignment dropdown.

![Admin fleet](docs/screenshots/05-admin-fleet.png)

### Admin — Stops
Stops are added to a route by typing a place name; the backend resolves it to exact coordinates. Students then see these stops with live ETAs.

![Admin stops](docs/screenshots/06-admin-stops.png)

### Admin — Users
Users are split into Students and Drivers, each with a search bar. Student cards show full academic details, and admins can edit, deactivate, or delete any user.

![Admin users](docs/screenshots/07-admin-users.png)

### Mobile
The app is responsive. On phones the map fills the screen with a bottom navigation bar and slide-up panels.

<img src="docs/screenshots/08-mobile-student.png" width="320" alt="Mobile student view"/>

## How to Use

### As a Student
1. Open the app, go to Register, choose Student, and fill in your name, email, password, and academic details (USN, roll number, section, year, branch).
2. Sign in. You land on the live map.
3. Allow location access when the browser asks; this places you on the map.
4. Browse nearby buses in the left panel. Each shows speed, ETA, and arrival time.
5. Tap a bus to track it. Its upcoming stops and ETAs appear, and a banner shows when it is approaching a stop.
6. Use the Satellite button on the map to switch to a satellite view.

### As a Driver
1. Register and choose Driver, or have an admin link your account to a bus.
2. Sign in to open the Driver Dashboard.
3. Select your bus from the list.
4. Allow location access, then tap Start Trip.
5. Your GPS now broadcasts live every 4 seconds, and students tracking your bus see you move in real time.
6. Tap End Trip when finished.

### As an Admin
1. Sign in with an admin account to open the Admin Dashboard.
2. Fleet tab: add buses (with number, plate, driver name and photo), assign drivers, and see which buses are live.
3. Stops tab: pick a route and add stops by place name; they are pinned to exact coordinates.
4. Users tab: search students or drivers and edit, deactivate, or remove accounts.

### Install on a phone
Open the live link in a phone browser, open the browser menu, and choose "Add to Home screen" or "Install app". It then runs full-screen like a native app.

## Architecture

```
Driver phone GPS
      |  POST /api/location/update (every 4s)
      v
  Express API ---> PostgreSQL        (permanent position history + all data)
      |        \-> In-memory store    (latest position cache + event bus)
      v
  Event bus ---> Socket.io ---> Student maps update live
```

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite, React Router, Leaflet maps, Socket.io-client, PWA (service worker) |
| Backend | Node.js, Express, Socket.io, JWT auth |
| Database | PostgreSQL (Neon) |
| Realtime | In-memory live store + Socket.io |
| Geocoding | OpenStreetMap Nominatim (stop pinning) |
| Hosting | Render (app) + Neon (PostgreSQL) |

## Project Structure

```
bustrack/
├── backend/                 # Node.js + Express API + Socket.io
│   └── src/
│       ├── config/          # db.js (PostgreSQL), liveStore.js (in-memory)
│       ├── middleware/      # auth.js (JWT + role guard)
│       ├── routes/          # auth, location, buses, trips, stops, admin
│       ├── socket/          # Socket.io server (live broadcasts)
│       └── index.js         # entry point (also serves built frontend)
├── frontend/                # React + Vite PWA
│   └── src/
│       ├── pages/           # Login, Register, Student, Driver, Admin
│       ├── components/      # BusMap (Leaflet), etc.
│       ├── lib/             # api.js (axios), socket.js, eta.js
│       └── hooks/           # useMediaQuery (responsive)
├── database/schema.sql      # full schema + seed data
└── docs/screenshots/        # images used in this README
```

## Run Locally

Prerequisites: Node.js 20+ and a PostgreSQL database (local, or a free Neon database).

```bash
# 1. Backend — set DATABASE_URL in backend/.env, then:
cd backend
npm install
npm run dev            # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev            # http://localhost:5173
```

The database schema and seed data load automatically from `database/schema.sql` on first start.

## Demo Accounts (live site)

| Role | Email | Password |
|------|-------|----------|
| Student | `demo.student@bustrack.app` | `Demo@1234` |
| Driver | `demo.driver@bustrack.app` | `Demo@1234` |
| Admin | `demo.admin@bustrack.app` | `Demo@1234` |

## Roadmap

- Push notifications (Firebase Cloud Messaging) for alerts when the app is closed.
- Bulk student import via Excel/CSV.
- Password reset and email verification.
- Road-following route lines on the map.
- Reports and analytics (trip history, on-time percentage).
- Parent accounts and boarding attendance.
