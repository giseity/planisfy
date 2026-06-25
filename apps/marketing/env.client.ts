import { createEnv, z } from '@planisfy/env'

const schema = z.object({
  NEXT_PUBLIC_AUTH_ORIGIN: z.string().url(),
  NEXT_PUBLIC_CONSOLE_URL: z.string().url(),
})

export const clientEnv = createEnv(
  schema,
  {
    NEXT_PUBLIC_AUTH_ORIGIN: process.env.NEXT_PUBLIC_AUTH_ORIGIN,
    NEXT_PUBLIC_CONSOLE_URL: process.env.NEXT_PUBLIC_CONSOLE_URL,
  },
  { appName: 'marketing client', onInvalid: 'throw' }
)
