import { trpc } from "./trpc";

export interface UploadResult {
  receiptId: number;
  imageUrl: string;
}

/**
 * Upload a receipt file: get a key from the server, PUT to S3 via server proxy, confirm.
 */
export async function uploadReceiptFile(
  file: File,
  trpcUtils: ReturnType<typeof trpc.useUtils>
): Promise<UploadResult> {
  // 1. Get upload info from server
  const uploadInfo = await trpcUtils.client.upload.getUploadUrl.mutate({
    filename: file.name,
    mimeType: file.type || "image/jpeg",
    sizeBytes: file.size,
  });

  // 2. Upload directly to S3 via the server storage endpoint
  const formData = new FormData();
  formData.append("file", file);
  formData.append("key", uploadInfo.key);
  formData.append("mimeType", uploadInfo.mimeType);

  const uploadResponse = await fetch("/api/upload-receipt", {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    const err = await uploadResponse.text();
    throw new Error(`Upload failed: ${err}`);
  }

  const { url } = await uploadResponse.json() as { url: string };

  // 3. Confirm upload with server
  await trpcUtils.client.upload.confirmUpload.mutate({
    receiptId: uploadInfo.receiptId,
    imageUrl: url,
  });

  return { receiptId: uploadInfo.receiptId, imageUrl: url };
}
