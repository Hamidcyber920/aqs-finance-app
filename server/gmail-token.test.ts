import { describe, it, expect } from "vitest";

describe("Gmail OAuth Token Validation", () => {
  it("should successfully refresh the Gmail access token", async () => {
    const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
    const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
    const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

    expect(GMAIL_CLIENT_ID).toBeTruthy();
    expect(GMAIL_CLIENT_SECRET).toBeTruthy();
    expect(GMAIL_REFRESH_TOKEN).toBeTruthy();

    console.log('Using Client ID:', GMAIL_CLIENT_ID?.substring(0, 12) + '...');
    console.log('Using Refresh Token:', GMAIL_REFRESH_TOKEN?.substring(0, 15) + '...');

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID!,
        client_secret: GMAIL_CLIENT_SECRET!,
        refresh_token: GMAIL_REFRESH_TOKEN!,
        grant_type: "refresh_token",
      }),
    });

    const body = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Token refresh failed:", JSON.stringify(body));
    }

    expect(tokenRes.ok).toBe(true);
    expect(body.access_token).toBeTruthy();
    expect(typeof body.access_token).toBe("string");
  });
});
