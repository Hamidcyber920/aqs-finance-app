import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from the server's env module pattern
const envPath = resolve(__dirname, "../.env.local");
let dbUrl;
try {
  const env = readFileSync(envPath, "utf8");
  const match = env.match(/DATABASE_URL=(.+)/);
  if (match) dbUrl = match[1].trim();
} catch {}

if (!dbUrl) {
  // Try process env
  dbUrl = process.env.DATABASE_URL;
}

if (!dbUrl) {
  console.error("DATABASE_URL not found. Run via: DATABASE_URL=... node scripts/migrate-auth-fields.mjs");
  process.exit(1);
}

const conn = await createConnection(dbUrl);

const statements = [
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `month` int",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `year` int",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `status` enum('pending','approved','paid','withheld') DEFAULT 'pending'",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `withheldAt` timestamp NULL",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `withheldReason` text",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `chequeNumber` varchar(50)",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `chequeImageUrl` text",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `invoiceUrl` text",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `authorisedById` int",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `authorisedByName` varchar(200)",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `authorisedAt` timestamp NULL",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `rejectedById` int",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `rejectedByName` varchar(200)",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `rejectedAt` timestamp NULL",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `rejectionComment` text",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `deferredToMonth` int",
  "ALTER TABLE `loan_repayments` ADD COLUMN IF NOT EXISTS `deferredToYear` int",
  "ALTER TABLE `payroll_records` ADD COLUMN IF NOT EXISTS `authorisedById` int",
  "ALTER TABLE `payroll_records` ADD COLUMN IF NOT EXISTS `authorisedByName` varchar(200)",
  "ALTER TABLE `payroll_records` ADD COLUMN IF NOT EXISTS `authorisedAt` timestamp NULL",
  "ALTER TABLE `payroll_records` ADD COLUMN IF NOT EXISTS `rejectedById` int",
  "ALTER TABLE `payroll_records` ADD COLUMN IF NOT EXISTS `rejectedByName` varchar(200)",
  "ALTER TABLE `payroll_records` ADD COLUMN IF NOT EXISTS `rejectedAt` timestamp NULL",
  "ALTER TABLE `payroll_records` ADD COLUMN IF NOT EXISTS `rejectionComment` text",
  "ALTER TABLE `payroll_records` ADD COLUMN IF NOT EXISTS `deferredToMonth` int",
  "ALTER TABLE `payroll_records` ADD COLUMN IF NOT EXISTS `deferredToYear` int",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `authorisedById` int",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `authorisedByName` varchar(200)",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `authorisedAt` timestamp NULL",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `rejectedById` int",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `rejectedByName` varchar(200)",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `rejectedAt` timestamp NULL",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `rejectionComment` text",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `deferredToMonth` int",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `deferredToYear` int",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `paymentStatus` enum('pending','paid','withheld') DEFAULT 'pending'",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `withheldAt` timestamp NULL",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `withheldReason` text",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `chequeAmount` decimal(10,2)",
  "ALTER TABLE `receipts` ADD COLUMN IF NOT EXISTS `totalAmount` decimal(10,2)",
  "ALTER TABLE `volunteer_payments` ADD COLUMN IF NOT EXISTS `authorisedById` int",
  "ALTER TABLE `volunteer_payments` ADD COLUMN IF NOT EXISTS `authorisedByName` varchar(200)",
  "ALTER TABLE `volunteer_payments` ADD COLUMN IF NOT EXISTS `authorisedAt` timestamp NULL",
  "ALTER TABLE `volunteer_payments` ADD COLUMN IF NOT EXISTS `rejectedById` int",
  "ALTER TABLE `volunteer_payments` ADD COLUMN IF NOT EXISTS `rejectedByName` varchar(200)",
  "ALTER TABLE `volunteer_payments` ADD COLUMN IF NOT EXISTS `rejectedAt` timestamp NULL",
  "ALTER TABLE `volunteer_payments` ADD COLUMN IF NOT EXISTS `rejectionComment` text",
  "ALTER TABLE `volunteer_payments` ADD COLUMN IF NOT EXISTS `deferredToMonth` int",
  "ALTER TABLE `volunteer_payments` ADD COLUMN IF NOT EXISTS `deferredToYear` int",
];

let ok = 0, skip = 0, fail = 0;
for (const sql of statements) {
  try {
    await conn.execute(sql);
    ok++;
    console.log(`✓ ${sql.slice(0, 80)}`);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || String(e.message).includes("Duplicate column")) {
      skip++;
      console.log(`⏭ Already exists: ${sql.slice(40, 90)}`);
    } else {
      fail++;
      console.error(`✗ FAILED: ${sql}\n  ${e.message}`);
    }
  }
}

await conn.end();
console.log(`\nDone: ${ok} applied, ${skip} skipped (already exist), ${fail} failed`);
if (fail > 0) process.exit(1);
