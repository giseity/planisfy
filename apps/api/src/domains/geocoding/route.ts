import { createHash } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { billableRequests, db } from '@planisfy/database'
import { and, eq } from 'drizzle-orm'
import type { AuthEnv } from '../../middleware/auth'
import { env } from '../../env'
import { isPeliasConfigured } from '../setup/geocoding-config'

export const geocodingRoute = new Hono<AuthEnv>()

const MAX_BATCH_QUERIES = 50
const BATCH_CONCURRENCY = 5

// ── GET /geocoding/v1/forward — Forward geocoding (address → coordinates) ───

geocodingRoute.get('/geocoding/v1/forward', async (c) => {
  const q = c.req.query('q')
  if (!q) {
    return c.json({ error: { code: 'BAD_REQUEST', message: "Missing 'q' parameter" } }, 400)
  }
  if (q.length > 500) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: "'q' must be 500 characters or fewer" } },
      400
    )
  }

  const limit = Math.min(Number(c.req.query('limit')) || 5, 25)
  const bbox = c.req.query('bbox')
  const lang = c.req.query('language') || 'en'
  const countryCode = c.req.query('country')

  if (!isPeliasConfigured(env.PELIAS_INTERNAL_URL)) {
    return geocoderNotConfigured(c)
  }

  try {
    const pelias = await requestPelias('search', {
      text: q,
      size: String(limit),
      lang,
      ...(bbox ? { 'boundary.rect': bbox } : {}),
      ...(countryCode ? { 'boundary.country': countryCode } : {}),
    })

    c.header('Cache-Control', 'public, max-age=3600')
    return c.json(pelias)
  } catch (err) {
    console.error('[geocoding] Forward error:', err)
    return peliasError(c, err)
  }
})

// ── GET /geocoding/v1/reverse — Reverse geocoding (coordinates → address) ───

geocodingRoute.get('/geocoding/v1/reverse', async (c) => {
  const lon = Number(c.req.query('lon'))
  const lat = Number(c.req.query('lat'))

  if (isNaN(lon) || isNaN(lat)) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: "Missing or invalid 'lon' and 'lat' parameters" } },
      400
    )
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    return c.json(
      {
        error: {
          code: 'BAD_REQUEST',
          message: 'Coordinates out of range (lon: -180..180, lat: -90..90)',
        },
      },
      400
    )
  }

  const lang = c.req.query('language') || 'en'
  const limit = Math.min(Number(c.req.query('limit')) || 1, 10)

  if (!isPeliasConfigured(env.PELIAS_INTERNAL_URL)) {
    return geocoderNotConfigured(c)
  }

  try {
    const pelias = await requestPelias('reverse', {
      'point.lon': String(lon),
      'point.lat': String(lat),
      size: String(limit),
      lang,
    })

    c.header('Cache-Control', 'public, max-age=3600')
    return c.json(pelias)
  } catch (err) {
    console.error('[geocoding] Reverse error:', err)
    return peliasError(c, err)
  }
})

// ── GET /geocoding/v1/autocomplete — Typeahead suggestions ──────────────────

geocodingRoute.get('/geocoding/v1/autocomplete', async (c) => {
  const text = c.req.query('text')
  if (!text) {
    return c.json({ error: { code: 'BAD_REQUEST', message: "Missing 'text' parameter" } }, 400)
  }
  if (text.length > 500) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: "'text' must be 500 characters or fewer" } },
      400
    )
  }

  const limit = Math.min(Number(c.req.query('limit')) || 5, 10)
  const lang = c.req.query('language') || 'en'
  const focusLon = c.req.query('focus.lon')
  const focusLat = c.req.query('focus.lat')

  if (!isPeliasConfigured(env.PELIAS_INTERNAL_URL)) {
    return geocoderNotConfigured(c)
  }

  try {
    const pelias = await requestPelias('autocomplete', {
      text,
      size: String(limit),
      lang,
      ...(focusLon ? { 'focus.point.lon': focusLon } : {}),
      ...(focusLat ? { 'focus.point.lat': focusLat } : {}),
    })

    c.header('Cache-Control', 'public, max-age=60')
    return c.json(pelias)
  } catch (err) {
    console.error('[geocoding] Autocomplete error:', err)
    return peliasError(c, err)
  }
})

