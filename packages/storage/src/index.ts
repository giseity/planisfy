import {
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { env } from "./env";

export interface StoredObject {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface StorageProviderInfo {
  provider: string;
  bucket: string;
}

export interface StorageProvider {
  upload(
    key: string,
    data: Buffer | Readable,
    contentType?: string
  ): Promise<StoredObject>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
  getInfo(): StorageProviderInfo;
}

export class S3Storage implements StorageProvider {
  private bucket: string;
  private region: string;
  private endpoint: string | undefined;
  private accessKeyId: string;
  private publicUrl: string | undefined;

  constructor() {
    this.bucket = env.S3_BUCKET;
    this.region = env.S3_REGION;
    this.endpoint = env.S3_ENDPOINT;
    this.accessKeyId = env.AWS_ACCESS_KEY_ID || "";
    this.publicUrl = env.S3_PUBLIC_URL;
  }

  async upload(
    key: string,
    data: Buffer | Readable,
    contentType?: string
  ): Promise<StoredObject> {
    const body = Buffer.isBuffer(data) ? data : await streamToBuffer(data);
    const resolvedContentType = contentType || "application/octet-stream";

    const url = `${this.originUrl()}/${this.bucket}/${key}`;
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:-]/g, "").slice(0, 15) + "Z";

    const res = await fetch(url, {
      method: "PUT",
      body: body as unknown as BodyInit,
      headers: {
        "Content-Type": resolvedContentType,
        "Content-Length": String(body.length),
        ...(this.accessKeyId ? { "x-amz-date": dateStr } : {}),
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`S3 upload failed: ${res.status} ${err}`);
    }

    return {
      key,
      url: this.getUrl(key),
      size: body.length,
      contentType: resolvedContentType,
    };
  }

  async download(key: string): Promise<Buffer> {
    const res = await fetch(`${this.originUrl()}/${this.bucket}/${key}`);
    if (!res.ok) {
      throw new Error(`S3 download failed: ${res.status}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await fetch(`${this.originUrl()}/${this.bucket}/${key}`, { method: "DELETE" });
  }

  async exists(key: string): Promise<boolean> {
    const res = await fetch(`${this.originUrl()}/${this.bucket}/${key}`, {
      method: "HEAD",
    });
    return res.ok;
  }

  getUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }

    return `${this.originUrl()}/${this.bucket}/${key}`;
  }

  getInfo(): StorageProviderInfo {
    return {
      provider: env.STORAGE_PROVIDER,
      bucket: this.bucket,
    };
  }

  private originUrl(): string {
    return this.endpoint || `https://s3.${this.region}.amazonaws.com`;
  }
}

export class LocalStorage implements StorageProvider {
  private basePath: string;
  private baseUrl: string;
  private bucket: string;

  constructor() {
    this.basePath = env.LOCAL_STORAGE_PATH || join(process.cwd(), ".storage");
    this.baseUrl = env.LOCAL_STORAGE_URL;
    this.bucket = env.LOCAL_STORAGE_BUCKET;

    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  async upload(
    key: string,
    data: Buffer | Readable,
    contentType?: string
  ): Promise<StoredObject> {
    const filePath = join(this.basePath, key);
    const dir = dirname(filePath);
    const resolvedContentType = contentType || "application/octet-stream";
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (Buffer.isBuffer(data)) {
      const { writeFile } = await import("fs/promises");
      await writeFile(filePath, data);
      return {
        key,
        url: this.getUrl(key),
        size: data.length,
        contentType: resolvedContentType,
      };
    }

    const writable = createWriteStream(filePath);
    await pipeline(data, writable);
    const stats = statSync(filePath);
    return {
      key,
      url: this.getUrl(key),
      size: stats.size,
      contentType: resolvedContentType,
    };
  }

  async download(key: string): Promise<Buffer> {
    const { readFile } = await import("fs/promises");
    return readFile(join(this.basePath, key));
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.basePath, key);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(join(this.basePath, key));
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  getInfo(): StorageProviderInfo {
    return {
      provider: "local",
      bucket: this.bucket,
    };
  }
}

let storage: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (storage) {
    return storage;
  }

  const provider = env.STORAGE_PROVIDER;

  switch (provider) {
    case "s3":
    case "r2":
      storage = new S3Storage();
      break;
    default:
      storage = new LocalStorage();
  }

  return storage;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
