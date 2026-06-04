import { Router } from "express";
import pool from "../config/db.js";
import redis from "../config/redis.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

// POST /api/location/update  — driver sends GPS ping
router.post("/update", authenticate, requireRole("driver"), async (req, res) => {
  const { bus_id, trip_id, latitude, longitude, speed, heading } = req.body;
  if (!bus_id || !latitude || !longitude) {
    return res.status(400).json({ error: "bus_id, latitude, longitude required" });
  }
  try {
    // 1. Write to PostgreSQL (permanent log)
    await pool.query(
      `INSERT INTO live_positions (bus_id, trip_id, location, speed, heading)
       VALUES ($1, $2, ST_GeogFromText('SRID=4326;POINT(' || $3 || ' ' || $4 || ')'), $5, $6)`,
      [bus_id, trip_id || null, longitude, latitude, speed || null, heading || null]
    );

    // 2. Cache latest position in Redis (expires in 30s)
    const posData = JSON.stringify({ latitude, longitude, speed, heading, updated_at: new Date() });
    await redis.setex(`bus:${bus_id}:position`, 30, posData);

    // 3. Notify socket server via Redis pub/sub
    await redis.publish("gps:update", JSON.stringify({ bus_id, latitude, longitude, speed, heading }));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/location/bus/:busId  — get latest position of a bus
router.get("/bus/:busId", authenticate, async (req, res) => {
  const { busId } = req.params;
  try {
    // Try Redis first (fast)
    const cached = await redis.get(`bus:${busId}:position`);
    if (cached) return res.json({ source: "cache", position: JSON.parse(cached) });

    // Fallback to DB
    const { rows } = await pool.query(
      `SELECT ST_X(location::geometry) AS longitude,
              ST_Y(location::geometry) AS latitude,
              speed, heading, recorded_at
       FROM live_positions
       WHERE bus_id = $1
       ORDER BY recorded_at DESC LIMIT 1`,
      [busId]
    );
    if (!rows[0]) return res.status(404).json({ error: "No position data" });
    res.json({ source: "db", position: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/location/nearby?lat=&lng=&radius=  — find buses within radius (meters)
router.get("/nearby", authenticate, async (req, res) => {
  const { lat, lng, radius = 3000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.bus_number, b.route_id,
              ST_Distance(lp.location, ST_GeogFromText('SRID=4326;POINT(' || $2 || ' ' || $1 || ')')) AS distance_m,
              ST_X(lp.location::geometry) AS longitude,
              ST_Y(lp.location::geometry) AS latitude,
              lp.recorded_at
       FROM buses b
       JOIN LATERAL (
         SELECT location, recorded_at FROM live_positions
         WHERE bus_id = b.id
         ORDER BY recorded_at DESC LIMIT 1
       ) lp ON true
       WHERE ST_DWithin(
         lp.location,
         ST_GeogFromText('SRID=4326;POINT(' || $2 || ' ' || $1 || ')'),
         $3
       )
       AND b.is_active = true
       ORDER BY distance_m ASC`,
      [lat, lng, radius]
    );
    res.json({ buses: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
