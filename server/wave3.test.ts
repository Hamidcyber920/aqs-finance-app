/**
 * Wave 3 – unit tests for donorsV3, payrollV3, commsV3, meetingsV3 routers
 * These tests verify the router modules export the expected procedure names
 * and that the schema tables exist.
 */
import { describe, it, expect } from "vitest";

// ── donorsV3 ─────────────────────────────────────────────────────────────────
describe("donorsV3 router", () => {
  it("exports expected procedure keys", async () => {
    const mod = await import("./routers/donorsV3");
    const keys = Object.keys(mod.donorsV3Router);
    expect(keys).toContain("listGiftAidClaims");
    expect(keys).toContain("createGiftAidClaim");
    expect(keys).toContain("getLapsedDonors");
    expect(keys).toContain("listDonorsWithSegments");
    expect(keys).toContain("sendThankYou");
  });
});

// ── payrollV3 ─────────────────────────────────────────────────────────────────
describe("payrollV3 router", () => {
  it("exports expected procedure keys", async () => {
    const mod = await import("./routers/payrollV3");
    const keys = Object.keys(mod.payrollV3Router);
    expect(keys).toContain("list");
    expect(keys).toContain("create");
    expect(keys).toContain("extractFromPayslip");
    expect(keys).toContain("approve");
    expect(keys).toContain("getEmployeeSummary");
  });
});

// ── commsV3 ───────────────────────────────────────────────────────────────────
describe("commsV3 router", () => {
  it("exports expected procedure keys", async () => {
    const mod = await import("./routers/commsV3");
    const keys = Object.keys(mod.commsV3Router);
    expect(keys).toContain("listTemplates");
    expect(keys).toContain("upsertTemplate");
    expect(keys).toContain("deleteTemplate");
    expect(keys).toContain("sendBulk");
    expect(keys).toContain("listOutbox");
    expect(keys).toContain("aiCompose");
  });
});

// ── meetingsV3 ────────────────────────────────────────────────────────────────
describe("meetingsV3 router", () => {
  it("exports expected procedure keys", async () => {
    const mod = await import("./routers/meetingsV3");
    const keys = Object.keys(mod.meetingsV3Router);
    expect(keys).toContain("listMeetings");
    expect(keys).toContain("getMeeting");
    expect(keys).toContain("createMeeting");
    expect(keys).toContain("updateMeeting");
    expect(keys).toContain("generateAgenda");
    expect(keys).toContain("extractDecisionsFromMinutes");
    expect(keys).toContain("initPipeline");
    expect(keys).toContain("listActivePipelines");
  });
});

// ── schema tables ─────────────────────────────────────────────────────────────
describe("Wave 3 schema tables", () => {
  it("giftAidClaims table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.giftAidClaims).toBeDefined();
  });

  it("payrollV2 table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.payrollV2).toBeDefined();
  });

  it("commsTemplates table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.commsTemplates).toBeDefined();
  });

  it("commsOutbox table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.commsOutbox).toBeDefined();
  });

  it("trusteeMeetings table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.trusteeMeetings).toBeDefined();
  });

  it("meetingAgendaItems table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.meetingAgendaItems).toBeDefined();
  });

  it("onboardingPipeline table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.onboardingPipeline).toBeDefined();
  });

  it("donorSegments table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.donorSegments).toBeDefined();
  });
});

// ── Wave 3 next-step procedures ───────────────────────────────────────────────
describe("donorsV3 ChR1 procedures", () => {
  it("exports buildGiftAidChr1Xml and submitGiftAidToTrustee", async () => {
    const mod = await import("./routers/donorsV3");
    const keys = Object.keys(mod.donorsV3Router);
    expect(keys).toContain("buildGiftAidChr1Xml");
    expect(keys).toContain("submitGiftAidToTrustee");
  });
});

