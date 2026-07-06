import "@planisfy/ui/globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@planisfy/ui/components/sonner";
import type { Metadata, Viewport } from "next";

const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://planisfy.com";
const description =
  "Open-source, self-hostable map infrastructure for MapLibre styles, vector tiles, geospatial APIs, and operations.";

export const metadata: Metadata = {
  metadataBase: new URL(marketingUrl),
  title: {
    default: "Planisfy",
    template: "%s | Planisfy",
  },
  description,
  applicationName: "Planisfy",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Planisfy",
    title: "Planisfy",
    description,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Planisfy - Open-Source, Self-Hostable Map Infrastructure",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Planisfy",
    description,
    images: ["/twitter-image"],
  },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
