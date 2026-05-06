import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { storagePut, storageGet } from "../storage";
import { notifyOwner } from "../_core/notification";

// ─── Senior gate (superadmin or trustee) ─────────────────────────────────────
const seniorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "superadmin" && ctx.user.role !== "trustee")
    throw new TRPCError({ code: "FORBIDDEN", message: "Only superadmins and trustees can access backups" });
  return next({ ctx });
});

// ─── Debounced real-time backup ───────────────────────────────────────────────
// Any data write calls triggerBackupSoon(). The timer is reset on each call.
// After 5 minutes of inactivity the backup fires automatically.
const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function triggerBackupSoon() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBackup("realtime").catch((err) =>
      console.error("[Realtime Backup] Failed:", err?.message ?? err)
    );
  }, DEBOUNCE_MS);
}

// ─── Core backup logic ────────────────────────────────────────────────────────
export async function runBackup(
  triggeredBy: "scheduled" | "manual" | "realtime",
  userId?: number,
  userName?: string
) {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const schema = await import("../../drizzle/schema");

  const tables = [
    { name: "users", table: schema.users },
    { name: "userPermissions", table: schema.userPermissions },
    { name: "departments", table: schema.departments },
    { name: "expenseCategories", table: schema.expenseCategories },
    { name: "receipts", table: schema.receipts },
    { name: "fundraisingCampaigns", table: schema.fundraisingCampaigns },
    { name: "fundraisingItems", table: schema.fundraisingItems },
    { name: "fundraisingDonations", table: schema.fundraisingDonations },
    { name: "fridayCollections", table: schema.fridayCollections },
    { name: "loanApplications", table: schema.loanApplications },
    { name: "loanRepayments", table: schema.loanRepayments },
    { name: "incomeCategories", table: schema.incomeCategories },
    { name: "incomeRecords", table: schema.incomeRecords },
    { name: "donors", table: schema.donors },
    { name: "campaigns", table: schema.campaigns },
    { name: "staffProfiles", table: schema.staffProfiles },
    { name: "payrollRecords", table: schema.payrollRecords },
    { name: "volunteerPayments", table: schema.volunteerPayments },
    { name: "reconciliationSessions", table: schema.reconciliationSessions },
    { name: "invoices", table: schema.invoices },
    { name: "trustees", table: schema.trustees },
    { name: "orgMembers", table: schema.orgMembers },
  ];

  const backup: Record<string, unknown[]> = {};
  let totalRecords = 0;

  for (const { name, table } of tables) {
    try {
      const rows = await db.select().from(table as any);
      backup[name] = rows;
      totalRecords += rows.length;
    } catch {
      backup[name] = [];
    }
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup-${dateStr}.json`;
  const s3Key = `system-backups/${filename}`;

  const triggeredByLabel =
    triggeredBy === "realtime"
      ? "Auto (data change)"
      : triggeredBy === "scheduled"
      ? "Scheduled Task"
      : userName ?? "Manual";

  const payload = JSON.stringify(
    {
      exportedAt: now.toISOString(),
      triggeredBy,
      triggeredByUserId: userId ?? null,
      triggeredByName: triggeredByLabel,
      tableCount: tables.length,
      totalRecords,
      data: backup,
    },
    null,
    2
  );

  const sizeBytes = Buffer.byteLength(payload, "utf8");
  const { url } = await storagePut(s3Key, payload, "application/json");

  // Record in DB
  const { systemBackups } = schema;
  await db.insert(systemBackups).values({
    filename,
    s3Key,
    s3Url: url,
    sizeBytes,
    tableCount: tables.length,
    recordCount: totalRecords,
    triggeredBy,
    triggeredByUserId: userId ?? null,
    triggeredByName: triggeredByLabel,
    status: "success",
  });

  // Notify owner only for scheduled and manual (not every realtime backup to avoid noise)
  if (triggeredBy !== "realtime") {
    await notifyOwner({
      title: `✅ Backup Complete — ${now.toLocaleDateString("en-GB")}`,
      content: `Backup completed successfully.\n\n• Tables: ${tables.length}\n• Records: ${totalRecords.toLocaleString()}\n• File size: ${(sizeBytes / 1024).toFixed(1)} KB\n• Triggered by: ${triggeredByLabel}\n• File: ${filename}`,
    }).catch(() => {});
  }

  return { filename, s3Key, url, sizeBytes, tableCount: tables.length, recordCount: totalRecords };
}

// ─── tRPC Router ──────────────────────────────────────────────────────────────
export const backupRouter = router({
  // Manually trigger a backup (superadmin/trustee only)
  create: seniorProcedure.mutation(async ({ ctx }) => {
    return runBackup("manual", ctx.user.id, ctx.user.name ?? "Unknown");
  }),

  // List last 30 backups
  list: seniorProcedure.query(async () => {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) return [];
    const { systemBackups } = await import("../../drizzle/schema");
    const { desc } = await import("drizzle-orm");
    return db.select().from(systemBackups).orderBy(desc(systemBackups.createdAt)).limit(30);
  }),

  // Get a presigned download URL for a specific backup
  download: seniorProcedure
    .input(z.object({ s3Key: z.string() }))
    .query(async ({ input }) => {
      const { url } = await storageGet(input.s3Key);
      return { url };
    }),
});
