/**
 * One-time script to activate all existing pending users as superadmin.
 * Run with: node scripts/activate-first-user.mjs
 */
import { createRequire } from "module";
import { config } from "dotenv";
config();

const require = createRequire(import.meta.url);

const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Show current users
  const [users] = await conn.execute("SELECT id, name, email, role, status, isActive FROM users");
  console.log("Current users:", users);
  
  // Activate all pending users as superadmin (first-time setup)
  const [result] = await conn.execute(
    "UPDATE users SET status = 'active', isActive = 1, role = 'superadmin' WHERE status = 'pending'"
  );
  console.log("Updated rows:", result.affectedRows);
  
  // Show updated users
  const [updated] = await conn.execute("SELECT id, name, email, role, status, isActive FROM users");
  console.log("Updated users:", updated);
  
  await conn.end();
}

main().catch(console.error);
