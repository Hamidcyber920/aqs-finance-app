import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { registerGoogleReauthRoutes } from "./googleReauth";

// Mock googleapis
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?test=1"),
        getAccessToken: vi.fn().mockResolvedValue({ token: "mock_access_token" }),
        setCredentials: vi.fn(),
        getToken: vi.fn().mockResolvedValue({
          tokens: { refresh_token: "new_mock_refresh_token", access_token: "mock_access" },
        }),
      })),
    },
    drive: vi.fn().mockReturnValue({
      files: { list: vi.fn().mockResolvedValue({ data: { files: [{ id: "1", name: "test.txt" }] } }) },
    }),
    gmail: vi.fn().mockReturnValue({
      users: { getProfile: vi.fn().mockResolvedValue({ data: { emailAddress: "test@test.com" } }) },
    }),
  },
}));

describe("Google Reauth Routes", () => {
  let app: express.Express;

  beforeAll(() => {
    process.env.GOOGLE_REAUTH_CLIENT_ID = "test_reauth_client_id";
    process.env.GOOGLE_REAUTH_CLIENT_SECRET = "test_reauth_client_secret";
    process.env.GMAIL_CLIENT_ID = "test_client_id";
    process.env.GMAIL_CLIENT_SECRET = "test_client_secret";
    process.env.GMAIL_REFRESH_TOKEN = "test_refresh_token";
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = "test_drive_refresh_token";

    app = express();
    app.use(express.json());
    registerGoogleReauthRoutes(app);
  });

  describe("GET /api/google/auth-url", () => {
    it("should return an authorization URL", async () => {
      const res = await request(app)
        .get("/api/google/auth-url")
        .set("Origin", "https://test.manus.space");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("url");
      expect(res.body.url).toContain("accounts.google.com");
    });
  });

  describe("GET /api/google/status", () => {
    it("should return connection status", async () => {
      const res = await request(app).get("/api/google/status");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("connected");
      expect(typeof res.body.connected).toBe("boolean");
    });

    it("should include drive and gmail status when connected", async () => {
      const res = await request(app).get("/api/google/status");

      expect(res.status).toBe(200);
      // With our mock, both should be connected
      expect(res.body.connected).toBe(true);
      expect(res.body.drive).toBe(true);
      expect(res.body.gmail).toBe(true);
    });
  });

  describe("GET /api/google/callback", () => {
    it("should redirect with error if no code provided", async () => {
      const res = await request(app)
        .get("/api/google/callback")
        .query({ state: Buffer.from(JSON.stringify({ origin: "https://test.manus.space" })).toString("base64") });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("google_auth=error");
    });

    it("should redirect with error if OAuth error is present", async () => {
      const res = await request(app)
        .get("/api/google/callback")
        .query({ error: "access_denied" });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("google_auth=error");
      expect(res.headers.location).toContain("access_denied");
    });

    it("should handle successful callback with code and state", async () => {
      const state = Buffer.from(JSON.stringify({ origin: "https://test.manus.space" })).toString("base64");
      const res = await request(app)
        .get("/api/google/callback")
        .query({ code: "mock_auth_code", state });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("google_auth=success");
    });
  });
});
