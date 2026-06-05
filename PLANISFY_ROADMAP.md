# Planisfy Product and Engineering Roadmap

## Product Identity

Planisfy should become the open, self-hostable Mapbox alternative, with hosted cloud when teams want convenience.

The focused promise is:

> Own your maps, style your data, deploy anywhere.

Planisfy should not initially compete with every Mapbox product. The first durable identity is a complete, self-hostable maps platform for custom geospatial data:

- a polished default basemap
- custom data upload and tiling
- visual Studio workflows
- MapLibre-compatible delivery
- reliable self-host deployment
- optional hosted cloud and managed data updates

The platform should feel like a product, not a stitched-together geospatial toolkit.

## Strategic Boundary

### Open-Core Scope

The open core should be useful enough that a developer, GIS team, civic project, or small company can run Planisfy successfully.

Open:

- Hono API gateway
- self-host Docker stack
- basic auth, orgs, and API keys
- basic Studio
- style serving
- basic custom uploads
- local processing jobs
- local usage logs
- MapLibre-compatible examples
- documented extension points

### Commercial Scope

Paid value should come from operations, managed infrastructure, governance, premium data, and support rather than artificial product crippling.

Paid:

- Planisfy Cloud hosted APIs
- managed CDN tile delivery
- managed basemap releases
- hosted custom tileset processing
- Dodo Payments-backed billing and subscription management
- advanced Studio collaboration
- SSO, SCIM, advanced RBAC
- long-retention audit logs
- approvals and publishing workflows
- Helm/Kubernetes/private-cloud tooling
- premium data packages
- SLAs, support, compliance reviews

Recommended licensing model:

- AGPLv3 for core server/platform code where network-service reciprocity matters
- permissive licensing for developer-facing client libraries, examples, SDK helpers, and integration snippets
- clear data/style attribution terms for basemap styles, sprites, fonts, and release manifests
- commercial license for companies that need non-AGPL terms
- proprietary enterprise/cloud modules for managed and governance-heavy features

Practical licensing policy:

- keep the self-hosted platform genuinely open source
- make it easy for developers and SMEs to build proprietary applications that consume Planisfy APIs
- make it harder for a competitor to take the hosted platform code, modify it privately, and sell it as a closed managed service
- separate core, SDK/example, data asset, documentation, and commercial module licenses explicitly in the repository
- require a contributor agreement or developer certificate process before accepting substantial outside contributions if dual licensing will be offered

## Engineering Principles

- Prefer MapLibre compatibility before Mapbox total parity.
- Build workflows end-to-end before expanding feature breadth.
- Treat the first credible product loop as a hard gate: demo map, upload, process, style, publish, use in MapLibre, roll back.
- Use immutable published artifacts for production maps.
- Keep draft/editing state separate from published URLs.
- Make self-hosting boring: predictable setup, health checks, backups, upgrades.
- Treat geodata processing as a first-class product surface, not background plumbing.
- Design every long-running operation as a job with logs, retries, progress, and failure states.
- Keep provider boundaries clean: local disk first, S3/R2-compatible storage next, cloud-managed later.
- Do not expand into search, navigation, billing, or enterprise governance until the core maps/custom-data loop is credible.

## Credible v1 Gate

The roadmap should be driven by one hard product gate before broader platform expansion.

Planisfy v1 is credible only when a team can:

1. Self-host the stack from documented commands.
2. See a polished default basemap immediately.
3. Upload a GeoJSON or CSV file.
4. Process it into a tileset with visible job progress and logs.
5. Style it visually in Studio.
6. Publish a stable style URL.
7. Use that URL in MapLibre.
8. Roll back style or tileset changes.
9. Inspect usage and processing logs.
10. Upgrade the deployment without losing data.

Milestones 1-5 should serve this gate. Milestones 6-10 should not pull focus until this loop works end to end.

## Implemented Foundation Baseline

