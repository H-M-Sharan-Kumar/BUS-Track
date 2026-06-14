import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Map layers ────────────────────────────────────────────
const MAP_LAYERS = {
  street: {
    label: "Street", icon: "🗺️",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    label: "Satellite", icon: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
  hybrid: {
    label: "Hybrid", icon: "🌍",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    overlayUrl: "https://stamen-tiles.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.png",
    attribution: "Tiles &copy; Esri; Labels &copy; Stamen",
  },
};

const ROLE_COLOR = { student: "#6366f1", driver: "#f59e0b", admin: "#ec4899" };
const ROLE_EMOJI = { student: "🧑‍🎓", driver: "🚗", admin: "👤" };

// ── Icons ─────────────────────────────────────────────────
const busIcon = (color = "#3b82f6") =>
  L.divIcon({
    className: "",
    html: `<div style="position:relative;width:44px;height:44px;">
      <div class="bus-ping" style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.35;"></div>
      <div style="position:absolute;inset:5px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 2px 10px rgba(0,0,0,0.5);">🚌</div>
    </div>`,
    iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -22],
  });

// ⭐ Driver — large, yellow, pulsing, with label
const driverIcon = (name = "") =>
  L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:60px;height:60px;display:flex;flex-direction:column;align-items:center;">
        <div style="position:absolute;inset:0;border-radius:50%;background:#f59e0b;opacity:0.25;animation:ping 1.4s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div style="position:absolute;inset:0;border-radius:50%;background:#f59e0b;opacity:0.15;animation:ping 1.4s cubic-bezier(0,0,0.2,1) infinite;animation-delay:0.3s;"></div>
        <div style="position:absolute;inset:8px;border-radius:50%;background:#f59e0b;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 3px 14px rgba(245,158,11,0.7);">🚗</div>
        <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#000;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.4);">${name}</div>
      </div>`,
    iconSize: [60, 60], iconAnchor: [30, 30], popupAnchor: [0, -34],
  });

const meIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:28px;height:28px;">
    <div style="position:absolute;inset:0;border-radius:50%;background:#6366f1;opacity:0.3;animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></div>
    <div style="position:absolute;inset:4px;border-radius:50%;background:#6366f1;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(99,102,241,0.6);"></div>
  </div>`,
  iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14],
});

const studentIcon = () =>
  L.divIcon({
    className: "",
    html: `<div style="position:relative;width:30px;height:30px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:#6366f1;opacity:0.2;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="position:absolute;inset:4px;border-radius:50%;background:#6366f1;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 1px 6px rgba(0,0,0,0.4);">🧑‍🎓</div>
    </div>`,
    iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
  });

const stopIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [14, 14], iconAnchor: [7, 7],
});

// ── Fly to ────────────────────────────────────────────────
function FlyTo({ position, zoom, trigger }) {
  const map = useMap();
  const didInit = useRef(false);

  // Fly when the "My Location" button is pressed
  useEffect(() => {
    if (position && trigger) map.flyTo(position, zoom || 17, { duration: 1.5 });
  }, [trigger]);

  // Auto-center on the user's real location the first time GPS resolves
  useEffect(() => {
    if (position && !didInit.current) {
      didInit.current = true;
      map.setView(position, 16);
    }
  }, [position]);

  return null;
}

// ── Layer switcher ────────────────────────────────────────
function LayerSwitcher({ activeLayer, onChange }) {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control({ position: "topright" });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create("div");
      div.id = "layer-switcher";
      div.style.cssText = "display:flex;flex-direction:column;gap:4px;";
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    ctrl.addTo(map);
    return () => ctrl.remove();
  }, [map]);

  useEffect(() => {
    const container = document.getElementById("layer-switcher");
    if (!container) return;
    container.innerHTML = "";
    Object.entries(MAP_LAYERS).forEach(([key, layer]) => {
      const btn = document.createElement("button");
      const isActive = key === activeLayer;
      btn.innerHTML = `<span style="font-size:15px">${layer.icon}</span><span style="font-size:11px;font-weight:600">${layer.label}</span>`;
      btn.style.cssText = `
        display:flex;align-items:center;gap:5px;padding:6px 10px;border-radius:8px;
        border:1.5px solid ${isActive ? "#3b82f6" : "#334155"};
        background:${isActive ? "#1d4ed8" : "#1e293b"};
        color:#fff;cursor:pointer;white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,0.4);`;
      btn.onclick = () => onChange(key);
      container.appendChild(btn);
    });
  }, [activeLayer, onChange]);

  return null;
}

