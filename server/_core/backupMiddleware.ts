/**
 * tRPC middleware that triggers a debounced real-time backup after every mutation.
 *
 * Usage: wrap any procedure with .use(backupOnMutation) or apply globally
 * via the Express middleware approach below.
 *
 * We use the Express-level approach: intercept every POST /api/trpc request
 * that represents a mutation and call triggerBackupSoon() after it completes.
 */
import type { Express, Request, Response, NextFunction } from "express";

export function registerBackupOnMutationMiddleware(app: Express) {
  // tRPC mutations arrive as HTTP POST to /api/trpc/<procedure>
  // We hook the response finish event to trigger the backup after a successful write.
  app.use("/api/trpc", (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "POST") {
      res.on("finish", () => {
        // Only trigger backup on successful 2xx responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Lazy import to avoid circular dependency at module load time
          import("../routers/backup").then(({ triggerBackupSoon }) => {
            triggerBackupSoon();
          }).catch(() => {});
        }
      });
    }
    next();
  });
}
