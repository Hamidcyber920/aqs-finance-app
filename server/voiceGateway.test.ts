/**
 * Tests for the minimal SSE-based Hibba Voice Gateway
 * No tools — pure audio conversation only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ─── Shared mocks ────────────────────────────────────────────────────────────

vi.mock("@google/genai", () => {
  const mockSession = {
    sendRealtimeInput: vi.fn(),
    sendClientContent: vi.fn(),
    close: vi.fn(),
  };
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      live: { connect: vi.fn().mockResolvedValue(mockSession) },
    })),
    Modality: { AUDIO: "AUDIO" },
  };
});

// ─── Environment & Module Imports ───────────────────────────────────────────

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
    expect(mod.attachVoiceGateway).toBe(mod.registerVoiceRoutes);
  });

  it("can import voiceTokenRoute module without errors", async () => {
    const mod = await import("./voiceTokenRoute");
    expect(mod.registerVoiceTokenRoute).toBeDefined();
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
    expect(await verifyWsToken("")).toBeNull();
  });
});

// ─── Route Tests ────────────────────────────────────────────────────────────

describe("Voice Gateway — Route Endpoints", () => {
  let app: express.Express;
  let validToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    vi.resetModules();

    const { generateWsToken } = await import("./wsAuth");
    validToken = await generateWsToken(42, "admin", "Dr. Hamid");

    const { registerVoiceRoutes } = await import("./voiceGateway");
    registerVoiceRoutes(app);
  });

  describe("POST /api/voice/start", () => {
    it("returns 401 when no auth header", async () => {
      const res = await request(app).post("/api/voice/start").send({});
      expect(res.status).toBe(401);
    });

    it("returns 401 when token is invalid", async () => {
      const res = await request(app)
        .post("/api/voice/start")
        .set("Authorization", "Bearer garbage-token")
        .send({});
      expect(res.status).toBe(401);
    });

    it("creates session with valid token", async () => {
      const res = await request(app)
        .post("/api/voice/start")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ voice: "Aoede" });
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.user).toBe("Dr. Hamid");
      expect(res.body.voice).toBe("Aoede");
    });
  });

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

  describe("POST /api/voice/stop", () => {
    it("returns 400 without token (missing params)", async () => {
      const res = await request(app).post("/api/voice/stop").send({ sessionId: "x" });
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
      const startRes = await request(app)
        .post("/api/voice/start")
        .set("Authorization", `Bearer ${validToken}`)
        .send({});
      const { sessionId } = startRes.body;

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

// ─── Source Code Verification ───────────────────────────────────────────────

describe("Voice Gateway — Source Code Verification", () => {
  let source: string;

  beforeEach(async () => {
    const fs = await import("fs");
    source = fs.readFileSync("server/voiceGateway.ts", "utf-8");
  });

  it("uses gemini-3.1-flash-live-preview model", () => {
    expect(source).toContain("gemini-3.1-flash-live-preview");
  });

  it("does NOT include tool declarations or executeTool", () => {
    expect(source).not.toContain("TOOL_DECLARATIONS");
    expect(source).not.toContain("functionDeclarations");
    expect(source).not.toContain("executeTool");
  });

  it("uses SSE transport (text/event-stream)", () => {
    expect(source).toContain("text/event-stream");
    expect(source).toContain("X-Accel-Buffering");
  });

  it("registers four voice routes (no /text)", () => {
    expect(source).toContain("/api/voice/start");
    expect(source).toContain("/api/voice/stream");
    expect(source).toContain("/api/voice/audio");
    expect(source).toContain("/api/voice/stop");
  });

  it("does NOT use WebSocket server", () => {
    expect(source).not.toContain("new WebSocketServer");
    expect(source).not.toContain("wss.handleUpgrade");
  });

  it("has connection timeout for Gemini", () => {
    expect(source).toContain("CONNECT_TIMEOUT_MS");
  });

  it("uses sendClientContent for greeting", () => {
    expect(source).toContain("sendClientContent");
    expect(source).toContain("turnComplete: true");
  });

  it("sends keepalive comments to prevent proxy timeout", () => {
    expect(source).toContain(":keepalive");
  });

  it("has session TTL and cleanup", () => {
    expect(source).toContain("SESSION_TTL_MS");
    expect(source).toContain("cleanup");
  });

  it("includes outputAudioTranscription config", () => {
    expect(source).toContain("outputAudioTranscription");
    expect(source).toContain("inputAudioTranscription");
  });
});

// ─── Voice Token Route ──────────────────────────────────────────────────────

describe("Voice Token Route", () => {
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
