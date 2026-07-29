import { describe, expect, it } from 'vitest'
import {
  buildDatasetTilesetProcessingInput,
  buildRetrySourceResource,
  isPinnedBuilderImage,
  MANAGED_PELIAS_PROFILE,
  MANAGED_PELIAS_PROFILE_EXCLUDED_IMPORTERS,
  MANAGED_PELIAS_PROFILE_IMPORTERS,
  MANAGED_PELIAS_PROFILE_VERSION,
  parseBuilderImageAllowlist,
  parseSourceProcessingJobInput,
} from '../src'

describe('geodata contracts', () => {
  const digest = 'a'.repeat(64)

  it('parses ordered digest-pinned builder image allowlists', () => {
    expect(
      parseBuilderImageAllowlist(
        `ghcr.io/planisfy/valhalla@sha256:${digest},registry.example:5000/maps/valhalla@sha256:${'b'.repeat(64)}`
      )
    ).toEqual([
      `ghcr.io/planisfy/valhalla@sha256:${digest}`,
      `registry.example:5000/maps/valhalla@sha256:${'b'.repeat(64)}`,
    ])
  })

  it('rejects mutable, malformed, empty, and duplicate builder image allowlists', () => {
    expect(isPinnedBuilderImage('ghcr.io/planisfy/valhalla:latest')).toBe(false)
    expect(isPinnedBuilderImage(`ghcr.io/planisfy/valhalla:3.7.0@sha256:${digest}`)).toBe(false)
    expect(isPinnedBuilderImage(`ghcr.io/Planisfy/valhalla@sha256:${digest}`)).toBe(false)
    expect(() => parseBuilderImageAllowlist('')).toThrow(/at least one/)
    expect(() =>
      parseBuilderImageAllowlist(
        `ghcr.io/planisfy/valhalla@sha256:${digest},ghcr.io/planisfy/valhalla@sha256:${digest}`
      )
    ).toThrow(/duplicate/)
  })

  it('defines the managed Pelias geocoder profile', () => {
    expect({
      name: MANAGED_PELIAS_PROFILE,
      version: MANAGED_PELIAS_PROFILE_VERSION,
      importers: MANAGED_PELIAS_PROFILE_IMPORTERS,
      excludedImporters: MANAGED_PELIAS_PROFILE_EXCLUDED_IMPORTERS,
    }).toEqual({
      name: 'planet_geocoder',
      version: 1,
      importers: ['whosonfirst', 'geonames', 'openaddresses', 'openstreetmap', 'polylines'],
      excludedImporters: ['interpolation', 'transit'],
    })
  })

  it('builds GeoJSON worker input for dataset-backed tilesets', () => {
    expect(
      buildDatasetTilesetProcessingInput({
        tilesetId: 'tileset-1',
        datasetId: 'dataset-1',
        datasetVersionId: 'dataset-version-1',
        storageObjectId: 'storage-1',
        storageKey: 'accounts/a/datasets/d/v1/features.geojson',
        options: { minZoom: 1, maxZoom: 12 },
      })
    ).toEqual({
      tilesetId: 'tileset-1',
      datasetId: 'dataset-1',
      datasetVersionId: 'dataset-version-1',
      storageObjectId: 'storage-1',
      uploadKey: 'accounts/a/datasets/d/v1/features.geojson',
      format: 'geojson',
      options: { minZoom: 1, maxZoom: 12 },
    })
  })

  it('maps dataset-backed builds to dataset retry source resources', () => {
    const input = parseSourceProcessingJobInput({
      tilesetId: 'tileset-1',
      datasetId: 'dataset-1',
      datasetVersionId: 'dataset-version-1',
      storageObjectId: 'storage-1',
      uploadKey: 'accounts/a/datasets/d/v1/features.geojson',
      format: 'geojson',
    })

    expect(input.datasetVersionId).toBe('dataset-version-1')
    expect(buildRetrySourceResource(input)).toEqual({
      sourceResourceType: 'dataset',
      sourceResourceId: 'dataset-version-1',
    })
  })

  it('maps upload-backed builds to upload retry source resources', () => {
    const input = parseSourceProcessingJobInput({
      tilesetId: 'tileset-1',
      uploadId: 'upload-1',
      uploadKey: 'accounts/a/uploads/u/original/data.csv',
      format: 'csv',
    })

    expect(buildRetrySourceResource(input)).toEqual({
      sourceResourceType: 'upload',
      sourceResourceId: 'upload-1',
    })
  })

  it('rejects orphan build inputs', () => {
    expect(() =>
      parseSourceProcessingJobInput({
        tilesetId: 'tileset-1',
        uploadKey: 'accounts/a/datasets/d/v1/features.geojson',
        format: 'geojson',
      })
    ).toThrow(/missing an upload or dataset version source/)
  })
})
