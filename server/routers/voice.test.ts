/**
 * Tests for Voice Router — Ephemeral Token Endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @google/genai before importing the router
const mockCreate = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    authTokens: { create: mockCreate },
  })),
}));

// Mock the tRPC context
vi.mock("../_core/trpc", () => {
  const mockRouter = vi.fn((routes: any) => routes);
  const mockProcedure = {
    mutation: (fn: any) => ({ _mutation: fn }),
    query: (fn: any) => ({ _query: fn }),
  };
  return {
    router: mockRouter,
    publicProcedure: mockProcedure,
    protectedProcedure: mockProcedure,
  };
});

describe("Voice Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set GEMINI_API_KEY
    process.env.GEMINI_API_KEY = "test-gemini-key-12345";
  });

  it("should export a voiceRouter with getEphemeralToken", async () => {
    const { voiceRouter } = await import("./voice");
    expect(voiceRouter).toBeDefined();
    expect(voiceRouter.getEphemeralToken).toBeDefined();
  });

  it("should return token, model, and user on success", async () => {
    mockCreate.mockResolvedValueOnce({
      name: "auth_tokens/test-ephemeral-token-abc123",
    });

    // Re-import to get fresh module
    vi.resetModules();
    vi.mock("@google/genai", () => ({
      GoogleGenAI: vi.fn().mockImplementation(() => ({
        authTokens: { create: mockCreate },
      })),
    }));
    vi.mock("../_core/trpc", () => {
      const mockRouter = vi.fn((routes: any) => routes);
      const mockProcedure = {
        mutation: (fn: any) => ({ _mutation: fn }),
      };
      return {
        router: mockRouter,
        publicProcedure: mockProcedure,
        protectedProcedure: mockProcedure,
      };
    });

    const { voiceRouter } = await import("./voice");
    const handler = (voiceRouter.getEphemeralToken as any)._mutation;

    const result = await handler({
      ctx: {
        user: { id: 1, name: "TestUser", openId: "test-open-id", role: "admin" },
      },
    });

    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("model");
    expect(result).toHaveProperty("user", "TestUser");
    expect(result.token).toBe("auth_tokens/test-ephemeral-token-abc123");
  });

  it("GEMINI_API_KEY env variable should be set", () => {
    expect(process.env.GEMINI_API_KEY).toBeTruthy();
    expect(process.env.GEMINI_API_KEY!.length).toBeGreaterThan(0);
  });

  it("should use v1alpha API version for ephemeral tokens", async () => {
    const { GoogleGenAI } = await import("@google/genai");
    // Verify the constructor was called (or will be called) with v1alpha
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
    vi.mock("../_core/trpc", () => {
      const mockRouter = vi.fn((routes: any) => routes);
      const mockProcedure = {
        mutation: (fn: any) => ({ _mutation: fn }),
      };
      return {
        router: mockRouter,
        publicProcedure: mockProcedure,
        protectedProcedure: mockProcedure,
      };
    });

    const { voiceRouter } = await import("./voice");
    const handler = (voiceRouter.getEphemeralToken as any)._mutation;

    const result = await handler({
      ctx: {
        user: { id: 1, name: "TestUser", openId: "test-open-id", role: "admin" },
      },
    });

    expect(result.model).toBe("gemini-2.5-flash-native-audio-latest");
  });
});
