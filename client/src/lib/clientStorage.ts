/**
 * Client-side S3 upload via Forge Storage API
 * Bypasses the server entirely — uploads directly from browser to S3
 */

const FORGE_API_URL = (import.meta.env.VITE_FRONTEND_FORGE_API_URL || "").replace(/\/+$/, "");
const FORGE_API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY || "";

export async function clientUploadFile(
  file: Blob,
  fileName: string,
  contentType: string
): Promise<{ url: string; key: string }> {
  if (!FORGE_API_URL || !FORGE_API_KEY) {
    throw new Error("Storage credentials not configured");
  }

  // Generate a unique key to prevent enumeration
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `receipts/${Date.now()}-${randomSuffix}-${sanitizedName}`;

  const uploadUrl = new URL("v1/storage/upload", FORGE_API_URL + "/");
  uploadUrl.searchParams.set("path", key);

  const formData = new FormData();
  formData.append("file", file, sanitizedName);

  const response = await fetch(uploadUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FORGE_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Upload failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return { url: result.url, key };
}
