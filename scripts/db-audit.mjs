// Database constraint audit script
// Run with: node scripts/db-audit.mjs

import { createConnection } from "mysql2/promise";
import { config } from "dotenv";
config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Parse MySQL URL: mysql://user:pass@host:port/dbname
const url = new URL(DATABASE_URL);
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || "3306"),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

const db = url.pathname.slice(1);
console.log(`Connected to database: ${db}\n`);

// ─── 1. Foreign keys ─────────────────────────────────────────────────────────
console.log("=== 1. FOREIGN KEY CONSTRAINTS ===");
const [fks] = await conn.execute(`
  SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE REFERENCED_TABLE_NAME IS NOT NULL
    AND TABLE_SCHEMA = ?
  ORDER BY TABLE_NAME, COLUMN_NAME
`, [db]);
console.log(`Found ${fks.length} FK constraints`);
if (fks.length === 0) {
  console.log("  FAIL: Zero foreign key constraints in the database");
} else {
  fks.slice(0, 10).forEach(r => console.log(`  ${r.TABLE_NAME}.${r.COLUMN_NAME} → ${r.REFERENCED_TABLE_NAME}.${r.REFERENCED_COLUMN_NAME}`));
  if (fks.length > 10) console.log(`  ... and ${fks.length - 10} more`);
}

// ─── 2. Check constraints ─────────────────────────────────────────────────────
console.log("\n=== 2. CHECK CONSTRAINTS ===");
try {
  const [checks] = await conn.execute(`
    SELECT CONSTRAINT_NAME, CHECK_CLAUSE
    FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = ?
    LIMIT 20
  `, [db]);
  console.log(`Found ${checks.length} check constraints`);
  if (checks.length === 0) {
    console.log("  NOTE: MySQL ENUM columns enforce values at DB level (not via CHECK constraints)");
  }
} catch (e) {
  console.log("  NOTE: CHECK_CONSTRAINTS table not available in this MySQL/TiDB version — ENUM columns enforce values natively");
}

// ─── 3. Unique constraints ────────────────────────────────────────────────────
console.log("\n=== 3. UNIQUE CONSTRAINTS ===");
const [uniques] = await conn.execute(`
  SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS COLUMNS
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE NON_UNIQUE = 0
    AND TABLE_SCHEMA = ?
    AND INDEX_NAME != 'PRIMARY'
  GROUP BY TABLE_NAME, INDEX_NAME
  ORDER BY TABLE_NAME
`, [db]);
console.log(`Found ${uniques.length} unique indexes`);
uniques.forEach(r => console.log(`  ${r.TABLE_NAME}: ${r.COLUMNS} (${r.INDEX_NAME})`));

// ─── 4. Monetary column types ─────────────────────────────────────────────────
console.log("\n=== 4. MONETARY COLUMNS — DECIMAL/FLOAT CHECK ===");
const [monetaryCols] = await conn.execute(`
  SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = ?
    AND DATA_TYPE IN ('decimal', 'float', 'double', 'real')
    AND (COLUMN_NAME LIKE '%amount%' OR COLUMN_NAME LIKE '%price%' OR COLUMN_NAME LIKE '%pay%'
      OR COLUMN_NAME LIKE '%total%' OR COLUMN_NAME LIKE '%balance%' OR COLUMN_NAME LIKE '%cost%'
      OR COLUMN_NAME LIKE '%fee%' OR COLUMN_NAME LIKE '%gross%' OR COLUMN_NAME LIKE '%net%'
      OR COLUMN_NAME LIKE '%tax%' OR COLUMN_NAME LIKE '%revenue%' OR COLUMN_NAME LIKE '%budget%')
  ORDER BY TABLE_NAME, COLUMN_NAME
  LIMIT 50
`, [db]);
console.log(`Found ${monetaryCols.length} monetary columns using DECIMAL/FLOAT (should be INT pence)`);
monetaryCols.slice(0, 20).forEach(r => console.log(`  FAIL: ${r.TABLE_NAME}.${r.COLUMN_NAME} (${r.DATA_TYPE}(${r.NUMERIC_PRECISION},${r.NUMERIC_SCALE}))`));

// ─── 5. Donor phone/email unique check ────────────────────────────────────────
console.log("\n=== 5. DONOR PHONE/EMAIL UNIQUE CONSTRAINT ===");
const [donorIndexes] = await conn.execute(`
  SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME) AS COLUMNS
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'donors'
  GROUP BY INDEX_NAME, NON_UNIQUE
  ORDER BY NON_UNIQUE, INDEX_NAME
`, [db]);
donorIndexes.forEach(r => console.log(`  ${r.NON_UNIQUE === 0 ? 'UNIQUE' : 'INDEX'}: ${r.COLUMNS} (${r.INDEX_NAME})`));
const hasPhoneUnique = donorIndexes.some(r => r.NON_UNIQUE === 0 && r.COLUMNS.includes('phone'));
const hasEmailUnique = donorIndexes.some(r => r.NON_UNIQUE === 0 && r.COLUMNS.includes('email'));
console.log(`  donor.phone unique: ${hasPhoneUnique ? 'PASS' : 'FAIL — missing'}`);
console.log(`  donor.email unique: ${hasEmailUnique ? 'PASS' : 'FAIL — missing'}`);

