import { describe, expect, it } from "vitest";
import { StoragePaths, parseStoragePath, safeSegment } from "../src";

describe("@planisfy/storage-paths", () => {
  it("builds and parses upload paths", () => {
    const path = StoragePaths.uploadOriginal("acct_1", "upload_1", "data.geojson");

    expect(path).toBe("accounts/acct_1/uploads/upload_1/original/data.geojson");
    expect(parseStoragePath(path)).toEqual({
      kind: "uploadOriginal",
      accountId: "acct_1",
      uploadId: "upload_1",
      fileName: "data.geojson",
    });
  });

  it("builds and parses tileset version paths", () => {
    const path = StoragePaths.tilesetVersion("acct_1", "tileset_1", 3, "pmtiles");

    expect(parseStoragePath(path)).toEqual({
      kind: "tilesetVersion",
      accountId: "acct_1",
      tilesetId: "tileset_1",
      version: 3,
      format: "pmtiles",
    });
  });

  it("rejects unsafe path segments", () => {
    expect(() => safeSegment("../secret")).toThrow();
    expect(() => StoragePaths.uploadOriginal("acct", "upload", "nested/file.geojson")).toThrow();
  });
});
