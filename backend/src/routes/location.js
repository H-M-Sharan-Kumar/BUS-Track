import { Router } from "express";
import pool from "../config/db.js";
import redis from "../config/redis.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

// Haversine distance in metres (SQL version)
const haversineSQL = (lat, lng) => `
  6371000 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(latitude - ${lat}) / 2), 2) +
    COS(RADIANS(${lat})) * COS(RADIANS(latitude)) *
    POWER(SIN(RADIANS(longitude - ${lng}) / 2), 2)
  ))`;

// POST /api/location/update — driver sends GPS ping
router.post("/update", authenticate, requireRole("driver"), async (req, res) => {
  const { bus_id, trip_id, latitude, longitude, speed, heading } = req.body;
  if (!bus_id || !latitude || !longitude)
    return res.status(400).json({ error: "bus_id, latitude, longitude required" });
  try {
    await pool.query(
      `INSERT INTO live_positions (bus_id, trip_id, latitude, longitude, speed, heading)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [bus_id, trip_id || null, latitude, longitude, speed || null, heading || null]
    );
    const posData = JSON.stringify({ latitude, longitude, speed, heading, updated_at: new Date() });
    await redis.setex(`bus:${bus_id}:position`, 30, posData);
    await redis.publish("gps:update", JSON.stringify({ bus_id, latitude, longitude, speed, heading }));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/location/bus/:busId
router.get("/bus/:busId", authenticate, async (req, res) => {
  const { busId } = req.params;
  try {
    const cached = await redis.get(`bus:${busId}:position`);
    if (cached) return res.json({ source: "cache", position: JSON.parse(cached) });
    const { rows } = await pool.query(
      `SELECT latitude, longitude, speed, heading, recorded_at
       FROM live_positions WHERE bus_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [busId]
    );
    if (!rows[0]) return res.status(404).json({ error: "No position data" });
    res.json({ source: "db", position: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/location/nearby?lat=&lng=&radius=
router.get("/nearby", authenticate, async (req, res) => {
  const { lat, lng, radius = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.bus_number, b.route_id,
              lp.latitude, lp.longitude, lp.speed,
              ${haversineSQL(lat, lng)} AS distance_m
       FROM buses b
       JOIN LATERAL (
         SELECT latitude, longitude, speed FROM live_positions
         WHERE bus_id = b.id ORDER BY recorded_at DESC LIMIT 1
       ) lp ON true
       WHERE ${haversineSQL(lat, lng)} <= $1
       AND b.is_active = true
       ORDER BY distance_m ASC`,
      [radius]
    );
    res.json({ buses: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
