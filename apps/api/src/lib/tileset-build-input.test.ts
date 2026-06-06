import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDatasetTilesetProcessingInput,
  buildRetrySourceResource,
  parseSourceProcessingJobInput,
} from "./tileset-build-input";

test("buildDatasetTilesetProcessingInput creates GeoJSON worker input", () => {
  assert.deepEqual(
    buildDatasetTilesetProcessingInput({
      tilesetId: "tileset-1",
      datasetId: "dataset-1",
      datasetVersionId: "dataset-version-1",
      storageObjectId: "storage-1",
      storageKey: "accounts/a/datasets/d/v1/features.geojson",
      options: { minZoom: 1, maxZoom: 12 },
    }),
    {
      tilesetId: "tileset-1",
      datasetId: "dataset-1",
      datasetVersionId: "dataset-version-1",
      storageObjectId: "storage-1",
      uploadKey: "accounts/a/datasets/d/v1/features.geojson",
      format: "geojson",
      options: { minZoom: 1, maxZoom: 12 },
    },
  );
});

test("parseSourceProcessingJobInput accepts dataset-backed builds", () => {
  const input = parseSourceProcessingJobInput({
    tilesetId: "tileset-1",
    datasetId: "dataset-1",
    datasetVersionId: "dataset-version-1",
    storageObjectId: "storage-1",
    uploadKey: "accounts/a/datasets/d/v1/features.geojson",
    format: "geojson",
  });

  assert.equal(input.datasetVersionId, "dataset-version-1");
  assert.deepEqual(buildRetrySourceResource(input), {
    sourceResourceType: "dataset",
    sourceResourceId: "dataset-version-1",
  });
});

test("parseSourceProcessingJobInput keeps upload retry behavior", () => {
  const input = parseSourceProcessingJobInput({
    tilesetId: "tileset-1",
    uploadId: "upload-1",
    uploadKey: "accounts/a/uploads/u/original/data.csv",
    format: "csv",
  });

  assert.deepEqual(buildRetrySourceResource(input), {
    sourceResourceType: "upload",
    sourceResourceId: "upload-1",
  });
});

test("parseSourceProcessingJobInput rejects orphan build inputs", () => {
  assert.throws(
    () =>
      parseSourceProcessingJobInput({
        tilesetId: "tileset-1",
        uploadKey: "accounts/a/datasets/d/v1/features.geojson",
        format: "geojson",
      }),
    /missing an upload or dataset version source/,
  );
});
