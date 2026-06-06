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
      `SELECT b.id, b.bus_number, b.capacity, b.is_active,
              r.name AS route_name,
              u.name AS driver_name, u.id AS driver_id
       FROM buses b
       LEFT JOIN routes r ON r.id = b.route_id
       LEFT JOIN users u ON u.id = b.driver_id
       ORDER BY b.bus_number`
    );
    // Check Redis for live position of each bus
    const withStatus = await Promise.all(rows.map(async (b) => {
      const cached = await redis.get(`bus:${b.id}:position`);
      const live = cached ? JSON.parse(cached) : null;
      return { ...b, isLive: !!live, livePosition: live };
    }));
    res.json({ buses: withStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — all users
router.get("/users", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, phone, created_at
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
