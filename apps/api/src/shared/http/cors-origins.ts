const defaultCorsOrigins = [
  'https://planisfy.localhost',
  'https://console.planisfy.localhost',
  'https://admin.planisfy.localhost',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3003',
  'https://console.planisfy.com',
]

export function apiCorsOrigins(config: {
  apiUrl: string
  consoleUrl: string
  adminUrl?: string
  marketingUrl?: string
  docsUrl?: string
}) {
  return [
    ...new Set([
      ...defaultCorsOrigins,
      ...[config.apiUrl, config.consoleUrl, config.adminUrl, config.marketingUrl, config.docsUrl]
        .filter((value): value is string => Boolean(value))
        .map((value) => new URL(value).origin),
    ]),
  ]
}
