import assert from "node:assert/strict";
import test from "node:test";
import { parseSourceProcessingJobInput } from "./outbox-dispatcher";

test("parseSourceProcessingJobInput derives worker identifiers from event context", () => {
  const input = parseSourceProcessingJobInput(
    {
      tilesetId: "tileset-1",
      uploadId: "upload-1",
      storageObjectId: "storage-1",
      uploadKey: "accounts/account/uploads/upload-1/original/data.geojson",
      format: "geojson",
      csv: {},
      options: { minZoom: 0, maxZoom: 14 },
    },
    {
      ownerId: "account-1",
      processingJobId: "job-1",
    },
  );

  assert.deepEqual(input, {
    ownerId: "account-1",
    tilesetId: "tileset-1",
    uploadKey: "accounts/account/uploads/upload-1/original/data.geojson",
    uploadId: "upload-1",
    storageObjectId: "storage-1",
    processingJobId: "job-1",
    format: "geojson",
    csv: {},
    options: { minZoom: 0, maxZoom: 14 },
  });
});

test("parseSourceProcessingJobInput rejects incomplete source details", () => {
  assert.throws(
    () =>
      parseSourceProcessingJobInput(
        {
          tilesetId: "tileset-1",
          uploadKey: "accounts/account/uploads/upload-1/original/data.geojson",
        },
        {
          ownerId: "account-1",
          processingJobId: "job-1",
        },
      ),
    /Processing job input is incomplete/,
  );
});
