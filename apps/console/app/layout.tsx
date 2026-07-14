import "@planisfy/ui/globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@planisfy/ui/components/sonner";
import logo192 from "assets/brand/logo-192.png";
import logo512 from "assets/brand/logo-512.png";
import type { Metadata } from "next";

const iconUrl = logo512.src;
const appleIconUrl = logo192.src;

export const metadata: Metadata = {
  icons: {
    icon: iconUrl,
    shortcut: iconUrl,
    apple: appleIconUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
