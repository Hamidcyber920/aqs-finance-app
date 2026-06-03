import express from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { sdk } from "./_core/sdk";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav", "audio/mp4",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — client compresses images to ~400KB; higher limit for PDFs via SmartUpload
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not allowed. Permitted types: images, PDF, CSV, Excel, audio.`));
    }
  },
});

export const uploadRouter = express.Router();

// Generic upload endpoint used by SmartUpload component
uploadRouter.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const customKey = (req.body.key as string) || null;
    const ext = file.originalname.split(".").pop() || "bin";
    const key =
      customKey ||
      `smart-upload/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const mimeType = file.mimetype || "application/octet-stream";

    const { url } = await storagePut(key, file.buffer, mimeType);
    res.json({ url, key, mimeType });
  } catch (err) {
    console.error("[Upload] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Receipt-specific upload endpoint (legacy)
uploadRouter.post("/api/upload-receipt", upload.single("file"), async (req, res) => {
  try {
    // Authenticate request
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const key = (req.body.key as string) || `receipts/${user.id}/upload-${Date.now()}`;
    const mimeType = (req.body.mimeType as string) || file.mimetype || "image/jpeg";

    const { url } = await storagePut(key, file.buffer, mimeType);
    res.json({ url, key });
  } catch (err) {
    console.error("[Upload] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});
