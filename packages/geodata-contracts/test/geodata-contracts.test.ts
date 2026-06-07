import { describe, expect, it } from "vitest";
import {
  buildDatasetTilesetProcessingInput,
  buildRetrySourceResource,
  parseSourceProcessingJobInput,
} from "../src";

describe("geodata contracts", () => {
  it("builds GeoJSON worker input for dataset-backed tilesets", () => {
    expect(
      buildDatasetTilesetProcessingInput({
        tilesetId: "tileset-1",
        datasetId: "dataset-1",
        datasetVersionId: "dataset-version-1",
        storageObjectId: "storage-1",
        storageKey: "accounts/a/datasets/d/v1/features.geojson",
        options: { minZoom: 1, maxZoom: 12 },
      }),
    ).toEqual({
      tilesetId: "tileset-1",
      datasetId: "dataset-1",
      datasetVersionId: "dataset-version-1",
      storageObjectId: "storage-1",
      uploadKey: "accounts/a/datasets/d/v1/features.geojson",
      format: "geojson",
      options: { minZoom: 1, maxZoom: 12 },
    });
  });

  it("maps dataset-backed builds to dataset retry source resources", () => {
    const input = parseSourceProcessingJobInput({
      tilesetId: "tileset-1",
      datasetId: "dataset-1",
      datasetVersionId: "dataset-version-1",
      storageObjectId: "storage-1",
      uploadKey: "accounts/a/datasets/d/v1/features.geojson",
      format: "geojson",
    });

    expect(input.datasetVersionId).toBe("dataset-version-1");
    expect(buildRetrySourceResource(input)).toEqual({
      sourceResourceType: "dataset",
      sourceResourceId: "dataset-version-1",
    });
  });

  it("maps upload-backed builds to upload retry source resources", () => {
    const input = parseSourceProcessingJobInput({
      tilesetId: "tileset-1",
      uploadId: "upload-1",
      uploadKey: "accounts/a/uploads/u/original/data.csv",
      format: "csv",
    });

    expect(buildRetrySourceResource(input)).toEqual({
      sourceResourceType: "upload",
      sourceResourceId: "upload-1",
    });
  });

  it("rejects orphan build inputs", () => {
    expect(() =>
      parseSourceProcessingJobInput({
        tilesetId: "tileset-1",
        uploadKey: "accounts/a/datasets/d/v1/features.geojson",
        format: "geojson",
      }),
    ).toThrow(/missing an upload or dataset version source/);
  });
});