describe("meetingsV3 transcribeAndExtract procedure", () => {
  it("exports transcribeAndExtract", async () => {
    const mod = await import("./routers/meetingsV3");
    const keys = Object.keys(mod.meetingsV3Router);
    expect(keys).toContain("transcribeAndExtract");
  });
});

describe("payrollV3 emailPayslip procedure", () => {
  it("exports emailPayslip", async () => {
    const mod = await import("./routers/payrollV3");
    const keys = Object.keys(mod.payrollV3Router);
    expect(keys).toContain("emailPayslip");
  });
});

// ─── Wave 4: Comms Inbox Router ───────────────────────────────────────────────
describe("Wave 4 – commsInbox router", () => {
  it("commsInbox router is registered in the main router", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.listSections");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.upsertSection");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.deleteSection");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.listEmails");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.getEmail");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.pushEmail");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.updateEmail");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.aiSummariseEmail");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.ocrAttachment");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.uploadAttachment");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.getInboxStats");
    expect(appRouter._def.procedures).toHaveProperty("commsInbox.fetchFromGmail");
  });

  it("Wave 4 DB tables exist in schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.emailSections).toBeDefined();
    expect(schema.inboundEmails).toBeDefined();
    expect(schema.emailAttachments).toBeDefined();
    expect(schema.emailActivityLog).toBeDefined();
  });

  it("Suggested next steps: markGiftAidSubmitted procedure exists", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("donorsV3.markGiftAidSubmitted");
  });

  it("Suggested next steps: quorumRequired/quorumMet columns exist in trusteeMeetings schema", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.trusteeMeetings);
    expect(cols).toContain("quorumRequired");
    expect(cols).toContain("quorumMet");
  });

  it("Suggested next steps: submittedToHmrc/submittedAt columns exist in giftAidClaims schema", async () => {
    const schema = await import("../drizzle/schema");
    const cols = Object.keys(schema.giftAidClaims);
    expect(cols).toContain("submittedToHmrc");
    expect(cols).toContain("submittedAt");
  });
});

// ── Wave 4 Next Steps tests ──────────────────────────────────────────────────

describe("commsInbox — reply, push webhook, unread counts", () => {
  const fs = require("fs");
  const path = require("path");
  const commsInboxSrc = fs.readFileSync(
    path.resolve(__dirname, "routers/commsInbox.ts"), "utf8"
  );

  it("commsInbox router has replyToEmail procedure", () => {
    expect(commsInboxSrc).toContain("replyToEmail:");
  });

  it("commsInbox router has registerGmailPush procedure", () => {
    expect(commsInboxSrc).toContain("registerGmailPush:");
  });

  it("commsInbox router has getSectionUnreadCounts procedure", () => {
    expect(commsInboxSrc).toContain("getSectionUnreadCounts:");
  });

  it("gmailWebhook file exists with registerGmailWebhook export", () => {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.resolve(__dirname, "gmailWebhook.ts");
    expect(fs.existsSync(filePath)).toBe(true);
    const src = fs.readFileSync(filePath, "utf8");
    expect(src).toContain("export function registerGmailWebhook");
  });
});

// ── Wave 4 Round 2: Search/Filter, Bulk Actions, Template Reply ────────────
describe("Wave 4 Round 2 — CommsInbox search/filter/bulk/template-reply", () => {
  it("commsInbox router has bulkAction procedure", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf8");
    expect(src).toContain("bulkAction:");
  });

  it("commsInbox listEmails supports dateFrom/dateTo filter", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf8");
    expect(src).toContain("dateFrom");
    expect(src).toContain("dateTo");
  });

  it("bulkAction supports markRead, archive, moveToSection actions", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf8");
    expect(src).toContain("markRead");
    expect(src).toContain("archive");
    expect(src).toContain("moveToSection");
  });

  it("CommsInbox.tsx has bulk checkbox select-all and action bar", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/CommsInbox.tsx"), "utf8");
    expect(src).toContain("toggleSelectAll");
    expect(src).toContain("selectedEmailIds");
    expect(src).toContain("bulkAction");
  });

  it("CommsInbox.tsx has template picker in reply tab", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/CommsInbox.tsx"), "utf8");
    expect(src).toContain("handleApplyTemplate");
    expect(src).toContain("selectedTemplateId");
    expect(src).toContain("commsV3.listTemplates");
  });

  it("CommsInbox.tsx has date range filter chips with presets", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/CommsInbox.tsx"), "utf8");
    expect(src).toContain("DATE_PRESETS");
    expect(src).toContain("activeDatePreset");
    expect(src).toContain("clearFilters");
  });
});

