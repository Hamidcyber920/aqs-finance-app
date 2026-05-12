/**
 * WebSocket Authentication Token Generator
 * 
 * Generates short-lived JWT tokens for WebSocket connections.
 * This is needed because some browsers (especially iOS Safari) don't send
 * httpOnly cookies on WebSocket upgrade requests.
 * 
 * Flow:
 * 1. Frontend calls GET /api/voice/token (authenticated via cookie)
 * 2. Server generates a short-lived JWT (30 seconds)
 * 3. Frontend passes token as query param: ws://host/api/voice?token=xxx
 * 4. WebSocket server verifies the token on connection
 */
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

const WS_TOKEN_EXPIRY = "30s"; // Very short-lived - only needs to last until WS connects

function getSecretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function generateWsToken(userId: number, role: string, name: string): Promise<string> {
  const token = await new SignJWT({ userId, role, name, purpose: "ws_auth" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(WS_TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(getSecretKey());
  return token;
}

export async function verifyWsToken(token: string): Promise<{ userId: number; role: string; name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.purpose !== "ws_auth") return null;
    return {
      userId: payload.userId as number,
      role: payload.role as string,
      name: (payload.name as string) || "User",
    };
  } catch {
    return null;
  }
}
