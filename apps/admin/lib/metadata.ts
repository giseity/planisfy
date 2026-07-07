import type { Metadata } from 'next'

const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.planisfy.com'
const siteName = 'Planisfy Admin'

export function adminMetadata({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}): Metadata {
  return {
    metadataBase: new URL(adminUrl),
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