// ─── 6. stripePaymentIntentId unique check ────────────────────────────────────
console.log("\n=== 6. STRIPE PAYMENT INTENT UNIQUE CONSTRAINT ===");
const [stripeIndexes] = await conn.execute(`
  SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME) AS COLUMNS
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'stripe_payment_sessions'
  GROUP BY INDEX_NAME, NON_UNIQUE
  ORDER BY NON_UNIQUE, INDEX_NAME
`, [db]);
stripeIndexes.forEach(r => console.log(`  ${r.NON_UNIQUE === 0 ? 'UNIQUE' : 'INDEX'}: ${r.COLUMNS} (${r.INDEX_NAME})`));
const hasStripeUnique = stripeIndexes.some(r => r.NON_UNIQUE === 0 && r.COLUMNS.includes('stripePaymentIntentId'));
console.log(`  stripePaymentIntentId unique: ${hasStripeUnique ? 'PASS' : 'FAIL — missing'}`);

// ─── 7. Gift Aid declaration unique (donor + valid_from) ──────────────────────
console.log("\n=== 7. GIFT AID CERTIFICATE UNIQUE CONSTRAINT ===");
const [gaIndexes] = await conn.execute(`
  SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS COLUMNS
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'gift_aid_certificates'
  GROUP BY INDEX_NAME, NON_UNIQUE
  ORDER BY NON_UNIQUE, INDEX_NAME
`, [db]);
gaIndexes.forEach(r => console.log(`  ${r.NON_UNIQUE === 0 ? 'UNIQUE' : 'INDEX'}: ${r.COLUMNS} (${r.INDEX_NAME})`));
const hasGaUnique = gaIndexes.some(r => r.NON_UNIQUE === 0 && (r.COLUMNS.includes('donorId') || r.COLUMNS.includes('coversFrom')));
console.log(`  gift_aid_certificates (donorId+coversFrom) unique: ${hasGaUnique ? 'PASS' : 'FAIL — missing'}`);

// ─── 8. fundraisingDonations fund_id check ────────────────────────────────────
console.log("\n=== 8. FUNDRAISING DONATIONS fund_id ===");
const [fdCols] = await conn.execute(`
  SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'fundraising_donations'
    AND COLUMN_NAME IN ('campaignId', 'fundId', 'fund_id', 'restrictedFundId')
`, [db]);
fdCols.forEach(r => console.log(`  ${r.COLUMN_NAME}: ${r.DATA_TYPE} (nullable: ${r.IS_NULLABLE})`));
const hasFundId = fdCols.some(r => ['fundId', 'fund_id', 'restrictedFundId'].includes(r.COLUMN_NAME));
console.log(`  Dedicated fund_id column: ${hasFundId ? 'PASS' : 'FAIL — only campaignId exists'}`);

// ─── 9. fundraisingCampaigns isRestricted check ───────────────────────────────
console.log("\n=== 9. FUNDRAISING CAMPAIGNS isRestricted ===");
const [fcCols] = await conn.execute(`
  SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'fundraising_campaigns'
    AND COLUMN_NAME IN ('isRestricted', 'restrictedFund', 'restrictedPurpose', 'fundType')
`, [db]);
fcCols.forEach(r => console.log(`  ${r.COLUMN_NAME}: ${r.DATA_TYPE}`));
console.log(`  isRestricted field: ${fcCols.length > 0 ? 'PASS' : 'FAIL — missing'}`);

// ─── 10. Audit log permissions ────────────────────────────────────────────────
console.log("\n=== 10. AUDIT LOG TABLE GRANTS ===");
const [grants] = await conn.execute(`SHOW GRANTS FOR CURRENT_USER()`);
grants.forEach(r => console.log(`  ${Object.values(r)[0]}`));

// ─── 11. Donors updated without audit log ─────────────────────────────────────
console.log("\n=== 11. DONORS UPDATED WITHOUT AUDIT LOG (last 30 days) ===");
const [donorGap] = await conn.execute(`
  SELECT d.id, d.name, d.updatedAt
  FROM donors d
  WHERE d.updatedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    AND NOT EXISTS (
      SELECT 1 FROM audit_log a
      WHERE a.entity = 'donor' AND a.entityId = d.id
        AND a.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    )
  LIMIT 10
`);
console.log(`  Donors updated in last 30 days without audit log entry: ${donorGap.length}`);
if (donorGap.length > 0) {
  donorGap.forEach(r => console.log(`  FAIL: donor ${r.id} (${r.name}) updated at ${r.updatedAt} — no audit log`));
} else {
  console.log("  PASS or no donor updates in last 30 days");
}

// ─── 12. Donations without campaignId (fund_id proxy) ────────────────────────
console.log("\n=== 12. DONATIONS WITHOUT CAMPAIGN (fund_id proxy) ===");
const [orphanDonations] = await conn.execute(`
  SELECT COUNT(*) as cnt FROM fundraising_donations WHERE campaignId IS NULL
`);
console.log(`  Donations without campaignId: ${orphanDonations[0].cnt} ${orphanDonations[0].cnt === 0 ? '(PASS)' : '(FAIL)'}`);

await conn.end();
console.log("\nAudit complete.");
