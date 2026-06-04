-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- USERS
-- ============================================================
CREATE TYPE user_role AS ENUM ('student', 'driver', 'admin');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'student',
  phone         VARCHAR(20),
  fcm_token     TEXT,                        -- Firebase push token
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROUTES
-- ============================================================
CREATE TABLE routes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,          -- e.g. "Route 4 - City Center"
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STOPS
-- ============================================================
CREATE TABLE stops (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(100) NOT NULL,          -- e.g. "Main Gate"
  location     GEOGRAPHY(POINT, 4326) NOT NULL, -- PostGIS point (lng, lat)
  address      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for fast geo queries
CREATE INDEX idx_stops_location ON stops USING GIST(location);

-- ============================================================
-- ROUTE_STOPS (ordered stops on a route)
-- ============================================================
CREATE TABLE route_stops (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id   UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id    UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  stop_order INT NOT NULL,                    -- 1, 2, 3 ... sequence on route
  eta_offset INT DEFAULT 0,                   -- minutes from route start
  UNIQUE(route_id, stop_order)
);

-- ============================================================
-- BUSES
-- ============================================================
CREATE TABLE buses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number   VARCHAR(20) UNIQUE NOT NULL,   -- e.g. "TN-01-AB-1234"
  capacity     INT DEFAULT 50,
  route_id     UUID REFERENCES routes(id),
  driver_id    UUID REFERENCES users(id),
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIPS (each time a bus starts/ends a run)
-- ============================================================
CREATE TYPE trip_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

CREATE TABLE trips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id      UUID NOT NULL REFERENCES buses(id),
  route_id    UUID NOT NULL REFERENCES routes(id),
  driver_id   UUID NOT NULL REFERENCES users(id),
  status      trip_status DEFAULT 'scheduled',
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LIVE_POSITIONS (append-only GPS log)
-- ============================================================
CREATE TABLE live_positions (
  id          BIGSERIAL PRIMARY KEY,
  bus_id      UUID NOT NULL REFERENCES buses(id),
  trip_id     UUID REFERENCES trips(id),
  location    GEOGRAPHY(POINT, 4326) NOT NULL,
  speed       FLOAT,                           -- km/h
  heading     FLOAT,                           -- degrees 0-360
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index + time index for fast queries
CREATE INDEX idx_live_positions_location ON live_positions USING GIST(location);
CREATE INDEX idx_live_positions_bus_time ON live_positions(bus_id, recorded_at DESC);

-- ============================================================
-- STUDENT_SUBSCRIPTIONS (which bus a student tracks)
-- ============================================================
CREATE TABLE student_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bus_id     UUID NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, bus_id)
);

-- ============================================================
-- SEED DATA (sample routes, stops, buses)
-- ============================================================
INSERT INTO routes (id, name, description) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Route 1 - North Campus', 'Covers northern residential zones'),
  ('11111111-0000-0000-0000-000000000002', 'Route 2 - South Campus', 'Covers southern zones and city center');

INSERT INTO stops (id, name, location, address) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Main Gate',      ST_GeogFromText('SRID=4326;POINT(80.2707 13.0827)'), 'College Main Gate'),
  ('22222222-0000-0000-0000-000000000002', 'Library Stop',   ST_GeogFromText('SRID=4326;POINT(80.2750 13.0850)'), 'Central Library'),
  ('22222222-0000-0000-0000-000000000003', 'Bus Stand North',ST_GeogFromText('SRID=4326;POINT(80.2680 13.0900)'), 'North Bus Terminal'),
  ('22222222-0000-0000-0000-000000000004', 'City Center',    ST_GeogFromText('SRID=4326;POINT(80.2785 13.0800)'), 'City Bus Stand');

INSERT INTO route_stops (route_id, stop_id, stop_order, eta_offset) VALUES
  ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 1, 0),
  ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 2, 5),
  ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 3, 12),
  ('11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 1, 0),
  ('11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000004', 2, 8);

INSERT INTO buses (id, bus_number, capacity, route_id, is_active) VALUES
  ('33333333-0000-0000-0000-000000000001', 'TN-01-AB-1001', 50, '11111111-0000-0000-0000-000000000001', true),
  ('33333333-0000-0000-0000-000000000002', 'TN-01-AB-1002', 50, '11111111-0000-0000-0000-000000000002', true),
  ('33333333-0000-0000-0000-000000000003', 'TN-01-AB-1003', 40, '11111111-0000-0000-0000-000000000001', true);