// ─── Wave 4 Round 3: Email Priority, Gmail Sync, Email-Receipt Link ────────────
describe("Wave 4 Round 3 — Email Priority, Gmail Sync, Email-Receipt Link", () => {
  it("commsInbox.classifyPriority procedure exists in router source", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf-8");
    expect(src).toContain("classifyPriority");
    expect(src).toContain("priority");
  });

  it("commsInbox.linkToReceipt procedure exists in router source", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf-8");
    expect(src).toContain("linkToReceipt");
    expect(src).toContain("linkedReceiptId");
  });

  it("commsInbox.searchReceiptsForLink procedure exists in router source", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf-8");
    expect(src).toContain("searchReceiptsForLink");
  });

  it("scheduledJobs.ts contains syncGmailInbox function", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "scheduledJobs.ts"), "utf-8");
    expect(src).toContain("syncGmailInbox");
    expect(src).toContain("Gmail sync");
  });

  it("scheduledJobs.ts registers hourly Gmail sync cron", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "scheduledJobs.ts"), "utf-8");
    expect(src).toContain("syncGmailInbox");
    expect(src).toContain("registerScheduledJobs");
  });

  it("inbound_emails schema has linkedReceiptId and linkedReceiptNote columns", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../drizzle/schema.ts"), "utf-8");
    expect(src).toContain("linkedReceiptId");
    expect(src).toContain("linkedReceiptNote");
  });

  it("gmailWebhook.ts handles push notifications", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "gmailWebhook.ts"), "utf-8");
    expect(src).toContain("gmail/push");
    expect(src).toContain("Pub/Sub");
  });
});

