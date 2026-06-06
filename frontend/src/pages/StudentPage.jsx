import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import BusMap from "../components/LazyMap";
import socket from "../lib/socket";
import api from "../lib/api";
import useAuthStore from "../store/authStore";
import { useNavigate } from "react-router-dom";
import { calcETA } from "../lib/eta";
import { useIsMobile } from "../hooks/useMediaQuery";

const ROLE_COLOR = { student: "bg-indigo-500", driver: "bg-yellow-500", admin: "bg-pink-500" };
const ROLE_EMOJI = { student: "🧑‍🎓", driver: "🚗", admin: "👤" };

export default function StudentPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const [buses, setBuses] = useState([]);
  const [stops, setStops] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [otherUsers, setOtherUsers] = useState({}); // { userId: {id,name,role,lat,lng} }
  const [trackedBusId, setTrackedBusId] = useState(null);
  const [trackedStops, setTrackedStops] = useState([]);
  const [arrivalAlert, setArrivalAlert] = useState(null);
  const [loadingBuses, setLoadingBuses] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [flyToUser, setFlyToUser] = useState(0);
  const [activeTab, setActiveTab] = useState("buses"); // "buses" | "people"
  const watchId = useRef(null);

  // ── GPS watch ────────────────────────────────────────────
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) { setLocationError("Geolocation not supported."); return; }
    setLocationError(null);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        setAccuracy(pos.coords.accuracy);
        setLocationError(null);
      },
      (err) => {
        if (err.code === 1) setLocationError("Location permission denied. Please allow access.");
        else setLocationError("Location unavailable. Retrying…");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, []);

  useEffect(() => {
    startTracking();
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); };
  }, [startTracking]);

  // ── Broadcast MY location to other users every 4s ────────
  useEffect(() => {
    if (!userLocation || !socket.connected) return;
    const [latitude, longitude] = userLocation;
    socket.emit("user:location", { latitude, longitude });
  }, [userLocation]);

  // ── Socket.io setup ──────────────────────────────────────
  useEffect(() => {
    socket.connect();

    // Get snapshot of all current online users
    socket.on("users:online", (users) => {
      const map = {};
      users.forEach((u) => { if (u.id !== user?.id) map[u.id] = u; });
      setOtherUsers(map);
    });

    // Someone new joined
    socket.on("user:joined", (u) => {
      if (u.id !== user?.id) {
        setOtherUsers((prev) => ({ ...prev, [u.id]: u }));
      }
    });

    // Someone's location updated
    socket.on("user:location", (u) => {
      if (u.id !== user?.id) {
        setOtherUsers((prev) => ({ ...prev, [u.id]: { ...prev[u.id], ...u } }));
      }
    });

    // Someone left
    socket.on("user:left", ({ id }) => {
      setOtherUsers((prev) => { const next = { ...prev }; delete next[id]; return next; });
    });

    // Bus position updates
    socket.on("bus:position", (data) => {
      setBuses((prev) =>
        prev.map((b) => b.id === data.bus_id
          ? { ...b, latitude: data.latitude, longitude: data.longitude, speed: data.speed }
          : b
        )
      );
    });

    // Bus approaching a stop — show arrival banner
    socket.on("bus:approaching", (data) => {
      setArrivalAlert({
        stop: data.stop_name,
        eta: data.eta_min,
        at: Date.now(),
      });
      setTimeout(() => setArrivalAlert(null), 9000);
    });

    return () => {
      socket.off("users:online");
      socket.off("user:joined");
      socket.off("user:location");
      socket.off("user:left");
      socket.off("bus:position");
      socket.off("bus:approaching");
      socket.disconnect();
    };
  }, [user?.id]);

  // ── Fetch stops for the tracked bus ──────────────────────
  useEffect(() => {
    if (!trackedBusId) { setTrackedStops([]); return; }
    api.get(`/stops/bus/${trackedBusId}`)
      .then((r) => setTrackedStops(r.data.stops || []))
      .catch(() => setTrackedStops([]));
  }, [trackedBusId]);

  // ── Bus room tracking ─────────────────────────────────────
  useEffect(() => {
    if (!trackedBusId) return;
    socket.emit("join:bus", trackedBusId);
    return () => socket.emit("leave:bus", trackedBusId);
  }, [trackedBusId]);

  // ── Fetch nearby buses every 10s ─────────────────────────
  const fetchNearbyBuses = useCallback(async () => {
    if (!userLocation) return;
    setLoadingBuses(true);
    try {
      const [lat, lng] = userLocation;
      const { data } = await api.get(`/location/nearby?lat=${lat}&lng=${lng}&radius=5000`);
      setBuses(data.buses || []);
    } catch { /* silent */ }
    finally { setLoadingBuses(false); }
  }, [userLocation]);

  useEffect(() => {
    fetchNearbyBuses();
    const interval = setInterval(fetchNearbyBuses, 10000);
    return () => clearInterval(interval);
  }, [fetchNearbyBuses]);

  const handleLocateMe = () => setFlyToUser((v) => v + 1);
  const handleLogout = () => { logout(); navigate("/login"); };

  const otherUsersArr = Object.values(otherUsers);
  const onlineWithLocation = otherUsersArr.filter((u) => u.latitude && u.longitude);

  // Attach ETA to every bus
  const busesWithETA = useMemo(() =>
    buses.map((b) => ({ ...b, _eta: calcETA(b, userLocation) })),
    [buses, userLocation]
  );

  const filteredBuses = busesWithETA.filter((b) =>
    b.bus_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const trackedBus = busesWithETA.find((b) => b.id === trackedBusId);

  // ETA from the tracked bus to each of its stops
  const stopsWithETA = useMemo(() => {
    if (!trackedBus?.latitude) return trackedStops.map((s) => ({ ...s, _eta: null }));
    const R = 6371, toRad = (d) => (d * Math.PI) / 180;
    const kmh = trackedBus.speed && trackedBus.speed > 2 ? trackedBus.speed : 20;
    return trackedStops.map((s) => {
      const dLat = toRad(s.latitude - trackedBus.latitude);
      const dLng = toRad(s.longitude - trackedBus.longitude);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(trackedBus.latitude)) * Math.cos(toRad(s.latitude)) * Math.sin(dLng / 2) ** 2;
      const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const etaMin = Math.round((km / kmh) * 60);
      return { ...s, _eta: { km, etaMin } };
    });
  }, [trackedStops, trackedBus]);

  const S = {
    sidebar: isMobile ? {
      // Mobile: bottom sheet
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000,
      maxHeight: "75svh", overflowY: "auto",
      background: "var(--carbon-1)",
      borderTop: "1px solid var(--border-hi)",
      borderRadius: "20px 20px 0 0",
      transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
      transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
      display: "flex", flexDirection: "column",
      fontFamily: "var(--font-body)",
    } : {
      width: sidebarOpen ? "300px" : "0",
      minWidth: sidebarOpen ? "300px" : "0",
      overflow: "hidden",
      transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
      display: "flex", flexDirection: "column",
      background: "var(--carbon-1)",
      borderRight: "1px solid var(--border)",
      fontFamily: "var(--font-body)",
    },
    sectionLabel: {
      fontSize:"12px", fontWeight: 700, letterSpacing: "1.2px",
      textTransform: "uppercase", color: "var(--text-3)",
      fontFamily: "var(--font-mono)", marginBottom: "8px",
    },
  };

  return (
    <div style={{ display:"flex", height:"100svh", background:"var(--carbon)", overflow:"hidden", fontFamily:"var(--font-body)", flexDirection: isMobile ? "column" : "row" }}>

      {/* ── Arrival alert banner ── */}
      {arrivalAlert && (
        <div style={{
          position:"fixed", top: isMobile ? "12px" : "16px", left:"50%", transform:"translateX(-50%)",
          zIndex:2000, display:"flex", alignItems:"center", gap:"12px",
          background:"linear-gradient(135deg, #16A34A, #15803D)",
          borderRadius:"12px", padding:"12px 18px",
          boxShadow:"0 8px 30px rgba(34,197,94,0.4)",
          maxWidth:"92vw",
        }}>
          <span style={{ fontSize:"22px" }}>🚌</span>
          <div>
            <div style={{ fontWeight:700, fontSize:"15px", color:"#fff", fontFamily:"var(--font-display)" }}>
              Bus approaching {arrivalAlert.stop}
            </div>
            <div style={{ fontSize:"13px", color:"#DCFCE7" }}>
              Arriving in about {arrivalAlert.eta < 1 ? "less than a minute" : `${arrivalAlert.eta} min`}
            </div>
          </div>
          <button onClick={() => setArrivalAlert(null)} style={{ background:"none", border:"none", color:"#DCFCE7", fontSize:"18px", cursor:"pointer", marginLeft:"4px" }}>×</button>
        </div>
      )}

      {/* Mobile overlay when sheet open */}
      {isMobile && sheetOpen && (
        <div onClick={() => setSheetOpen(false)} style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:999,
        }}/>
      )}

      {/* ── Sidebar / Bottom Sheet ── */}
      <aside style={S.sidebar}>
        {/* Mobile drag handle */}
        {isMobile && <div className="bottom-sheet-handle" onClick={() => setSheetOpen(false)}/>}

        {/* Header */}
        <div style={{ padding:"16px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
            <div style={{
              width:"36px", height:"36px", borderRadius:"10px", flexShrink:0,
              background:"linear-gradient(135deg, var(--amber), var(--amber-dim))",
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px",
              boxShadow:"0 0 16px var(--amber-glow)",
            }}>🚌</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"16px", color:"var(--text-1)" }}>BusTrack</div>
              <div style={{ fontSize:"13px", color:"var(--text-3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user?.name}</div>
            </div>
            <button onClick={handleLogout} style={{
              display:"flex", alignItems:"center", gap:"5px",
              background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)",
              borderRadius:"8px", padding:"5px 10px",
              color:"var(--red)", fontSize:"13px", fontWeight:600, cursor:"pointer",
              transition:"all 0.2s", whiteSpace:"nowrap",
            }}
              onMouseEnter={e => { e.currentTarget.style.background="rgba(248,113,113,0.15)"; e.currentTarget.style.borderColor="rgba(248,113,113,0.4)"; }}
              onMouseLeave={e => { e.currentTarget.style.background="rgba(248,113,113,0.08)"; e.currentTarget.style.borderColor="rgba(248,113,113,0.2)"; }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
              Log out
            </button>
          </div>

          {/* Search */}
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute", left:"12px", top:"50%", transform:"translateY(-50%)", fontSize:"15px", pointerEvents:"none" }}>🔍</span>
            <input
              type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bus…"
              style={{
                width:"100%", background:"var(--carbon-3)",
                border:"1px solid var(--border-hi)", borderRadius:"8px",
                padding:"9px 12px 9px 34px",
                color:"var(--text-1)", fontSize:"15px",
                fontFamily:"var(--font-body)", outline:"none",
                transition:"border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor="var(--amber)"}
              onBlur={e => e.target.style.borderColor="var(--border-hi)"}
            />
          </div>
        </div>

        {/* GPS badge */}
        <div style={{ padding:"10px 14px", flexShrink:0 }}>
          {locationError ? (
            <div style={{ background:"var(--red-glow)", border:"1px solid rgba(248,113,113,0.25)", borderRadius:"10px", padding:"10px 12px" }}>
              <div style={{ color:"var(--red)", fontSize:"14px", marginBottom:"6px" }}>⚠ {locationError}</div>
              <button onClick={startTracking} style={{ background:"rgba(248,113,113,0.15)", border:"none", borderRadius:"6px", padding:"4px 10px", color:"var(--red)", fontSize:"13px", cursor:"pointer" }}>Retry</button>
            </div>
          ) : userLocation ? (
            <div style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:"10px", padding:"10px 12px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"4px" }}>
                <span style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#818cf8", display:"inline-block", animation:"livePulse 1.4s ease-in-out infinite" }}/>
                <span style={{ fontSize:"12px", fontWeight:700, letterSpacing:"0.8px", textTransform:"uppercase", color:"#818cf8", fontFamily:"var(--font-mono)" }}>GPS Active</span>
              </div>
              <div style={{ fontFamily:"var(--font-mono)", fontSize:"13px", color:"var(--text-2)" }}>{userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}</div>
              {accuracy && <div style={{ fontSize:"12px", color:"var(--text-3)", marginTop:"2px" }}>±{Math.round(accuracy)}m accuracy</div>}
            </div>
          ) : (
            <div style={{ background:"rgba(245,166,35,0.08)", border:"1px solid rgba(245,166,35,0.2)", borderRadius:"10px", padding:"10px 12px", display:"flex", alignItems:"center", gap:"8px" }}>
              <span style={{ width:"6px", height:"6px", borderRadius:"50%", background:"var(--amber)", display:"inline-block", animation:"livePulse 1.4s ease-in-out infinite" }}/>
              <span style={{ fontSize:"14px", color:"var(--amber)" }}>Acquiring GPS…</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", margin:"0 14px 10px", background:"var(--carbon-3)", borderRadius:"10px", padding:"3px", gap:"3px", flexShrink:0 }}>
          {[
            { key:"buses", label:`🚌 Buses${buses.length > 0 ? ` (${buses.length})` : ""}` },
            { key:"people", label:"👥 Online" },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              flex:1, padding:"7px", borderRadius:"7px", border:"none", cursor:"pointer",
              background: activeTab === t.key ? "var(--carbon-5)" : "transparent",
              color: activeTab === t.key ? "var(--text-1)" : "var(--text-3)",
              fontSize:"13px", fontWeight:600, fontFamily:"var(--font-display)",
              transition:"all 0.2s",
              display:"flex", alignItems:"center", justifyContent:"center", gap:"4px",
            }}>
              {t.label}
              {t.key === "people" && otherUsersArr.filter(u=>u.role==="driver").length > 0 && (
                <span style={{ background:"var(--amber)", color:"#000", fontSize:"11px", fontWeight:800, padding:"1px 5px", borderRadius:"10px" }}>
                  {otherUsersArr.filter(u=>u.role==="driver").length}🚗
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex:1, overflowY:"auto", padding: isMobile ? "0 12px 90px" : "0 12px 12px" }}>

          {/* ── Buses tab ── */}
          {activeTab === "buses" && (
            <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>

              {/* Tracked bus hero card */}
              {trackedBus && (
                <div style={{
                  background:"linear-gradient(135deg, rgba(52,211,153,0.1), rgba(52,211,153,0.05))",
                  border:"1.5px solid rgba(52,211,153,0.3)",
                  borderRadius:"12px", padding:"12px",
                  boxShadow:"0 4px 20px rgba(52,211,153,0.08)",
                }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <span className="live-dot" style={{ width:"7px", height:"7px", borderRadius:"50%", background:"var(--green)", display:"inline-block" }}/>
                      <span style={{ fontSize:"12px", fontWeight:700, textTransform:"uppercase", letterSpacing:"1px", color:"var(--green)", fontFamily:"var(--font-mono)" }}>Live Tracking</span>
                    </div>
                    <button onClick={() => setTrackedBusId(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-3)", fontSize:"16px", lineHeight:1 }}>×</button>
                  </div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:"18px", color:"var(--text-1)", marginBottom:"10px" }}>
                    🚌 {trackedBus.bus_number}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px" }}>
                    {[
                      { label:"SPEED", value: trackedBus.speed != null ? Math.round(trackedBus.speed) : "—", unit:"km/h", color:"var(--text-2)" },
                      { label:"ETA",   value: trackedBus._eta ? (trackedBus._eta.etaMin < 1 ? "<1" : trackedBus._eta.etaMin) : "—", unit:"min", color:"var(--green)" },
                      { label:"ARRIVES", value: trackedBus._eta?.arrivalTime ?? "—", unit:"", color:"var(--sky)" },
                    ].map(s => (
                      <div key={s.label} style={{ background:"rgba(0,0,0,0.25)", borderRadius:"8px", padding:"8px 6px", textAlign:"center" }}>
                        <div style={{ fontSize:"11px", fontWeight:700, letterSpacing:"0.8px", color:"var(--text-3)", fontFamily:"var(--font-mono)", marginBottom:"3px" }}>{s.label}</div>
                        <div style={{ fontFamily:"var(--font-mono)", fontWeight:700, fontSize:"16px", color:s.color, lineHeight:1 }}>{s.value}</div>
                        {s.unit && <div style={{ fontSize:"11px", color:"var(--text-3)", marginTop:"2px" }}>{s.unit}</div>}
                      </div>
                    ))}
                  </div>
                  {trackedBus._eta && (
                    <div style={{ marginTop:"8px", fontSize:"12px", color:"var(--text-3)", textAlign:"center", fontFamily:"var(--font-mono)" }}>
                      📍 {trackedBus._eta.distanceKm < 1 ? `${(trackedBus._eta.distanceKm*1000).toFixed(0)}m` : `${trackedBus._eta.distanceKm.toFixed(1)}km`} away
                      {!trackedBus.speed && " · est. 20 km/h"}
                    </div>
                  )}
                </div>
              )}

              {/* ── Upcoming stops for tracked bus ── */}
              {trackedBus && stopsWithETA.length > 0 && (
                <div style={{ background:"var(--carbon-2)", border:"1px solid var(--border)", borderRadius:"12px", padding:"12px", marginBottom:"4px" }}>
                  <div style={{ ...S.sectionLabel, marginBottom:"10px" }}>🛣️ Upcoming Stops</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"0" }}>
                    {stopsWithETA.map((s, i) => (
                      <div key={s.id} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"6px 0" }}>
                        {/* timeline dot */}
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", alignSelf:"stretch" }}>
                          <div style={{ width:"10px", height:"10px", borderRadius:"50%", background: i===0 ? "var(--green)" : "var(--carbon-5)", border: i===0 ? "2px solid var(--green)" : "2px solid var(--border-hi)", flexShrink:0 }}/>
                          {i < stopsWithETA.length - 1 && <div style={{ width:"2px", flex:1, minHeight:"14px", background:"var(--border-hi)" }}/>}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:"14px", fontWeight:600, color:"var(--text-1)" }}>{s.name}</div>
                        </div>
                        {s._eta && (
                          <div style={{ textAlign:"right", flexShrink:0 }}>
                            <div style={{ fontSize:"14px", fontWeight:700, fontFamily:"var(--font-mono)", color: s._eta.etaMin < 3 ? "var(--green)" : "var(--sky)" }}>
                              {s._eta.etaMin < 1 ? "<1" : s._eta.etaMin} min
                            </div>
                            <div style={{ fontSize:"11px", color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>
                              {s._eta.km < 1 ? `${(s._eta.km*1000).toFixed(0)}m` : `${s._eta.km.toFixed(1)}km`}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section label */}
              <div style={S.sectionLabel}>{loadingBuses ? "Searching…" : `${filteredBuses.length} buses nearby`}</div>

              {/* Bus cards */}
              {filteredBuses.map((bus) => {
                const isTracked = bus.id === trackedBusId;
                const eta = bus._eta;
                return (
                  <div key={bus.id} onClick={() => setTrackedBusId(isTracked ? null : bus.id)}
                    style={{
                      background: isTracked ? "rgba(56,189,248,0.07)" : "var(--carbon-2)",
                      border: `1px solid ${isTracked ? "rgba(56,189,248,0.3)" : "var(--border)"}`,
                      borderRadius:"12px", padding:"12px", cursor:"pointer",
                      transition:"all 0.2s",
                    }}
                    onMouseEnter={e => { if(!isTracked) e.currentTarget.style.borderColor="var(--border-hi)"; }}
                    onMouseLeave={e => { if(!isTracked) e.currentTarget.style.borderColor="var(--border)"; }}
                  >
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
                      <div style={{
                        width:"32px", height:"32px", borderRadius:"8px", flexShrink:0,
                        background: isTracked ? "rgba(56,189,248,0.15)" : "var(--carbon-4)",
                        display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px",
                      }}>🚌</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"15px", color:"var(--text-1)" }}>{bus.bus_number}</div>
                        <div style={{ fontSize:"13px", color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>
                          {eta ? (eta.distanceKm < 1 ? `${(eta.distanceKm*1000).toFixed(0)}m` : `${eta.distanceKm.toFixed(1)}km`) : "—"} away
                        </div>
                      </div>
                      {isTracked && <span style={{ fontSize:"12px", fontWeight:700, color:"var(--green)", fontFamily:"var(--font-mono)" }}>● LIVE</span>}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"4px" }}>
                      {[
                        { label:"SPD", value: bus.speed != null ? `${Math.round(bus.speed)}` : "—", unit:"km/h", active:bus.speed!=null, color:"var(--text-1)" },
                        { label:"ETA", value: eta ? (eta.etaMin < 1 ? "<1" : `${eta.etaMin}`) : "—", unit:"min", active:!!eta, color:"var(--green)" },
                        { label:"ARR", value: eta?.arrivalTime ?? "—", unit:"", active:!!eta, color:"var(--sky)" },
                      ].map(s => (
                        <div key={s.label} style={{
                          background: s.active ? "rgba(0,0,0,0.2)" : "var(--carbon-3)",
                          borderRadius:"6px", padding:"5px 4px", textAlign:"center",
                        }}>
                          <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.8px", color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>{s.label}</div>
                          <div style={{ fontFamily:"var(--font-mono)", fontWeight:700, fontSize:"13px", color: s.active ? s.color : "var(--text-3)", marginTop:"2px" }}>{s.value}</div>
                          {s.unit && <div style={{ fontSize:"10px", color:"var(--text-3)" }}>{s.unit}</div>}
                        </div>
                      ))}
                    </div>
                    {!bus.latitude && (
                      <div style={{ marginTop:"6px", fontSize:"12px", color:"var(--text-3)", textAlign:"center", fontFamily:"var(--font-mono)" }}>Waiting for driver GPS…</div>
                    )}
                  </div>
                );
              })}

              {!loadingBuses && filteredBuses.length === 0 && (
                <div style={{ textAlign:"center", padding:"32px 16px", color:"var(--text-3)" }}>
                  <div style={{ fontSize:"32px", marginBottom:"8px" }}>🚌</div>
                  <div style={{ fontSize:"15px", fontWeight:600 }}>No buses nearby</div>
                  <div style={{ fontSize:"13px", marginTop:"4px" }}>Buses appear when drivers go online</div>
                </div>
              )}
            </div>
          )}

          {/* ── People tab ── */}
          {activeTab === "people" && (
            <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>

              {/* Drivers section */}
              {(() => {
                const drivers = otherUsersArr.filter(u => u.role === "driver");
                return (
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
                      <span style={S.sectionLabel}>🚗 Drivers Online</span>
                      <span style={{
                        background: drivers.length > 0 ? "var(--amber)" : "var(--carbon-4)",
                        color: drivers.length > 0 ? "#000" : "var(--text-3)",
                        fontSize:"11px", fontWeight:800, padding:"2px 7px", borderRadius:"10px",
                      }}>{drivers.length}</span>
                    </div>
                    {drivers.length === 0 ? (
                      <div style={{ background:"rgba(245,166,35,0.04)", border:"1px solid rgba(245,166,35,0.12)", borderRadius:"10px", padding:"14px", textAlign:"center" }}>
                        <div style={{ fontSize:"24px", marginBottom:"4px" }}>🚗</div>
                        <div style={{ fontSize:"14px", color:"rgba(245,166,35,0.5)", fontWeight:600 }}>No drivers online</div>
                        <div style={{ fontSize:"12px", color:"var(--text-3)", marginTop:"2px" }}>Bus positions won't update</div>
                      </div>
                    ) : drivers.map(u => (
                      <div key={u.id} style={{
                        background:"rgba(245,166,35,0.07)",
                        border:"1.5px solid rgba(245,166,35,0.3)",
                        borderRadius:"12px", padding:"12px", marginBottom:"6px",
                        boxShadow:"0 4px 20px rgba(245,166,35,0.07)",
                      }}>
                        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                          <div style={{ position:"relative" }}>
                            <div style={{ width:"40px", height:"40px", borderRadius:"50%", background:"linear-gradient(135deg,var(--amber),var(--amber-dim))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px", boxShadow:"0 0 16px var(--amber-glow-strong)" }}>🚗</div>
                            <span style={{ position:"absolute", top:"-2px", right:"-2px", width:"11px", height:"11px", background:"var(--green)", borderRadius:"50%", border:"2px solid var(--carbon-1)" }} className="live-dot"/>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"15px", color:"var(--text-1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name}</div>
                            <div style={{ display:"flex", alignItems:"center", gap:"6px", marginTop:"2px" }}>
                              <span style={{ fontSize:"12px", color:"var(--amber)", fontWeight:700 }}>DRIVER</span>
                              {u.latitude
                                ? <span style={{ background:"rgba(52,211,153,0.15)", color:"var(--green)", fontSize:"11px", fontWeight:600, padding:"1px 6px", borderRadius:"6px" }}>📍 Sharing</span>
                                : <span style={{ background:"var(--carbon-4)", color:"var(--text-3)", fontSize:"11px", padding:"1px 6px", borderRadius:"6px" }}>No GPS</span>
                              }
                            </div>
                          </div>
                        </div>
                        {u.latitude && (
                          <div style={{ marginTop:"8px", paddingTop:"8px", borderTop:"1px solid rgba(245,166,35,0.15)", fontFamily:"var(--font-mono)", fontSize:"12px", color:"rgba(245,166,35,0.5)" }}>
                            {u.latitude.toFixed(5)}, {u.longitude.toFixed(5)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div style={{ height:"1px", background:"var(--border)", margin:"4px 0" }}/>
              <div style={S.sectionLabel}>Other Users Online</div>

              {/* Me */}
              <div style={{ background:"rgba(99,102,241,0.07)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:"10px", padding:"10px 12px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                  <div style={{ width:"34px", height:"34px", borderRadius:"50%", background:"rgba(99,102,241,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>🧑‍🎓</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:"15px", color:"var(--text-1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {user?.name} <span style={{ color:"#818cf8", fontSize:"12px" }}>(You)</span>
                    </div>
                    <div style={{ fontSize:"12px", color:"var(--text-3)", textTransform:"capitalize" }}>{user?.role}</div>
                  </div>
                  <span className="live-dot" style={{ width:"7px", height:"7px", borderRadius:"50%", background:"var(--green)", display:"inline-block" }}/>
                </div>
              </div>

              {otherUsersArr.filter(u => u.role !== "driver").map(u => (
                <div key={u.id} style={{ background:"var(--carbon-2)", border:"1px solid var(--border)", borderRadius:"10px", padding:"10px 12px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                    <div style={{ width:"34px", height:"34px", borderRadius:"50%", background:"var(--carbon-4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>
                      {ROLE_EMOJI[u.role] || "👤"}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:"15px", color:"var(--text-1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.name}</div>
                      <div style={{ fontSize:"12px", color:"var(--text-3)", textTransform:"capitalize" }}>{u.role}</div>
                    </div>
                    {u.latitude
                      ? <span style={{ fontSize:"12px", color:"var(--green)", fontFamily:"var(--font-mono)" }}>📍</span>
                      : <span style={{ fontSize:"12px", color:"var(--text-3)" }}>—</span>
                    }
                  </div>
                </div>
              ))}

              {otherUsersArr.filter(u => u.role !== "driver").length === 0 && (
                <div style={{ textAlign:"center", fontSize:"13px", color:"var(--text-3)", padding:"12px" }}>No other students online</div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main map area ── */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Top bar */}
        <div style={{
          display:"flex", alignItems:"center", gap:"10px",
          padding: isMobile ? "10px 12px" : "10px 16px",
          background:"var(--carbon-1)",
          borderBottom:"1px solid var(--border)",
          flexShrink:0,
        }}>
          {/* Desktop: sidebar toggle | Mobile: hidden (use bottom bar) */}
          {!isMobile && (
            <button onClick={() => setSidebarOpen(v => !v)} style={{
              background:"var(--carbon-3)", border:"1px solid var(--border-hi)",
              borderRadius:"8px", width:"34px", height:"34px", cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-2)",
              transition:"all 0.2s", flexShrink:0,
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor="var(--amber)"; e.currentTarget.style.color="var(--amber)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border-hi)"; e.currentTarget.style.color="var(--text-2)"; }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          )}

          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"15px", color:"var(--text-1)" }}>Live Map</span>
            <div style={{
              display:"flex", alignItems:"center", gap:"5px",
              background:"var(--carbon-3)", border:"1px solid var(--border)",
              borderRadius:"20px", padding:"3px 10px",
            }}>
              <span className="live-dot" style={{ width:"6px", height:"6px", borderRadius:"50%", background:"var(--green)", display:"inline-block" }}/>
              <span style={{ fontSize:"13px", color:"var(--text-2)", fontFamily:"var(--font-mono)" }}>
                {1 + otherUsersArr.length} online
              </span>
            </div>
          </div>

          <button onClick={handleLocateMe} style={{
            marginLeft:"auto",
            display:"flex", alignItems:"center", gap:"6px",
            background:"linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.1))",
            border:"1px solid rgba(99,102,241,0.3)",
            borderRadius:"8px", padding:"7px 14px",
            color:"#a5b4fc", fontSize:"14px", fontWeight:600,
            fontFamily:"var(--font-display)", cursor:"pointer",
            transition:"all 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background="rgba(99,102,241,0.25)"; e.currentTarget.style.borderColor="rgba(99,102,241,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.background="linear-gradient(135deg,rgba(99,102,241,0.2),rgba(99,102,241,0.1))"; e.currentTarget.style.borderColor="rgba(99,102,241,0.3)"; }}
          >
            📍 My Location
          </button>
        </div>

        {/* Map */}
        <div style={{ flex:1, padding: isMobile ? "0" : "10px", paddingBottom: isMobile ? "64px" : "10px" }}>
          <div style={{
            height:"100%",
            borderRadius: isMobile ? "0" : "14px",
            overflow:"hidden",
            border: isMobile ? "none" : "1px solid var(--border-hi)",
            boxShadow:"0 8px 40px rgba(0,0,0,0.5)",
          }}>
            <BusMap
              buses={busesWithETA}
              stops={stops}
              userLocation={userLocation}
              accuracy={accuracy}
              otherUsers={otherUsersArr}
              trackedBusId={trackedBusId}
              flyToUser={flyToUser}
              onLocate={handleLocateMe}
            />
          </div>
        </div>

        {/* ── Mobile bottom nav bar ── */}
        {isMobile && (
          <div style={{
            position:"fixed", bottom:0, left:0, right:0, zIndex:998,
            background:"var(--carbon-1)", borderTop:"1px solid var(--border-hi)",
            display:"flex", height:"64px",
            boxShadow:"0 -4px 20px rgba(0,0,0,0.4)",
          }}>
            {/* Buses */}
            <button onClick={() => { setActiveTab("buses"); setSheetOpen(v => !v); }} style={{
              flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              background:"none", border:"none", cursor:"pointer", gap:"3px",
              color: sheetOpen && activeTab==="buses" ? "var(--amber)" : "var(--text-3)",
            }}>
              <span style={{ fontSize:"20px" }}>🚌</span>
              <span style={{ fontSize:"12px", fontWeight:600, fontFamily:"var(--font-display)" }}>
                Buses {filteredBuses.length > 0 && `(${filteredBuses.length})`}
              </span>
            </button>

            {/* Locate me */}
            <button onClick={handleLocateMe} style={{
              flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              background:"none", border:"none", cursor:"pointer", gap:"3px",
              color:"var(--text-3)",
            }}>
              <div style={{
                width:"42px", height:"42px", borderRadius:"50%",
                background:"linear-gradient(135deg, var(--amber), var(--amber-dim))",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:"20px", boxShadow:"0 0 16px var(--amber-glow-strong)",
                marginTop:"-16px",
              }}>📍</div>
            </button>

            {/* People */}
            <button onClick={() => { setActiveTab("people"); setSheetOpen(v => !v); }} style={{
              flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              background:"none", border:"none", cursor:"pointer", gap:"3px",
              color: sheetOpen && activeTab==="people" ? "var(--amber)" : "var(--text-3)",
              position:"relative",
            }}>
              <span style={{ fontSize:"20px" }}>👥</span>
              <span style={{ fontSize:"12px", fontWeight:600, fontFamily:"var(--font-display)" }}>Online</span>
              {otherUsersArr.filter(u=>u.role==="driver").length > 0 && (
                <span style={{
                  position:"absolute", top:"6px", right:"18px",
                  width:"8px", height:"8px", borderRadius:"50%",
                  background:"var(--amber)", border:"2px solid var(--carbon-1)",
                }}/>
              )}
            </button>

            {/* Logout */}
            <button onClick={handleLogout} style={{
              flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              background:"none", border:"none", cursor:"pointer", gap:"3px",
              color:"var(--red)",
            }}>
              <span style={{ fontSize:"20px" }}>🚪</span>
              <span style={{ fontSize:"12px", fontWeight:600, fontFamily:"var(--font-display)" }}>Logout</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
