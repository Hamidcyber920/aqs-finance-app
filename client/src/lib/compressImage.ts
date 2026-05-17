/**
 * Client-side image compression for mobile uploads.
 * Aggressively compresses iPhone photos (3-8MB HEIC/JPEG) to under 500KB.
 * This is critical because the server has limited memory (512MB Cloud Run).
 *
 * For OCR/receipt scanning, 800px max dimension at 0.6 quality is more than sufficient.
 */

const MAX_DIMENSION = 800; // Max width or height in pixels
const JPEG_QUALITY = 0.6; // JPEG compression quality
const TARGET_SIZE = 500 * 1024; // Target max 500KB
const RETRY_QUALITY = 0.4; // Retry quality if still too large

export async function compressImage(file: File): Promise<File> {
  // Skip non-images (PDFs, CSVs)
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // Skip already small files (under 200KB)
  if (file.size < 200 * 1024) {
    return file;
  }

  // Try createImageBitmap first (better iOS/HEIC support in modern Safari)
  if (typeof createImageBitmap === "function" && typeof OffscreenCanvas !== "undefined") {
    try {
      return await compressWithBitmap(file);
    } catch (err) {
      console.warn("[Compress] createImageBitmap failed, trying fallback:", err);
    }
  }

  // Fallback: traditional Image + canvas
  return compressFallback(file);
}

async function compressWithBitmap(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Calculate new dimensions
  let newWidth = width;
  let newHeight = height;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    newWidth = Math.round(width * ratio);
    newHeight = Math.round(height * ratio);
  }

  // Draw to OffscreenCanvas
  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("No canvas context");
  }
  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
  bitmap.close();

  // Convert to JPEG blob
  let blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });

  // If still too large, retry with lower quality
  if (blob.size > TARGET_SIZE) {
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality: RETRY_QUALITY });
  }

  const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  console.log(`[Compress] ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB, ${newWidth}x${newHeight}`);
  return compressed;
}

/**
 * Fallback compression using Image element + canvas.
 * Works on older Safari where createImageBitmap/OffscreenCanvas may not be available.
 */
function compressFallback(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;

      let newWidth = width;
      let newHeight = height;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        newWidth = Math.round(width * ratio);
        newHeight = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          // If still too large, retry with lower quality
          if (blob.size > TARGET_SIZE) {
            canvas.toBlob(
              (blob2) => {
                if (!blob2) { resolve(file); return; }
                const compressed = new File([blob2], file.name.replace(/\.[^.]+$/, ".jpg"), {
                  type: "image/jpeg", lastModified: Date.now(),
                });
                console.log(`[Compress/fallback] ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`);
                resolve(compressed);
              },
              "image/jpeg",
              RETRY_QUALITY
            );
            return;
          }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
            type: "image/jpeg", lastModified: Date.now(),
          });
          console.log(`[Compress/fallback] ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`);
          resolve(compressed);
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      console.warn("[Compress/fallback] Image decode failed, returning original file");
      resolve(file);
    };

    img.src = url;
  });
}
