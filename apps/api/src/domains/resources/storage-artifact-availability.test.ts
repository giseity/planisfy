import assert from "node:assert/strict";
import type { Readable } from "node:stream";
import test from "node:test";
import type { StorageProvider, StoredObject } from "@planisfy/storage";
import { verifyStorageArtifactAvailable } from "./storage-artifact-availability";

test("verifyStorageArtifactAvailable accepts existing artifacts", async () => {
  const storage = new MemoryStorage("s3", "planisfy-artifacts", ["source.geojson"]);
  const result = await verifyStorageArtifactAvailable(
    {
      provider: "s3",
      bucket: "planisfy-artifacts",
      storageKey: "source.geojson",
    },
    storage,
  );

  assert.deepEqual(result, { ok: true });
});

test("verifyStorageArtifactAvailable reports missing artifacts", async () => {
  const storage = new MemoryStorage("s3", "planisfy-artifacts", []);
  const result = await verifyStorageArtifactAvailable(
    {
      provider: "s3",
      bucket: "planisfy-artifacts",
      storageKey: "source.geojson",
    },
    storage,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "ARTIFACT_MISSING");
  }
});

test("verifyStorageArtifactAvailable reports storage provider mismatches", async () => {
  const storage = new MemoryStorage("s3", "planisfy-artifacts", ["source.geojson"]);
  const result = await verifyStorageArtifactAvailable(
    {
      provider: "r2",
      bucket: "planisfy-artifacts",
      storageKey: "source.geojson",
    },
    storage,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "ARTIFACT_STORAGE_UNAVAILABLE");
  }
});

class MemoryStorage implements StorageProvider {
  constructor(
    private provider: "local" | "s3" | "r2",
    private bucket: string,
    private keys: string[],
  ) {}

  async upload(
    key: string,
    _data: Buffer | Readable,
    contentType = "application/octet-stream",
  ): Promise<StoredObject> {
    this.keys.push(key);
    return {
      key,
      url: this.getUrl(key),
      size: 0,
      contentType,
    };
  }

  async download(): Promise<Buffer> {
    return Buffer.alloc(0);
  }

  async readRange(): Promise<Buffer> {
    return Buffer.alloc(0);
  }

  async copy() {
    throw new Error("Not implemented");
  }

  async delete() {
    throw new Error("Not implemented");
  }

  async exists(key: string) {
    return this.keys.includes(key);
  }

  getUrl(key: string) {
    return `memory://${key}`;
  }

  getInfo() {
    return { provider: this.provider, bucket: this.bucket };
  }
}
