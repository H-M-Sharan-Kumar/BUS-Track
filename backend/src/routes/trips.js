import { Router } from "express";
import pool from "../config/db.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

// POST /api/trips/start
router.post("/start", authenticate, requireRole("driver"), async (req, res) => {
  const { bus_id } = req.body;
  if (!bus_id) return res.status(400).json({ error: "bus_id required" });
  try {
    // Get route for this bus
    const { rows: busRows } = await pool.query("SELECT route_id FROM buses WHERE id=$1", [bus_id]);
    const route_id = busRows[0]?.route_id;

    const { rows } = await pool.query(
      `INSERT INTO trips (bus_id, route_id, driver_id, status, started_at)
       VALUES ($1, $2, $3, 'in_progress', NOW())
       RETURNING id, status, started_at`,
      [bus_id, route_id, req.user.id]
    );
    res.status(201).json({ trip: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/end
router.post("/:id/end", authenticate, requireRole("driver"), async (req, res) => {
  try {
    await pool.query(
      `UPDATE trips SET status='completed', ended_at=NOW() WHERE id=$1 AND driver_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