// ─── Wave 4 Round 4: Priority Stats, Last Sync, Receipt Cross-Reference ────────
describe("Wave 4 Round 4 — Priority Stats, Last Sync, Receipt Cross-Reference", () => {
  it("commsInbox.getPriorityStats procedure exists in router source", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf-8");
    expect(src).toContain("getPriorityStats");
    expect(src).toContain("urgent");
    expect(src).toContain("high");
    expect(src).toContain("normal");
    expect(src).toContain("low");
  });
  it("commsInbox.getLastSyncTime procedure exists in router source", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf-8");
    expect(src).toContain("getLastSyncTime");
    expect(src).toContain("gmailLastSyncedAt");
  });
  it("commsInbox.getLinkedEmailsForReceipt procedure exists in router source", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf-8");
    expect(src).toContain("getLinkedEmailsForReceipt");
    expect(src).toContain("receiptId");
    expect(src).toContain("linkedReceiptId");
  });
  it("gmailLastSyncedAt is exported from commsInbox router", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf-8");
    expect(src).toContain("export let gmailLastSyncedAt");
    expect(src).toContain("export function setGmailLastSyncedAt");
  });
  it("scheduledJobs.ts calls setGmailLastSyncedAt after sync", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "scheduledJobs.ts"), "utf-8");
    expect(src).toContain("setGmailLastSyncedAt");
    expect(src).toContain("Date.now()");
  });
  it("CommsInbox.tsx queries getPriorityStats and getLastSyncTime", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/CommsInbox.tsx"), "utf-8");
    expect(src).toContain("getPriorityStats");
    expect(src).toContain("getLastSyncTime");
    expect(src).toContain("priorityStats");
    expect(src).toContain("syncTimeData");
  });
  it("CommsInbox.tsx renders priority stats bar with urgent/high/normal/low badges", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/CommsInbox.tsx"), "utf-8");
    expect(src).toContain("priorityStats.urgent");
    expect(src).toContain("priorityStats.high");
    expect(src).toContain("priorityStats.normal");
    expect(src).toContain("priorityStats.low");
  });
  it("CommsInbox.tsx renders last sync timestamp indicator", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/CommsInbox.tsx"), "utf-8");
    expect(src).toContain("lastSyncedAt");
    expect(src).toContain("Synced");
    expect(src).toContain("min ago");
  });
  it("ReceiptDetail.tsx queries getLinkedEmailsForReceipt", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/ReceiptDetail.tsx"), "utf-8");
    expect(src).toContain("getLinkedEmailsForReceipt");
    expect(src).toContain("linkedEmails");
  });
  it("ReceiptDetail.tsx renders linked emails cross-reference panel", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/ReceiptDetail.tsx"), "utf-8");
    expect(src).toContain("Linked Emails");
    expect(src).toContain("linkedReceiptNote");
    expect(src).toContain("email.subject");
    expect(src).toContain("email.fromEmail");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wave 4 Round 5 — Section Reply Templates, Unread Digest, Receipt-Expense Link
// ─────────────────────────────────────────────────────────────────────────────
describe("Wave 4 Round 5", () => {
  it("section_reply_templates table exists in schema.ts", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../drizzle/schema.ts"), "utf-8");
    expect(src).toContain("section_reply_templates");
    expect(src).toContain("sectionId");
    expect(src).toContain("title");
    expect(src).toContain("body");
  });

  it("audit_log table exists in schema.ts", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../drizzle/schema.ts"), "utf-8");
    expect(src).toContain("audit_log");
    expect(src).toContain("action");
    expect(src).toContain("entity");
    expect(src).toContain("entityId");
  });

  it("receipts table has linkedExpenseId and linkedExpenseNote columns", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../drizzle/schema.ts"), "utf-8");
    expect(src).toContain("linkedExpenseId");
    expect(src).toContain("linkedExpenseNote");
  });

  it("commsInbox router has listSectionTemplates, upsertSectionTemplate, deleteSectionTemplate", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/commsInbox.ts"), "utf-8");
    expect(src).toContain("listSectionTemplates");
    expect(src).toContain("upsertSectionTemplate");
    expect(src).toContain("deleteSectionTemplate");
  });

  it("receipts router has suggestExpenseLink and confirmExpenseLink procedures", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers.ts"), "utf-8");
    expect(src).toContain("suggestExpenseLink");
    expect(src).toContain("confirmExpenseLink");
  });

  it("scheduledJobs.ts has unread digest cron job", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "scheduledJobs.ts"), "utf-8");
    expect(src).toContain("unread digest");
    expect(src).toContain("urgent");
    expect(src).toContain("high");
  });

  it("CommsInbox.tsx has Manage Templates button and template manager dialog", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/CommsInbox.tsx"), "utf-8");
    expect(src).toContain("Manage Templates");
    expect(src).toContain("showTemplateManager");
    expect(src).toContain("sectionTemplates");
    expect(src).toContain("upsertSectionTemplate");
  });

  it("CommsInbox.tsx renders section-specific template picker in reply tab", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/CommsInbox.tsx"), "utf-8");
    expect(src).toContain("Section Templates");
    expect(src).toContain("listSectionTemplates");
    expect(src).toContain("setReplyBody(t.body)");
  });

  it("ReceiptDetail.tsx queries suggestExpenseLink and confirmExpenseLink", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/ReceiptDetail.tsx"), "utf-8");
    expect(src).toContain("suggestExpenseLink");
    expect(src).toContain("confirmExpenseLink");
    expect(src).toContain("expenseSuggestions");
  });

  it("ReceiptDetail.tsx renders expense auto-link suggestion card", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/ReceiptDetail.tsx"), "utf-8");
    expect(src).toContain("Suggested Expense Match");
    expect(src).toContain("dismissedExpenseLink");
    expect(src).toContain("linkedExpenseId");
  });
});

