import { lazy, Suspense } from "react";

const BusMap = lazy(() => import("./BusMap"));

export default function LazyMap(props) {
  return (
    <Suspense fallback={
      <div style={{
        width:"100%", height:"100%",
        background:"var(--carbon-2)",
        display:"flex", alignItems:"center", justifyContent:"center",
        flexDirection:"column", gap:"12px",
      }}>
        <div style={{ fontSize:"32px", animation:"livePulse 1.4s ease-in-out infinite" }}>🗺️</div>
        <div style={{ fontSize:"12px", color:"var(--text-3)", fontFamily:"var(--font-mono)" }}>Loading map…</div>
      </div>
    }>
      <BusMap {...props} />
    </Suspense>
  );
}
