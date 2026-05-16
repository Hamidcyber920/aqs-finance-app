/**
 * Hibba Voice Gateway — Minimal SSE + HTTP POST Transport
 * Uses @google/genai SDK with ai.live.connect() for Gemini 3.1 Flash Live Preview
 * Voice: Aoede | Model: gemini-3.1-flash-live-preview
 *
 * Architecture:
 *   POST /api/voice/start   → Authenticate, create session entry, return sessionId
 *   GET  /api/voice/stream   → SSE stream (server→client: audio, transcript, status)
 *   POST /api/voice/audio    → Send audio chunks from client to Gemini
 *   POST /api/voice/stop     → End a session
 *
 * NO TOOLS — pure audio conversation only. Tools will be added incrementally once
 * this minimal version works end-to-end on the deployed site.
 */
import type { Express, Request, Response } from "express";
import { GoogleGenAI, Modality } from "@google/genai";
import type { Session } from "@google/genai";
import { verifyWsToken } from "./wsAuth";
import crypto from "crypto";

// ─── Config ─────────────────────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY || "";
const MODEL = "gemini-3.1-flash-live-preview";
const VOICE = "Aoede";
const CONNECT_TIMEOUT_MS = 20_000;
const SESSION_TTL_MS = 10 * 60 * 1000;

console.log(`[Hibba] API key present: ${!!apiKey} (len ${apiKey.length}), model: ${MODEL}`);

// ─── System Instruction (minimal — identity only) ───────────────────────────
const SYSTEM_INSTRUCTION = `You are Hibba, a voice assistant for the Abdullah Quilliam Society (AQS).
You speak with a refined British English accent, authoritative yet warm.
Greet users with "Assalamu Alaikum" followed by their name.
You are helpful, concise, and professional. Keep responses short for voice.`;

// ─── Session Management ─────────────────────────────────────────────────────
interface VoiceSession {
  id: string;
  userId: number;
  userName: string;
  geminiSession: Session | null;
  sseRes: Response | null;
  createdAt: number;
  lastActivity: number;
}

const sessions = new Map<string, VoiceSession>();

// Cleanup stale sessions every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS || now - s.lastActivity > 5 * 60_000) {
      console.log(`[Hibba] Cleaning stale session ${id}`);
      cleanup(id);
    }
  }
}, 60_000);

function cleanup(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  try { s.geminiSession?.close(); } catch { /* ignore */ }
  try { if (s.sseRes && !s.sseRes.writableEnded) s.sseRes.end(); } catch { /* ignore */ }
  sessions.delete(id);
}

// ─── SSE Helper ─────────────────────────────────────────────────────────────
function sse(res: Response, event: string, data: any) {
  if (res.writableEnded) return;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch { /* client gone */ }
}

