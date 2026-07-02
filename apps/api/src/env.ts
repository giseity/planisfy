import { loadWorkspaceEnv } from '@planisfy/env/node'
import { createEnv, portSchema, redisConnectionFromEnv, z } from '@planisfy/env'

loadWorkspaceEnv()

const emptyableString = z.string()
const optionalEmptyableString = z.string().default('')
const emptyableUrl = z.union([z.literal(''), z.string().url()])

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: portSchema,
  APP_VERSION: z.string().min(1),
  DEPLOYMENT_MODE: z.enum(['self_host', 'managed']),

  REDIS_URL: z.string().url(),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: portSchema,
  GEODATA_STALE_JOB_THRESHOLD_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),

  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_CONSOLE_URL: z.string().url(),
  INTERNAL_API_SECRET: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),

  MARTIN_URL: z.string().url(),
  TILE_DELIVERY_MODE: z.enum(['api', 'worker']).default('api'),
  TILE_WORKER_URL: emptyableUrl.default(''),
  VALHALLA_URL: z.string().url(),
  PELIAS_URL: z.string().url(),
  GLYPHS_URL: z.string().url(),
  STATIC_MAP_URL: emptyableUrl,
  ELEVATION_URL: z.string().url(),

  ZEPTOMAIL_SEND_MAIL_TOKEN: emptyableString,
  ZEPTOMAIL_FROM_AUTH: emptyableString,
  ZEPTOMAIL_FROM_NOTIFICATIONS: emptyableString,
  DODO_PAYMENTS_API_KEY: emptyableString,
  DODO_PAYMENTS_ENVIRONMENT: z.enum(['test_mode', 'live_mode']),
  DODO_PAYMENTS_WEBHOOK_SECRET: emptyableString,
  DODO_PAYMENTS_BRAND_ID: optionalEmptyableString,
  DODO_STARTER_MONTHLY_PRODUCT_ID: optionalEmptyableString,
  DODO_STARTER_YEARLY_PRODUCT_ID: optionalEmptyableString,
  DODO_SCALE_MONTHLY_PRODUCT_ID: optionalEmptyableString,
  DODO_SCALE_YEARLY_PRODUCT_ID: optionalEmptyableString,
  SOURCE_CREDENTIAL_ENCRYPTION_KEY: emptyableString,
  ALLOW_PRIVATE_SOURCE_URLS: z.preprocess(
    (value) => value === 'true' || value === true,
    z.boolean()
  ),
  OVERTURE_ALLOW_EXPERIMENTAL_TYPES: z.preprocess(
    (value) => value === 'true' || value === true,
    z.boolean()
  ),
  OVERTURE_RELEASE: emptyableString,
  DEMO_PMTILES_PATH: emptyableString,
  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']),
  LOCAL_STORAGE_PATH: z.string().min(1),
  S3_BUCKET: emptyableString,
  S3_REGION: emptyableString,
  S3_ENDPOINT: emptyableUrl,
  S3_PUBLIC_URL: emptyableUrl,
  AWS_ACCESS_KEY_ID: emptyableString,
  AWS_SECRET_ACCESS_KEY: emptyableString,
  R2_ACCOUNT_ID: emptyableString,
  R2_BUCKET: emptyableString,
  R2_ENDPOINT: emptyableUrl,
  R2_PUBLIC_URL: emptyableUrl,
  R2_ACCESS_KEY_ID: emptyableString,
  R2_SECRET_ACCESS_KEY: emptyableString,
})

export const env = createEnv(schema, process.env, { appName: 'api' })

assertProductionSecrets(env)
assertManagedProductionEnv(env)

export const redisConnection = redisConnectionFromEnv(env)

function assertProductionSecrets(value: typeof env) {
  if (value.NODE_ENV !== 'production') {
    return
  }

  const issues: string[] = []
  if (isPlaceholderSecret(value.BETTER_AUTH_SECRET)) {
    issues.push('BETTER_AUTH_SECRET')
  }
  if (isPlaceholderSecret(value.INTERNAL_API_SECRET)) {
    issues.push('INTERNAL_API_SECRET')
  }
  if (issues.length > 0) {
    throw new Error(
      `Production deployments require generated secrets, not placeholders: ${issues.join(', ')}`
    )
  }
}

function assertManagedProductionEnv(value: typeof env) {
  if (value.NODE_ENV !== 'production' || value.DEPLOYMENT_MODE !== 'managed') {
    return
  }

  const missing = managedProductionEnvIssues(value)
  if (missing.length > 0) {
    throw new Error(
      `Managed production requires complete platform configuration: ${missing.join(', ')}`
    )
  }
}

function managedProductionEnvIssues(value: typeof env): string[] {
  const issues: string[] = []

  if (!value.DODO_PAYMENTS_API_KEY) issues.push('DODO_PAYMENTS_API_KEY')
  if (!value.DODO_PAYMENTS_WEBHOOK_SECRET) {
    issues.push('DODO_PAYMENTS_WEBHOOK_SECRET')
  }
  if (!value.DODO_PAYMENTS_BRAND_ID) issues.push('DODO_PAYMENTS_BRAND_ID')
  if (!value.DODO_STARTER_MONTHLY_PRODUCT_ID) {
    issues.push('DODO_STARTER_MONTHLY_PRODUCT_ID')
  }
  if (!value.ZEPTOMAIL_SEND_MAIL_TOKEN) {
    issues.push('ZEPTOMAIL_SEND_MAIL_TOKEN')
  }
  if (!value.ZEPTOMAIL_FROM_AUTH) issues.push('ZEPTOMAIL_FROM_AUTH')
  if (!value.ZEPTOMAIL_FROM_NOTIFICATIONS) {
    issues.push('ZEPTOMAIL_FROM_NOTIFICATIONS')
  }
  if (!value.BETTER_AUTH_SECRET || isPlaceholderSecret(value.BETTER_AUTH_SECRET)) {
    issues.push('BETTER_AUTH_SECRET')
  }
  if (!value.INTERNAL_API_SECRET || isPlaceholderSecret(value.INTERNAL_API_SECRET)) {
    issues.push('INTERNAL_API_SECRET')
  }
  if (value.STORAGE_PROVIDER !== 'r2') issues.push('STORAGE_PROVIDER=r2')
  if (!value.R2_BUCKET && !value.S3_BUCKET) issues.push('R2_BUCKET')
  if (!value.R2_ENDPOINT && !value.R2_ACCOUNT_ID) {
    issues.push('R2_ENDPOINT or R2_ACCOUNT_ID')
  }
  if (!value.R2_ACCESS_KEY_ID && !value.AWS_ACCESS_KEY_ID) {
    issues.push('R2_ACCESS_KEY_ID')
  }
  if (!value.R2_SECRET_ACCESS_KEY && !value.AWS_SECRET_ACCESS_KEY) {
    issues.push('R2_SECRET_ACCESS_KEY')
  }
  if (!value.R2_PUBLIC_URL && !value.S3_PUBLIC_URL) issues.push('R2_PUBLIC_URL')

  return issues
}

function isPlaceholderSecret(value: string) {
  return /generate-a-random|change-this|changeme|secret-here|local-dev-only/i.test(value)
}
