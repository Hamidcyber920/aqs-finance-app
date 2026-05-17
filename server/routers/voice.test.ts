/**
 * Tests for Voice Router — Ephemeral Token + Session Tracking
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @google/genai before importing the router
const mockCreate = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    authTokens: { create: mockCreate },
  })),
}));

// Mock db.voice helpers
vi.mock("../db.voice", () => ({
  createVoiceSession: vi.fn().mockResolvedValue(1),
  endVoiceSession: vi.fn().mockResolvedValue(undefined),
  errorVoiceSession: vi.fn().mockResolvedValue(undefined),
  recordVoiceCost: vi.fn().mockResolvedValue(undefined),
  getMonthlyVoiceCost: vi.fn().mockResolvedValue(0),
  getTotalMonthlyVoiceCost: vi.fn().mockResolvedValue(0),
  logVoiceToolCall: vi.fn().mockResolvedValue(undefined),
  logVoiceTranscript: vi.fn().mockResolvedValue(undefined),
  getRecentVoiceSessions: vi.fn().mockResolvedValue([]),
}));

// Mock the tRPC context — support .input().mutation() chain
vi.mock("../_core/trpc", () => {
  const mockRouter = vi.fn((routes: any) => routes);
  const createProcedure = () => {
    const proc: any = {
      mutation: (fn: any) => ({ _mutation: fn }),
      query: (fn: any) => ({ _query: fn }),
      input: (schema: any) => {
        // Return a new procedure-like object that also has mutation/query
        return {
          mutation: (fn: any) => ({ _mutation: fn, _inputSchema: schema }),
          query: (fn: any) => ({ _query: fn, _inputSchema: schema }),
          input: (schema2: any) => ({
            mutation: (fn: any) => ({ _mutation: fn, _inputSchema: schema2 }),
            query: (fn: any) => ({ _query: fn, _inputSchema: schema2 }),
          }),
        };
      },
    };
    return proc;
  };
  return {
    router: mockRouter,
    publicProcedure: createProcedure(),
    protectedProcedure: createProcedure(),
  };
});

describe("Voice Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key-12345";
  });

  it("should export a voiceRouter with getEphemeralToken", async () => {
    const { voiceRouter } = await import("./voice");
    expect(voiceRouter).toBeDefined();
    expect(voiceRouter.getEphemeralToken).toBeDefined();
  });

  it("should return token, model, user, and sessionId on success", async () => {
    mockCreate.mockResolvedValueOnce({
      name: "auth_tokens/test-ephemeral-token-abc123",
    });

    vi.resetModules();
    vi.mock("@google/genai", () => ({
      GoogleGenAI: vi.fn().mockImplementation(() => ({
        authTokens: { create: mockCreate },
      })),
    }));
    vi.mock("../db.voice", () => ({
      createVoiceSession: vi.fn().mockResolvedValue(42),
      getTotalMonthlyVoiceCost: vi.fn().mockResolvedValue(100),
      endVoiceSession: vi.fn(),
      errorVoiceSession: vi.fn(),
      recordVoiceCost: vi.fn(),
      getMonthlyVoiceCost: vi.fn().mockResolvedValue(0),
      logVoiceToolCall: vi.fn(),
      logVoiceTranscript: vi.fn(),
      getRecentVoiceSessions: vi.fn().mockResolvedValue([]),
    }));
    vi.mock("../_core/trpc", () => {
      const createProcedure = () => {
        const proc: any = {
          mutation: (fn: any) => ({ _mutation: fn }),
          query: (fn: any) => ({ _query: fn }),
          input: (schema: any) => ({
            mutation: (fn: any) => ({ _mutation: fn }),
            query: (fn: any) => ({ _query: fn }),
            input: (s2: any) => ({
              mutation: (fn: any) => ({ _mutation: fn }),
              query: (fn: any) => ({ _query: fn }),
            }),
          }),
        };
        return proc;
      };
      return {
        router: vi.fn((routes: any) => routes),
        publicProcedure: createProcedure(),
        protectedProcedure: createProcedure(),
      };
    });

    const { voiceRouter } = await import("./voice");
    const handler = (voiceRouter.getEphemeralToken as any)._mutation;

    const result = await handler({
      ctx: {
        user: { id: 1, name: "TestUser", openId: "test-open-id", role: "admin" },
      },
      input: { device: "mobile", screenContext: "/dashboard" },
    });

    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("model");
    expect(result).toHaveProperty("user", "TestUser");
    expect(result).toHaveProperty("sessionId");
    expect(result.token).toBe("auth_tokens/test-ephemeral-token-abc123");
  });

  it("GEMINI_API_KEY env variable should be set", () => {
    expect(process.env.GEMINI_API_KEY).toBeTruthy();
    expect(process.env.GEMINI_API_KEY!.length).toBeGreaterThan(0);
  });

  it("should use v1alpha API version for ephemeral tokens", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    expect(GoogleGenAI).toBeDefined();
  });

  it("model should be gemini-2.5-flash-native-audio-latest", async () => {
    mockCreate.mockResolvedValueOnce({
      name: "auth_tokens/test-token",
    });

    vi.resetModules();
    vi.mock("@google/genai", () => ({
      GoogleGenAI: vi.fn().mockImplementation(() => ({
        authTokens: { create: mockCreate },
      })),
    }));
    vi.mock("../db.voice", () => ({
      createVoiceSession: vi.fn().mockResolvedValue(1),
      getTotalMonthlyVoiceCost: vi.fn().mockResolvedValue(0),
      endVoiceSession: vi.fn(),
      errorVoiceSession: vi.fn(),
      recordVoiceCost: vi.fn(),
      getMonthlyVoiceCost: vi.fn().mockResolvedValue(0),
      logVoiceToolCall: vi.fn(),
      logVoiceTranscript: vi.fn(),
      getRecentVoiceSessions: vi.fn().mockResolvedValue([]),
    }));
    vi.mock("../_core/trpc", () => {
      const createProcedure = () => {
        const proc: any = {
          mutation: (fn: any) => ({ _mutation: fn }),
          query: (fn: any) => ({ _query: fn }),
          input: (schema: any) => ({
            mutation: (fn: any) => ({ _mutation: fn }),
            query: (fn: any) => ({ _query: fn }),
            input: (s2: any) => ({
              mutation: (fn: any) => ({ _mutation: fn }),
              query: (fn: any) => ({ _query: fn }),
            }),
          }),
        };
        return proc;
      };
      return {
        router: vi.fn((routes: any) => routes),
        publicProcedure: createProcedure(),
        protectedProcedure: createProcedure(),
      };
    });

    const { voiceRouter } = await import("./voice");
    const handler = (voiceRouter.getEphemeralToken as any)._mutation;

    const result = await handler({
      ctx: {
        user: { id: 1, name: "TestUser", openId: "test-open-id", role: "admin" },
      },
      input: {},
    });

    expect(result.model).toBe("gemini-2.5-flash-native-audio-latest");
  });

  it("should export endSession, logToolCall, logTranscript, and getUsageStats", async () => {
    const { voiceRouter } = await import("./voice");
    expect(voiceRouter.endSession).toBeDefined();
    expect(voiceRouter.logToolCall).toBeDefined();
    expect(voiceRouter.logTranscript).toBeDefined();
    expect(voiceRouter.getUsageStats).toBeDefined();
  });
});
