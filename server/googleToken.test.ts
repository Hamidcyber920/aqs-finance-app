import { describe, it, expect } from "vitest";

describe("Google OAuth Token Validation", () => {
  it("should have GMAIL_CLIENT_ID set", () => {
    expect(process.env.GMAIL_CLIENT_ID).toBeDefined();
    expect(process.env.GMAIL_CLIENT_ID).toContain("781074422659");
  });

  it("should have GMAIL_CLIENT_SECRET set", () => {
    expect(process.env.GMAIL_CLIENT_SECRET).toBeDefined();
    expect(process.env.GMAIL_CLIENT_SECRET!.length).toBeGreaterThan(10);
  });

  it("should have GMAIL_REFRESH_TOKEN set", () => {
    expect(process.env.GMAIL_REFRESH_TOKEN).toBeDefined();
    expect(process.env.GMAIL_REFRESH_TOKEN!.length).toBeGreaterThan(20);
  });

  it("should have valid refresh token format", () => {
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    expect(refreshToken).toBeDefined();
    expect(refreshToken!.startsWith("1//")).toBe(true);
    expect(refreshToken!.length).toBeGreaterThan(40);
  });
});
