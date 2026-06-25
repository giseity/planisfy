import { createEnv, z } from '@planisfy/env'

const schema = z.object({
  NEXT_PUBLIC_AUTH_ORIGIN: z.string().url(),
  NEXT_PUBLIC_CONSOLE_URL: z.string().url(),
  NEXT_PUBLIC_DOCS_URL: z.string().url().optional(),
  NEXT_PUBLIC_MARKETING_URL: z.string().url().optional(),
  CONTACT_EMAIL: z.string().email(),
})

const parsed = createEnv(
  schema,
  {
    NEXT_PUBLIC_AUTH_ORIGIN: process.env.NEXT_PUBLIC_AUTH_ORIGIN,
    NEXT_PUBLIC_CONSOLE_URL: process.env.NEXT_PUBLIC_CONSOLE_URL,
    NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL,
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
    CONTACT_EMAIL: process.env.CONTACT_EMAIL,
  },
  { appName: 'marketing server', onInvalid: 'throw' }
)

export const serverEnv = {
  ...parsed,
  NEXT_PUBLIC_DOCS_URL: parsed.NEXT_PUBLIC_DOCS_URL ?? derivedDocsUrl(),
}

function derivedDocsUrl() {
  const base = parsed.NEXT_PUBLIC_MARKETING_URL ?? parsed.NEXT_PUBLIC_CONSOLE_URL
  const url = new URL(base)
  const parts = url.hostname.split('.')

  if (url.hostname.endsWith('planisfy.localhost')) {
    url.hostname = 'docs.planisfy.localhost'
  } else if (parts.length >= 2) {
    url.hostname = `docs.${parts.slice(-2).join('.')}`
  }

  return url.origin
}
