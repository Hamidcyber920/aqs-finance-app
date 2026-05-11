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
