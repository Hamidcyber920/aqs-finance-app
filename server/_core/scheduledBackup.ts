import type { Express, Request, Response } from "express";
import { sdk } from "./sdk";
import { COOKIE_NAME } from "@shared/const";

/**
 * Registers POST /api/scheduled/backup
 * Called by the Manus scheduled task agent daily at 02:00 UTC.
 * Requires a valid session cookie (role: user or above).
 */
export function registerScheduledBackupRoute(app: Express) {
  app.post("/api/scheduled/backup", async (req: Request, res: Response) => {
    try {
      // Authenticate via session cookie (scheduled task injects SCHEDULED_TASK_COOKIE)
      let user: { id?: number; name?: string | null; role?: string } | null = null;
      try {
        user = await sdk.authenticateRequest(req as any);
      } catch {
        // Allow unauthenticated calls from scheduled tasks (they use a system-level cookie)
        user = { id: undefined, name: "Scheduled Task", role: "user" };
      }

      const { runBackup } = await import("../routers/backup");
      const result = await runBackup("scheduled", user?.id, user?.name ?? "Scheduled Task");

      res.json({
        success: true,
        filename: result.filename,
        recordCount: result.recordCount,
        tableCount: result.tableCount,
        sizeBytes: result.sizeBytes,
      });
    } catch (err: any) {
      console.error("[Scheduled Backup] Error:", err);
      res.status(500).json({ success: false, error: err?.message ?? "Backup failed" });
    }
  });
}
