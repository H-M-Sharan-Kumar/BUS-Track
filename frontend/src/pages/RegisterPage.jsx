import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

const ROLES = [
  { value: "student", label: "Student", icon: "🧑‍🎓", desc: "Track buses, view ETA" },
  { value: "driver",  label: "Driver",  icon: "🚗",    desc: "Broadcast GPS, manage trips" },
  { value: "admin",   label: "Admin",   icon: "🛡️",    desc: "Monitor fleet, manage routes" },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/register", form);
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100svh",
      background: "var(--carbon)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
      fontFamily: "var(--font-body)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Background */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
        <div style={{
          position:"absolute", bottom:"-20%", right:"-10%",
          width:"500px", height:"500px", borderRadius:"50%",
          background:"radial-gradient(circle, rgba(56,189,248,0.05) 0%, transparent 70%)",
        }}/>
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.03 }}>
          <defs>
            <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--amber)"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)"/>
        </svg>
      </div>

      <div style={{ width:"100%", maxWidth:"480px", position:"relative" }} className="fade-in-up">

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:"32px" }}>
          <div style={{
            display:"inline-flex", alignItems:"center", gap:"12px", marginBottom:"16px",
          }}>
            <div style={{
              width:"44px", height:"44px", borderRadius:"12px",
              background:"linear-gradient(135deg, var(--amber), var(--amber-dim))",
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px",
              boxShadow:"0 0 24px var(--amber-glow-strong)",
            }}>🚌</div>
            <span style={{ fontFamily:"var(--font-display)", fontSize:"20px", fontWeight:700 }}>BusTrack</span>
          </div>
          <h1 style={{
            fontFamily:"var(--font-display)", fontSize:"28px", fontWeight:800,
            letterSpacing:"-1px", color:"var(--text-1)",
          }}>Create your account</h1>
          <p style={{ color:"var(--text-3)", fontSize:"13px", marginTop:"6px" }}>Join your college transit network</p>
        </div>

        {/* Card */}
        <div style={{
          background:"var(--carbon-2)",
          border:"1px solid var(--border-hi)",
          borderRadius:"20px", padding:"36px",
          boxShadow:"0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
          position:"relative", overflow:"hidden",
        }}>
          <div style={{
            position:"absolute", top:0, left:"10%", right:"10%", height:"1px",
            background:"linear-gradient(90deg, transparent, var(--sky), transparent)",
          }}/>

          {error && (
            <div style={{
              background:"var(--red-glow)", border:"1px solid rgba(248,113,113,0.3)",
              borderRadius:"8px", padding:"10px 14px",
              color:"var(--red)", fontSize:"13px", marginBottom:"20px",
              display:"flex", alignItems:"center", gap:"8px",
            }}>⚠ {error}</div>
          )}

          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:"18px" }}>

            {/* Role picker */}
            <div>
              <label style={{
                display:"block", fontSize:"11px", fontWeight:600, textTransform:"uppercase",
                letterSpacing:"0.8px", color:"var(--text-3)", marginBottom:"10px",
                fontFamily:"var(--font-mono)",
              }}>Role</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"8px" }}>
                {ROLES.map((r) => (
                  <button
                    key={r.value} type="button"
                    onClick={() => setForm({ ...form, role: r.value })}
                    style={{
                      padding:"12px 8px", borderRadius:"10px", cursor:"pointer",
                      border:`1.5px solid ${form.role === r.value ? "var(--amber)" : "var(--border-hi)"}`,
                      background: form.role === r.value ? "var(--amber-glow)" : "var(--carbon-3)",
                      textAlign:"center", transition:"all 0.2s",
                      boxShadow: form.role === r.value ? "0 0 12px var(--amber-glow)" : "none",
                    }}
                  >
                    <div style={{ fontSize:"20px", marginBottom:"4px" }}>{r.icon}</div>
                    <div style={{
                      fontSize:"11px", fontWeight:700, fontFamily:"var(--font-display)",
                      color: form.role === r.value ? "var(--amber)" : "var(--text-2)",
                    }}>{r.label}</div>
                    <div style={{ fontSize:"9px", color:"var(--text-3)", marginTop:"2px", lineHeight:1.3 }}>{r.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Text fields */}
            {[
              { label:"Full Name",  key:"name",     type:"text",     placeholder:"John Doe" },
              { label:"Email",      key:"email",     type:"email",    placeholder:"you@college.edu" },
              { label:"Password",   key:"password",  type:"password", placeholder:"Min 8 characters" },
              { label:"Phone (optional)", key:"phone", type:"tel",   placeholder:"+91 98765 43210" },
            ].map((field) => (
              <div key={field.key}>
                <label style={{
                  display:"block", fontSize:"11px", fontWeight:600, textTransform:"uppercase",
                  letterSpacing:"0.8px", color:"var(--text-3)", marginBottom:"8px",
                  fontFamily:"var(--font-mono)",
                }}>{field.label}</label>
                <input
                  type={field.type}
                  value={form[field.key]}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  required={field.key !== "phone"}
                  style={{
                    width:"100%", background:"var(--carbon-3)",
                    border:"1px solid var(--border-hi)", borderRadius:"10px",
                    padding:"12px 16px", color:"var(--text-1)",
                    fontSize:"14px", fontFamily:"var(--font-body)", outline:"none",
                    transition:"border-color 0.2s, box-shadow 0.2s",
                  }}
                  onFocus={(e) => { e.target.style.borderColor="var(--sky)"; e.target.style.boxShadow="0 0 0 3px var(--sky-glow)"; }}
                  onBlur={(e)  => { e.target.style.borderColor="var(--border-hi)"; e.target.style.boxShadow="none"; }}
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              style={{
                width:"100%",
                background: loading ? "var(--carbon-4)" : "linear-gradient(135deg, var(--amber), var(--amber-dim))",
                border:"none", borderRadius:"10px", padding:"13px",
                color: loading ? "var(--text-3)" : "#0a0600",
                fontSize:"14px", fontWeight:700, fontFamily:"var(--font-display)",
                cursor: loading ? "not-allowed" : "pointer",
                transition:"all 0.2s",
                boxShadow: loading ? "none" : "0 4px 20px var(--amber-glow-strong)",
                marginTop:"4px",
              }}
              onMouseEnter={(e) => { if(!loading) e.target.style.transform="translateY(-1px)"; }}
              onMouseLeave={(e) => { e.target.style.transform="translateY(0)"; }}
            >
              {loading ? "Creating account…" : "Create account →"}
            </button>
          </form>

          <div style={{ textAlign:"center", marginTop:"20px", fontSize:"13px", color:"var(--text-3)" }}>
            Already have an account?{" "}
            <button onClick={() => navigate("/login")}
              style={{ background:"none", border:"none", cursor:"pointer", color:"var(--amber)", fontWeight:600 }}>
              Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
