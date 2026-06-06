import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.REDIS_URL || "redis://localhost:6379";

// Only use TLS if the URL explicitly asks for it (rediss://).
// Railway's internal Redis uses plain redis:// — forcing TLS causes
// endless connection retries that hang every Redis call.
const useTls = url.startsWith("rediss://");

const redis = new Redis(url, {
  ...(useTls ? { tls: {} } : {}),
  maxRetriesPerRequest: 2,        // don't let a command hang forever
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error",   (err) => console.error("❌ Redis error:", err.message));

export default redis;
