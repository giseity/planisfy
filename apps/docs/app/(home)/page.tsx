import type { Metadata } from 'next';

const description =
  "Developer documentation for Planisfy APIs, self-hosting, MapLibre styles, tiles, routing, and geospatial workflows.";

export const metadata: Metadata = {
  title: "Planisfy Documentation",
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Planisfy Documentation",
    description,
    url: "/",
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: "Planisfy Documentation",
    description,
  },
};

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/docs');
}
