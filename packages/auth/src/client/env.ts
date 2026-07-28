import { createEnv, z } from '@planisfy/env'

declare const process: {
  env: Record<string, string | undefined>
}

const schema = z.object({
  NEXT_PUBLIC_AUTH_ORIGIN: z.string().url(),
  NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS: z.string().optional(),
  NEXT_PUBLIC_AUTH_EMAIL_PASSWORD_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

export const clientEnv = createEnv(
  schema,
  {
    NEXT_PUBLIC_AUTH_ORIGIN: process.env.NEXT_PUBLIC_AUTH_ORIGIN,
    NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS: process.env.NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS,
    NEXT_PUBLIC_AUTH_EMAIL_PASSWORD_ENABLED: process.env.NEXT_PUBLIC_AUTH_EMAIL_PASSWORD_ENABLED,
  },
  { appName: 'auth client', onInvalid: 'throw' }
)
