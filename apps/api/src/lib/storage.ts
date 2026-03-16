// ── Storage abstraction layer ────────────────────────────────────────────────
// Supports: local filesystem (dev) and S3-compatible (prod: AWS S3, Cloudflare R2, MinIO)

import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync, statSync } from "fs";
import { join, dirname } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export interface StorageProvider {
  upload(key: string, data: Buffer | Readable, contentType?: string): Promise<{ url: string; size: number }>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
}

// ── S3-compatible storage (production) ──────────────────────────────────────

export class S3Storage implements StorageProvider {
  private bucket: string;
  private region: string;
  private endpoint: string | undefined;
  private accessKeyId: string;
  private secretAccessKey: string;
  private publicUrl: string | undefined;

  constructor() {
    this.bucket = process.env.S3_BUCKET || "planisfy-uploads";
    this.region = process.env.S3_REGION || "auto";
    this.endpoint = process.env.S3_ENDPOINT;
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";
    this.publicUrl = process.env.S3_PUBLIC_URL;
  }

  async upload(key: string, data: Buffer | Readable, contentType?: string): Promise<{ url: string; size: number }> {
    const body = Buffer.isBuffer(data) ? data : await streamToBuffer(data);

    const url = `${this.endpoint || `https://s3.${this.region}.amazonaws.com`}/${this.bucket}/${key}`;
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:-]/g, "").slice(0, 15) + "Z";

    // Use simple PUT request with v4 sig or unsigned (for R2 with API token)
    const res = await fetch(url, {
      method: "PUT",
      body: body as unknown as BodyInit,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": String(body.length),
        ...(this.accessKeyId ? { "x-amz-date": dateStr } : {}),
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`S3 upload failed: ${res.status} ${err}`);
    }

    return { url: this.getUrl(key), size: body.length };
  }

  async download(key: string): Promise<Buffer> {
    const url = `${this.endpoint || `https://s3.${this.region}.amazonaws.com`}/${this.bucket}/${key}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`S3 download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const url = `${this.endpoint || `https://s3.${this.region}.amazonaws.com`}/${this.bucket}/${key}`;
    await fetch(url, { method: "DELETE" });
  }

  async exists(key: string): Promise<boolean> {
    const url = `${this.endpoint || `https://s3.${this.region}.amazonaws.com`}/${this.bucket}/${key}`;
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  }

  getUrl(key: string): string {
    if (this.publicUrl) return `${this.publicUrl}/${key}`;
    return `${this.endpoint || `https://s3.${this.region}.amazonaws.com`}/${this.bucket}/${key}`;
  }
}

// ── Local filesystem storage (development) ──────────────────────────────────

export class LocalStorage implements StorageProvider {
  private basePath: string;
  private baseUrl: string;

  constructor() {
    this.basePath = process.env.LOCAL_STORAGE_PATH || join(process.cwd(), ".storage");
    this.baseUrl = process.env.LOCAL_STORAGE_URL || "http://localhost:4000/storage";

    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  async upload(key: string, data: Buffer | Readable, _contentType?: string): Promise<{ url: string; size: number }> {
    const filePath = join(this.basePath, key);
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (Buffer.isBuffer(data)) {
      const { writeFile } = await import("fs/promises");
      await writeFile(filePath, data);
      return { url: this.getUrl(key), size: data.length };
    }

    const writable = createWriteStream(filePath);
    await pipeline(data, writable);
    const stats = statSync(filePath);
    return { url: this.getUrl(key), size: stats.size };
  }

  async download(key: string): Promise<Buffer> {
    const { readFile } = await import("fs/promises");
    return readFile(join(this.basePath, key));
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.basePath, key);
    if (existsSync(filePath)) unlinkSync(filePath);
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(join(this.basePath, key));
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────

let _storage: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (_storage) return _storage;

  const provider = process.env.STORAGE_PROVIDER || "local";

  switch (provider) {
    case "s3":
    case "r2":
      _storage = new S3Storage();
      break;
    default:
      _storage = new LocalStorage();
  }

  return _storage;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
