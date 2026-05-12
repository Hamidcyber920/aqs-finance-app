import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { attachVoiceGateway } from "../voiceGateway";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { uploadRouter } from "../uploadHandler";
import { registerScheduledBackupRoute } from "./scheduledBackup";
import { registerBackupOnMutationMiddleware } from "./backupMiddleware";
import { registerScheduledJobs } from "../scheduledJobs";
import { registerStripeWebhook } from "../stripeWebhook";
import { registerGmailWebhook } from "../gmailWebhook";

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

  // ── Security headers (Helmet) ──────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: false, // Vite injects inline scripts in dev; CSP managed at CDN/proxy layer
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
  app.use("/api/stripe/webhook", webhookLimiter);
  app.use("/api", apiLimiter);

  // Raw body parser for Stripe webhook signature verification (must be before express.json)
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Storage proxy for /manus-storage/* paths
  registerStorageProxy(app);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // File upload endpoint
  app.use(uploadRouter);
  // Scheduled backup endpoint (POST /api/scheduled/backup)
  registerScheduledBackupRoute(app);
  // Real-time backup: fires triggerBackupSoon() after every successful tRPC mutation
  registerBackupOnMutationMiddleware(app);
  // Stripe webhook endpoint
  registerStripeWebhook(app);
  // Gmail push notification webhook (POST /api/gmail/push)
  registerGmailWebhook(app);
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

  // Register scheduled cron jobs (weekly repayment alert + monthly trustee report)
  registerScheduledJobs();

  // Attach Voice Agent WebSocket gateway
  attachVoiceGateway(server);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
