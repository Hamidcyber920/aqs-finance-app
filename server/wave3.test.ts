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
describe("donorsV3 R68 procedures", () => {
  it("exports buildGiftAidR68Xml and submitGiftAidToTrustee", async () => {
    const mod = await import("./routers/donorsV3");
    const keys = Object.keys(mod.donorsV3Router);
    expect(keys).toContain("buildGiftAidR68Xml");
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