The architecture restructuring is now baseline, not future roadmap scope.

Already in place:

- Geobble-style `accounts` ownership anchor for users and organizations, with Better Auth provider credentials renamed to `oauth_accounts`
- durable schema tables for uploads, datasets, tilesets, tileset versions, processing jobs, storage objects, event outbox, invoices, and usage rollups
- shared contract packages for events, storage paths, style lifecycle helpers, logging, style spec validation, and env validation
- `apps/worker-geodata` split from the API as the source-processing worker
- local/S3/R2 storage abstraction plus storage ledger writes
- Docker Compose wiring for API, console, admin, worker, Postgres, Redis, Martin, Valhalla, and local artifact storage
- validated `env.ts` modules for API, worker, database, storage, and public console/admin navigation variables

Roadmap work should now focus on making those foundations product-complete: seeded demo data, real processing handlers, publish/rollback flows, visible job UX, and operational hardening.

## Core Resource Model

These concepts should become the backbone of the platform.

The current implementation now uses a Geobble-style `accounts` ownership anchor under users and organizations. Roadmap work should build on that model instead of reviving the older `profiles` language except where temporary compatibility exports still exist.

Current direction:

- keep `styles` and `style_versions`, but separate editable draft state from immutable published versions more explicitly
- treat `tileset_sources` as legacy/compatibility surface while new upload and tileset workflows move onto `uploads`, `tilesets`, and `tileset_versions`
- use `processing_jobs` as the durable job record and keep BullMQ as transport
- use `storage_objects` as the artifact ledger, with object keys produced through `@planisfy/storage-paths`
- make all owned resources reference `accounts.id`

### Dataset

Editable raw features, usually GeoJSON-like.

Needed fields:

- account owner
- name, handle, description
- bounds
- feature count
- schema summary
- storage pointer for raw data
- created/updated/deleted timestamps

### Upload

A source file or remote import.

Needed fields:

- account owner
- original filename
- content type
- size
- storage key
- status
- validation result
- linked dataset or tileset

### Tileset

A logical map data product served as tiles.

Needed fields:

- account owner
- name, handle, description
- type: vector, raster, raster-array, terrain
- current published version
- bounds
- min/max zoom
- layer metadata

### Tileset Version

Immutable build output.

Needed fields:

- tileset ID
- version number
- artifact storage key
- tile format: pmtiles, mbtiles, directory, external
- build job ID
- schema/layers
- bounds
- created timestamp
- published timestamp

### Style

Editable style object.

Needed states:

- draft JSON
- published JSON
- visibility
- protected flag
- linked sources/assets

### Style Version

Immutable snapshot used for rollback and publishing history.

Needed fields:

- style ID
- version number
- style JSON
- created by
- created timestamp
- publish metadata

### Processing Job

A first-class record for async work.

Needed fields:

- type
- status
- progress
- account owner
- input references
- output references
- logs
- error code/message
- retry count
- started/completed timestamps
- persisted log entries or log storage pointer
- cancel/requested cancellation state
- artifact promotion result

## Milestone 0: Foundation Baseline

Status: complete enough to stop treating it as the active roadmap milestone.

What changed:

- docs match implementation
- lint/type/test commands are reliable
- Docker Compose references valid build targets and includes the worker/storage path
- internal routes are protected
- style mutation logic is shared
- alpha status is documented
- app/package environment variables are validated through the `env.ts` convention

Remaining foundation chores should be handled opportunistically, not as roadmap blockers:

- add repository license file
- run the full CI matrix in GitHub Actions once the next product milestone is ready
- regenerate Drizzle migrations/snapshots when the resource model settles further

## Milestone 1: Self-Hosted Demo That Works

Goal: `docker compose up` should produce a working product with a visible map and demo data.

This milestone is the first adoption test. It should be treated as complete only when a new developer can experience Planisfy as a product rather than a collection of services.

User-facing workflow:

1. Clone repo.
2. Copy `.env.example`.
3. Run setup command.
4. Start Docker Compose.
5. Open console.
6. See a working default map.
7. Sign in with a bootstrap account.
8. Inspect a demo style and custom demo layer.

Implementation areas:

- seed data
- bootstrap admin user
- sample PMTiles dataset
- sample style wired to sample tiles
- compose health checks
- migration entrypoint
- setup script
- local storage directory creation
- clear startup docs

Representative commits:

- `infra: add self-host bootstrap script`
- `database: add seed data for local demo`
- `infra: include sample PMTiles and style fixtures`
- `console: add first-run bootstrap flow`
- `docs: document local self-host setup`

Acceptance criteria:

- `docker compose -f infra/docker/docker-compose.yml up` starts all required services.
- Console shows at least one working map without manual data download.
- Seeded style, seeded source metadata, and sample tiles all agree on URLs and layer names.
- Bootstrap account creation is documented and repeatable.
- API health endpoint reports Postgres, Redis, Martin, and Valhalla states.
- New developers can complete setup from README alone.
- The demo remains useful without routing, geocoding, billing, email, or cloud storage configured.

## Milestone 2: Default Basemap v1

Goal: ship one attractive, reliable Planisfy basemap.

This is the trust anchor. If the default map looks poor, the platform feels unserious. Milestone 2 should keep the original global release ambition: coherent global rendering from zoom 0 to 14+.

A regional fixture can still be useful for fast local development and regression testing, but it should not redefine the release bar.

Required output:

- `planisfy-streets-v1` vector tileset
- `planisfy-streets-light-v1` style
- `planisfy-streets-dark-v1` style
- documented source-layer schema
- regular build command
- versioned release artifact

Data sources:

- Overture Maps for roads, buildings, places, land, water, admin where suitable
- Natural Earth for low-zoom global context
- optional OSM enrichment for gaps

Pipeline requirements:

- regional fixture support for fast iteration
- region extract support
- global build path
- schema normalization
- label ranking
- min/max zoom assignment
- geometry simplification
- tile size validation
- artifact publication to local/S3/R2 storage
- release manifest

Representative commits:

- `tiles: define basemap source-layer schema`
- `pipeline: add Overture ingest command`
- `pipeline: add Natural Earth low-zoom ingest`
- `pipeline: generate Planisfy Streets PMTiles`
- `styles: add Planisfy Streets light style`
- `styles: add Planisfy Streets dark style`
- `docs: document basemap schema and release process`

Acceptance criteria:

- Map renders globally from zoom 0 to 14+ with coherent roads, water, land, boundaries, buildings, places, and labels.
- Style uses stable source-layer names.
- Tileset can be rebuilt reproducibly.
- Release artifact is immutable and versioned.
- Data source attribution is visible in styles/docs and reflected in release metadata.

## Milestone 3: Custom Uploads and Processing

Goal: users can upload their own geodata and publish it as tiles.

The current source upload/queue prototype should graduate into the resource model above: uploads, tilesets, immutable tileset versions, and durable processing jobs.

First supported formats:

- GeoJSON
- zipped Shapefile
- CSV with latitude/longitude columns
- PMTiles passthrough
- MBTiles passthrough/conversion

Later formats:

- GeoPackage
- GeoTIFF
- Cloud Optimized GeoTIFF
- raster DEM

Required workflow:

1. User uploads file.
2. Platform validates file.
3. User sees bounds/schema/feature count.
4. User starts processing.
5. Durable job record tracks progress, logs, retries, and failure state.
6. Background worker creates PMTiles or performs passthrough/conversion.
7. Tileset version is created as an immutable artifact.
8. User publishes or promotes the version.
9. User can add it to Studio.

Architecture:

- finish API/worker behavior around the existing `uploads`, `tilesets`, `tileset_versions`, and `processing_jobs` tables
- add visible job log persistence and progress updates
- use the existing storage abstraction for raw and processed artifacts
- complete worker handlers for upload validation and tiling
- Tippecanoe integration for vector tiling
- optional GDAL integration for raster formats

Representative commits:

- `api: add upload creation and validation routes`
- `workers: convert GeoJSON uploads to PMTiles`
- `workers: support CSV point uploads`
- `console: add upload and processing UI`
- `api: serve custom tileset versions`

Acceptance criteria:

- A GeoJSON file can be uploaded, processed, and served as vector tiles.
- CSV point upload supports explicit latitude/longitude selection or clear auto-detection.
- Processing failures show actionable logs.
- Job status survives worker restarts.
- Published tileset URLs are stable.
- Reprocessing creates a new version without breaking existing URLs.

## Milestone 4: Studio Workflow v1

Goal: Studio should complete the core Planisfy workflow: upload data, style it, publish it, use it.

Primary workflow:

1. Open Studio.
2. Select a base style.
3. Add a custom tileset source.
4. Add a layer from source metadata.
5. Style visually.
6. Validate.
7. Publish.
8. Copy a MapLibre style URL.

Required features:

- source browser
- custom tileset source picker
- layer creation from source layer
- layer reorder/group/hide/delete
- paint/layout editors by layer type
- filter builder
- zoom range controls
- categorical styling
- numeric ramp styling
- inspect mode
- style validation
- import/export JSON
- draft/publish separation
- version history and rollback

Representative commits:

- `studio: add tileset source browser`
- `studio: create layers from tileset metadata`
- `studio: add data-driven styling controls`
- `studio: add filter builder for vector layers`
- `studio: add draft and publish workflow`
- `api: serve draft and published style variants`
- `studio: add style validation and publish checks`
- `studio: add style URL copy and usage snippets`

Acceptance criteria:

- A non-technical user can add an uploaded dataset to a map without editing JSON.
- Published style URLs remain stable.
- Draft edits do not affect published maps.
- Invalid styles are blocked from publishing with readable errors.

## Milestone 5: Publishing, Versioning, and Rollback

Goal: production maps should be safe.

Required behavior:

- datasets, tilesets, and styles have immutable versions
- published URLs point to explicit versions or stable aliases
- users can promote a version
- users can roll back
- publish events are audit logged
- destructive actions are soft-deleted or protected

URL model:

- `/styles/v1/{owner}/{style}`
- `/styles/v1/{owner}/{style}@{version}`
- `/tiles/v1/{owner}.{tileset}/{z}/{x}/{y}`
- `/tiles/v1/{owner}.{tileset}@{version}/{z}/{x}/{y}`
- `/tiles/v1/{owner}.{tileset}.json`

Representative commits:

- `database: add published aliases for styles and tilesets`
- `api: serve versioned style URLs`
- `api: serve versioned tileset URLs`
- `studio: add publish confirmation and rollback UI`
- `audit: log style and tileset publish events`
- `docs: document stable URL model`

Acceptance criteria:

- A published map cannot be broken by draft edits.
- Rollback takes effect without rebuilding data.
- Versioned URLs continue to serve old artifacts.

## Milestone 6: Maps API Compatibility

Goal: cover the maps API surface needed by MapLibre/Mapbox migration users.

This milestone should expand only the API surface that helps users migrate the core v1 workflow. Avoid chasing total Mapbox parity before Planisfy has a strong default map and custom-data workflow.

Priority endpoints:

- Styles API read/update/list/delete
- glyphs/fonts endpoint
- sprites endpoint
- TileJSON metadata
- vector tiles endpoint
- raster tiles endpoint
- static tiles endpoint
- static images endpoint
- Tilequery endpoint

Static images requirements:

- center/zoom rendering
- bbox rendering
- auto fitting
- width/height and `@2x`
- overlays
- marker/path/GeoJSON overlays
- add/remove layer parameters
- cache key normalization