geocodingRoute.post('/geocoding/v1/batch', async (c) => {
  if (!isPeliasConfigured(env.PELIAS_INTERNAL_URL)) {
    return geocoderNotConfigured(c)
  }

  const idempotencyKey = c.req.header('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return c.json(
      {
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Idempotency-Key must contain between 8 and 128 characters.',
        },
      },
      400
    )
  }

  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Request body must be JSON.' } }, 400)
  }

  const parsed = parseBatchGeocodingRequest(rawBody)
  if (!parsed.ok) {
    return c.json({ error: { code: 'BAD_REQUEST', message: parsed.message } }, 400)
  }

  const accountId = c.get('ownerId')
  const requestFingerprint = createHash('sha256')
    .update(JSON.stringify(parsed.queries))
    .digest('hex')
  const existing = await findBillableRequest(accountId, idempotencyKey)
  if (existing) {
    return await replayBillableRequest(c, existing, requestFingerprint)
  }

  const [reservation] = await db
    .insert(billableRequests)
    .values({
      accountId,
      idempotencyKey,
      requestFingerprint,
      endpoint: c.req.path,
      method: c.req.method,
      units: c.get('requestCost'),
    })
    .onConflictDoNothing({
      target: [billableRequests.accountId, billableRequests.idempotencyKey],
    })
    .returning({ id: billableRequests.id })

  if (!reservation) {
    const raced = await findBillableRequest(accountId, idempotencyKey)
    if (raced) return await replayBillableRequest(c, raced, requestFingerprint)
    return c.json(
      {
        error: {
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'The request could not acquire its idempotency reservation.',
        },
      },
      409
    )
  }

  try {
    const results = await mapWithConcurrency(parsed.queries, BATCH_CONCURRENCY, executeBatchQuery)
    const responseBody = { data: { results } }
    await db
      .update(billableRequests)
      .set({
        statusCode: 200,
        responseBody,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(billableRequests.id, reservation.id))

    c.header('Cache-Control', 'private, no-store')
    return c.json(responseBody)
  } catch (error) {
    await db.delete(billableRequests).where(eq(billableRequests.id, reservation.id))
    console.error('[geocoding] Batch error:', error)
    return peliasError(c, error)
  }
})

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requestPelias(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`/v1/${endpoint}`, env.PELIAS_INTERNAL_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    if (!res.ok) {
      throw new PeliasUpstreamError(res.status)
    }

    return await res.json()
  } finally {
    clearTimeout(timeout)
  }
}

type BatchGeocodingQuery =
  | {
      type: 'forward'
      q: string
      limit: number
      language: string
      country?: string
      bbox?: string
    }
  | {
      type: 'reverse'
      lon: number
      lat: number
      limit: number
      language: string
    }

export function parseBatchGeocodingRequest(
  value: unknown
): { ok: true; queries: BatchGeocodingQuery[] } | { ok: false; message: string } {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { queries?: unknown }).queries)
  ) {
    return { ok: false, message: "'queries' must be an array." }
  }
  const values = (value as { queries: unknown[] }).queries
  if (values.length === 0 || values.length > MAX_BATCH_QUERIES) {
    return {
      ok: false,
      message: `'queries' must contain between 1 and ${MAX_BATCH_QUERIES} items.`,
    }
  }

  const queries: BatchGeocodingQuery[] = []
  for (const [index, item] of values.entries()) {
    if (!item || typeof item !== 'object') {
      return { ok: false, message: `Query ${index} must be an object.` }
    }
    const query = item as Record<string, unknown>
    const language =
      typeof query.language === 'string' && query.language ? query.language.slice(0, 16) : 'en'
    if (query.type === 'forward') {
      if (typeof query.q !== 'string' || !query.q.trim() || query.q.length > 500) {
        return { ok: false, message: `Query ${index} has an invalid 'q'.` }
      }
      queries.push({
        type: 'forward',
        q: query.q,
        limit: boundedInteger(query.limit, 5, 1, 25),
        language,
        ...(typeof query.country === 'string' && query.country
          ? { country: query.country.slice(0, 8) }
          : {}),
        ...(typeof query.bbox === 'string' && query.bbox ? { bbox: query.bbox.slice(0, 128) } : {}),
      })
      continue
    }
    if (query.type === 'reverse') {
      const lon = Number(query.lon)
      const lat = Number(query.lat)
      if (
        !Number.isFinite(lon) ||
        !Number.isFinite(lat) ||
        lon < -180 ||
        lon > 180 ||
        lat < -90 ||
        lat > 90
      ) {
        return { ok: false, message: `Query ${index} has invalid coordinates.` }
      }
      queries.push({
        type: 'reverse',
        lon,
        lat,
        limit: boundedInteger(query.limit, 1, 1, 10),
        language,
      })
      continue
    }
    return { ok: false, message: `Query ${index} has an unsupported 'type'.` }
  }

  return { ok: true, queries }
}

