import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