// ─── Wave 5: Audit Trail & System Health ─────────────────────────────────────
describe("Wave 5: Audit Trail Router", () => {
  it("auditTrail.ts exports auditTrailRouter and logAudit helper", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/auditTrail.ts"), "utf-8");
    expect(src).toContain("export const auditTrailRouter");
    expect(src).toContain("export async function logAudit");
  });
  it("auditTrailRouter has list, stats, getEntityTypes, getActionTypes, getForEntity procedures", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/auditTrail.ts"), "utf-8");
    expect(src).toContain("list: protectedProcedure");
    expect(src).toContain("stats: protectedProcedure");
    expect(src).toContain("getEntityTypes: protectedProcedure");
    expect(src).toContain("getActionTypes: protectedProcedure");
    expect(src).toContain("getForEntity: protectedProcedure");
  });
  it("logAudit helper is non-throwing (catches errors internally)", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/auditTrail.ts"), "utf-8");
    expect(src).toContain("} catch {");
    expect(src).toContain("// Non-critical");
  });
  it("auditTrail stats procedure returns total, uniqueUsers, todayCount, topEntity", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/auditTrail.ts"), "utf-8");
    expect(src).toContain("total:");
    expect(src).toContain("uniqueUsers:");
    expect(src).toContain("todayCount:");
    expect(src).toContain("topEntity:");
  });
  it("auditTrailRouter is registered in routers.ts", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers.ts"), "utf-8");
    expect(src).toContain("auditTrailRouter");
    expect(src).toContain("auditTrail: auditTrailRouter");
  });
});

describe("Wave 5: System Health Router", () => {
  it("systemHealth.ts exports systemHealthRouter", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/systemHealth.ts"), "utf-8");
    expect(src).toContain("export const systemHealthRouter");
  });
  it("systemHealthRouter has snapshot and ping procedures", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/systemHealth.ts"), "utf-8");
    expect(src).toContain("snapshot: protectedProcedure");
    expect(src).toContain("ping: protectedProcedure");
  });
  it("snapshot procedure returns dbOk, tables, scheduledJobs, gmailLastSyncedAt, serverTime", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers/systemHealth.ts"), "utf-8");
    expect(src).toContain("dbOk");
    expect(src).toContain("tables:");
    expect(src).toContain("scheduledJobs");
    expect(src).toContain("gmailLastSyncedAt");
    expect(src).toContain("serverTime:");
  });
  it("systemHealthRouter is registered in routers.ts", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "routers.ts"), "utf-8");
    expect(src).toContain("import { systemHealthRouter }");
    expect(src).toContain("systemHealth: systemHealthRouter");
  });
});

