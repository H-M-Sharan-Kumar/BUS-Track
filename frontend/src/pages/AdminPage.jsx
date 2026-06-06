import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import useAuthStore from "../store/authStore";
import { useIsMobile } from "../hooks/useMediaQuery";

const ROLE_EMOJI = { student: "🧑‍🎓", driver: "🚗", admin: "🛡️" };

export default function AdminPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [stats, setStats] = useState(null);
  const [buses, setBuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [tab, setTab] = useState("fleet"); // fleet | users
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [s, b, u, d] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/buses"),
        api.get("/admin/users"),
        api.get("/admin/drivers"),
      ]);
      setStats(s.data);
      setBuses(b.data.buses || []);
      setUsers(u.data.users || []);
      setDrivers(d.data.drivers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000); // refresh live status every 8s
    return () => clearInterval(iv);
  }, [load]);

  const assignDriver = async (busId, driverId) => {
    await api.patch(`/admin/buses/${busId}/assign`, { driver_id: driverId });
    load();
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
          boxShadow:"0 0 16px rgba(236,72,153,0.3)",
        }}>🛡️</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"15px" }}>Admin Dashboard</div>
          <div style={{ fontSize:"11px", color:"var(--text-3)" }}>{user?.name}</div>
        </div>
        <button onClick={handleLogout} style={{
          display:"flex", alignItems:"center", gap:"5px",
          background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)",
          borderRadius:"8px", padding:"7px 12px",
          color:"var(--red)", fontSize:"12px", fontWeight:600, cursor:"pointer",
        }}>🚪 Logout</button>
      </div>

      <div style={{ padding: isMobile ? "16px" : "24px", maxWidth:"1200px", margin:"0 auto" }}>

        {loading ? (
          <div style={{ textAlign:"center", padding:"60px", color:"var(--text-3)" }}>Loading dashboard…</div>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{
              display:"grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, 1fr)",
              gap:"12px", marginBottom:"24px",
            }}>
              {STAT_CARDS.map((s) => (
                <div key={s.label} style={{
                  background:"var(--carbon-2)", border:"1px solid var(--border)",
                  borderRadius:"14px", padding:"16px",
                }}>
                  <div style={{ fontSize:"22px", marginBottom:"6px" }}>{s.icon}</div>
                  <div style={{ fontFamily:"var(--font-mono)", fontSize:"28px", fontWeight:700, color:s.color, lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:"11px", color:"var(--text-3)", marginTop:"4px", fontWeight:600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:"8px", marginBottom:"16px" }}>
              {[{k:"fleet",l:"🚌 Fleet"},{k:"users",l:"👥 Users"}].map(t => (
                <button key={t.k} onClick={() => setTab(t.k)} style={{
                  padding:"8px 18px", borderRadius:"10px", cursor:"pointer",
                  border:`1px solid ${tab===t.k ? "var(--amber)" : "var(--border)"}`,
                  background: tab===t.k ? "rgba(245,166,35,0.12)" : "var(--carbon-2)",
                  color: tab===t.k ? "var(--amber)" : "var(--text-2)",
                  fontWeight:700, fontFamily:"var(--font-display)", fontSize:"13px",
                }}>{t.l}</button>
              ))}
            </div>

            {/* Fleet tab */}
            {tab === "fleet" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                {buses.map((b) => (
                  <div key={b.id} style={{
                    background:"var(--carbon-2)", border:"1px solid var(--border)",
                    borderRadius:"12px", padding:"14px",
                    display:"flex", alignItems:"center", gap:"14px",
                    flexWrap: isMobile ? "wrap" : "nowrap",
                  }}>
                    <div style={{
                      width:"42px", height:"42px", borderRadius:"10px", flexShrink:0,
                      background:"var(--carbon-4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px",
                    }}>🚌</div>
                    <div style={{ flex:1, minWidth:"120px" }}>
                      <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:"14px" }}>{b.bus_number}</div>
                      <div style={{ fontSize:"11px", color:"var(--text-3)" }}>{b.route_name || "No route"}</div>
                    </div>
                    {/* Live badge */}
                    <div style={{
                      display:"flex", alignItems:"center", gap:"6px",
                      background: b.isLive ? "rgba(34,197,94,0.12)" : "var(--carbon-3)",
                      border:`1px solid ${b.isLive ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                      borderRadius:"8px", padding:"5px 10px",
                    }}>
                      <span className={b.isLive ? "live-dot" : ""} style={{
                        width:"7px", height:"7px", borderRadius:"50%",
                        background: b.isLive ? "var(--green)" : "var(--text-3)",
                      }}/>
                      <span style={{ fontSize:"10px", fontWeight:700, fontFamily:"var(--font-mono)",
                        color: b.isLive ? "var(--green)" : "var(--text-3)" }}>
                        {b.isLive ? "LIVE" : "OFFLINE"}
                      </span>
                    </div>
                    {/* Driver assign */}
                    <select
                      value={b.driver_id || ""}
                      onChange={(e) => assignDriver(b.id, e.target.value)}
                      style={{
                        background:"var(--carbon-3)", border:"1px solid var(--border-hi)",
                        borderRadius:"8px", padding:"7px 10px", color:"var(--text-1)",
                        fontSize:"12px", fontFamily:"var(--font-body)", cursor:"pointer",
                        minWidth:"150px",
                      }}
                    >
                      <option value="">— No driver —</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {buses.length === 0 && (
                  <div style={{ textAlign:"center", padding:"40px", color:"var(--text-3)" }}>No buses found</div>
                )}
              </div>
            )}

            {/* Users tab */}
            {tab === "users" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {users.map((u) => (
                  <div key={u.id} style={{
                    background:"var(--carbon-2)", border:"1px solid var(--border)",
                    borderRadius:"12px", padding:"12px 14px",
                    display:"flex", alignItems:"center", gap:"12px",
                  }}>
                    <div style={{
                      width:"38px", height:"38px", borderRadius:"50%", flexShrink:0,
                      background:"var(--carbon-4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px",
                    }}>{ROLE_EMOJI[u.role] || "👤"}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:"13px" }}>{u.name}</div>
                      <div style={{ fontSize:"11px", color:"var(--text-3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.email}</div>
                    </div>
                    <span style={{
                      fontSize:"10px", fontWeight:700, textTransform:"uppercase",
                      fontFamily:"var(--font-mono)", letterSpacing:"0.5px",
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
    </div>
  );
}
