import type { Metadata } from 'next'

const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://planisfy.com'
const siteName = 'Planisfy'
const image = '/opengraph-image'

export function marketingMetadata({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}): Metadata {
  return {
    metadataBase: new URL(marketingUrl),
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: 'website',
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