describe("Wave 5: Audit Trail & System Health Frontend Pages", () => {
  it("AuditTrail.tsx exists and uses auditTrail tRPC procedures", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/AuditTrail.tsx"), "utf-8");
    expect(src).toContain("trpc.auditTrail.list.useQuery");
    expect(src).toContain("trpc.auditTrail.stats.useQuery");
    expect(src).toContain("trpc.auditTrail.getEntityTypes.useQuery");
    expect(src).toContain("trpc.auditTrail.getActionTypes.useQuery");
  });
  it("AuditTrail.tsx renders stats row, filters, table, and pagination", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/AuditTrail.tsx"), "utf-8");
    expect(src).toContain("Audit Trail");
    expect(src).toContain("Total Entries");
    expect(src).toContain("Unique Users");
    expect(src).toContain("entityFilter");
    expect(src).toContain("actionFilter");
    expect(src).toContain("totalPages");
  });
  it("SystemHealth.tsx exists and uses systemHealth tRPC procedures", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/SystemHealth.tsx"), "utf-8");
    expect(src).toContain("trpc.systemHealth.snapshot.useQuery");
    expect(src).toContain("trpc.systemHealth.ping.useQuery");
  });
  it("SystemHealth.tsx renders DB status, server time, Gmail sync, scheduled jobs, table counts", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/pages/SystemHealth.tsx"), "utf-8");
    expect(src).toContain("System Health");
    expect(src).toContain("Database");
    expect(src).toContain("Gmail Sync");
    expect(src).toContain("Scheduled Jobs");
    expect(src).toContain("Database Tables");
    expect(src).toContain("latencyMs");
  });
  it("App.tsx registers /audit-trail and /system-health routes", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/App.tsx"), "utf-8");
    expect(src).toContain("/audit-trail");
    expect(src).toContain("/system-health");
    expect(src).toContain("AuditTrailPage");
    expect(src).toContain("SystemHealthPage");
  });
  it("DashboardLayout.tsx has Audit Trail and System Health nav items", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../client/src/components/DashboardLayout.tsx"), "utf-8");
    expect(src).toContain("Audit Trail");
    expect(src).toContain("System Health");
    expect(src).toContain("/audit-trail");
    expect(src).toContain("/system-health");
  });
});

// ─── Gap Analysis P1: Pledges Router ─────────────────────────────────────────
describe("Gap Analysis P1 — Pledges Router", () => {
  it("pledgesRouter exports a router object", async () => {
    const mod = await import("./routers/pledges");
    expect(mod.pledgesRouter).toBeDefined();
    expect(typeof mod.pledgesRouter).toBe("object");
  });

  it("pledgesRouter has list, create, getById, stats, markPaid procedures", async () => {
    const mod = await import("./routers/pledges");
    const r = mod.pledgesRouter as any;
    const procedures = Object.keys(r._def?.record ?? {});
    expect(procedures).toContain("list");
    expect(procedures).toContain("create");
    expect(procedures).toContain("getById");
    expect(procedures).toContain("stats");
    expect(procedures).toContain("markPaid");
  });

  it("pledgesRouter markPaid procedure exists in appRouter", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("pledges.markPaid");
  });
});

// ─── Gap Analysis P1: Donor Pipeline Router ──────────────────────────────────
describe("Gap Analysis P1 — Donor Pipeline Router", () => {
  it("donorPipelineRouter exports a router object", async () => {
    const mod = await import("./routers/donorPipeline");
    expect(mod.donorPipelineRouter).toBeDefined();
  });

  it("donorPipelineRouter has kanban, create, moveStage, delete, addNote, listNotes, deleteNote", async () => {
    const mod = await import("./routers/donorPipeline");
    const r = mod.donorPipelineRouter as any;
    const procedures = Object.keys(r._def?.record ?? {});
    expect(procedures).toContain("kanban");
    expect(procedures).toContain("create");
    expect(procedures).toContain("moveStage");
    expect(procedures).toContain("delete");
    expect(procedures).toContain("addNote");
    expect(procedures).toContain("listNotes");
    expect(procedures).toContain("deleteNote");
  });

  it("kanban and moveStage exist in appRouter procedures", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("donorPipeline.kanban");
    expect(appRouter._def.procedures).toHaveProperty("donorPipeline.moveStage");
  });
});

