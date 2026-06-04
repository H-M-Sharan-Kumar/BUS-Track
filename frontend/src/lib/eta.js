// Haversine formula — straight-line distance in km between two lat/lng points
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns { etaMin, arrivalTime, distanceKm } or null if can't compute
export function calcETA(bus, userLocation) {
  if (!bus.latitude || !bus.longitude || !userLocation) return null;

  const dist = distanceKm(
    userLocation[0], userLocation[1],
    bus.latitude,    bus.longitude
  );

  // Use live speed if available and > 2 km/h, otherwise assume 20 km/h average
  const speedKmh = bus.speed && bus.speed > 2 ? bus.speed : 20;

  const etaMin = (dist / speedKmh) * 60; // minutes

  const arrival = new Date(Date.now() + etaMin * 60 * 1000);
  const arrivalTime = arrival.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return {
    etaMin: Math.round(etaMin),
    arrivalTime,
    distanceKm: dist,
  };
}
