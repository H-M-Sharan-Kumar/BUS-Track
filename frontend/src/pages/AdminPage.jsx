import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import useAuthStore from "../store/authStore";
import { useIsMobile } from "../hooks/useMediaQuery";

const ROLE_EMOJI = { student: "🧑‍🎓", driver: "🚗", admin: "🛡️" };

// Compress an image file to a small base64 thumbnail
function compressImage(file, maxSize = 200) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = img.width * scale, h = img.height * scale;
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function AdminPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [stats, setStats] = useState(null);
  const [buses, setBuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [tab, setTab] = useState("fleet"); // fleet | stops | users
  const [loading, setLoading] = useState(true);

  // Add Bus modal
  const [showAddBus, setShowAddBus] = useState(false);
  const [busForm, setBusForm] = useState({ bus_number: "", capacity: 50, route_id: "", driver_name: "", driver_photo: "" });
  const [savingBus, setSavingBus] = useState(false);

  // Stops
  const [stopRoute, setStopRoute] = useState("");
  const [stops, setStops] = useState([]);
  const [stopForm, setStopForm] = useState({ name: "", address: "", eta_offset: "" });
  const [savingStop, setSavingStop] = useState(false);
  const [stopMsg, setStopMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, b, u, d, r] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/buses"),
        api.get("/admin/users"),
        api.get("/admin/drivers"),
        api.get("/admin/routes"),
      ]);
      setStats(s.data);
      setBuses(b.data.buses || []);
      setUsers(u.data.users || []);
      setDrivers(d.data.drivers || []);
      setRoutes(r.data.routes || []);
      if (!stopRoute && r.data.routes?.length) setStopRoute(r.data.routes[0].id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [stopRoute]);

  useEffect(() => {
    load();
    const iv = setInterval(() => {
      api.get("/admin/buses").then(b => setBuses(b.data.buses || [])).catch(()=>{});
    }, 8000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line

  // Load stops when route changes
  useEffect(() => {
    if (!stopRoute) return;
    api.get(`/admin/stops?route_id=${stopRoute}`).then(r => setStops(r.data.stops || [])).catch(()=>{});
  }, [stopRoute]);

  const assignDriver = async (busId, driverId) => {
    await api.patch(`/admin/buses/${busId}/assign`, { driver_id: driverId });
    load();
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setBusForm((f) => ({ ...f, driver_photo: compressed }));
  };

  const submitBus = async () => {
    if (!busForm.bus_number) return;
    setSavingBus(true);
    try {
      await api.post("/admin/buses", busForm);
      setShowAddBus(false);
      setBusForm({ bus_number: "", capacity: 50, route_id: "", driver_name: "", driver_photo: "" });
      load();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to add bus");
    } finally { setSavingBus(false); }
  };

  const deleteBus = async (id) => {
    if (!confirm("Delete this bus?")) return;
    await api.delete(`/admin/buses/${id}`);
    load();
  };

  const submitStop = async () => {
    if (!stopForm.name || (!stopForm.address)) { setStopMsg("Enter stop name and address"); return; }
    setSavingStop(true); setStopMsg("Pinning location…");
    try {
      await api.post("/admin/stops", { ...stopForm, route_id: stopRoute, eta_offset: Number(stopForm.eta_offset) || 0 });
      setStopForm({ name: "", address: "", eta_offset: "" });
      setStopMsg("✓ Stop added & pinned");
      const r = await api.get(`/admin/stops?route_id=${stopRoute}`);
      setStops(r.data.stops || []);
    } catch (e) {
      setStopMsg(e.response?.data?.error || "Failed to add stop");
    } finally { setSavingStop(false); }
  };

  const deleteStop = async (id) => {
    await api.delete(`/admin/stops/${id}`);
    setStops((s) => s.filter((x) => x.id !== id));
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const STAT_CARDS = stats ? [
    { label: "Total Users",  value: stats.totalUsers,  icon: "👥", color: "#3B82F6" },
    { label: "Students",     value: stats.students,    icon: "🧑‍🎓", color: "#6366F1" },
    { label: "Drivers",      value: stats.drivers,     icon: "🚗", color: "#F5A623" },
    { label: "Active Buses", value: stats.activeBuses, icon: "🚌", color: "#22C55E" },
    { label: "Active Trips", value: stats.activeTrips, icon: "📡", color: "#EC4899" },
    { label: "Routes",       value: stats.activeRoutes,icon: "🛣️", color: "#8B5CF6" },
  ] : [];

  const inputStyle = {
    width:"100%", background:"var(--carbon-3)", border:"1px solid var(--border-hi)",
    borderRadius:"8px", padding:"10px 12px", color:"var(--text-1)",
    fontSize:"15px", fontFamily:"var(--font-body)", outline:"none", marginTop:"4px",
  };
  const labelStyle = { fontSize:"13px", fontWeight:600, color:"var(--text-3)", textTransform:"uppercase", letterSpacing:"0.5px", fontFamily:"var(--font-mono)" };

  return (
    <div style={{ minHeight:"100svh", background:"var(--carbon)", fontFamily:"var(--font-body)", color:"var(--text-1)" }}>

      {/* Top bar */}
      <div style={{
        display:"flex", alignItems:"center", gap:"12px",
        padding: isMobile ? "12px 14px" : "14px 24px",
        background:"var(--carbon-1)", borderBottom:"1px solid var(--border)",
        position:"sticky", top:0, zIndex:10,
      }}>
        <div style={{
          width:"38px", height:"38px", borderRadius:"10px",
          background:"linear-gradient(135deg, #EC4899, #BE185D)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px",
        }}>🛡️</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"15px" }}>Admin Dashboard</div>
          <div style={{ fontSize:"13px", color:"var(--text-3)" }}>{user?.name}</div>
        </div>
        <button onClick={handleLogout} style={{
          background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)",
          borderRadius:"8px", padding:"7px 12px", color:"var(--red)", fontSize:"14px", fontWeight:600, cursor:"pointer",
        }}>🚪 Logout</button>
      </div>

      <div style={{ padding: isMobile ? "16px" : "24px", maxWidth:"1200px", margin:"0 auto" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:"60px", color:"var(--text-3)" }}>Loading dashboard…</div>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, 1fr)", gap:"12px", marginBottom:"24px" }}>
              {STAT_CARDS.map((s) => (
                <div key={s.label} style={{ background:"var(--carbon-2)", border:"1px solid var(--border)", borderRadius:"14px", padding:"16px" }}>
                  <div style={{ fontSize:"22px", marginBottom:"6px" }}>{s.icon}</div>
                  <div style={{ fontFamily:"var(--font-mono)", fontSize:"28px", fontWeight:700, color:s.color, lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:"13px", color:"var(--text-3)", marginTop:"4px", fontWeight:600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:"8px", marginBottom:"16px", flexWrap:"wrap" }}>
              {[{k:"fleet",l:"🚌 Fleet"},{k:"stops",l:"📍 Stops"},{k:"users",l:"👥 Users"}].map(t => (
                <button key={t.k} onClick={() => setTab(t.k)} style={{
                  padding:"8px 18px", borderRadius:"10px", cursor:"pointer",
                  border:`1px solid ${tab===t.k ? "var(--amber)" : "var(--border)"}`,
                  background: tab===t.k ? "rgba(245,166,35,0.12)" : "var(--carbon-2)",
                  color: tab===t.k ? "var(--amber)" : "var(--text-2)",
                  fontWeight:700, fontFamily:"var(--font-display)", fontSize:"15px",
                }}>{t.l}</button>
              ))}
            </div>

            {/* ── FLEET ── */}
            {tab === "fleet" && (
              <div>
                <button onClick={() => setShowAddBus(true)} style={{
                  marginBottom:"14px", background:"linear-gradient(135deg,var(--amber),var(--amber-dim))",
                  border:"none", borderRadius:"10px", padding:"10px 18px", color:"#0a0600",
                  fontWeight:700, fontFamily:"var(--font-display)", fontSize:"15px", cursor:"pointer",
                }}>+ Add New Bus</button>

                <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                  {buses.map((b) => (
                    <div key={b.id} style={{
                      background:"var(--carbon-2)", border:"1px solid var(--border)", borderRadius:"12px",
                      padding:"14px", display:"flex", alignItems:"center", gap:"14px", flexWrap: isMobile ? "wrap" : "nowrap",
                    }}>
                      {/* Driver photo or bus icon */}
                      {b.driver_photo ? (
                        <img src={b.driver_photo} alt="driver" style={{ width:"44px", height:"44px", borderRadius:"10px", objectFit:"cover", flexShrink:0 }}/>
                      ) : (
                        <div style={{ width:"44px", height:"44px", borderRadius:"10px", flexShrink:0, background:"var(--carbon-4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px" }}>🚌</div>
                      )}
                      <div style={{ flex:1, minWidth:"120px" }}>
                        <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"16px" }}>{b.bus_number}</div>
                        <div style={{ fontSize:"13px", color:"var(--text-3)" }}>
                          {(b.driver_name || b.driver_name) ? `Driver: ${b.driver_name}` : "No driver"} · {b.route_name || "No route"} · {b.capacity} seats
                        </div>
                      </div>
                      <div style={{
                        display:"flex", alignItems:"center", gap:"6px",
                        background: b.isLive ? "rgba(34,197,94,0.12)" : "var(--carbon-3)",
                        border:`1px solid ${b.isLive ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                        borderRadius:"8px", padding:"5px 10px",
                      }}>
                        <span className={b.isLive ? "live-dot" : ""} style={{ width:"7px", height:"7px", borderRadius:"50%", background: b.isLive ? "var(--green)" : "var(--text-3)" }}/>
                        <span style={{ fontSize:"12px", fontWeight:700, fontFamily:"var(--font-mono)", color: b.isLive ? "var(--green)" : "var(--text-3)" }}>{b.isLive ? "LIVE" : "OFFLINE"}</span>
                      </div>
                      <select value={b.driver_id || ""} onChange={(e) => assignDriver(b.id, e.target.value)} style={{
                        background:"var(--carbon-3)", border:"1px solid var(--border-hi)", borderRadius:"8px",
                        padding:"7px 10px", color:"var(--text-1)", fontSize:"14px", cursor:"pointer", minWidth:"140px",
                      }}>
                        <option value="">— Link account —</option>
                        {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button onClick={() => deleteBus(b.id)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:"16px" }}>🗑️</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── STOPS ── */}
            {tab === "stops" && (
              <div>
                {/* Route selector */}
                <div style={{ marginBottom:"16px" }}>
                  <label style={labelStyle}>Route</label>
                  <select value={stopRoute} onChange={(e) => setStopRoute(e.target.value)} style={{ ...inputStyle, maxWidth:"360px" }}>
                    {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                {/* Add stop form */}
                <div style={{ background:"var(--carbon-2)", border:"1px solid var(--border)", borderRadius:"14px", padding:"16px", marginBottom:"20px" }}>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"16px", marginBottom:"12px" }}>📍 Add a Stop</div>
                  <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.5fr 0.8fr", gap:"12px", alignItems:"end" }}>
                    <div>
                      <label style={labelStyle}>Stop Name</label>
                      <input value={stopForm.name} onChange={(e) => setStopForm({ ...stopForm, name: e.target.value })} placeholder="e.g. Main Gate" style={inputStyle}/>
                    </div>
                    <div>
                      <label style={labelStyle}>Address / Place (auto-pinned)</label>
                      <input value={stopForm.address} onChange={(e) => setStopForm({ ...stopForm, address: e.target.value })} placeholder="e.g. Anna Nagar, Chennai" style={inputStyle}/>
                    </div>
                    <div>
                      <label style={labelStyle}>ETA offset (min)</label>
                      <input type="number" value={stopForm.eta_offset} onChange={(e) => setStopForm({ ...stopForm, eta_offset: e.target.value })} placeholder="0" style={inputStyle}/>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:"12px", marginTop:"14px" }}>
                    <button onClick={submitStop} disabled={savingStop} style={{
                      background:"linear-gradient(135deg,var(--amber),var(--amber-dim))", border:"none", borderRadius:"8px",
                      padding:"9px 18px", color:"#0a0600", fontWeight:700, fontFamily:"var(--font-display)", fontSize:"15px",
                      cursor: savingStop ? "wait" : "pointer", opacity: savingStop ? 0.6 : 1,
                    }}>{savingStop ? "Pinning…" : "+ Add Stop"}</button>
                    {stopMsg && <span style={{ fontSize:"14px", color: stopMsg.startsWith("✓") ? "var(--green)" : "var(--text-3)" }}>{stopMsg}</span>}
                  </div>
                </div>

                {/* Stop list */}
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  {stops.map((s, i) => (
                    <div key={s.id} style={{ background:"var(--carbon-2)", border:"1px solid var(--border)", borderRadius:"12px", padding:"12px 14px", display:"flex", alignItems:"center", gap:"12px" }}>
                      <div style={{ width:"30px", height:"30px", borderRadius:"50%", flexShrink:0, background:"var(--carbon-4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px", fontWeight:700, fontFamily:"var(--font-mono)", color:"var(--amber)" }}>{s.stop_order ?? i + 1}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:"15px" }}>{s.name}</div>
                        <div style={{ fontSize:"13px", color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>
                          📍 {Number(s.latitude).toFixed(5)}, {Number(s.longitude).toFixed(5)} {s.eta_offset ? `· +${s.eta_offset} min` : ""}
                        </div>
                      </div>
                      <button onClick={() => deleteStop(s.id)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:"15px" }}>🗑️</button>
                    </div>
                  ))}
                  {stops.length === 0 && <div style={{ textAlign:"center", padding:"30px", color:"var(--text-3)", fontSize:"15px" }}>No stops on this route yet</div>}
                </div>
              </div>
            )}

            {/* ── USERS ── */}
            {tab === "users" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {users.map((u) => (
                  <div key={u.id} style={{ background:"var(--carbon-2)", border:"1px solid var(--border)", borderRadius:"12px", padding:"12px 14px", display:"flex", alignItems:"center", gap:"12px" }}>
                    <div style={{ width:"38px", height:"38px", borderRadius:"50%", flexShrink:0, background:"var(--carbon-4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>{ROLE_EMOJI[u.role] || "👤"}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:"15px" }}>{u.name}</div>
                      <div style={{ fontSize:"13px", color:"var(--text-3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.email}</div>
                    </div>
                    <span style={{
                      fontSize:"12px", fontWeight:700, textTransform:"uppercase", fontFamily:"var(--font-mono)",
                      color: u.role==="admin" ? "#EC4899" : u.role==="driver" ? "var(--amber)" : "#6366F1",
                      background: u.role==="admin" ? "rgba(236,72,153,0.1)" : u.role==="driver" ? "rgba(245,166,35,0.1)" : "rgba(99,102,241,0.1)",
                      padding:"4px 10px", borderRadius:"6px",
                    }}>{u.role}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Add Bus Modal ── */}
      {showAddBus && (
        <div onClick={() => setShowAddBus(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"16px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background:"var(--carbon-1)", border:"1px solid var(--border-hi)", borderRadius:"16px", padding:"24px", width:"100%", maxWidth:"440px" }}>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"18px", marginBottom:"18px" }}>🚌 Add New Bus</div>

            {/* Photo */}
            <div style={{ display:"flex", alignItems:"center", gap:"14px", marginBottom:"16px" }}>
              <div style={{ width:"64px", height:"64px", borderRadius:"12px", background:"var(--carbon-3)", border:"1px solid var(--border-hi)", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
                {busForm.driver_photo ? <img src={busForm.driver_photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : <span style={{ fontSize:"24px" }}>📷</span>}
              </div>
              <label style={{ ...inputStyle, cursor:"pointer", textAlign:"center", marginTop:0, padding:"10px" }}>
                Upload Driver Photo
                <input type="file" accept="image/*" onChange={handlePhoto} style={{ display:"none" }}/>
              </label>
            </div>

            <div style={{ marginBottom:"12px" }}>
              <label style={labelStyle}>Bus Number *</label>
              <input value={busForm.bus_number} onChange={(e) => setBusForm({ ...busForm, bus_number: e.target.value })} placeholder="TN-01-AB-1234" style={inputStyle}/>
            </div>
            <div style={{ marginBottom:"12px" }}>
              <label style={labelStyle}>Driver Name</label>
              <input value={busForm.driver_name} onChange={(e) => setBusForm({ ...busForm, driver_name: e.target.value })} placeholder="John Doe" style={inputStyle}/>
            </div>
            <div style={{ display:"flex", gap:"12px", marginBottom:"12px" }}>
              <div style={{ flex:1 }}>
                <label style={labelStyle}>Capacity</label>
                <input type="number" value={busForm.capacity} onChange={(e) => setBusForm({ ...busForm, capacity: e.target.value })} style={inputStyle}/>
              </div>
              <div style={{ flex:2 }}>
                <label style={labelStyle}>Route</label>
                <select value={busForm.route_id} onChange={(e) => setBusForm({ ...busForm, route_id: e.target.value })} style={inputStyle}>
                  <option value="">— Select route —</option>
                  {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display:"flex", gap:"10px", marginTop:"18px" }}>
              <button onClick={() => setShowAddBus(false)} style={{ flex:1, background:"var(--carbon-3)", border:"1px solid var(--border-hi)", borderRadius:"8px", padding:"11px", color:"var(--text-2)", fontWeight:600, cursor:"pointer" }}>Cancel</button>
              <button onClick={submitBus} disabled={savingBus || !busForm.bus_number} style={{ flex:1, background:"linear-gradient(135deg,var(--amber),var(--amber-dim))", border:"none", borderRadius:"8px", padding:"11px", color:"#0a0600", fontWeight:700, fontFamily:"var(--font-display)", cursor:"pointer", opacity: (savingBus || !busForm.bus_number) ? 0.5 : 1 }}>{savingBus ? "Saving…" : "Add Bus"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
