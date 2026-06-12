import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  createWriteStream,
  createReadStream,
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
  provider: "local" | "s3" | "r2";
  bucket: string;
}

export interface StorageProvider {
  upload(
    key: string,
    data: Buffer | Readable,
    contentType?: string
  ): Promise<StoredObject>;
  download(key: string): Promise<Buffer>;
  readRange(key: string, offset: number, length: number): Promise<Buffer>;
  copy(sourceKey: string, targetKey: string): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
  getInfo(): StorageProviderInfo;
}

export class S3Storage implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private provider: "s3" | "r2";
  private publicUrl: string | undefined;

  constructor() {
    this.provider = env.STORAGE_PROVIDER === "r2" ? "r2" : "s3";
    const config = this.resolveConfig();
    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      credentials: config.credentials,
    });
  }

  async upload(
    key: string,
    data: Buffer | Readable,
    contentType?: string
  ): Promise<StoredObject> {
    const body = Buffer.isBuffer(data) ? data : await streamToBuffer(data);
    const resolvedContentType = contentType || "application/octet-stream";

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: resolvedContentType,
        ContentLength: body.length,
      }),
    );

    return {
      key,
      url: this.getUrl(key),
      size: body.length,
      contentType: resolvedContentType,
    };
  }

  async download(key: string): Promise<Buffer> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!object.Body) return Buffer.alloc(0);
    return Buffer.from(await object.Body.transformToByteArray());
  }

  async readRange(key: string, offset: number, length: number): Promise<Buffer> {
    if (length <= 0) return Buffer.alloc(0);
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=${offset}-${offset + length - 1}`,
      }),
    );
    if (!object.Body) return Buffer.alloc(0);
    return Buffer.from(await object.Body.transformToByteArray());
  }

  async copy(sourceKey: string, targetKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: targetKey,
        CopySource: `${this.bucket}/${encodeCopySourceKey(sourceKey)}`,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err) {
      if (isNotFoundError(err)) return false;
      throw err;
    }
  }

  getUrl(key: string): string {
    if (this.publicUrl) {
      return `${trimTrailingSlash(this.publicUrl)}/${key}`;
    }
    const endpoint = this.resolveConfig().endpoint;
    if (endpoint) return `${trimTrailingSlash(endpoint)}/${this.bucket}/${key}`;
    return `https://${this.bucket}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
  }

  getInfo(): StorageProviderInfo {
    return {
      provider: this.provider,
      bucket: this.bucket,
    };
  }

  private resolveConfig(): {
    bucket: string;
    region: string;
    endpoint?: string;
    publicUrl?: string;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  } {
    if (this.provider === "r2") {
      const endpoint =
        configured(env.R2_ENDPOINT) ??
        (configured(env.R2_ACCOUNT_ID)
          ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
          : undefined);
      if (!endpoint) {
        throw new Error("R2 storage requires R2_ENDPOINT or R2_ACCOUNT_ID");
      }

      const accessKeyId =
        configured(env.R2_ACCESS_KEY_ID) ?? configured(env.AWS_ACCESS_KEY_ID);
      const secretAccessKey =
        configured(env.R2_SECRET_ACCESS_KEY) ??
        configured(env.AWS_SECRET_ACCESS_KEY);
      if (!accessKeyId || !secretAccessKey) {
        throw new Error(
          "R2 storage requires R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY",
        );
      }

      const bucket = configured(env.R2_BUCKET) ?? configured(env.S3_BUCKET);
      if (!bucket) {
        throw new Error("R2 storage requires R2_BUCKET or S3_BUCKET");
      }

      return {
        bucket,
        region: "auto",
        endpoint,
        publicUrl: configured(env.R2_PUBLIC_URL) ?? configured(env.S3_PUBLIC_URL),
        credentials: { accessKeyId, secretAccessKey },
      };
    }

    const awsAccessKeyId = configured(env.AWS_ACCESS_KEY_ID);
    const awsSecretAccessKey = configured(env.AWS_SECRET_ACCESS_KEY);
    const credentials =
      awsAccessKeyId && awsSecretAccessKey
        ? {
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
          }
        : undefined;
    const bucket = configured(env.S3_BUCKET);
    if (!bucket) {
      throw new Error("S3 storage requires S3_BUCKET");
    }
    const region = configured(env.S3_REGION);
    if (!region) {
      throw new Error("S3 storage requires S3_REGION");
    }

    return {
      bucket,
      region,
      endpoint: configured(env.S3_ENDPOINT),
      publicUrl: configured(env.S3_PUBLIC_URL),
      credentials,
    };
  }
}

export class LocalStorage implements StorageProvider {
  private basePath: string;
  private baseUrl: string;
  private bucket: string;

  constructor() {
    this.basePath = env.LOCAL_STORAGE_PATH;
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

  async readRange(key: string, offset: number, length: number): Promise<Buffer> {
    if (length <= 0) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    const stream = createReadStream(join(this.basePath, key), {
      start: offset,
      end: offset + length - 1,
    });
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async copy(sourceKey: string, targetKey: string): Promise<void> {
    const { copyFile, mkdir } = await import("fs/promises");
    const sourcePath = join(this.basePath, sourceKey);
    const targetPath = join(this.basePath, targetKey);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
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

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function configured(value: string | undefined) {
  return value && value.length > 0 ? value : undefined;
}

function encodeCopySourceKey(key: string) {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isNotFoundError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    ("$metadata" in err || "name" in err) &&
    ((err as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode === 404 ||
      (err as { name?: string }).name === "NotFound")
  );
}
