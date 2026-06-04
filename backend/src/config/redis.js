import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

const redis = new Redis(process.env.REDIS_URL, {
  tls: process.env.NODE_ENV === "production" ? {} : undefined,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error",   (err) => console.error("❌ Redis error:", err.message));

export default redis;
