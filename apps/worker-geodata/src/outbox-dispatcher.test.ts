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

  assert.equal(input.ownerId, "account-1");
  assert.equal(input.tilesetId, "tileset-1");
  assert.equal(
    input.uploadKey,
    "accounts/account/uploads/upload-1/original/data.geojson",
  );
  assert.equal(input.uploadId, "upload-1");
  assert.equal(input.storageObjectId, "storage-1");
  assert.equal(input.processingJobId, "job-1");
  assert.equal(input.format, "geojson");
  assert.deepEqual(input.csv, {});
  assert.deepEqual(input.options, { minZoom: 0, maxZoom: 14 });
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
    /cannot reconstruct a tileset build request/,
  );
});

test("parseSourceProcessingJobInput preserves dataset build source metadata", () => {
  const input = parseSourceProcessingJobInput(
    {
      tilesetId: "tileset-1",
      datasetId: "dataset-1",
      datasetVersionId: "dataset-version-1",
      storageObjectId: "storage-1",
      uploadKey: "accounts/account/datasets/dataset-1/v1/features.geojson",
      format: "geojson",
      options: { minZoom: 0, maxZoom: 14 },
    },
    {
      ownerId: "account-1",
      processingJobId: "job-1",
    },
  );

  assert.equal(input.datasetId, "dataset-1");
  assert.equal(input.datasetVersionId, "dataset-version-1");
  assert.equal(input.uploadId, undefined);
  assert.equal(input.format, "geojson");
});
