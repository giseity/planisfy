import { ArrowRight, HardDriveUpload, LifeBuoy, Mail, ServerCog } from 'lucide-react'

import { Button } from '@planisfy/ui/components/button'
import { Card } from '@planisfy/ui/components/card'

import { Footer } from '@/components/footer'
import { HeroHeader } from '@/components/header'
import { serverEnv } from '@/env.server'

const signInHref = `${serverEnv.NEXT_PUBLIC_AUTH_ORIGIN}/sign-in`
const signUpHref = `${serverEnv.NEXT_PUBLIC_AUTH_ORIGIN}/sign-up`
const contactEmail = serverEnv.CONTACT_EMAIL
const contactHref = `mailto:${contactEmail}?subject=Planisfy%20self-hosted%20deployment%20conversation`

const contactRoutes = [
  {
    title: 'Self-hosting plan',
    description: 'Map out runtime services, storage, backups, upgrades, and ownership boundaries.',
    icon: ServerCog,
  },
  {
    title: 'Data migration',
    description: 'Bring source imports, tilesets, styles, API keys, and release workflows across.',
    icon: HardDriveUpload,
  },
  {
    title: 'Support',
    description:
      'Work through deployment blockers, service health, jobs, or operational questions.',
    icon: LifeBuoy,
  },
]

export default function ContactPage() {
  return (
    <div className="min-h-svh bg-background">
      <HeroHeader
        docsHref={serverEnv.NEXT_PUBLIC_DOCS_URL}
        signInHref={signInHref}
        signUpHref={signUpHref}
      />
      <main className="pt-24">
        <section className="py-20 md:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div>
              <p className="text-sm font-medium text-primary">Contact</p>
              <h1 className="mt-4 max-w-xl text-balance font-serif text-4xl font-medium md:text-5xl">
                Plan a self-hosted path for your map infrastructure.
              </h1>
              <p className="mt-6 max-w-xl text-balance text-muted-foreground">
                Reach out for self-hosted deployment, data workflow, migration, or platform
                integration questions. Include your expected traffic, geodata sources, and target
                environment if you already know them.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild className="h-13 rounded-[20px] px-4 pr-1.5">
                  <a href={contactHref}>
                    <Mail className="size-4" />
                    <span>Email Planisfy</span>
                    <ArrowRight className="opacity-50" />
                  </a>
                </Button>
                <Button variant="secondary" asChild className="h-13 rounded-[20px] px-4">
                  <a href={signUpHref}>Start building</a>
                </Button>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                Prefer direct email?{' '}
                <a href={contactHref} className="font-medium text-primary hover:underline">
                  {contactEmail}
                </a>
              </p>
            </div>

            <div className="grid gap-4">
              {contactRoutes.map((route) => (
                <Card key={route.title} className="rounded-3xl p-6">
                  <div className="flex gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <route.icon className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-medium">{route.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {route.description}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}

              <Card className="rounded-3xl border-primary/20 bg-primary/5 p-6">
                <h2 className="text-lg font-medium">What to send</h2>
                <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
                  <p>Deployment shape: local demo, private cloud, customer VPC, or hybrid.</p>
                  <p>Map workloads: styles, vector tiles, static maps, geocoding, or imports.</p>
                  <p>
                    Operational needs: API keys, usage controls, audit, jobs, or support bundles.
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <Footer docsHref={serverEnv.NEXT_PUBLIC_DOCS_URL} />
    </div>
  )
}
