import type { Metadata } from 'next'

const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://planisfy.com'
const siteName = 'Planisfy'
const image = '/opengraph-image'

export function getMarketingUrl() {
  return marketingUrl
}

export function marketingMetadata({
  title,
  description,
  path,
  type = 'website',
}: {
  title: string
  description: string
  path: string
  type?: 'website' | 'article'
}): Metadata {
  return {
    metadataBase: new URL(marketingUrl),
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type,
      siteName,
      title,
      description,
      url: path,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: 'Planisfy - Open-Source, Self-Hostable Map Infrastructure',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/twitter-image'],
    },
  }
}
