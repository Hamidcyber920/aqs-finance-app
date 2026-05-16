/**
 * Tests for the SSE-based Hibba Voice Gateway
 * Covers: session creation, auth, audio/text endpoints, session lifecycle, model config
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ─── Shared mocks ────────────────────────────────────────────────────────────

vi.mock("@google/genai", () => {
  const mockSession = {
    sendRealtimeInput: vi.fn(),
    sendClientContent: vi.fn(),
    sendToolResponse: vi.fn(),
    close: vi.fn(),
  };
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      live: { connect: vi.fn().mockResolvedValue(mockSession) },
    })),
    Modality: { AUDIO: "AUDIO" },
    Type: { OBJECT: "OBJECT", STRING: "STRING", INTEGER: "INTEGER", NUMBER: "NUMBER", BOOLEAN: "BOOLEAN" },
  };
});

vi.mock("./db", () => ({
  getDonors: vi.fn().mockResolvedValue([]),
  getLoans: vi.fn().mockResolvedValue([]),
  getTrustees: vi.fn().mockResolvedValue([]),
  listAllUsers: vi.fn().mockResolvedValue([]),
  getDashboardStats: vi.fn().mockResolvedValue({ totalDonations: 0 }),
  getCampaignById: vi.fn().mockResolvedValue(null),
  getFundraisingCampaigns: vi.fn().mockResolvedValue([]),
  getDonorById: vi.fn().mockResolvedValue(null),
}));

// ─── API key & wsAuth ────────────────────────────────────────────────────────

describe("Voice Gateway — Environment & Auth", () => {
  it("GEMINI_API_KEY is set in environment", () => {
    expect(process.env.GEMINI_API_KEY).toBeTruthy();
  });

  it("GEMINI_API_KEY has reasonable length (39+ chars)", () => {
    const key = process.env.GEMINI_API_KEY || "";
    expect(key.length).toBeGreaterThanOrEqual(39);
  });

  it("can import voiceGateway module without errors", async () => {
    const mod = await import("./voiceGateway");
    expect(mod.registerVoiceRoutes).toBeDefined();
    expect(typeof mod.registerVoiceRoutes).toBe("function");
    // Backward compat alias
    expect(mod.attachVoiceGateway).toBe(mod.registerVoiceRoutes);
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
    expect(token.split(".").length).toBe(3);

    const user = await verifyWsToken(token);
    expect(user).not.toBeNull();
    expect(user!.userId).toBe(1);
    expect(user!.role).toBe("admin");
    expect(user!.name).toBe("TestUser");
  });

  it("verifyWsToken rejects invalid tokens", async () => {
    const { verifyWsToken } = await import("./wsAuth");
    expect(await verifyWsToken("invalid.token.here")).toBeNull();
  });

  it("verifyWsToken rejects empty string", async () => {
    const { verifyWsToken } = await import("./wsAuth");
    expect(await verifyWsToken("")).toBeNull();
  });
});

// ─── Gemini model availability ───────────────────────────────────────────────

describe("Voice Gateway — Gemini Live Model Availability", () => {
  it("gemini-2.5-flash-native-audio-latest model exists in API", async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.warn("GEMINI_API_KEY not set — skipping"); return; }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-native-audio-latest?key=${apiKey}`
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toContain("gemini-2.5-flash-native-audio");
    expect(data.supportedGenerationMethods).toContain("bidiGenerateContent");
  });
});

// ─── SSE Route Tests (using supertest) ───────────────────────────────────────

describe("Voice Gateway — SSE Route Endpoints", () => {
  let app: express.Express;
  let validToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    // Reset the module-level mocks
    vi.resetModules();

    // We need to use the real wsAuth for token generation
    const { generateWsToken } = await import("./wsAuth");
    validToken = await generateWsToken(42, "admin", "Dr. Hamid");

    // Re-import registerVoiceRoutes after reset
    const { registerVoiceRoutes } = await import("./voiceGateway");
    registerVoiceRoutes(app);
  });

  // ── POST /api/voice/start ──────────────────────────────────────────────────

  describe("POST /api/voice/start", () => {
    it("returns 401 when no auth header", async () => {
      const res = await request(app).post("/api/voice/start").send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toContain("No authentication token");
    });

    it("returns 401 when token is invalid", async () => {
      const res = await request(app)
        .post("/api/voice/start")
        .set("Authorization", "Bearer garbage-token")
        .send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toContain("Authentication failed");
    });

    it("creates session with valid token", async () => {
      const res = await request(app)
        .post("/api/voice/start")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ voice: "Aoede" });
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBeDefined();
      expect(typeof res.body.sessionId).toBe("string");
      expect(res.body.user).toBe("Dr. Hamid");
      expect(res.body.voice).toBe("Aoede");
    });

    it("defaults voice to Aoede when not specified", async () => {
      const res = await request(app)
        .post("/api/voice/start")
        .set("Authorization", `Bearer ${validToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.voice).toBe("Aoede");
    });
  });

  // ── POST /api/voice/audio ──────────────────────────────────────────────────

  describe("POST /api/voice/audio", () => {
    it("returns 400 when missing fields", async () => {
      const res = await request(app)
        .post("/api/voice/audio")
        .set("Authorization", `Bearer ${validToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("returns 404 when session doesn't exist", async () => {
      const res = await request(app)
        .post("/api/voice/audio")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ sessionId: "nonexistent-id", data: "base64audio" });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/voice/text ───────────────────────────────────────────────────

  describe("POST /api/voice/text", () => {
    it("returns 400 when missing fields", async () => {
      const res = await request(app)
        .post("/api/voice/text")
        .set("Authorization", `Bearer ${validToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("returns 404 when session doesn't exist", async () => {
      const res = await request(app)
        .post("/api/voice/text")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ sessionId: "nonexistent-id", text: "hello" });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/voice/stop ───────────────────────────────────────────────────

  describe("POST /api/voice/stop", () => {
    it("returns 400 when missing sessionId", async () => {
      const res = await request(app)
        .post("/api/voice/stop")
        .set("Authorization", `Bearer ${validToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("returns 404 when session doesn't exist", async () => {
      const res = await request(app)
        .post("/api/voice/stop")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ sessionId: "nonexistent-id" });
      expect(res.status).toBe(404);
    });
  });

  // ── GET /api/voice/stream ──────────────────────────────────────────────────

  describe("GET /api/voice/stream", () => {
    it("returns 400 when missing params", async () => {
      const res = await request(app).get("/api/voice/stream");
      expect(res.status).toBe(400);
    });

    it("returns 401 when token is invalid", async () => {
      const res = await request(app).get("/api/voice/stream?sessionId=test&token=bad");
      expect(res.status).toBe(401);
    });

    it("returns 404 when session doesn't exist", async () => {
      const res = await request(app).get(`/api/voice/stream?sessionId=nonexistent&token=${validToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ── Session lifecycle ──────────────────────────────────────────────────────

  describe("Session lifecycle", () => {
    it("creates session then stops it successfully", async () => {
      const startRes = await request(app)
        .post("/api/voice/start")
        .set("Authorization", `Bearer ${validToken}`)
        .send({});
      expect(startRes.status).toBe(200);
      const { sessionId } = startRes.body;

      const stopRes = await request(app)
        .post("/api/voice/stop")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ sessionId });
      expect(stopRes.status).toBe(200);
      expect(stopRes.body.ok).toBe(true);

      // Stopping again returns 404
      const stopRes2 = await request(app)
        .post("/api/voice/stop")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ sessionId });
      expect(stopRes2.status).toBe(404);
    });

    it("prevents cross-user session access", async () => {
      // User 42 creates session
      const startRes = await request(app)
        .post("/api/voice/start")
        .set("Authorization", `Bearer ${validToken}`)
        .send({});
      const { sessionId } = startRes.body;

      // User 99 tries to stop it
      const { generateWsToken } = await import("./wsAuth");
      const otherToken = await generateWsToken(99, "user", "OtherUser");
      const stopRes = await request(app)
        .post("/api/voice/stop")
        .set("Authorization", `Bearer ${otherToken}`)
        .send({ sessionId });
      expect(stopRes.status).toBe(404);
    });
  });
});

// ─── Source code verification ────────────────────────────────────────────────

describe("Voice Gateway — Source Code Verification", () => {
  let source: string;

  beforeEach(async () => {
    const fs = await import("fs");
    source = fs.readFileSync("server/voiceGateway.ts", "utf-8");
  });

  it("uses gemini-2.5-flash-native-audio-latest model", () => {
    expect(source).toContain("gemini-2.5-flash-native-audio-latest");
    expect(source).not.toContain("gemini-2.0-flash-live-001");
  });

  it("uses SSE transport (text/event-stream)", () => {
    expect(source).toContain("text/event-stream");
    expect(source).toContain("X-Accel-Buffering");
  });

  it("registers all five voice routes", () => {
    expect(source).toContain("/api/voice/start");
    expect(source).toContain("/api/voice/stream");
    expect(source).toContain("/api/voice/audio");
    expect(source).toContain("/api/voice/text");
    expect(source).toContain("/api/voice/stop");
  });

  it("does NOT use WebSocket server", () => {
    expect(source).not.toContain("new WebSocketServer");
    expect(source).not.toContain("ws.on(\"connection\"");
    expect(source).not.toContain("wss.handleUpgrade");
  });

  it("has connection timeout for Gemini", () => {
    const match = source.match(/GEMINI_CONNECT_TIMEOUT_MS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const timeout = parseInt(match![1]);
    expect(timeout).toBeGreaterThanOrEqual(10000);
    expect(timeout).toBeLessThanOrEqual(60000);
  });

  it("uses sendClientContent for greeting (not sendRealtimeInput)", () => {
    // Find the greeting section
    expect(source).toContain("session.geminiSession.sendClientContent(");
    expect(source).toContain("turnComplete: true");
    expect(source).toContain("Failed to send greeting");
  });

  it("sends keepalive comments to prevent proxy timeout", () => {
    expect(source).toContain(":keepalive");
  });

  it("has session TTL and cleanup", () => {
    expect(source).toContain("SESSION_TTL_MS");
    expect(source).toContain("cleanupSession");
  });

  it("logs API key presence at startup", () => {
    expect(source).toContain("[Hibba] API key configured:");
  });
});

// ─── Voice Token Route ───────────────────────────────────────────────────────

describe("Voice Token Route — Request Handling", () => {
  it("returns 401 JSON when no session cookie is present", async () => {
    const { registerVoiceTokenRoute } = await import("./voiceTokenRoute");

    let registeredHandler: any = null;
    const mockApp = {
      get: (path: string, handler: any) => {
        if (path === "/api/voice/token") registeredHandler = handler;
      },
    };

    registerVoiceTokenRoute(mockApp as any);
    expect(registeredHandler).not.toBeNull();

    const mockReq = { headers: { cookie: "" } };
    let statusCode = 0;
    let responseBody: any = null;
    const mockRes = {
      status: (code: number) => { statusCode = code; return mockRes; },
      json: (body: any) => { responseBody = body; return mockRes; },
    };

    await registeredHandler(mockReq, mockRes);
    expect(statusCode).toBe(401);
    expect(responseBody).toBeDefined();
    expect(typeof responseBody.error).toBe("string");
  });
});