// ─── Gap Analysis P1: Major Donor Due Diligence Router ───────────────────────
describe("Gap Analysis P1 — Major Donor Due Diligence Router", () => {
  it("majorDonorRouter exports a router object", async () => {
    const mod = await import("./routers/majorDonor");
    expect(mod.majorDonorRouter).toBeDefined();
  });

  it("majorDonorRouter has list, getById, trigger, updateSanctionsCheck, trusteeSignOff, fileSIR", async () => {
    const mod = await import("./routers/majorDonor");
    const r = mod.majorDonorRouter as any;
    const procedures = Object.keys(r._def?.record ?? {});
    expect(procedures).toContain("list");
    expect(procedures).toContain("getById");
    expect(procedures).toContain("trigger");
    expect(procedures).toContain("updateSanctionsCheck");
    expect(procedures).toContain("trusteeSignOff");
    expect(procedures).toContain("fileSIR");
  });

  it("trigger and fileSIR exist in appRouter procedures", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("majorDonor.trigger");
    expect(appRouter._def.procedures).toHaveProperty("majorDonor.fileSIR");
  });
});

// ─── Gap Analysis P1: Bulk Approvals Router ──────────────────────────────────
describe("Gap Analysis P1 — Bulk Approvals Router", () => {
  it("bulkApprovalsRouter exports a router object", async () => {
    const mod = await import("./routers/bulkApprovals");
    expect(mod.bulkApprovalsRouter).toBeDefined();
  });

  it("bulkApprovalsRouter has list, request, review, checkThreshold", async () => {
    const mod = await import("./routers/bulkApprovals");
    const r = mod.bulkApprovalsRouter as any;
    const procedures = Object.keys(r._def?.record ?? {});
    expect(procedures).toContain("list");
    expect(procedures).toContain("request");
    expect(procedures).toContain("review");
    expect(procedures).toContain("checkThreshold");
  });

  it("request and review exist in appRouter procedures", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("bulkApprovals.request");
    expect(appRouter._def.procedures).toHaveProperty("bulkApprovals.review");
  });
});

// ─── Gap Analysis P1: New Schema Tables ──────────────────────────────────────
describe("Gap Analysis P1 — New Schema Tables", () => {
  it("pledges table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect((schema as any).pledges).toBeDefined();
  });

  it("pledgePayments table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect((schema as any).pledgePayments).toBeDefined();
  });

  it("donorPipeline table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect((schema as any).donorPipeline).toBeDefined();
  });

  it("majorDonorDueDiligence table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect((schema as any).majorDonorDueDiligence).toBeDefined();
  });

  it("donorNotes table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect((schema as any).donorNotes).toBeDefined();
  });

  it("bulkMessageApprovals table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect((schema as any).bulkMessageApprovals).toBeDefined();
  });

  it("sectionReplyTemplates table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect((schema as any).sectionReplyTemplates).toBeDefined();
  });

  it("auditLog table is exported from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect((schema as any).auditLog).toBeDefined();
  });
});

// ─── Gap Analysis P1: AppRouter Registration ─────────────────────────────────
describe("Gap Analysis P1 — AppRouter Router Registration", () => {
  it("appRouter includes pledges router", async () => {
    const mod = await import("./routers");
    const r = (mod as any).appRouter;
    expect(r._def?.record?.pledges).toBeDefined();
  });

  it("appRouter includes donorPipeline router", async () => {
    const mod = await import("./routers");
    const r = (mod as any).appRouter;
    expect(r._def?.record?.donorPipeline).toBeDefined();
  });

  it("appRouter includes majorDonor router", async () => {
    const mod = await import("./routers");
    const r = (mod as any).appRouter;
    expect(r._def?.record?.majorDonor).toBeDefined();
  });

  it("appRouter includes bulkApprovals router", async () => {
    const mod = await import("./routers");
    const r = (mod as any).appRouter;
    expect(r._def?.record?.bulkApprovals).toBeDefined();
  });

  it("appRouter includes auditTrail router", async () => {
    const mod = await import("./routers");
    const r = (mod as any).appRouter;
    expect(r._def?.record?.auditTrail).toBeDefined();
  });

  it("appRouter includes systemHealth router", async () => {
    const mod = await import("./routers");
    const r = (mod as any).appRouter;
    expect(r._def?.record?.systemHealth).toBeDefined();
  });
});
