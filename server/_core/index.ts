import "dotenv/config";
import * as Sentry from "@sentry/node";

// Initialise Sentry as early as possible (before any imports that might throw)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    // Strip PII before sending to Sentry
    beforeSend(event) {
      // Remove user email and IP address from all events
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      // Scrub Authorization and Cookie headers from request data
      if (event.request?.headers) {
        delete (event.request.headers as Record<string, unknown>)["authorization"];
        delete (event.request.headers as Record<string, unknown>)["cookie"];
      }
      return event;
    },
  });
  console.log("[Sentry] Initialised");
}

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { uploadRouter } from "../uploadHandler";
import { extractRouter } from "../extractEndpoint";
import { registerScheduledBackupRoute } from "./scheduledBackup";
import { registerBackupOnMutationMiddleware } from "./backupMiddleware";
// scheduledJobs lazy-loaded after server starts to reduce cold-start memory
import { registerStripeWebhook } from "../stripeWebhook";
import { registerGmailWebhook } from "../gmailWebhook";
import { registerGoogleReauthRoutes } from "../googleReauth";
// Voice is now client-side (ephemeral token via tRPC, browser connects directly to Gemini)

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust proxy (Cloud Run / Cloudflare) so req.protocol = 'https' and cookies work
  app.set('trust proxy', 1);

  // ── Security headers (Helmet) ──────────────────────────────────────────────
  const isDev = process.env.NODE_ENV === "development";
  app.use(
    helmet({
      contentSecurityPolicy: isDev ? false : {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://donorbox.org"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          connectSrc: ["'self'", "wss:", "ws:", "https://api.manus.im", "https://api.stripe.com", "https://api.aladhan.com", "https://*.manus.computer", "https://*.manus.space", "https://generativelanguage.googleapis.com", "wss://generativelanguage.googleapis.com"],
          frameSrc: ["'self'", "https://js.stripe.com", "https://donorbox.org"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for Manus OAuth portal
    })
  );

  // ── Rate limiting ──────────────────────────────────────────────────────────
  // General API limiter: 300 requests per minute per IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again in a moment." },
    skip: (req) => req.path === "/api/stripe/webhook", // Stripe webhook has its own limiter
  });
  // Stripe webhook limiter: 60 per minute (Stripe retries are infrequent)
  const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Webhook rate limit exceeded." },
  });
  // Auth-specific rate limiter: 10 requests per minute per IP on login
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Please try again later." },
  });
  app.use("/api/stripe/webhook", webhookLimiter);
  app.use("/api/trpc/localAuth.login", authLimiter);
  app.use("/api/trpc/localAuth.register", authLimiter);
  app.use("/api", apiLimiter);

  // Raw body parser for Stripe webhook signature verification (must be before express.json)
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
  // Body parsers — keep limits reasonable to avoid OOM on Cloud Run (512MB)
  // 5MB is enough for base64 images (~500KB compressed → ~667KB base64)
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));
  // Slow-request timing middleware: logs tRPC calls taking > 2s
  app.use("/api/trpc", (req, _res, next) => {
    const start = Date.now();
    _res.on("finish", () => {
      const ms = Date.now() - start;
      if (ms > 2000) {
        console.warn(`[SlowRequest] ${req.method} ${req.url} took ${ms}ms`);
      }
    });
    next();
  });
  // Storage proxy for /manus-storage/* paths
  registerStorageProxy(app);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // File upload endpoint
  app.use(uploadRouter);
  // Lightweight AI extraction endpoint (bypasses tRPC for lower memory usage)
  app.use(extractRouter);
  // Scheduled backup endpoint (POST /api/scheduled/backup)
  registerScheduledBackupRoute(app);
  // Real-time backup: fires triggerBackupSoon() after every successful tRPC mutation
  registerBackupOnMutationMiddleware(app);
  // Stripe webhook endpoint
  registerStripeWebhook(app);
  // Gmail push notification webhook (POST /api/gmail/push)
  registerGmailWebhook(app);
  // Google OAuth re-authorization routes
  registerGoogleReauthRoutes(app);
  // Voice token endpoint (must be BEFORE Vite/static catch-all)
  // Voice token route removed — ephemeral token served via tRPC voice.getEphemeralToken
  // Voice SSE + HTTP routes (must be BEFORE Vite/static catch-all)
  // Voice gateway removed — browser connects directly to Gemini Live API

  // Health check endpoint for uptime monitoring (BetterStack, etc.)
  app.get("/api/health", async (_req, res) => {
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      const dbOk = db !== null;
      res.status(dbOk ? 200 : 503).json({
        status: dbOk ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        db: dbOk ? "connected" : "unavailable",
      });
    } catch {
      res.status(503).json({ status: "error", timestamp: new Date().toISOString() });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Lazy-load scheduled cron jobs 10s after server starts to reduce cold-start memory
  setTimeout(async () => {
    try {
      const { registerScheduledJobs } = await import("../scheduledJobs");
      registerScheduledJobs();
    } catch (e) {
      console.error("[Scheduled] Failed to register jobs:", e);
    }
  }, 10000);

  // Voice gateway now uses SSE + HTTP POST (no WebSocket needed)

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
