import { useEffect, useState, useRef, useCallback } from "react";
import { useIsMobile } from "../hooks/useMediaQuery";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import socket from "../lib/socket";
import api from "../lib/api";
import useAuthStore from "../store/authStore";
import { useNavigate } from "react-router-dom";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const driverMapIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:56px;height:56px;">
    <div style="position:absolute;inset:0;border-radius:50%;background:#f5a623;opacity:0.2;animation:ping 1.4s cubic-bezier(0,0,0.2,1) infinite;"></div>
    <div style="position:absolute;inset:4px;border-radius:50%;background:#f5a623;opacity:0.15;animation:ping 1.4s 0.3s cubic-bezier(0,0,0.2,1) infinite;"></div>
    <div style="position:absolute;inset:10px;border-radius:50%;background:linear-gradient(135deg,#f5a623,#c47f10);border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 20px rgba(245,166,35,0.6);">🚗</div>
  </div>`,
  iconSize: [56, 56], iconAnchor: [28, 28], popupAnchor: [0, -28],
});

const MAP_LAYERS = {
  street:    { label: "Street",    icon: "🗺️", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" },
  satellite: { label: "Satellite", icon: "🛰️", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" },
  hybrid:    { label: "Hybrid",    icon: "🌍", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", overlay: "https://stamen-tiles.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.png" },
};

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 17, { duration: 1.2 });
  }, [position?.join?.(",")]);
  return null;
}

function LayerSwitcher({ active, onChange }) {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control({ position: "topright" });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create("div");
      div.id = "driver-layer-sw";
      div.style.cssText = "display:flex;flex-direction:column;gap:5px;";
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    ctrl.addTo(map);
    return () => ctrl.remove();
  }, [map]);

  useEffect(() => {
    const c = document.getElementById("driver-layer-sw");
    if (!c) return;
    c.innerHTML = "";
    Object.entries(MAP_LAYERS).forEach(([key, l]) => {
      const isActive = key === active;
      const btn = document.createElement("button");
      btn.innerHTML = `<span style="font-size:14px">${l.icon}</span><span style="font-size:11px;font-weight:700;font-family:'Syne',sans-serif">${l.label}</span>`;
      btn.style.cssText = `
        display:flex;align-items:center;gap:7px;padding:7px 12px;border-radius:9px;
        border:1.5px solid ${isActive ? "#f5a623" : "#1e2535"};
        background:${isActive ? "rgba(245,166,35,0.15)" : "rgba(13,16,23,0.92)"};
        color:${isActive ? "#f5a623" : "#8892a4"};
        cursor:pointer;white-space:nowrap;
        box-shadow:${isActive ? "0 0 14px rgba(245,166,35,0.25)" : "0 2px 8px rgba(0,0,0,0.5)"};
        backdrop-filter:blur(8px);transition:all 0.2s;`;
      btn.onclick = () => onChange(key);
      c.appendChild(btn);
    });
  }, [active, onChange]);
  return null;
}

export default function DriverPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [controlsOpen, setControlsOpen] = useState(false);

  const [location, setLocation]       = useState(null);
  const [accuracy, setAccuracy]       = useState(null);
  const [speed, setSpeed]             = useState(null);
  const [heading, setHeading]         = useState(null);
  const [locationError, setLocError]  = useState(null);
  const [activeLayer, setActiveLayer] = useState("satellite");
  const [tripActive, setTripActive]   = useState(false);
  const [tripId, setTripId]           = useState(null);
  const [buses, setBuses]             = useState([]);
  const [selectedBus, setSelectedBus] = useState("");
  const [pingCount, setPingCount]     = useState(0);
  const [lastPing, setLastPing]       = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [elapsed, setElapsed]         = useState(0);
  const [busLoading, setBusLoading]   = useState(true);

  const watchId    = useRef(null);
  const intervalId = useRef(null);
  const startTime  = useRef(null);

  useEffect(() => {
    api.get("/buses/mine").then(({ data }) => {
      setBuses(data.buses || []);
      if (data.buses?.length === 1) setSelectedBus(data.buses[0].id);
    }).catch(() => setBuses([])).finally(() => setBusLoading(false));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) { setLocError("Geolocation not supported"); return; }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation([pos.coords.latitude, pos.coords.longitude]);
        setAccuracy(pos.coords.accuracy);
        setSpeed(pos.coords.speed != null ? (pos.coords.speed * 3.6).toFixed(1) : null);
        setHeading(pos.coords.heading);
        setLocError(null);
      },
      (err) => setLocError(err.code === 1 ? "Location permission denied." : "Location unavailable."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
    );
    return () => navigator.geolocation.clearWatch(watchId.current);
  }, []);

  useEffect(() => {
    socket.connect();
    socket.on("users:online", (users) => setOnlineCount(users.length));
    socket.on("user:joined",  () => setOnlineCount(c => c + 1));
    socket.on("user:left",    () => setOnlineCount(c => Math.max(0, c - 1)));
    return () => { socket.off("users:online"); socket.off("user:joined"); socket.off("user:left"); socket.disconnect(); };
  }, []);

  const broadcastLocation = useCallback(async () => {
    if (!location || !selectedBus) return;
    const [latitude, longitude] = location;
    socket.emit("user:location", { latitude, longitude });
    try {
      await api.post("/location/update", { bus_id: selectedBus, trip_id: tripId, latitude, longitude, speed: speed ? parseFloat(speed) : null, heading });
      setPingCount(c => c + 1);
      setLastPing(new Date());
    } catch (e) { console.error("GPS ping failed:", e.message); }
  }, [location, selectedBus, tripId, speed, heading]);

  const startTrip = async () => {
    if (!selectedBus) return;
    try {
      const { data } = await api.post("/trips/start", { bus_id: selectedBus });
      setTripId(data.trip?.id || null);
    } catch {}
    setTripActive(true);
    startTime.current = Date.now();
    setPingCount(0); setElapsed(0);
    intervalId.current = setInterval(() => {
      broadcastLocation();
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 4000);
    broadcastLocation();
  };

  const stopTrip = async () => {
    clearInterval(intervalId.current);
    setTripActive(false);
    if (tripId) { try { await api.post(`/trips/${tripId}/end`); } catch {} setTripId(null); }
  };

  useEffect(() => {
    if (!tripActive) return;
    clearInterval(intervalId.current);
    intervalId.current = setInterval(() => {
      broadcastLocation();
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 4000);
    return () => clearInterval(intervalId.current);
  }, [broadcastLocation, tripActive]);

  useEffect(() => () => clearInterval(intervalId.current), []);

  const handleLogout = () => { stopTrip(); logout(); navigate("/login"); };
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
  const selectedBusObj = buses.find(b => b.id === selectedBus);

  const canStart = selectedBus && location && !tripActive;

  return (
    <div style={{
      display:"flex", height:"100svh", background:"var(--carbon)",
      fontFamily:"var(--font-body)", overflow:"hidden",
      flexDirection: isMobile ? "column" : "row",
    }}>
      {/* Mobile overlay */}
      {isMobile && controlsOpen && (
        <div onClick={() => setControlsOpen(false)} style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:999,
        }}/>
      )}

      {/* ── Sidebar / Bottom sheet ── */}
      <aside style={isMobile ? {
        position:"fixed", bottom:0, left:0, right:0, zIndex:1000,
        maxHeight:"80svh", overflowY:"auto",
        background:"var(--carbon-1)",
        borderTop:"1px solid var(--border-hi)",
        borderRadius:"20px 20px 0 0",
        transform: controlsOpen ? "translateY(0)" : "translateY(100%)",
        transition:"transform 0.35s cubic-bezier(0.4,0,0.2,1)",
        display:"flex", flexDirection:"column",
      } : {
        width:"268px", minWidth:"268px",
        display:"flex", flexDirection:"column",
        background:"var(--carbon-1)",
        borderRight:"1px solid var(--border)",
        overflow:"hidden",
      }}>
        {isMobile && <div className="bottom-sheet-handle" onClick={() => setControlsOpen(false)}/>}

        {/* Header */}
        <div style={{ padding:"14px 16px", borderBottom:"1px solid var(--border)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"0" }}>
            {/* Avatar */}
            <div style={{
              width:"38px", height:"38px", borderRadius:"10px", flexShrink:0,
              background:"linear-gradient(135deg, var(--amber), var(--amber-dim))",
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px",
              boxShadow:"0 0 16px var(--amber-glow)",
            }}>🚗</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"15px", color:"var(--text-1)" }}>Driver Dashboard</div>
              <div style={{ fontSize:"13px", color:"var(--text-3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user?.name}</div>
            </div>
            <button onClick={handleLogout} style={{
              display:"flex", alignItems:"center", gap:"4px",
              background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)",
              borderRadius:"7px", padding:"5px 9px",
              color:"var(--red)", fontSize:"12px", fontWeight:600, cursor:"pointer",
              transition:"all 0.2s",
            }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,0.15)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,0.08)";}}
            >
              <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7"/></svg>
              Out
            </button>
          </div>

          {/* Online pill */}
          <div style={{
            marginTop:"10px", display:"inline-flex", alignItems:"center", gap:"6px",
            background:"var(--carbon-3)", border:"1px solid var(--border)", borderRadius:"20px",
            padding:"3px 10px",
          }}>
            <span className="live-dot" style={{ width:"6px", height:"6px", borderRadius:"50%", background:"var(--green)", display:"inline-block" }}/>
            <span style={{ fontSize:"13px", color:"var(--text-2)", fontFamily:"var(--font-mono)" }}>{onlineCount + 1} online</span>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex:1, overflowY:"auto", padding:"12px" }}>

          {/* ── GPS STATUS ── */}
          <div style={{ marginBottom:"12px" }}>
            <div style={{ fontSize:"12px", fontWeight:700, letterSpacing:"1.2px", textTransform:"uppercase", color:"var(--text-3)", fontFamily:"var(--font-mono)", marginBottom:"8px" }}>GPS Status</div>

            {locationError ? (
              <div style={{ background:"var(--red-glow)", border:"1px solid rgba(248,113,113,0.25)", borderRadius:"10px", padding:"10px 12px" }}>
                <div style={{ color:"var(--red)", fontSize:"14px" }}>⚠ {locationError}</div>
              </div>
            ) : location ? (
              <div style={{ background:"rgba(52,211,153,0.06)", border:"1px solid rgba(52,211,153,0.2)", borderRadius:"10px", padding:"10px 12px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"8px" }}>
                  <span className="live-dot" style={{ width:"7px", height:"7px", borderRadius:"50%", background:"var(--green)", display:"inline-block" }}/>
                  <span style={{ fontSize:"12px", fontWeight:700, textTransform:"uppercase", letterSpacing:"1px", color:"var(--green)", fontFamily:"var(--font-mono)" }}>GPS Active</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px" }}>
                  {[
                    { label:"LAT",  value: location[0].toFixed(5) },
                    { label:"LNG",  value: location[1].toFixed(5) },
                    { label:"SPD",  value: speed != null ? `${speed} km/h` : "—" },
                    { label:"ACC",  value: accuracy ? `±${Math.round(accuracy)}m` : "—" },
                  ].map(s => (
                    <div key={s.label} style={{ background:"rgba(0,0,0,0.3)", borderRadius:"7px", padding:"6px 8px" }}>
                      <div style={{ fontSize:"11px", fontWeight:700, letterSpacing:"0.8px", color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>{s.label}</div>
                      <div style={{ fontFamily:"var(--font-mono)", fontSize:"13px", fontWeight:600, color:"var(--text-1)", marginTop:"2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ background:"rgba(245,166,35,0.06)", border:"1px solid rgba(245,166,35,0.2)", borderRadius:"10px", padding:"10px 12px", display:"flex", alignItems:"center", gap:"8px" }}>
                <span className="live-dot" style={{ width:"7px", height:"7px", borderRadius:"50%", background:"var(--amber)", display:"inline-block" }}/>
                <span style={{ fontSize:"14px", color:"var(--amber)" }}>Acquiring GPS…</span>
              </div>
            )}
          </div>

          {/* ── BUS SELECTOR ── */}
          <div style={{ marginBottom:"12px" }}>
            <div style={{ fontSize:"12px", fontWeight:700, letterSpacing:"1.2px", textTransform:"uppercase", color:"var(--text-3)", fontFamily:"var(--font-mono)", marginBottom:"8px" }}>Select Bus</div>

            {busLoading ? (
              <div style={{ color:"var(--text-3)", fontSize:"14px", textAlign:"center", padding:"16px" }}>Loading buses…</div>
            ) : buses.length === 0 ? (
              <div style={{ background:"var(--carbon-2)", border:"1px solid var(--border)", borderRadius:"10px", padding:"14px", textAlign:"center" }}>
                <div style={{ fontSize:"24px", marginBottom:"4px" }}>🚌</div>
                <div style={{ fontSize:"14px", color:"var(--text-3)" }}>No buses assigned</div>
                <div style={{ fontSize:"12px", color:"var(--text-3)", marginTop:"2px" }}>Contact admin</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                {buses.map(bus => {
                  const isSelected = selectedBus === bus.id;
                  return (
                    <div key={bus.id} onClick={() => !tripActive && setSelectedBus(bus.id)}
                      style={{
                        background: isSelected ? "rgba(245,166,35,0.1)" : "var(--carbon-2)",
                        border:`1.5px solid ${isSelected ? "rgba(245,166,35,0.5)" : "var(--border)"}`,
                        borderRadius:"10px", padding:"10px 12px",
                        cursor: tripActive ? "not-allowed" : "pointer",
                        opacity: tripActive && !isSelected ? 0.5 : 1,
                        transition:"all 0.2s",
                        boxShadow: isSelected ? "0 0 16px rgba(245,166,35,0.1)" : "none",
                      }}
                    >
                      <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                        <div style={{
                          width:"30px", height:"30px", borderRadius:"8px", flexShrink:0,
                          background: isSelected ? "linear-gradient(135deg,var(--amber),var(--amber-dim))" : "var(--carbon-4)",
                          display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px",
                        }}>🚌</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"14px", color: isSelected ? "var(--amber)" : "var(--text-1)" }}>{bus.bus_number}</div>
                          <div style={{ fontSize:"12px", color:"var(--text-3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{bus.route_name || "No route"}</div>
                        </div>
                        {isSelected && (
                          <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:"var(--amber)", boxShadow:"0 0 8px var(--amber)", flexShrink:0 }}/>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── TRIP CONTROL ── */}
          <div>
            <div style={{ fontSize:"12px", fontWeight:700, letterSpacing:"1.2px", textTransform:"uppercase", color:"var(--text-3)", fontFamily:"var(--font-mono)", marginBottom:"8px" }}>Trip Control</div>

            {tripActive ? (
              <div>
                {/* Active stats card */}
                <div style={{
                  background:"linear-gradient(135deg, rgba(52,211,153,0.1), rgba(52,211,153,0.04))",
                  border:"1.5px solid rgba(52,211,153,0.3)",
                  borderRadius:"12px", padding:"12px", marginBottom:"8px",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"10px" }}>
                    <span className="live-dot" style={{ width:"8px", height:"8px", borderRadius:"50%", background:"var(--green)", display:"inline-block" }}/>
                    <span style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"14px", color:"var(--green)", textTransform:"uppercase", letterSpacing:"0.5px" }}>Trip Active</span>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px", marginBottom:"8px" }}>
                    {[
                      { label:"TIME",  value: fmt(elapsed), color:"var(--green)" },
                      { label:"PINGS", value: pingCount,    color:"var(--sky)" },
                      { label:"SPD",   value: speed ?? "—", color:"var(--amber)" },
                    ].map(s => (
                      <div key={s.label} style={{ background:"rgba(0,0,0,0.3)", borderRadius:"7px", padding:"7px 5px", textAlign:"center" }}>
                        <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.8px", color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>{s.label}</div>
                        <div style={{ fontFamily:"var(--font-mono)", fontWeight:700, fontSize:"15px", color:s.color, lineHeight:1, marginTop:"3px" }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {lastPing && (
                    <div style={{ fontSize:"12px", color:"var(--text-3)", textAlign:"center", fontFamily:"var(--font-mono)" }}>
                      Last ping {lastPing.toLocaleTimeString()}
                    </div>
                  )}
                </div>

                <button onClick={stopTrip} style={{
                  width:"100%", padding:"12px",
                  background:"linear-gradient(135deg, #ef4444, #b91c1c)",
                  border:"none", borderRadius:"10px",
                  color:"#fff", fontSize:"15px", fontWeight:700,
                  fontFamily:"var(--font-display)", cursor:"pointer",
                  boxShadow:"0 4px 20px rgba(239,68,68,0.3)",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:"8px",
                  transition:"all 0.2s",
                }}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 6px 24px rgba(239,68,68,0.4)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 4px 20px rgba(239,68,68,0.3)";}}
                >
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                  End Trip
                </button>
              </div>
            ) : (
              <div>
                <div style={{
                  background: canStart ? "rgba(245,166,35,0.06)" : "var(--carbon-2)",
                  border:`1px solid ${canStart ? "rgba(245,166,35,0.2)" : "var(--border)"}`,
                  borderRadius:"10px", padding:"10px 12px", marginBottom:"8px", textAlign:"center",
                }}>
                  {!selectedBus ? (
                    <div style={{ fontSize:"13px", color:"var(--text-3)" }}>← Select a bus above</div>
                  ) : !location ? (
                    <div style={{ fontSize:"13px", color:"var(--amber)" }}>Waiting for GPS signal…</div>
                  ) : (
                    <div style={{ fontSize:"13px", color:"var(--amber)", fontWeight:600 }}>
                      📡 Ready · {selectedBusObj?.bus_number}
                    </div>
                  )}
                </div>

                <button onClick={startTrip} disabled={!canStart} style={{
                  width:"100%", padding:"13px",
                  background: canStart
                    ? "linear-gradient(135deg, var(--amber), var(--amber-dim))"
                    : "var(--carbon-3)",
                  border:"none", borderRadius:"10px",
                  color: canStart ? "#0a0600" : "var(--text-3)",
                  fontSize:"15px", fontWeight:700,
                  fontFamily:"var(--font-display)", letterSpacing:"0.3px",
                  cursor: canStart ? "pointer" : "not-allowed",
                  boxShadow: canStart ? "0 4px 20px var(--amber-glow-strong)" : "none",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:"8px",
                  transition:"all 0.2s",
                }}
                  onMouseEnter={e=>{if(canStart){e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 6px 28px rgba(245,166,35,0.45)";}}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow=canStart?"0 4px 20px var(--amber-glow-strong)":"none";}}
                >
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
                  Start Trip
                </button>
              </div>
            )}

            <div style={{ marginTop:"10px", textAlign:"center", fontSize:"12px", color:"var(--text-3)", fontFamily:"var(--font-mono)", lineHeight:1.6 }}>
              Broadcasts every <span style={{ color:"var(--text-2)", fontWeight:600 }}>4s</span> to all students
            </div>
          </div>
        </div>
      </aside>

      {/* ── Map area ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Map topbar */}
        <div style={{
          padding:"10px 16px", display:"flex", alignItems:"center", gap:"12px",
          background:"var(--carbon-1)", borderBottom:"1px solid var(--border)", flexShrink:0,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <div style={{
              width:"8px", height:"8px", borderRadius:"50%",
              background: tripActive ? "var(--green)" : "var(--text-3)",
              boxShadow: tripActive ? "0 0 10px var(--green)" : "none",
            }} className={tripActive ? "live-dot" : ""}/>
            <span style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"16px", color:"var(--text-1)" }}>
              {tripActive ? "Broadcasting Live" : "Map View"}
            </span>
            {tripActive && selectedBusObj && (
              <span style={{
                background:"rgba(245,166,35,0.15)", border:"1px solid rgba(245,166,35,0.3)",
                borderRadius:"6px", padding:"2px 8px",
                fontSize:"13px", fontWeight:700, color:"var(--amber)",
                fontFamily:"var(--font-mono)",
              }}>{selectedBusObj.bus_number}</span>
            )}
          </div>

          {location && (
            <div style={{
              marginLeft:"auto", display:"flex", alignItems:"center", gap:"6px",
              background:"var(--carbon-3)", border:"1px solid var(--border)",
              borderRadius:"8px", padding:"5px 10px",
            }}>
              <span style={{ fontSize:"13px", color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>
                {location[0].toFixed(4)}, {location[1].toFixed(4)}
              </span>
              {speed != null && (
                <>
                  <span style={{ width:"1px", height:"12px", background:"var(--border)", display:"inline-block" }}/>
                  <span style={{ fontSize:"13px", color:"var(--amber)", fontFamily:"var(--font-mono)", fontWeight:600 }}>{speed} km/h</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Map */}
        <div style={{ flex:1, padding: isMobile ? "0" : "10px", paddingBottom: isMobile ? "64px" : "10px" }}>
          <div style={{
            height:"100%",
            borderRadius: isMobile ? "0" : "14px",
            overflow:"hidden",
            border: isMobile ? "none" : "1px solid var(--border-hi)",
            boxShadow:"0 8px 40px rgba(0,0,0,0.6)",
            position:"relative",
          }}>
            {/* BROADCASTING badge */}
            {tripActive && (
              <div style={{
                position:"absolute", top:"12px", left:"12px", zIndex:1000,
                display:"flex", alignItems:"center", gap:"7px",
                background:"rgba(8,10,14,0.88)", backdropFilter:"blur(8px)",
                border:"1px solid rgba(52,211,153,0.4)",
                borderRadius:"8px", padding:"6px 12px",
                boxShadow:"0 4px 20px rgba(52,211,153,0.2)",
              }}>
                <span className="live-dot" style={{ width:"8px", height:"8px", borderRadius:"50%", background:"var(--green)", display:"inline-block" }}/>
                <span style={{ fontSize:"13px", fontWeight:700, color:"var(--green)", fontFamily:"var(--font-mono)", letterSpacing:"1px", textTransform:"uppercase" }}>Broadcasting</span>
                <span style={{ fontSize:"13px", fontFamily:"var(--font-mono)", color:"var(--text-3)" }}>· {fmt(elapsed)}</span>
              </div>
            )}

            <MapContainer center={location || [13.0827, 80.2707]} zoom={15} scrollWheelZoom style={{ height:"100%", width:"100%" }}>
              <TileLayer key={activeLayer} url={MAP_LAYERS[activeLayer].url} attribution="&copy; Map contributors" maxZoom={19}/>
              {activeLayer === "hybrid" && MAP_LAYERS.hybrid.overlay && (
                <TileLayer key="hybrid-labels" url={MAP_LAYERS.hybrid.overlay} opacity={0.8}/>
              )}
              <LayerSwitcher active={activeLayer} onChange={setActiveLayer}/>
              {location && <FlyTo position={location}/>}
              {location && (
                <Marker position={location} icon={driverMapIcon}>
                  <Popup>
                    <div style={{ minWidth:"150px" }}>
                      <div style={{ fontWeight:700, color:"var(--amber)", marginBottom:"6px", fontSize:"16px" }}>🚗 {user?.name}</div>
                      <div style={{ fontSize:"13px", color:"#888" }}>{location[0].toFixed(5)}, {location[1].toFixed(5)}</div>
                      {speed != null && <div style={{ fontSize:"13px", color:"#888", marginTop:"2px" }}>{speed} km/h</div>}
                      {tripActive && <div style={{ fontSize:"13px", color:"#22c55e", fontWeight:"bold", marginTop:"4px" }}>● Live Broadcasting</div>}
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>

        {/* ── Mobile bottom bar ── */}
        {isMobile && (
          <div style={{
            position:"fixed", bottom:0, left:0, right:0, zIndex:998,
            background:"var(--carbon-1)", borderTop:"1px solid var(--border-hi)",
            display:"flex", height:"64px",
            boxShadow:"0 -4px 20px rgba(0,0,0,0.4)",
          }}>
            {/* Controls toggle */}
            <button onClick={() => setControlsOpen(v => !v)} style={{
              flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              background:"none", border:"none", cursor:"pointer", gap:"3px",
              color: controlsOpen ? "var(--amber)" : "var(--text-3)",
            }}>
              <span style={{ fontSize:"20px" }}>⚙️</span>
              <span style={{ fontSize:"12px", fontWeight:600, fontFamily:"var(--font-display)" }}>Controls</span>
            </button>

            {/* Big start/stop button */}
            <button onClick={tripActive ? stopTrip : startTrip} disabled={!tripActive && !canStart} style={{
              flex:2, margin:"8px", borderRadius:"12px", border:"none", cursor: (!tripActive && !canStart) ? "not-allowed" : "pointer",
              background: tripActive
                ? "linear-gradient(135deg,#ef4444,#b91c1c)"
                : canStart
                  ? "linear-gradient(135deg,var(--amber),var(--amber-dim))"
                  : "var(--carbon-3)",
              color: tripActive ? "#fff" : canStart ? "#0a0600" : "var(--text-3)",
              fontFamily:"var(--font-display)", fontWeight:800, fontSize:"16px",
              boxShadow: tripActive ? "0 4px 16px rgba(239,68,68,0.4)" : canStart ? "0 4px 16px var(--amber-glow-strong)" : "none",
            }}>
              {tripActive ? `⏹ End · ${fmt(elapsed)}` : "▶ Start Trip"}
            </button>

            {/* Logout */}
            <button onClick={handleLogout} style={{
              flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              background:"none", border:"none", cursor:"pointer", gap:"3px", color:"var(--red)",
            }}>
              <span style={{ fontSize:"20px" }}>🚪</span>
              <span style={{ fontSize:"12px", fontWeight:600, fontFamily:"var(--font-display)" }}>Logout</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
