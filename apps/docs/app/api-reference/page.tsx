import type { Metadata } from 'next';

const description =
  "Reference documentation for Planisfy tiles, styles, sprites, glyphs, geocoding, routing, static maps, and geospatial APIs.";

export const metadata: Metadata = {
  title: "API Reference",
  description,
  alternates: {
    canonical: "/api-reference",
  },
  openGraph: {
    title: "API Reference",
    description,
    url: "/api-reference",
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: "API Reference",
    description,
  },
};

import { redirect } from 'next/navigation';

export default function ApiReferencePage() {
  redirect('/docs/api/tiles');
}
