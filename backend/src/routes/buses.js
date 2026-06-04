import { Router } from "express";
import pool from "../config/db.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /api/buses/mine — buses assigned to driver, fallback to ALL buses
router.get("/mine", authenticate, requireRole("driver"), async (req, res) => {
  try {
    // Try assigned buses first
    const { rows: assigned } = await pool.query(
      `SELECT b.id, b.bus_number, b.capacity, b.is_active,
              r.name AS route_name
       FROM buses b
       LEFT JOIN routes r ON r.id = b.route_id
       WHERE b.driver_id = $1 AND b.is_active = true`,
      [req.user.id]
    );
    if (assigned.length > 0) return res.json({ buses: assigned });

    // Fallback: return all active buses so driver can still operate
    const { rows: all } = await pool.query(
      `SELECT b.id, b.bus_number, b.capacity, b.is_active,
              r.name AS route_name
       FROM buses b
       LEFT JOIN routes r ON r.id = b.route_id
       WHERE b.is_active = true
       ORDER BY b.bus_number`
    );
    res.json({ buses: all });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/buses — all buses (admin)
router.get("/", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, r.name AS route_name, u.name AS driver_name
       FROM buses b
       LEFT JOIN routes r ON r.id = b.route_id
       LEFT JOIN users u ON u.id = b.driver_id
       ORDER BY b.bus_number`
    );
    res.json({ buses: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
