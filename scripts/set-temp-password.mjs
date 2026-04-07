/**
 * Sets a temporary password for the superadmin account.
 * Run with: node scripts/set-temp-password.mjs
 */
import { createRequire } from "module";
import { config } from "dotenv";
config();

const require = createRequire(import.meta.url);
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

const TEMP_PASSWORD = "AQSociety2026!";
const EMAIL = "ahamid4@gmail.com";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const hash = await bcrypt.hash(TEMP_PASSWORD, 12);
  await conn.execute(
    "UPDATE users SET passwordHash = ?, loginMethod = 'local', status = 'active', isActive = 1 WHERE email = ?",
    [hash, EMAIL]
  );
  console.log(`✅ Temporary password set for ${EMAIL}`);
  console.log(`   Password: ${TEMP_PASSWORD}`);
  console.log(`   Please change this after first login via Profile & Settings.`);
  await conn.end();
}

main().catch(console.error);
