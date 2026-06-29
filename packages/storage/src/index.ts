import {
  CopyObjectCommand,
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  UploadPartCommand,
  PutObjectCommand,
  S3Client,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  chmodSync,
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

const LOCAL_STORAGE_DIR_MODE = 0o777;
const LOCAL_STORAGE_FILE_MODE = 0o666;

export interface StoredObject {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface StoredObjectMetadata {
  key: string;
  size: number;
  contentType: string;
}

export interface StorageProviderInfo {
  provider: "local" | "s3" | "r2";
  bucket: string;
}

export interface MultipartUploadPartUrl {
  partNumber: number;
  url: string;
  method: "PUT";
}

export interface MultipartUploadSession {
  provider: "s3" | "r2";
  bucket: string;
  key: string;
  uploadId: string;
  partSize: number;
  expiresAt: string;
  parts: MultipartUploadPartUrl[];
}

export interface StorageProvider {
  upload(
    key: string,
    data: Buffer | Readable,
    contentType?: string,
    contentLength?: number
  ): Promise<StoredObject>;
  download(key: string): Promise<Buffer>;
  downloadStream?(key: string): Promise<Readable>;
  readRange(key: string, offset: number, length: number): Promise<Buffer>;
  copy(sourceKey: string, targetKey: string): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<StoredObjectMetadata | null>;
  createMultipartUploadSession?(
    key: string,
    contentType: string,
    contentLength: number,
    options?: { partSize?: number; expiresInSeconds?: number },
  ): Promise<MultipartUploadSession>;
  completeMultipartUpload?(
    key: string,
    uploadId: string,
    parts: Array<{ partNumber: number; eTag: string }>,
  ): Promise<void>;
  abortMultipartUpload?(key: string, uploadId: string): Promise<void>;
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
    contentType?: string,
    contentLength?: number
  ): Promise<StoredObject> {
    const resolvedContentType = contentType || "application/octet-stream";
    const contentLengthBytes = Buffer.isBuffer(data) ? data.length : contentLength;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: resolvedContentType,
        ContentLength: contentLengthBytes,
      }),
    );

    return {
      key,
      url: this.getUrl(key),
      size: contentLengthBytes ?? 0,
      contentType: resolvedContentType,
    };
  }

  async createMultipartUploadSession(
    key: string,
    contentType: string,
    contentLength: number,
    options: { partSize?: number; expiresInSeconds?: number } = {},
  ): Promise<MultipartUploadSession> {
    const partSize = resolveMultipartPartSize(contentLength, options.partSize);
    const partCount = Math.ceil(contentLength / partSize);
    if (partCount > 10_000) {
      throw new Error("Multipart upload would exceed the 10,000 part S3 limit");
    }

    const multipart = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!multipart.UploadId) {
      throw new Error("S3 did not return a multipart upload id");
    }

    const expiresIn = options.expiresInSeconds ?? 60 * 60 * 24 * 7;
    const parts = await Promise.all(
      Array.from({ length: partCount }, async (_, index) => {
        const partNumber = index + 1;
        const url = await getS3SignedUrl(
          this.client,
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: multipart.UploadId,
            PartNumber: partNumber,
          }),
          { expiresIn },
        );
        return { partNumber, url, method: "PUT" as const };
      }),
    );

    return {
      provider: this.provider,
      bucket: this.bucket,
      key,
      uploadId: multipart.UploadId,
      partSize,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      parts,
    };
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: Array<{ partNumber: number; eTag: string }>,
  ): Promise<void> {
    const completedParts: CompletedPart[] = parts
      .map((part) => ({
        PartNumber: part.partNumber,
        ETag: part.eTag,
      }))
      .sort((a, b) => Number(a.PartNumber) - Number(b.PartNumber));

    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: completedParts },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  async download(key: string): Promise<Buffer> {
    return streamToBuffer(await this.downloadStream(key));
  }

  async downloadStream(key: string): Promise<Readable> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!object.Body) return Readable.from([]);
    return object.Body instanceof Readable
      ? object.Body
      : Readable.fromWeb(
          object.Body.transformToWebStream() as unknown as import("stream/web").ReadableStream,
        );
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
    return (await this.getMetadata(key)) !== null;
  }

  async getMetadata(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const object = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        size: object.ContentLength ?? 0,
        contentType: object.ContentType ?? "application/octet-stream",
      };
    } catch (err) {
      if (isNotFoundError(err)) return null;
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

    ensureLocalStorageDirectory(this.basePath);
  }

  async upload(
    key: string,
    data: Buffer | Readable,
    contentType?: string,
  ): Promise<StoredObject> {
    const filePath = join(this.basePath, key);
    const dir = dirname(filePath);
    const resolvedContentType = contentType || "application/octet-stream";
    ensureLocalStorageDirectory(dir);

    if (Buffer.isBuffer(data)) {
      const { writeFile } = await import("fs/promises");
      await writeFile(filePath, data, { mode: LOCAL_STORAGE_FILE_MODE });
      return {
        key,
        url: this.getUrl(key),
        size: data.length,
        contentType: resolvedContentType,
      };
    }

    const writable = createWriteStream(filePath, {
      mode: LOCAL_STORAGE_FILE_MODE,
    });
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
    return streamToBuffer(await this.downloadStream(key));
  }

  async downloadStream(key: string): Promise<Readable> {
    return createReadStream(join(this.basePath, key));
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
    const { copyFile } = await import("fs/promises");
    const sourcePath = join(this.basePath, sourceKey);
    const targetPath = join(this.basePath, targetKey);
    ensureLocalStorageDirectory(dirname(targetPath));
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

  async getMetadata(key: string): Promise<StoredObjectMetadata | null> {
    const filePath = join(this.basePath, key);
    if (!existsSync(filePath)) return null;
    const stats = statSync(filePath);
    return {
      key,
      size: stats.size,
      contentType: "application/octet-stream",
    };
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

function ensureLocalStorageDirectory(path: string): void {
  if (existsSync(path)) {
    chmodLocalStorageDirectory(path);
    return;
  }

  const parent = dirname(path);
  if (parent && parent !== path) {
    ensureLocalStorageDirectory(parent);
  }
  mkdirSync(path, { recursive: true, mode: LOCAL_STORAGE_DIR_MODE });
  chmodLocalStorageDirectory(path);
}

function chmodLocalStorageDirectory(path: string): void {
  try {
    chmodSync(path, LOCAL_STORAGE_DIR_MODE);
  } catch {
    // Non-root containers may not own bind-mounted host directories. Best effort
    // is still useful for paths the current process created or owns.
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

function getS3SignedUrl(
  client: S3Client,
  command: UploadPartCommand,
  options: { expiresIn: number },
) {
  const signer = getSignedUrl as unknown as (
    client: unknown,
    command: unknown,
    options: { expiresIn: number },
  ) => Promise<string>;
  return signer(client, command, options);
}

function resolveMultipartPartSize(contentLength: number, requested?: number) {
  const minPartSize = 5 * 1024 * 1024;
  const defaultPartSize = 64 * 1024 * 1024;
  const maxParts = 10_000;
  const requiredPartSize = Math.ceil(contentLength / maxParts);
  return Math.max(requested ?? defaultPartSize, defaultPartSize, minPartSize, requiredPartSize);
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
