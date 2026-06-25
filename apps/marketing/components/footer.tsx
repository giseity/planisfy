import Link from 'next/link'
import { Github } from 'lucide-react'

import { PlanisfyLogo } from '@planisfy/ui/components/brand-mark'

const socialLinks = [{ icon: Github, href: 'https://github.com/giseity/planisfy', label: 'GitHub' }]

type FooterProps = {
  docsHref: string
}

export function Footer({ docsHref }: FooterProps) {
  const linkGroups = [
    {
      label: 'Product',
      links: [
        { label: 'Features', href: '/#features' },
        { label: 'Pricing', href: '/pricing' },
        { label: 'Compare', href: '/pricing#compare' },
        { label: 'FAQs', href: '/#faqs' },
      ],
    },
    {
      label: 'Platform',
      links: [
        { label: 'Styles', href: `${docsHref}/docs/api/styles` },
        { label: 'Tilesets', href: `${docsHref}/docs/api/tiles` },
        { label: 'Geocoding', href: `${docsHref}/docs/api/geocoding` },
        { label: 'Self-hosting', href: `${docsHref}/docs/self-hosting/overview` },
      ],
    },
    {
      label: 'Company',
      links: [
        { label: 'Contact', href: '/contact' },
        { label: 'Docs', href: docsHref },
        { label: 'Terms', href: '/terms' },
        { label: 'Console', href: '/sign-in' },
      ],
    },
  ]

  return (
    <footer id="contact" className="border-t bg-background py-12">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
          <div>
            <Link href="/" aria-label="Planisfy home" className="inline-flex">
              <PlanisfyLogo size="lg" markClassName="size-11" />
            </Link>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              Self-hostable map infrastructure for styles, tilesets, API keys, and operational
              control.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {linkGroups.map((group) => (
              <div key={group.label}>
                <h2 className="text-sm font-medium">{group.label}</h2>
                <nav className="mt-4 grid gap-3">
                  {group.links.map((link) => (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            &copy; 2026 Planisfy. All rights reserved.
          </p>
          <div className="flex gap-3">
            {socialLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={item.label}
              >
                <item.icon className="size-4" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
