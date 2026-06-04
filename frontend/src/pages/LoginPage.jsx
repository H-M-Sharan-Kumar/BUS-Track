import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import useAuthStore from "../store/authStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", form);
      login(data.token, data.user);
      if (data.user.role === "driver") navigate("/driver");
      else if (data.user.role === "admin") navigate("/admin");
      else navigate("/student");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100svh",
      background: "var(--carbon)",
      display: "flex",
      fontFamily: "var(--font-body)",
      overflow: "hidden",
      position: "relative",
    }}>

      {/* ── Ambient background geometry ── */}
      <div style={{
        position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
      }}>
        {/* Large amber orb */}
        <div style={{
          position: "absolute", top: "-20%", left: "-10%",
          width: "600px", height: "600px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245,166,35,0.07) 0%, transparent 70%)",
        }}/>
        {/* Grid lines */}
        <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.04 }}>
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="var(--amber)" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)"/>
        </svg>
        {/* Route dots */}
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            left: `${15 + i * 14}%`,
            top: `${20 + (i % 3) * 25}%`,
            width: "4px", height: "4px", borderRadius: "50%",
            background: "var(--amber)",
            opacity: 0.15 + (i * 0.05),
          }}/>
        ))}
        {/* Vertical accent line */}
        <div style={{
          position: "absolute", right: "42%", top: 0, bottom: 0,
          width: "1px",
          background: "linear-gradient(180deg, transparent, rgba(245,166,35,0.1) 30%, rgba(245,166,35,0.1) 70%, transparent)",
        }}/>
      </div>

      {/* ── Left brand panel ── */}
      <div style={{
        width: "46%", display: "flex", flexDirection: "column",
        justifyContent: "center", padding: "60px",
        position: "relative",
      }} className="fade-in-up">
        {/* Logo mark */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "14px", marginBottom: "48px",
        }}>
          <div style={{
            width: "52px", height: "52px", borderRadius: "14px",
            background: "linear-gradient(135deg, var(--amber) 0%, var(--amber-dim) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "24px",
            boxShadow: "0 0 32px var(--amber-glow-strong)",
          }}>🚌</div>
          <span style={{
            fontFamily: "var(--font-display)",
            fontSize: "22px", fontWeight: 700,
            color: "var(--text-1)", letterSpacing: "-0.5px",
          }}>BusTrack</span>
        </div>

        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(42px, 4vw, 60px)",
          fontWeight: 800, lineHeight: 1.05,
          letterSpacing: "-2px",
          marginBottom: "20px",
        }}>
          <span style={{ color: "var(--text-1)" }}>Real-time</span><br/>
          <span className="shimmer-text">Transit</span><br/>
          <span style={{ color: "var(--text-1)" }}>Tracking.</span>
        </h1>

        <p style={{ color: "var(--text-2)", fontSize: "15px", lineHeight: 1.7, maxWidth: "340px" }}>
          Know exactly where your bus is, how fast it's moving, and when it arrives — live, every 4 seconds.
        </p>

        {/* Feature pills */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "40px" }}>
          {[
            { icon: "📍", label: "Live GPS positions" },
            { icon: "⚡", label: "4-second updates" },
            { icon: "🛰️", label: "Satellite map view" },
          ].map((f) => (
            <div key={f.label} style={{
              display: "inline-flex", alignItems: "center", gap: "10px",
              padding: "8px 14px",
              background: "var(--carbon-2)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              width: "fit-content",
            }}>
              <span style={{ fontSize: "14px" }}>{f.icon}</span>
              <span style={{ fontSize: "13px", color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px",
      }}>
        <div style={{ width: "100%", maxWidth: "400px" }} className="fade-in-up-2">

          {/* Card */}
          <div style={{
            background: "var(--carbon-2)",
            border: "1px solid var(--border-hi)",
            borderRadius: "20px",
            padding: "40px",
            boxShadow: "0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
            position: "relative", overflow: "hidden",
          }}>
            {/* Top accent bar */}
            <div style={{
              position: "absolute", top: 0, left: "10%", right: "10%", height: "1px",
              background: "linear-gradient(90deg, transparent, var(--amber), transparent)",
            }}/>

            <h2 style={{
              fontFamily: "var(--font-display)",
              fontSize: "26px", fontWeight: 700,
              letterSpacing: "-0.5px",
              marginBottom: "8px",
              color: "var(--text-1)",
            }}>Sign in</h2>
            <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: "28px" }}>
              Enter your credentials to continue
            </p>

            {error && (
              <div style={{
                background: "var(--red-glow)", border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: "8px", padding: "10px 14px",
                color: "var(--red)", fontSize: "13px", marginBottom: "20px",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <span>⚠</span> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {[
                { label: "Email", key: "email", type: "email", placeholder: "you@college.edu" },
                { label: "Password", key: "password", type: "password", placeholder: "••••••••" },
              ].map((field) => (
                <div key={field.key}>
                  <label style={{
                    display: "block", fontSize: "11px", fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.8px",
                    color: "var(--text-3)", marginBottom: "8px",
                    fontFamily: "var(--font-mono)",
                  }}>{field.label}</label>
                  <input
                    type={field.type}
                    value={form[field.key]}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    required
                    style={{
                      width: "100%",
                      background: "var(--carbon-3)",
                      border: "1px solid var(--border-hi)",
                      borderRadius: "10px",
                      padding: "12px 16px",
                      color: "var(--text-1)",
                      fontSize: "14px",
                      fontFamily: "var(--font-body)",
                      outline: "none",
                      transition: "border-color 0.2s, box-shadow 0.2s",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "var(--amber)";
                      e.target.style.boxShadow = "0 0 0 3px var(--amber-glow)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "var(--border-hi)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                </div>
              ))}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  background: loading
                    ? "var(--carbon-4)"
                    : "linear-gradient(135deg, var(--amber) 0%, var(--amber-dim) 100%)",
                  border: "none",
                  borderRadius: "10px",
                  padding: "13px",
                  color: loading ? "var(--text-3)" : "#0a0600",
                  fontSize: "14px",
                  fontWeight: 700,
                  fontFamily: "var(--font-display)",
                  letterSpacing: "0.3px",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  boxShadow: loading ? "none" : "0 4px 20px var(--amber-glow-strong)",
                  marginTop: "4px",
                }}
                onMouseEnter={(e) => { if (!loading) e.target.style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; }}
              >
                {loading ? "Signing in…" : "Sign in →"}
              </button>
            </form>

            <div style={{
              textAlign: "center", marginTop: "24px",
              fontSize: "13px", color: "var(--text-3)",
            }}>
              No account?{" "}
              <button
                onClick={() => navigate("/register")}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--amber)", fontWeight: 600, fontSize: "13px",
                }}
              >
                Register here
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