// ── Locate button ─────────────────────────────────────────
function LocateControl({ onLocate }) {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control({ position: "bottomright" });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create("div");
      div.innerHTML = `<button id="loc-btn"
        style="width:42px;height:42px;border-radius:10px;background:#1e293b;border:1.5px solid #334155;
               color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;
               justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.5);" title="My location">📍</button>`;
      L.DomEvent.on(div.querySelector("#loc-btn"), "click", (e) => {
        L.DomEvent.stopPropagation(e);
        onLocate();
      });
      return div;
    };
    ctrl.addTo(map);
    return () => ctrl.remove();
  }, [onLocate]);
  return null;
}

// ── Main map ──────────────────────────────────────────────
export default function BusMap({
  buses, stops,
  userLocation, accuracy,
  otherUsers = [],
  trackedBusId,
  flyToUser,
  onLocate,
}) {
  const [activeLayer, setActiveLayer] = useState("satellite");
  const layer = MAP_LAYERS[activeLayer];
  const defaultCenter = userLocation || [13.0827, 80.2707];

  const drivers  = otherUsers.filter(u => u.role === "driver"  && u.latitude && u.longitude);
  const students = otherUsers.filter(u => u.role === "student" && u.latitude && u.longitude);
  const admins   = otherUsers.filter(u => u.role === "admin"   && u.latitude && u.longitude);

  return (
    <MapContainer center={defaultCenter} zoom={15} scrollWheelZoom style={{ height: "100%", width: "100%" }}>

      <TileLayer key={activeLayer} url={layer.url} attribution={layer.attribution} maxZoom={19} />
      {activeLayer === "hybrid" && layer.overlayUrl && (
        <TileLayer key="hybrid-labels" url={layer.overlayUrl} attribution="" opacity={0.8} />
      )}

      <LayerSwitcher activeLayer={activeLayer} onChange={setActiveLayer} />

      {userLocation && <FlyTo position={userLocation} zoom={17} trigger={flyToUser} />}

      {/* Accuracy circle */}
      {userLocation && accuracy && (
        <Circle center={userLocation} radius={accuracy}
          pathOptions={{ color: "#6366f1", fillColor: "#6366f1", fillOpacity: 0.08, weight: 1 }} />
      )}

      {/* My dot */}
      {userLocation && (
        <Marker position={userLocation} icon={meIcon}>
          <Popup>
            <b style={{color:"#6366f1"}}>📍 You</b>
            <div style={{fontSize:"11px",color:"#888",marginTop:"2px"}}>{userLocation[0].toFixed(5)}, {userLocation[1].toFixed(5)}</div>
            {accuracy && <div style={{fontSize:"11px",color:"#888"}}>±{Math.round(accuracy)}m</div>}
          </Popup>
        </Marker>
      )}

      {/* ⭐ DRIVERS — large highlighted markers */}
      {drivers.map((u) => (
        <Marker key={u.id} position={[u.latitude, u.longitude]} icon={driverIcon(u.name.split(" ")[0])}>
          <Popup>
            <div style={{background:"#fef3c7",borderRadius:"8px",padding:"8px 10px",minWidth:"140px"}}>
              <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"4px"}}>
                <span style={{fontSize:"18px"}}>🚗</span>
                <span style={{fontWeight:"700",fontSize:"14px",color:"#92400e"}}>Driver</span>
                <span style={{marginLeft:"auto",background:"#f59e0b",color:"#000",fontSize:"9px",fontWeight:"700",padding:"2px 6px",borderRadius:"4px"}}>LIVE</span>
              </div>
              <div style={{fontWeight:"600",fontSize:"13px",color:"#1c1917"}}>{u.name}</div>
              <div style={{fontSize:"11px",color:"#78716c",marginTop:"2px"}}>{u.latitude.toFixed(5)}, {u.longitude.toFixed(5)}</div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Students */}
      {students.map((u) => (
        <Marker key={u.id} position={[u.latitude, u.longitude]} icon={studentIcon()}>
          <Popup>
            <b>🧑‍🎓 {u.name}</b>
            <div style={{fontSize:"11px",color:"#888",textTransform:"capitalize"}}>{u.role}</div>
          </Popup>
        </Marker>
      ))}

      {/* Admins */}
      {admins.map((u) => (
        <Marker key={u.id} position={[u.latitude, u.longitude]}
          icon={L.divIcon({
            className:"",
            html:`<div style="width:32px;height:32px;border-radius:50%;background:#ec4899;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.4);">👤</div>`,
            iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-16]
          })}>
          <Popup>
            <b>👤 {u.name}</b>
            <div style={{fontSize:"11px",color:"#888"}}>Admin</div>
          </Popup>
        </Marker>
      ))}

      {/* Bus stops */}
      {stops.map((stop) => (
        <Marker key={stop.id} position={[stop.latitude, stop.longitude]} icon={stopIcon}>
          <Popup>
            <b>{stop.name}</b>
            {stop.address && <div style={{fontSize:"11px",color:"#888"}}>{stop.address}</div>}
          </Popup>
        </Marker>
      ))}

      {/* Buses */}
      {buses.map((bus) => {
        if (!bus.latitude || !bus.longitude) return null;
        const isTracked = bus.id === trackedBusId;
        const eta = bus._eta;
        return (
          <Marker key={bus.id} position={[bus.latitude, bus.longitude]}
            icon={busIcon(isTracked ? "#22c55e" : "#3b82f6")}>
            <Popup>
              <div style={{minWidth:"160px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"6px"}}>
                  <span style={{fontSize:"18px"}}>🚌</span>
                  <span style={{fontWeight:"700",fontSize:"14px"}}>{bus.bus_number}</span>
                  {isTracked && <span style={{marginLeft:"auto",background:"#22c55e",color:"#fff",fontSize:"9px",fontWeight:"700",padding:"2px 6px",borderRadius:"4px"}}>TRACKING</span>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
                  <div style={{background:"#f1f5f9",borderRadius:"6px",padding:"5px 7px"}}>
                    <div style={{fontSize:"9px",color:"#94a3b8",fontWeight:"600",textTransform:"uppercase"}}>Speed</div>
                    <div style={{fontSize:"13px",fontWeight:"700",color:"#0f172a"}}>
                      {bus.speed != null ? `${Math.round(bus.speed)} km/h` : "—"}
                    </div>
                  </div>
                  <div style={{background:"#f1f5f9",borderRadius:"6px",padding:"5px 7px"}}>
                    <div style={{fontSize:"9px",color:"#94a3b8",fontWeight:"600",textTransform:"uppercase"}}>Distance</div>
                    <div style={{fontSize:"13px",fontWeight:"700",color:"#0f172a"}}>
                      {eta ? `${eta.distanceKm < 1 ? (eta.distanceKm * 1000).toFixed(0) + "m" : eta.distanceKm.toFixed(1) + "km"}` : "—"}
                    </div>
                  </div>
                  <div style={{background:"#dcfce7",borderRadius:"6px",padding:"5px 7px"}}>
                    <div style={{fontSize:"9px",color:"#16a34a",fontWeight:"600",textTransform:"uppercase"}}>ETA</div>
                    <div style={{fontSize:"13px",fontWeight:"700",color:"#15803d"}}>
                      {eta ? (eta.etaMin < 1 ? "< 1 min" : `${eta.etaMin} min`) : "—"}
                    </div>
                  </div>
                  <div style={{background:"#dbeafe",borderRadius:"6px",padding:"5px 7px"}}>
                    <div style={{fontSize:"9px",color:"#2563eb",fontWeight:"600",textTransform:"uppercase"}}>Arrives</div>
                    <div style={{fontSize:"13px",fontWeight:"700",color:"#1d4ed8"}}>
                      {eta ? eta.arrivalTime : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      <LocateControl onLocate={onLocate} />
    </MapContainer>
  );
}
