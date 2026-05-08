import { describe, it, expect } from "vitest";

describe("SMTP configuration", () => {
  it("SMTP_FROM_EMAIL is set to ahamid4@gmail.com", () => {
    const val = process.env.SMTP_FROM_EMAIL ?? "";
    expect(val).toBe("ahamid4@gmail.com");
  });

  it("SMTP_USER is set to ahamid4@gmail.com", () => {
    const val = process.env.SMTP_USER ?? "";
    expect(val).toBe("ahamid4@gmail.com");
  });

  it("SMTP_PASSWORD is set (non-empty)", () => {
    const val = process.env.SMTP_PASSWORD ?? "";
    expect(val.length).toBeGreaterThan(0);
  });
});