Tilequery requirements:

- point query
- radius
- layer filtering
- limit
- vector feature property return

Representative commits:

- `api: add Mapbox-compatible vector tiles route`
- `api: add TileJSON metadata route`
- `api: add sprite and glyph asset routes`
- `renderer: add static image render service`
- `api: implement static images endpoint`
- `api: implement tilequery endpoint`
- `docs: add Mapbox migration guide`

Acceptance criteria:

- A basic Mapbox GL/MapLibre app can switch to Planisfy URLs with minimal changes.
- Static image requests return real rendered images, not placeholders.
- Tilequery can inspect features from custom vector tilesets.

## Milestone 7: Operational Productization

Goal: make self-hosted operation understandable and trustworthy.

Required features:

- health dashboard
- job dashboard
- processing logs
- service status checks
- storage usage
- tile request usage
- API key usage charts
- backups guide
- restore guide
- upgrade guide
- resource sizing guide
- observability hooks

Architecture:

- periodic usage rollups
- job log storage
- service health probes
- admin maintenance screens
- structured logs
- optional OpenTelemetry

Representative commits:

- `api: add usage rollup jobs`
- `admin: add system health dashboard`
- `admin: add processing job dashboard`
- `admin: add storage and artifact views`
- `docs: add backup and restore guide`
- `observability: add structured service metrics`

Acceptance criteria:

- Operators can diagnose common failures from the admin UI.
- Usage charts do not query raw logs for every dashboard load.
- Backup/restore has documented commands and tested paths.

## Milestone 8: Planisfy Cloud Foundation

Goal: prepare hosted commercial API usage without compromising self-hosted trust.

Cloud should reuse the self-hosted resource model and publishing model. If hosted Planisfy requires a forked product model, the cloud work is too early or too divergent.

Required cloud features:

- hosted account provisioning
- Dodo Payments billing integration
- usage metering
- plan limits
- overage handling
- team management
- hosted storage
- hosted tile CDN
- managed worker fleet
- abuse controls
- customer support/admin views

Architecture:

- cloud deployment environment
- multi-tenant isolation
- regional storage/CDN strategy
- API gateway autoscaling
- worker autoscaling
- billing event pipeline
- customer-facing usage dashboard

Representative commits:

- `billing: add usage metering events`
- `billing: add Dodo Payments customer and subscription sync`
- `billing: add plan and quota enforcement`
- `cloud: add hosted storage provider configuration`
- `cloud: add CDN cache and purge integration`
- `admin: add tenant and plan management`
- `console: add billing and usage views`

Acceptance criteria:

- A customer can sign up, create an API key, use hosted map APIs, and see usage.
- Cloud usage and self-host usage share the same conceptual resource model.
- Hosted Planisfy does not require a forked codebase.

## Milestone 9: Enterprise and Hybrid

Goal: monetize serious organizations while preserving the open-core promise.

Enterprise features:

- SSO/SAML/OIDC
- SCIM
- advanced RBAC
- audit log export
- approval workflows
- protected styles and tilesets
- environment separation
- private cloud deployment
- Helm charts
- support bundle export
- SLA monitoring

Hybrid features:

- hosted Studio with customer-owned tile endpoints
- managed data releases for self-hosters
- remote auth/control plane for self-hosted engines
- private basemap package downloads
- routing graph subscriptions

Representative commits:

- `enterprise: add SSO provider abstraction`
- `enterprise: add advanced RBAC policies`
- `enterprise: add audit export`
- `enterprise: add publishing approvals`
- `deploy: add Helm chart`
- `hybrid: add managed data release download flow`

Acceptance criteria:

- Enterprise buyers have clear paid reasons to choose Planisfy.
- Self-hosted users can pay for managed data without moving runtime traffic to Planisfy Cloud.
- Hybrid mode is documented and supportable.

## Milestone 10: Search and Navigation Expansion

