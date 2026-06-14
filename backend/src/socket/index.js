import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { liveBus } from "../config/liveStore.js";
dotenv.config();

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || "*", methods: ["GET", "POST"] },
  });

  // ── Auth middleware for socket ─────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  // Track online users: { socketId -> { id, name, role, latitude, longitude } }
  const onlineUsers = new Map();

  io.on("connection", (socket) => {
    const { id, name, role } = socket.user;
    console.log(`🔌 ${name} (${role}) connected: ${socket.id}`);

    // Add to online users (no location yet)
    onlineUsers.set(socket.id, { id, name, role, latitude: null, longitude: null });

    // Send current online users list to the newly connected client
    socket.emit("users:online", Array.from(onlineUsers.values()));

    // Announce this new user to everyone else
    socket.broadcast.emit("user:joined", { id, name, role });

    // ── User broadcasts their live location ──────────────
    socket.on("user:location", ({ latitude, longitude }) => {
      const user = onlineUsers.get(socket.id);
      if (!user) return;
      user.latitude = latitude;
      user.longitude = longitude;
      onlineUsers.set(socket.id, user);

      // Broadcast this user's updated location to ALL other clients
      socket.broadcast.emit("user:location", { id, name, role, latitude, longitude });
    });

    // ── Bus tracking rooms ───────────────────────────────
    socket.on("join:bus", (busId) => {
      socket.join(`bus:${busId}`);
    });
    socket.on("leave:bus", (busId) => {
      socket.leave(`bus:${busId}`);
    });

    // ── Disconnect ───────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`🔌 ${name} disconnected`);
      onlineUsers.delete(socket.id);
      // Tell everyone this user left
      io.emit("user:left", { id });
    });
  });

  // ── In-memory event bus for GPS updates + stop alerts ───
  liveBus.on("gps:update", (data) => {
    io.to(`bus:${data.bus_id}`).emit("bus:position", data);
  });
  liveBus.on("stop:approaching", (data) => {
    // Notify students tracking this bus that it's nearing a stop
    io.to(`bus:${data.bus_id}`).emit("bus:approaching", data);
  });

  return io;
}
