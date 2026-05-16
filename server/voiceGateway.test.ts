/**
 * Voice Gateway Tests — DEPRECATED
 *
 * The SSE-based voice gateway has been replaced with a client-side
 * architecture where the browser connects directly to Gemini Live API.
 * See server/routers/voice.test.ts for the new ephemeral token tests.
 */
import { describe, it, expect } from "vitest";

describe("Voice Gateway (deprecated — now client-side)", () => {
  it("voiceGateway.ts still exports registerVoiceRoutes for backward compat", async () => {
    const mod = await import("./voiceGateway");
    expect(mod.registerVoiceRoutes).toBeDefined();
    expect(typeof mod.registerVoiceRoutes).toBe("function");
  });

  it("GEMINI_API_KEY is set in environment", () => {
    expect(process.env.GEMINI_API_KEY).toBeTruthy();
  });

  it("wsAuth module still works for any legacy usage", async () => {
    const { generateWsToken, verifyWsToken } = await import("./wsAuth");
    const token = await generateWsToken(1, "admin", "TestUser");
    expect(token).toBeTruthy();
    const user = await verifyWsToken(token);
    expect(user).not.toBeNull();
    expect(user!.userId).toBe(1);
  });
});
