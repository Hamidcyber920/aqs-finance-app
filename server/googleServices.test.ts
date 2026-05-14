import { describe, it, expect } from "vitest";

// Test that the Google services module exports all expected functions
describe("Google Services Module", () => {
  it("should export all required functions", async () => {
    const mod = await import("./googleServices");
    expect(mod.getGoogleAccessToken).toBeDefined();
    expect(mod.listDriveFiles).toBeDefined();
    expect(mod.getDriveFile).toBeDefined();
    expect(mod.uploadToDrive).toBeDefined();
    expect(mod.listGmailLabels).toBeDefined();
    expect(mod.fetchEmailsByLabel).toBeDefined();
    expect(mod.fetchRecentEmails).toBeDefined();
    expect(mod.createExpenseSheet).toBeDefined();
    expect(mod.createMonthlyBreakdownSheet).toBeDefined();
  });

  it("should get a valid access token from Google OAuth", async () => {
    const { getGoogleAccessToken } = await import("./googleServices");
    const token = await getGoogleAccessToken();
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
  });

  it("should list Gmail labels", async () => {
    const { listGmailLabels } = await import("./googleServices");
    const labels = await listGmailLabels(false); // fast path
    expect(Array.isArray(labels)).toBe(true);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]).toHaveProperty("id");
    expect(labels[0]).toHaveProperty("name");
  });

  it("should list Google Drive files in the configured folder", async () => {
    const { listDriveFiles } = await import("./googleServices");
    const files = await listDriveFiles(undefined, 5);
    expect(Array.isArray(files)).toBe(true);
    // Folder may be empty, but should not throw
  });
});
