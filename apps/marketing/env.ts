export const env = {
  NEXT_PUBLIC_AUTH_ORIGIN: requiredUrl('NEXT_PUBLIC_AUTH_ORIGIN'),
  NEXT_PUBLIC_CONSOLE_URL: requiredUrl('NEXT_PUBLIC_CONSOLE_URL'),
  NEXT_PUBLIC_DOCS_URL: optionalUrl('NEXT_PUBLIC_DOCS_URL') ?? derivedDocsUrl(),
}

function requiredUrl(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)

  try {
    new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL.`)
  }

  return value
}

function optionalUrl(name: string) {
  const value = process.env[name]
  if (!value) return undefined

  try {
    new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL.`)
  }

  return value
}

function derivedDocsUrl() {
  const base = optionalUrl('NEXT_PUBLIC_MARKETING_URL') ?? optionalUrl('NEXT_PUBLIC_CONSOLE_URL')
  if (!base) return 'https://docs.planisfy.localhost'

  const url = new URL(base)
  const parts = url.hostname.split('.')

  if (url.hostname.endsWith('planisfy.localhost')) {
    url.hostname = 'docs.planisfy.localhost'
  } else if (parts.length >= 2) {
    url.hostname = `docs.${parts.slice(-2).join('.')}`
  }

  return url.origin
}
