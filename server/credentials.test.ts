import { describe, it, expect } from "vitest";
import { google } from "googleapis";

/**
 * Validates that the Gmail and Google Drive OAuth credentials are correctly
 * configured and can obtain a valid access token from Google.
 */

function makeGmailAuth() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
}

function makeDriveAuth() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
}

describe("Gmail API credentials", () => {
  it("env vars are present", () => {
    expect(process.env.GMAIL_CLIENT_ID, "GMAIL_CLIENT_ID missing").toBeTruthy();
    expect(process.env.GMAIL_CLIENT_SECRET, "GMAIL_CLIENT_SECRET missing").toBeTruthy();
    expect(process.env.GMAIL_REFRESH_TOKEN, "GMAIL_REFRESH_TOKEN missing").toBeTruthy();
    expect(process.env.GMAIL_FROM_EMAIL, "GMAIL_FROM_EMAIL missing").toBeTruthy();
  });

  it("can exchange refresh token for access token", async () => {
    const auth = makeGmailAuth();
    auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const { token } = await auth.getAccessToken();
    expect(token, "Gmail access token should not be null").toBeTruthy();
  });
});

describe("Google Drive API credentials", () => {
  it("env vars are present", () => {
    expect(process.env.GOOGLE_DRIVE_CLIENT_ID, "GOOGLE_DRIVE_CLIENT_ID missing").toBeTruthy();
    expect(process.env.GOOGLE_DRIVE_CLIENT_SECRET, "GOOGLE_DRIVE_CLIENT_SECRET missing").toBeTruthy();
    expect(process.env.GOOGLE_DRIVE_REFRESH_TOKEN, "GOOGLE_DRIVE_REFRESH_TOKEN missing").toBeTruthy();
    expect(process.env.GOOGLE_DRIVE_PAYROLL_FOLDER_ID, "GOOGLE_DRIVE_PAYROLL_FOLDER_ID missing").toBeTruthy();
  });

  it("can exchange refresh token for access token", async () => {
    const auth = makeDriveAuth();
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    const { token } = await auth.getAccessToken();
    expect(token, "Drive access token should not be null").toBeTruthy();
  });

  it("can list files in the payroll folder", async () => {
    const auth = makeDriveAuth();
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.list({
      q: `'${process.env.GOOGLE_DRIVE_PAYROLL_FOLDER_ID}' in parents and trashed = false`,
      fields: "files(id, name, mimeType)",
      pageSize: 5,
    });
    // Just verify the API call succeeds — folder may be empty
    expect(Array.isArray(res.data.files)).toBe(true);
  });
});