Goal: expand beyond maps after the core maps/custom-data product is credible.

Search and navigation are expansion lines, not prerequisites for the first defensible Planisfy product.

Search:

- production Pelias/OpenSearch-backed geocoding
- autocomplete suggest/retrieve
- POI/category search
- reverse geocoding
- batch geocoding
- stable place IDs
- language and country filtering
- confidence/match codes

Navigation:

- Mapbox-compatible Directions responses
- Valhalla graph versioning
- route alternatives
- matrix
- isochrone
- map matching
- optimization
- eventually traffic and incident data

Representative commits:

- `search: add indexed geocoder service`
- `search: add suggest and retrieve endpoints`
- `search: add POI category search`
- `routing: normalize Valhalla directions responses`
- `routing: add graph build and version pipeline`
- `routing: add optimization endpoint parity`

Acceptance criteria:

- Search and routing APIs are useful enough for application migration.
- Response shapes are documented and close to Mapbox where possible.
- Data limitations are explicit.

## Cross-Cutting Requirements

These should be tracked across milestones rather than treated as one late hardening pass.

### Licensing and Data Attribution

- add a repository license file before outside distribution or contribution
- document the AGPL/commercial license boundary clearly
- track attribution requirements for Overture Maps, OpenStreetMap-derived data, Natural Earth, and any premium packages
- include attribution metadata in basemap release manifests
- make attribution visible in default styles and documentation

### Security and Abuse Controls

- validate uploads with strict size, type, and content checks
- prevent path traversal and unsafe storage keys
- avoid SSRF when adding remote imports
- protect internal routes in every production-like configuration
- define API key scope behavior for styles, tiles, uploads, and admin operations
- document tenant isolation assumptions for self-hosted and cloud modes

### Performance and Reliability Targets

- define target tile latency for local, CDN, and cloud paths
- define upload size limits by plan/deployment mode
- define processing time expectations for sample GeoJSON, CSV, and PMTiles inputs
- cap tile sizes and record validation failures
- use rollups for usage dashboards instead of querying raw request logs directly
- make backup, restore, and upgrade paths part of release verification

### Test Strategy

- add Docker Compose smoke tests for the self-hosted demo
- add API smoke tests for health, styles, tiles, uploads, and published URLs
- add worker tests around successful processing, failed processing, retry, and restart behavior
- add golden checks for basemap release manifests and source-layer schemas
- add Studio workflow tests for add source, create layer, publish, and rollback
- run lint, typecheck, tests, and Docker build in CI before roadmap milestones are marked complete

## Suggested Execution Order

Short-term:

1. Build Milestone 1 self-host demo.
2. Seed a bootstrap account, sample style, and sample PMTiles dataset.
3. Build the Milestone 2 global basemap pipeline, using regional fixtures only for fast local iteration.
4. Start the Milestone 3 upload-to-tileset workflow on top of the existing accounts/resources schema.
5. Keep roadmap/docs truthful after each milestone.

Medium-term:

1. Complete custom upload to immutable tileset version workflow.
2. Make Studio excellent for styling uploaded data.
3. Add versioned publishing and rollback.
4. Harden operational dashboards around jobs, health, storage, and usage.
5. Expand Maps API compatibility around styles, tiles, glyphs, sprites, static images, and tilequery.

Commercial readiness:

1. Offer managed basemap data packages.
2. Launch Planisfy Cloud for hosted map APIs and tileset processing.
3. Add enterprise governance and hybrid/private-cloud deployment.

Later:

1. Build production search.
2. Deepen navigation.
3. Explore mobile/offline SDK helpers.
4. Add deeper Mapbox parity only where migration demand justifies it.

## Definition of a Credible v1

Planisfy v1 should be considered credible when the Credible v1 Gate near the top of this document is complete.

This is the first product line worth defending. It is not total Mapbox parity, but it is a sharp, valuable identity.
