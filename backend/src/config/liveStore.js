// In-memory live store — replaces Redis for a single-instance deployment.
// Holds latest bus positions (with TTL), dedupes stop alerts, and provides
// an event bus for broadcasting GPS updates to the Socket.io layer.
import { EventEmitter } from "events";

const positions = new Map();   // busId -> { data, expires }
const alertDedup = new Map();  // key   -> expiresAt (ms)

export const liveBus = new EventEmitter();

// Store a bus's latest position for `ttlSec` seconds
export function setPosition(busId, data, ttlSec = 30) {
  positions.set(busId, { data, expires: Date.now() + ttlSec * 1000 });
}

// Get a bus's latest position, or null if missing/expired
export function getPosition(busId) {
  const e = positions.get(busId);
  if (!e) return null;
  if (Date.now() > e.expires) { positions.delete(busId); return null; }
  return e.data;
}

// Is the bus currently broadcasting (has a fresh position)?
export function isLive(busId) {
  return !!getPosition(busId);
}

// Returns true the first time a key is seen within ttlSec (used to throttle alerts)
export function shouldAlert(key, ttlSec = 1800) {
  const now = Date.now();
  const exp = alertDedup.get(key);
  if (exp && now < exp) return false;
  alertDedup.set(key, now + ttlSec * 1000);
  return true;
}

// Broadcast an event to the Socket.io layer
export function publish(event, payload) {
  liveBus.emit(event, payload);
}

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of positions) if (now > v.expires) positions.delete(k);
  for (const [k, exp] of alertDedup) if (now > exp) alertDedup.delete(k);
}, 60_000).unref?.();
