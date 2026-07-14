import type { MetadataRoute } from 'next'

import { getBlogPostUrl, getPublishedBlogPosts } from '@/lib/blog'
import { getMarketingUrl } from '@/lib/metadata'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getMarketingUrl()
  const staticRoutes = ['/', '/pricing', '/contact', '/terms', '/blog']

  return [
    ...staticRoutes.map((route) => ({
      url: new URL(route, baseUrl).toString(),
      lastModified: new Date(),
    })),
    ...getPublishedBlogPosts().map((post) => ({
      url: new URL(getBlogPostUrl(post), baseUrl).toString(),
      lastModified: new Date(`${post.date}T00:00:00.000Z`),
    })),
  ]
}
