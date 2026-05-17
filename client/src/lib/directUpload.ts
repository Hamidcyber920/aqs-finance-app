/**
 * Direct-to-S3 upload from the browser.
 * Bypasses the server entirely to avoid 503 OOM errors on Cloud Run.
 * Uses the same Forge storage API that the server uses.
 */

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const API_URL = (
  import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
  import.meta.env.VITE_FRONTEND_FORGE_API_KEY // fallback
)?.replace(/\/+$/, "");

function getBaseUrl(): string {
  // The forge API URL for frontend
  const url = import.meta.env.VITE_FRONTEND_FORGE_API_URL;
  if (url) return url.replace(/\/+$/, "");
  // Fallback: try the built-in forge URL
  return API_URL || "";
}

/**
 * Upload a file directly to S3 from the browser.
 * Returns the public URL of the uploaded file.
 */
export async function directUpload(
  file: File,
  keyPrefix: string = "smart-upload"
): Promise<{ url: string; key: string }> {
  const baseUrl = getBaseUrl();
  const apiKey = API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Storage credentials not available for direct upload");
  }

  // Generate a unique key
  const ext = file.name.split(".").pop() || "bin";
  const randomSuffix = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const key = `${keyPrefix}/${randomSuffix}.${ext}`;

  // Build upload URL
  const uploadUrl = new URL("v1/storage/upload", baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  uploadUrl.searchParams.set("path", key);

  // Create FormData with the file
  const formData = new FormData();
  formData.append("file", file, file.name);

  console.log("[DirectUpload] Uploading to:", uploadUrl.toString(), "size:", file.size);

  const response = await fetch(uploadUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    console.error("[DirectUpload] Failed:", response.status, errorText);
    throw new Error(`Direct upload failed (${response.status}): ${errorText.substring(0, 100)}`);
  }

  const result = await response.json();
  console.log("[DirectUpload] Success:", result.url);
  return { url: result.url, key };
}
