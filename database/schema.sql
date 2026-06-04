-- ============================================================
-- USERS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'driver', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'student',
  phone         VARCHAR(20),
  fcm_token     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROUTES
-- ============================================================
CREATE TABLE IF NOT EXISTS routes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STOPS
-- ============================================================
CREATE TABLE IF NOT EXISTS stops (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      VARCHAR(100) NOT NULL,
  latitude  DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address   TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROUTE_STOPS
-- ============================================================
CREATE TABLE IF NOT EXISTS route_stops (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id   UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id    UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  stop_order INT NOT NULL,
  eta_offset INT DEFAULT 0,
  UNIQUE(route_id, stop_order)
);

-- ============================================================
-- BUSES
-- ============================================================
CREATE TABLE IF NOT EXISTS buses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number VARCHAR(20) UNIQUE NOT NULL,
  capacity   INT DEFAULT 50,
  route_id   UUID REFERENCES routes(id),
  driver_id  UUID REFERENCES users(id),
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIPS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE trip_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS trips (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id     UUID NOT NULL REFERENCES buses(id),
  route_id   UUID REFERENCES routes(id),
  driver_id  UUID NOT NULL REFERENCES users(id),
  status     trip_status DEFAULT 'scheduled',
  started_at TIMESTAMPTZ,
  ended_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LIVE_POSITIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS live_positions (
  id          BIGSERIAL PRIMARY KEY,
  bus_id      UUID NOT NULL REFERENCES buses(id),
  trip_id     UUID REFERENCES trips(id),
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  speed       FLOAT,
  heading     FLOAT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_positions_bus_time ON live_positions(bus_id, recorded_at DESC);

-- ============================================================
-- STUDENT_SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS student_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bus_id     UUID NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, bus_id)
);

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO routes (id, name, description) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Route 1 - North Campus', 'Covers northern residential zones'),
  ('11111111-0000-0000-0000-000000000002', 'Route 2 - South Campus', 'Covers southern zones and city center')
ON CONFLICT DO NOTHING;

INSERT INTO stops (id, name, latitude, longitude, address) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Main Gate',       13.0827, 80.2707, 'College Main Gate'),
  ('22222222-0000-0000-0000-000000000002', 'Library Stop',    13.0850, 80.2750, 'Central Library'),
  ('22222222-0000-0000-0000-000000000003', 'Bus Stand North', 13.0900, 80.2680, 'North Bus Terminal'),
  ('22222222-0000-0000-0000-000000000004', 'City Center',     13.0800, 80.2785, 'City Bus Stand')
ON CONFLICT DO NOTHING;

INSERT INTO route_stops (route_id, stop_id, stop_order, eta_offset) VALUES
  ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 1, 0),
  ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 2, 5),
  ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 3, 12),
  ('11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 1, 0),
  ('11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000004', 2, 8)
ON CONFLICT DO NOTHING;

INSERT INTO buses (id, bus_number, capacity, route_id, is_active) VALUES
  ('33333333-0000-0000-0000-000000000001', 'TN-01-AB-1001', 50, '11111111-0000-0000-0000-000000000001', true),
  ('33333333-0000-0000-0000-000000000002', 'TN-01-AB-1002', 50, '11111111-0000-0000-0000-000000000002', true),
  ('33333333-0000-0000-0000-000000000003', 'TN-01-AB-1003', 40, '11111111-0000-0000-0000-000000000001', true)
ON CONFLICT DO NOTHING;
