import { describe, it, expect, vi } from "vitest";

describe("Voice Gateway Configuration", () => {
  it("GEMINI_API_KEY is set in environment", () => {
    expect(process.env.GEMINI_API_KEY).toBeTruthy();
  });

  it("GEMINI_API_KEY has reasonable length (39+ chars for Google API keys)", () => {
    const key = process.env.GEMINI_API_KEY || "";
    expect(key.length).toBeGreaterThanOrEqual(39);
  });

  it("can import voiceGateway module without errors", async () => {
    // This validates that the module syntax is correct and all imports resolve
    const mod = await import("./voiceGateway");
    expect(mod.attachVoiceGateway).toBeDefined();
    expect(typeof mod.attachVoiceGateway).toBe("function");
  });

  it("can import voiceTokenRoute module without errors", async () => {
    const mod = await import("./voiceTokenRoute");
    expect(mod.registerVoiceTokenRoute).toBeDefined();
    expect(typeof mod.registerVoiceTokenRoute).toBe("function");
  });

  it("can import wsAuth module without errors", async () => {
    const mod = await import("./wsAuth");
    expect(mod.generateWsToken).toBeDefined();
    expect(mod.verifyWsToken).toBeDefined();
  });

  it("generateWsToken produces a valid JWT and verifyWsToken can decode it", async () => {
    const { generateWsToken, verifyWsToken } = await import("./wsAuth");
    const token = await generateWsToken(1, "admin", "TestUser");
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // JWT has 3 parts

    const user = await verifyWsToken(token);
    expect(user).not.toBeNull();
    expect(user!.userId).toBe(1);
    expect(user!.role).toBe("admin");
    expect(user!.name).toBe("TestUser");
  });

  it("verifyWsToken rejects invalid tokens", async () => {
    const { verifyWsToken } = await import("./wsAuth");
    const result = await verifyWsToken("invalid.token.here");
    expect(result).toBeNull();
  });

  it("verifyWsToken rejects empty string", async () => {
    const { verifyWsToken } = await import("./wsAuth");
    const result = await verifyWsToken("");
    expect(result).toBeNull();
  });
});

describe("Voice Gateway - Gemini Live Model Availability", () => {
  it("gemini-2.5-flash-native-audio-latest model exists in API", async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY not set — skipping live test");
      return;
    }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-native-audio-latest?key=${apiKey}`,
      { method: "GET" }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toContain("gemini-2.5-flash-native-audio");
    // Verify it supports bidirectional content (Live API)
    expect(data.supportedGenerationMethods).toContain("bidiGenerateContent");
  });
});

describe("Voice Token Route - Request Handling", () => {
  it("returns 401 JSON when no session cookie is present", async () => {
    // Simulate a request to the token endpoint without auth
    const { registerVoiceTokenRoute } = await import("./voiceTokenRoute");

    // Create a mock Express app
    let registeredHandler: any = null;
    const mockApp = {
      get: (path: string, handler: any) => {
        if (path === "/api/voice/token") {
          registeredHandler = handler;
        }
      },
    };

    registerVoiceTokenRoute(mockApp as any);
    expect(registeredHandler).not.toBeNull();

    // Call the handler with a mock request (no cookies)
    const mockReq = {
      headers: { cookie: "" },
    };
    let statusCode = 0;
    let responseBody: any = null;
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (body: any) => {
        responseBody = body;
        return mockRes;
      },
    };

    await registeredHandler(mockReq, mockRes);

    expect(statusCode).toBe(401);
    expect(responseBody).toBeDefined();
    expect(responseBody.error).toBeDefined();
    // Should be JSON, not HTML
    expect(typeof responseBody.error).toBe("string");
  });
});

describe("Voice Gateway - Connection Timeout Configuration", () => {
  it("timeout constant is defined and reasonable (10-60 seconds)", async () => {
    // Read the file to check the constant
    const fs = await import("fs");
    const content = fs.readFileSync("server/voiceGateway.ts", "utf-8");
    const match = content.match(/GEMINI_CONNECT_TIMEOUT_MS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const timeout = parseInt(match![1]);
    expect(timeout).toBeGreaterThanOrEqual(10000); // At least 10s
    expect(timeout).toBeLessThanOrEqual(60000); // At most 60s
  });

  it("uses sendClientContent for greeting (not sendRealtimeInput)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/voiceGateway.ts", "utf-8");
    // The greeting should use sendClientContent
    expect(content).toContain("session.sendClientContent(");
    // Should have turnComplete: true for the greeting
    expect(content).toContain("turnComplete: true");
  });

  it("has try/catch around greeting send", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/voiceGateway.ts", "utf-8");
    // The greeting send should be wrapped in try/catch
    expect(content).toContain("Failed to send greeting");
  });

  it("checks clientWs.readyState before sending messages in callbacks", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/voiceGateway.ts", "utf-8");
    // Should check WebSocket state before sending
    const readyStateChecks = (content.match(/clientWs\.readyState === WebSocket\.OPEN/g) || []).length;
    expect(readyStateChecks).toBeGreaterThanOrEqual(5); // Multiple checks in callbacks
  });

  it("wraps onmessage callback in try/catch", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/voiceGateway.ts", "utf-8");
    expect(content).toContain("onmessage callback error");
  });

  it("logs API key presence at startup", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/voiceGateway.ts", "utf-8");
    expect(content).toContain("[Hibba] API key configured:");
  });
});
