import { describe, it, expect } from "vitest";

describe("Gemini API credentials", () => {
  it("GEMINI_API_KEY is set", () => {
    expect(process.env.GEMINI_API_KEY).toBeTruthy();
  });

  it("can reach Gemini API with the key", async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY not set — skipping live test");
      return;
    }
    // Use the models.list endpoint as a lightweight validation
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: "GET" }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.models).toBeDefined();
    expect(data.models.length).toBeGreaterThan(0);
  });
});
