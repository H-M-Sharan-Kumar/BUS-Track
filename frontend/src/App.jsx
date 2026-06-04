import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import ProtectedRoute from "./components/ProtectedRoute";

// Lazy-load every page — each becomes a separate chunk
// Login loads instantly (~12KB), map only downloads when user navigates to it
const LoginPage    = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const StudentPage  = lazy(() => import("./pages/StudentPage"));
const DriverPage   = lazy(() => import("./pages/DriverPage"));

const AdminPage = lazy(() => Promise.resolve({
  default: () => (
    <div style={{ minHeight:"100svh", background:"var(--carbon)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-1)", fontFamily:"var(--font-display)", fontSize:"20px" }}>
      📊 Admin Dashboard — Coming soon
    </div>
  )
}));

// Minimal splash shown while a chunk downloads
function PageLoader() {
  return (
    <div style={{
      minHeight: "100svh",
      background: "var(--carbon)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: "16px",
    }}>
      <div style={{
        width: "48px", height: "48px", borderRadius: "14px",
        background: "linear-gradient(135deg, #f5a623, #c47f10)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "24px",
        boxShadow: "0 0 32px rgba(245,166,35,0.4)",
        animation: "livePulse 1.2s ease-in-out infinite",
      }}>🚌</div>
      <div style={{
        width: "120px", height: "3px", borderRadius: "2px",
        background: "var(--carbon-4)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: "2px",
          background: "linear-gradient(90deg, var(--amber), var(--amber-dim))",
          animation: "shimmer 1.2s linear infinite",
          backgroundSize: "200% auto",
        }}/>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/student" element={<ProtectedRoute role="student"><StudentPage /></ProtectedRoute>} />
          <Route path="/driver"  element={<ProtectedRoute role="driver"><DriverPage /></ProtectedRoute>} />
          <Route path="/admin"   element={<ProtectedRoute role="admin"><AdminPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
