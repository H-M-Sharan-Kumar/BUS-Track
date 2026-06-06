import { Router } from "express";
import pool from "../config/db.js";
import redis from "../config/redis.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

// All admin routes require admin role
router.use(authenticate, requireRole("admin"));

// GET /api/admin/stats — dashboard summary counts
router.get("/stats", async (_req, res) => {
  try {
    const [users, buses, routes, trips] = await Promise.all([
      pool.query("SELECT role, COUNT(*)::int AS c FROM users GROUP BY role"),
      pool.query("SELECT COUNT(*)::int AS c FROM buses WHERE is_active = true"),
      pool.query("SELECT COUNT(*)::int AS c FROM routes WHERE is_active = true"),
      pool.query("SELECT COUNT(*)::int AS c FROM trips WHERE status = 'in_progress'"),
    ]);
    const roleCounts = { student: 0, driver: 0, admin: 0 };
    users.rows.forEach((r) => { roleCounts[r.role] = r.c; });

    res.json({
      students: roleCounts.student,
      drivers: roleCounts.driver,
      admins: roleCounts.admin,
      totalUsers: roleCounts.student + roleCounts.driver + roleCounts.admin,
      activeBuses: buses.rows[0].c,
      activeRoutes: routes.rows[0].c,
      activeTrips: trips.rows[0].c,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/buses — all buses + live status from Redis
router.get("/buses", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.bus_number, b.number_plate, b.capacity, b.is_active,
              b.driver_name, b.driver_photo,
              r.name AS route_name,
              u.id AS driver_id
       FROM buses b
       LEFT JOIN routes r ON r.id = b.route_id
       LEFT JOIN users u ON u.id = b.driver_id
       ORDER BY LENGTH(b.bus_number), b.bus_number`
    );

    // Batch-fetch live status with one Redis round-trip (mget), guarded
    let liveFlags = {};
    try {
      if (rows.length) {
        const keys = rows.map((b) => `bus:${b.id}:position`);
        const vals = await redis.mget(keys);
        rows.forEach((b, i) => { liveFlags[b.id] = !!vals[i]; });
      }
    } catch {
      // Redis unavailable — return buses without live flags rather than hang
    }

    res.json({ buses: rows.map((b) => ({ ...b, isLive: !!liveFlags[b.id] })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — all users
router.get("/users", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, phone,
              usn, academic_year, branch, roll_no, section, created_at
       FROM users ORDER BY role, created_at DESC`
    );
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/drivers — list of drivers (for assignment dropdown)
router.get("/drivers", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email FROM users WHERE role = 'driver' ORDER BY name"
    );
    res.json({ drivers: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/buses/:id/assign — assign a driver to a bus
router.patch("/buses/:id/assign", async (req, res) => {
  const { driver_id } = req.body;
  try {
    await pool.query(
      "UPDATE buses SET driver_id = $1 WHERE id = $2",
      [driver_id || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/buses — create a new bus with driver name + photo
router.post("/buses", async (req, res) => {
  const { bus_number, number_plate, capacity, route_id, driver_id, driver_name, driver_photo } = req.body;
  if (!bus_number) return res.status(400).json({ error: "bus_number required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO buses (bus_number, number_plate, capacity, route_id, driver_id, driver_name, driver_photo, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, bus_number`,
      [bus_number, number_plate || null, capacity || 50, route_id || null, driver_id || null, driver_name || null, driver_photo || null]
    );
    res.status(201).json({ bus: rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Bus number already exists" });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/buses/:id
router.delete("/buses/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM buses WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/routes — list routes (for dropdowns)
router.get("/routes", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, description FROM routes WHERE is_active = true ORDER BY name"
    );
    res.json({ routes: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GEOCODING helper — address → exact lat/lng via OpenStreetMap Nominatim
async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const r = await fetch(url, { headers: { "User-Agent": "BusTrack/1.0" } });
  const data = await r.json();
  if (!data.length) return null;
  return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
}

// GET /api/admin/stops?route_id= — list stops for a route (ordered)
router.get("/stops", async (req, res) => {
  const { route_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.latitude, s.longitude, s.address,
              rs.stop_order, rs.eta_offset, rs.route_id
       FROM stops s
       JOIN route_stops rs ON rs.stop_id = s.id
       ${route_id ? "WHERE rs.route_id = $1" : ""}
       ORDER BY rs.route_id, rs.stop_order`,
      route_id ? [route_id] : []
    );
    res.json({ stops: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/stops — add a stop to a route (geocodes address if no coords)
router.post("/stops", async (req, res) => {
  let { name, address, latitude, longitude, route_id, stop_order, eta_offset } = req.body;
  if (!name || !route_id) return res.status(400).json({ error: "name and route_id required" });
  try {
    // Pin exact location: use provided coords, else geocode the address
    if ((!latitude || !longitude) && address) {
      const geo = await geocode(address);
      if (!geo) return res.status(422).json({ error: "Could not find that address. Try a more specific one." });
      latitude = geo.latitude;
      longitude = geo.longitude;
    }
    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Provide either coordinates or a valid address" });
    }

    // Auto stop_order = next in route if not given
    if (stop_order == null) {
      const { rows: m } = await pool.query(
        "SELECT COALESCE(MAX(stop_order),0)+1 AS next FROM route_stops WHERE route_id=$1", [route_id]
      );
      stop_order = m[0].next;
    }

    const { rows: stopRows } = await pool.query(
      `INSERT INTO stops (name, latitude, longitude, address)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, latitude, longitude, address || null]
    );
    const stopId = stopRows[0].id;

    await pool.query(
      `INSERT INTO route_stops (route_id, stop_id, stop_order, eta_offset)
       VALUES ($1, $2, $3, $4)`,
      [route_id, stopId, stop_order, eta_offset || 0]
    );

    res.status(201).json({ stop: { id: stopId, name, latitude, longitude, address, stop_order } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/stops/:id
router.delete("/stops/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM stops WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/trips — recent trips
router.get("/trips", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.status, t.started_at, t.ended_at,
              b.bus_number, u.name AS driver_name, r.name AS route_name
       FROM trips t
       LEFT JOIN buses b ON b.id = t.bus_id
       LEFT JOIN users u ON u.id = t.driver_id
       LEFT JOIN routes r ON r.id = t.route_id
       ORDER BY t.created_at DESC LIMIT 20`
    );
    res.json({ trips: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
