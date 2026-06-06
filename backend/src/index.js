import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import authRoutes from "./routes/auth.js";
import locationRoutes from "./routes/location.js";
import busRoutes from "./routes/buses.js";
import tripRoutes from "./routes/trips.js";
import adminRoutes from "./routes/admin.js";
import stopRoutes from "./routes/stops.js";
import { initSocket } from "./socket/index.js";

const app = express();
const httpServer = http.createServer(app);

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

// ── Serve frontend static files ─────────────────────────────
const distPath = path.join(__dirname, "../../frontend/dist");
app.use(express.static(distPath, {
  maxAge: "1y",           // cache assets for 1 year (they have hashed names)
  etag: true,
  setHeaders(res, filePath) {
    // Don't cache index.html or service worker
    if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
}));

// ── API Routes ──────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/buses", busRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/stops", stopRoutes);

// ── SPA fallback — send index.html for all non-API routes ──
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(distPath, "index.html"));
  }
});

// ── WebSocket ───────────────────────────────────────────────
initSocket(httpServer);

// ── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚌 BusTrack backend running on port ${PORT}`);
});