// ─── Register Routes ────────────────────────────────────────────────────────
export function registerVoiceRoutes(app: Express) {

  // ── POST /api/voice/start ──
  app.post("/api/voice/start", async (req: Request, res: Response) => {
    console.log("[Hibba] POST /api/voice/start");

    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7) : null;
    if (!token) return res.status(401).json({ error: "No token" });

    const user = await verifyWsToken(token);
    if (!user) return res.status(401).json({ error: "Auth failed" });

    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

    const sessionId = crypto.randomUUID();
    console.log(`[Hibba] Session ${sessionId} for ${user.name}`);

    sessions.set(sessionId, {
      id: sessionId,
      userId: user.userId,
      userName: user.name,
      geminiSession: null,
      sseRes: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });

    return res.json({ sessionId, user: user.name, voice: VOICE });
  });

  // ── GET /api/voice/stream — SSE ──
  app.get("/api/voice/stream", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const token = req.query.token as string;

    if (!sessionId || !token) return res.status(400).json({ error: "Missing params" });

    const user = await verifyWsToken(token);
    if (!user) return res.status(401).json({ error: "Auth failed" });

    const session = sessions.get(sessionId);
    if (!session || session.userId !== user.userId) {
      return res.status(404).json({ error: "Session not found" });
    }

    console.log(`[Hibba] SSE stream for ${sessionId} (${user.name})`);

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    session.sseRes = res;
    sse(res, "connected", { sessionId });

    // Connect to Gemini Live
    try {
      console.log(`[Hibba] Connecting to ${MODEL}...`);
      const ai = new GoogleGenAI({ apiKey });

      const connectPromise = ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
          },
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log(`[Hibba] Gemini onopen for ${sessionId}`);
          },
          onmessage: (message: any) => {
            try {
              session.lastActivity = Date.now();

              const sc = message?.serverContent;
              if (!sc) return;

              // Audio output
              const audioPart = sc?.modelTurn?.parts?.[0]?.inlineData;
              if (audioPart?.data) {
                sse(res, "audio", { data: audioPart.data });
              }

              // Model text (from modelTurn)
              const textPart = sc?.modelTurn?.parts?.[0]?.text;
              if (textPart) {
                sse(res, "transcript", { text: textPart, source: "model" });
              }

              // Output transcription
              if (sc?.outputTranscription?.text) {
                sse(res, "transcript", { text: sc.outputTranscription.text, source: "output" });
              }

              // Input transcription
              if (sc?.inputTranscription?.text) {
                sse(res, "transcript", { text: sc.inputTranscription.text, source: "input" });
              }

              // Interruption
              if (sc?.interrupted) {
                sse(res, "interrupted", {});
              }
            } catch (err: any) {
              console.error("[Hibba] onmessage error:", err?.message);
            }
          },
          onerror: (error: any) => {
            const msg = error?.message || String(error);
            console.error("[Hibba] Gemini onerror:", msg);
            sse(res, "error", { message: `AI error: ${msg}` });
          },
          onclose: () => {
            console.log(`[Hibba] Gemini onclose for ${sessionId}`);
            sse(res, "session_ended", {});
            if (!res.writableEnded) res.end();
            sessions.delete(sessionId);
          },
        },
      });

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini connect timeout")), CONNECT_TIMEOUT_MS)
      );

      session.geminiSession = await Promise.race([connectPromise, timeout]);
      console.log(`[Hibba] Connected to Gemini for ${sessionId}`);
      sse(res, "session_started", { user: user.name, voice: VOICE });

      // Send greeting prompt
      try {
        session.geminiSession.sendClientContent({
          turns: [{
            role: "user",
            parts: [{ text: `Say hello to ${user.name}. Keep it brief.` }],
          }],
          turnComplete: true,
        });
      } catch (e: any) {
        console.error("[Hibba] Greeting error:", e?.message);
      }

    } catch (error: any) {
      const msg = error?.message || String(error);
      console.error("[Hibba] Connect failed:", msg);
      sse(res, "error", { message: `Connect failed: ${msg}` });
      if (!res.writableEnded) res.end();
      sessions.delete(sessionId);
      return;
    }

    // Keepalive every 15s
    const keepalive = setInterval(() => {
      if (res.writableEnded) { clearInterval(keepalive); return; }
      try { res.write(`:keepalive\n\n`); } catch { clearInterval(keepalive); }
    }, 15_000);

    req.on("close", () => {
      clearInterval(keepalive);
      console.log(`[Hibba] Client disconnected: ${sessionId}`);
      cleanup(sessionId);
    });
  });

  // ── POST /api/voice/audio ──
  app.post("/api/voice/audio", async (req: Request, res: Response) => {
    const { sessionId, data } = req.body;
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7) : null;

    if (!token || !sessionId || !data) {
      return res.status(400).json({ error: "Missing params" });
    }

    const user = await verifyWsToken(token);
    if (!user) return res.status(401).json({ error: "Auth failed" });

    const session = sessions.get(sessionId);
    if (!session || session.userId !== user.userId || !session.geminiSession) {
      return res.status(404).json({ error: "Session not ready" });
    }

    try {
      session.lastActivity = Date.now();
      session.geminiSession.sendRealtimeInput({
        audio: { data, mimeType: "audio/pcm;rate=16000" },
      });
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[Hibba] Audio send error:", err?.message);
      return res.status(500).json({ error: "Send failed" });
    }
  });

  // ── POST /api/voice/stop ──
  app.post("/api/voice/stop", async (req: Request, res: Response) => {
    const { sessionId } = req.body;
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7) : null;

    if (!token || !sessionId) return res.status(400).json({ error: "Missing params" });

    const user = await verifyWsToken(token);
    if (!user) return res.status(401).json({ error: "Auth failed" });

    const session = sessions.get(sessionId);
    if (!session || session.userId !== user.userId) {
      return res.status(404).json({ error: "Session not found" });
    }

    console.log(`[Hibba] Stopping ${sessionId}`);
    cleanup(sessionId);
    return res.json({ ok: true });
  });

  console.log(`[Hibba] Minimal voice routes registered (model: ${MODEL}, no tools)`);
}

// Backward compat export
export { registerVoiceRoutes as attachVoiceGateway };
