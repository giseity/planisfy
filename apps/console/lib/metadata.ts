import type { Metadata } from 'next'

const consoleUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://console.planisfy.com'
const siteName = 'Planisfy Console'

export function consoleMetadata({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}): Metadata {
  return {
    metadataBase: new URL(consoleUrl),
    title: `${title} | ${siteName}`,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: 'website',
      siteName,
      title: `${title} | ${siteName}`,
      description,
      url: path,
    },
    twitter: {
      card: 'summary',
      title: `${title} | ${siteName}`,
      description,
    },
  }
}
