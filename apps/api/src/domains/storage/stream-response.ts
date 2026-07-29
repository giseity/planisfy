import { Readable } from "node:stream";
import type { StorageProvider } from "@planisfy/storage";

export async function createPublishedStorageResponse(params: {
  storage: StorageProvider;
  key: string;
  contentType: string | null;
  size: number | null;
}) {
  if (!params.storage.downloadStream) {
    throw new Error("Storage provider does not support streaming downloads");
  }

  const stream = await params.storage.downloadStream(params.key);
  const headers = new Headers({
    "Content-Type": params.contentType || "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  if (params.size !== null) {
    headers.set("Content-Length", String(params.size));
  }

  return new Response(
    Readable.toWeb(stream) as ReadableStream<Uint8Array<ArrayBuffer>>,
    { headers },
  );
}
