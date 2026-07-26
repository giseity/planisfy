import { createEnv, z } from '@planisfy/env'
import { loadWorkspaceEnv } from '@planisfy/env/node'

loadWorkspaceEnv()

const emptyableString = z.string().default('')
const emptyableUrl = z.union([z.literal(''), z.string().url()])

const schema = z.object({
  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']),
  LOCAL_STORAGE_PATH: emptyableString,
  LOCAL_STORAGE_URL: emptyableUrl.default(''),
  LOCAL_STORAGE_BUCKET: emptyableString,
  S3_BUCKET: emptyableString,
  S3_REGION: emptyableString,
  S3_ENDPOINT: emptyableUrl.default(''),
  AWS_ACCESS_KEY_ID: emptyableString,
  AWS_SECRET_ACCESS_KEY: emptyableString,
  S3_PUBLIC_URL: emptyableUrl.default(''),
  R2_ACCOUNT_ID: emptyableString,
  R2_BUCKET: emptyableString,
  R2_ACCESS_KEY_ID: emptyableString,
  R2_SECRET_ACCESS_KEY: emptyableString,
  R2_ENDPOINT: emptyableUrl.default(''),
  R2_PUBLIC_URL: emptyableUrl.default(''),
})

export const env = createEnv(schema, process.env, { appName: 'storage' })

assertSelectedStorageProvider(env)

function assertSelectedStorageProvider(value: typeof env) {
  const missing: string[] = []

  if (value.STORAGE_PROVIDER === 'local') {
    if (!value.LOCAL_STORAGE_PATH) missing.push('LOCAL_STORAGE_PATH')
    if (!value.LOCAL_STORAGE_URL) missing.push('LOCAL_STORAGE_URL')
    if (!value.LOCAL_STORAGE_BUCKET) missing.push('LOCAL_STORAGE_BUCKET')
  } else if (value.STORAGE_PROVIDER === 's3') {
    if (!value.S3_BUCKET) missing.push('S3_BUCKET')
    if (!value.S3_REGION) missing.push('S3_REGION')
    if (!value.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID')
    if (!value.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY')
  } else {
    if (!value.R2_BUCKET) missing.push('R2_BUCKET')
    if (!value.R2_ENDPOINT && !value.R2_ACCOUNT_ID) {
      missing.push('R2_ENDPOINT or R2_ACCOUNT_ID')
    }
    if (!value.R2_ACCESS_KEY_ID && !value.AWS_ACCESS_KEY_ID) {
      missing.push('R2_ACCESS_KEY_ID')
    }
    if (!value.R2_SECRET_ACCESS_KEY && !value.AWS_SECRET_ACCESS_KEY) {
      missing.push('R2_SECRET_ACCESS_KEY')
    }
  }

  if (missing.length > 0) {
    throw new Error(`${value.STORAGE_PROVIDER} storage requires: ${missing.join(', ')}`)
  }
}
