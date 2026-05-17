/**
 * Client-side image compression for mobile uploads.
 * Resizes large photos (e.g., iPhone 12MP = 4032x3024) to a max dimension
 * and compresses to JPEG to reduce file size from 3-8MB to under 1MB.
 */

const MAX_DIMENSION = 1600; // px — enough for AI OCR while keeping file small
const JPEG_QUALITY = 0.7;
const MAX_FILE_SIZE = 1.5 * 1024 * 1024; // 1.5MB target

export async function compressImage(file: File): Promise<File> {
  // Skip non-image files
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // Skip already small files (< 1MB)
  if (file.size < 1 * 1024 * 1024) {
    return file;
  }

  return new Promise<File>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Calculate new dimensions maintaining aspect ratio
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      // Draw to canvas
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file); // fallback to original
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob with compression
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file); // fallback to original
            return;
          }

          // If still too large, try lower quality
          if (blob.size > MAX_FILE_SIZE) {
            canvas.toBlob(
              (blob2) => {
                if (!blob2) {
                  resolve(file);
                  return;
                }
                const compressed = new File(
                  [blob2],
                  file.name.replace(/\.[^.]+$/, ".jpg"),
                  { type: "image/jpeg", lastModified: Date.now() }
                );
                console.log(
                  `[Compress] ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (quality: 0.5)`
                );
                resolve(compressed);
              },
              "image/jpeg",
              0.5
            );
            return;
          }

          const compressed = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, ".jpg"),
            { type: "image/jpeg", lastModified: Date.now() }
          );
          console.log(
            `[Compress] ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (quality: ${JPEG_QUALITY})`
          );
          resolve(compressed);
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Can't load image (e.g., HEIC not supported by canvas) — return original
      resolve(file);
    };

    img.src = url;
  });
}