async function executeBatchQuery(query: BatchGeocodingQuery) {
  if (query.type === 'forward') {
    return requestPelias('search', {
      text: query.q,
      size: String(query.limit),
      lang: query.language,
      ...(query.bbox ? { 'boundary.rect': query.bbox } : {}),
      ...(query.country ? { 'boundary.country': query.country } : {}),
    })
  }
  return requestPelias('reverse', {
    'point.lon': String(query.lon),
    'point.lat': String(query.lat),
    size: String(query.limit),
    lang: query.language,
  })
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
) {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++
        results[index] = await mapper(values[index]!)
      }
    })
  )
  return results
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.max(minimum, Math.min(maximum, parsed))
}

async function findBillableRequest(accountId: string, idempotencyKey: string) {
  const [request] = await db
    .select()
    .from(billableRequests)
    .where(
      and(
        eq(billableRequests.accountId, accountId),
        eq(billableRequests.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1)
  return request
}

async function replayBillableRequest(
  c: Context<AuthEnv>,
  existing: NonNullable<Awaited<ReturnType<typeof findBillableRequest>>>,
  requestFingerprint: string
) {
  c.set('billableUsage', false)
  if (existing.requestFingerprint !== requestFingerprint) {
    return c.json(
      {
        error: {
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Idempotency-Key was already used for a different request.',
        },
      },
      409
    )
  }
  if (!existing.completedAt || !existing.statusCode || !existing.responseBody) {
    if (existing.createdAt.getTime() < Date.now() - 5 * 60 * 1000) {
      await db.delete(billableRequests).where(eq(billableRequests.id, existing.id))
      return c.json(
        {
          error: {
            code: 'STALE_REQUEST_RELEASED',
            message: 'A stale request reservation was released. Retry the request.',
          },
        },
        409
      )
    }
    return c.json(
      {
        error: {
          code: 'REQUEST_IN_PROGRESS',
          message: 'A request with this Idempotency-Key is still in progress.',
        },
      },
      409
    )
  }

  c.header('Idempotency-Replayed', 'true')
  c.header('Cache-Control', 'private, no-store')
  return new Response(JSON.stringify(existing.responseBody), {
    status: existing.statusCode,
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  })
}

function geocoderNotConfigured(c: Context<AuthEnv>) {
  return c.json(
    {
      error: {
        code: 'GEOCODER_NOT_CONFIGURED',
        message: 'Configure PELIAS_INTERNAL_URL with a Pelias-compatible geocoding service.',
      },
    },
    503
  )
}

function peliasError(c: Context<AuthEnv>, err: unknown) {
  if (err instanceof PeliasUpstreamError) {
    return c.json(
      {
        error: {
          code: 'UPSTREAM_ERROR',
          message: `Pelias geocoding service returned HTTP ${err.status}.`,
        },
      },
      502
    )
  }

  return c.json(
    {
      error: {
        code: 'GEOCODER_UNAVAILABLE',
        message: 'Pelias geocoding service unavailable.',
      },
    },
    503
  )
}

class PeliasUpstreamError extends Error {
  constructor(readonly status: number) {
    super(`Pelias returned HTTP ${status}`)
  }
}
