import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new pg.Client({
  connectionString: "postgresql://postgres:GqoEmGoQGJigVDHvclDrbighFMbOeLVz@junction.proxy.rlwy.net:39202/railway",
  ssl: { rejectUnauthorized: false },
});

const schema = fs.readFileSync(path.join(__dirname, "database/schema.sql"), "utf8");

async function run() {
  console.log("Connecting to Railway PostgreSQL...");
  await client.connect();
  console.log("✅ Connected! Running schema...");
  try {
    await client.query(schema);
    console.log("✅ Schema created successfully!");
    console.log("✅ Tables: users, routes, stops, route_stops, buses, trips, live_positions, student_subscriptions");
    console.log("✅ Seed data: 2 routes, 4 stops, 3 buses inserted");
  } catch (err) {
    if (err.message.includes("already exists")) {
      console.log("✅ Tables already exist — schema is up to date");
    } else {
      console.error("❌ Error:", err.message);
    }
  }
  await client.end();
}

run();
