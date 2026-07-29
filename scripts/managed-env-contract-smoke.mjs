const valhallaDigest = `ghcr.io/planisfy/valhalla@sha256:${'a'.repeat(64)}`
const planetilerDigest = `ghcr.io/planisfy/planetiler@sha256:${'b'.repeat(64)}`

Object.assign(process.env, {
  NODE_ENV: 'production',
  PORT: '4000',
  APP_VERSION: 'managed-contract-smoke',
  DEPLOYMENT_MODE: 'managed',
  DATABASE_URL: 'postgresql://planisfy:planisfy@database.invalid/planisfy',
  REDIS_URL: 'redis://redis.invalid:6379',
  NEXT_PUBLIC_API_URL: 'https://api.staging.example.com',
  NEXT_PUBLIC_CONSOLE_URL: 'https://console.staging.example.com',
  NEXT_PUBLIC_ADMIN_URL: 'https://admin.staging.example.com',
  NEXT_PUBLIC_MARKETING_URL: 'https://staging.example.com',
  NEXT_PUBLIC_DOCS_URL: 'https://docs.staging.example.com',
  NEXT_PUBLIC_AUTH_EMAIL_PASSWORD_ENABLED: 'true',
  BETTER_AUTH_SECRET: 'managed-contract-auth-value',
  INTERNAL_API_SECRET: 'managed-contract-internal-value',
  MARTIN_INTERNAL_URL: 'http://martin:3000',
  TILE_DELIVERY_MODE: 'api',
  TILE_WORKER_INTERNAL_URL: '',
  VALHALLA_INTERNAL_URL: 'http://valhalla:8002',
  PELIAS_INTERNAL_URL: 'http://pelias:4000',
  GLYPHS_INTERNAL_URL: 'http://glyphs:3000',
  STATIC_RENDERER_INTERNAL_URL: 'http://static-renderer:4300',
  ELEVATION_INTERNAL_URL: 'http://elevation:8080',
  VALHALLA_BUILDER_IMAGES: valhallaDigest,
  PLANETILER_BUILDER_IMAGES: planetilerDigest,
  ZEPTOMAIL_SEND_MAIL_TOKEN: 'managed-contract-mail-token',
  ZEPTOMAIL_FROM_AUTH: 'auth@staging.example.com',
  ZEPTOMAIL_FROM_NOTIFICATIONS: 'notifications@staging.example.com',
  DODO_PAYMENTS_API_KEY: 'managed-contract-dodo-key',
  DODO_PAYMENTS_ENVIRONMENT: 'test_mode',
  DODO_PAYMENTS_WEBHOOK_SECRET: 'managed-contract-dodo-webhook',
  DODO_PAYMENTS_BRAND_ID: 'brand_managed_contract',
  DODO_STARTER_MONTHLY_PRODUCT_ID: 'prod_starter_monthly',
  DODO_STARTER_YEARLY_PRODUCT_ID: 'prod_starter_yearly',
  DODO_SCALE_MONTHLY_PRODUCT_ID: 'prod_scale_monthly',
  DODO_SCALE_YEARLY_PRODUCT_ID: 'prod_scale_yearly',
  SOURCE_CREDENTIAL_ENCRYPTION_KEY: 'managed-contract-source-key',
  ALLOW_PRIVATE_SOURCE_URLS: 'false',
  OUTBOUND_PRIVATE_ALLOWLIST: '',
  OVERTURE_ALLOW_EXPERIMENTAL_TYPES: 'false',
  OVERTURE_RELEASE: '',
  DEMO_PMTILES_PATH: '',
  STORAGE_PROVIDER: 'r2',
  LOCAL_STORAGE_PATH: '.storage',
  S3_BUCKET: '',
  S3_REGION: '',
  S3_ENDPOINT: '',
  S3_PUBLIC_URL: '',
  AWS_ACCESS_KEY_ID: '',
  AWS_SECRET_ACCESS_KEY: '',
  R2_ACCOUNT_ID: 'managed-contract-account',
  R2_BUCKET: 'managed-contract-bucket',
  R2_ENDPOINT: 'https://managed-contract-account.r2.cloudflarestorage.com',
  R2_PUBLIC_URL: 'https://assets.staging.example.com',
  R2_ACCESS_KEY_ID: 'managed-contract-access-key',
  R2_SECRET_ACCESS_KEY: 'managed-contract-secret-key',
})

const { env } = await import('../apps/api/src/env.ts')

if (
  env.DEPLOYMENT_MODE !== 'managed' ||
  env.VALHALLA_BUILDER_IMAGES[0] !== valhallaDigest ||
  env.PLANETILER_BUILDER_IMAGES[0] !== planetilerDigest
) {
  throw new Error('Managed environment contract resolved unexpected values')
}

console.log('Managed production environment contract passed')
