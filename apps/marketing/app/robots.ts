import type { MetadataRoute } from 'next'

import { getMarketingUrl } from '@/lib/metadata'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getMarketingUrl()

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: new URL('/sitemap.xml', baseUrl).toString(),
  }
}
