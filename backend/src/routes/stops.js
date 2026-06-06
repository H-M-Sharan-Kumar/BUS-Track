import { Router } from "express";
import pool from "../config/db.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// GET /api/stops/bus/:busId — ordered stops for the route a bus runs on
router.get("/bus/:busId", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.latitude, s.longitude, s.address,
              rs.stop_order, rs.eta_offset
       FROM buses b
       JOIN route_stops rs ON rs.route_id = b.route_id
       JOIN stops s ON s.id = rs.stop_id
       WHERE b.id = $1
       ORDER BY rs.stop_order`,
      [req.params.busId]
    );
    res.json({ stops: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
