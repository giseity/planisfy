import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Activity,
  BarChart3,
  Boxes,
  ChevronRight,
  Database,
  Globe,
  KeyRound,
  Layers,
  LocateFixed,
  Map,
  MapPin,
  Route,
  Search,
  ServerCog,
  Upload,
  Workflow,
} from 'lucide-react'

import { Button } from '@planisfy/ui/components/button'
import { Card } from '@planisfy/ui/components/card'

import { HeroHeader } from './header'

type HeroSectionProps = {
  docsHref: string
  signInHref: string
  signUpHref: string
  consoleHref: string
}

export function HeroSection({ docsHref, signInHref, signUpHref, consoleHref }: HeroSectionProps) {
  return (
    <>
      <HeroHeader docsHref={docsHref} signInHref={signInHref} signUpHref={signUpHref} />
      <main className="overflow-hidden">
        <section className="bg-background">
          <div className="relative pb-32 pt-32 lg:pt-44">
            <div className="mask-radial-from-50% mask-radial-to-85% mask-radial-at-top mask-radial-[85%_120%] absolute inset-x-0 top-0 h-[78%] opacity-10 dark:opacity-5 md:h-[82%]">
              <Image
                fill
                src="/earth.jpg"
                alt="Abstract map infrastructure background"
                sizes="100vw"
                className="h-full w-full object-cover object-top"
              />
            </div>
            <div className="relative z-10 mx-auto w-full max-w-6xl px-3 lg:px-6">
              <div className="mx-auto mb-16 max-w-6xl lg:mb-24">
                <div className="**:fill-foreground grid scale-95 grid-cols-3 gap-x-8 gap-y-14 lg:gap-y-10 lg:grid-cols-4 xl:grid-cols-5">
                  <div className="ml-auto feature-cloud-node-blurred -translate-y-3 -translate-x-2 lg:-translate-y-16 lg:-translate-x-8">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <Database className="size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Sources</span>
                    </Card>
                  </div>
                  <div className="ml-auto feature-cloud-node-sharp translate-y-2 lg:-translate-y-6">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <Search className="size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Geocoding</span>
                    </Card>
                  </div>
                  <div className="ml-auto feature-cloud-node-blurred -translate-x-1 -translate-y-4 lg:-translate-x-3 lg:translate-y-4">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <Map className="size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Styles</span>
                    </Card>
                  </div>
                  <div className="mr-auto feature-cloud-node-sharp -translate-y-2 translate-x-2 lg:-translate-y-8 lg:translate-x-4">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <ServerCog className="size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Serving</span>
                    </Card>
                  </div>
                  <div className="feature-cloud-node-blurred -translate-y-4 translate-x-1 lg:translate-x-6 lg:-translate-y-12">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <Route className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Tilequery</span>
                    </Card>
                  </div>
                  <div className="feature-cloud-node-sharp -translate-y-3 -translate-x-2 lg:-translate-x-6 lg:-translate-y-4">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <Activity className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Jobs</span>
                    </Card>
                  </div>
                  <div className="ml-auto feature-cloud-node-blurred -translate-y-1 translate-x-2 lg:-translate-x-16 lg:translate-y-1">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <KeyRound className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">API Keys</span>
                    </Card>
                  </div>
                  <div className="feature-cloud-node-sharp -translate-x-1 translate-y-4 lg:-translate-x-4 lg:translate-y-3">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <LocateFixed className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Reverse</span>
                    </Card>
                  </div>
                  <div className="feature-cloud-node-blurred -translate-y-3 lg:-translate-y-2 lg:translate-x-2">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <MapPin className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Places</span>
                    </Card>
                  </div>
                  <div className="ml-auto feature-cloud-node-sharp translate-y-2 -translate-x-4 lg:-translate-y-5 lg:-translate-x-2">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <Upload className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Uploads</span>
                    </Card>
                  </div>
                  <div className="feature-cloud-node-blurred translate-x-2 translate-y-4 lg:translate-y-2 lg:translate-x-3">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <Layers className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Vector Tiles</span>
                    </Card>
                  </div>
                  <div className="mr-auto feature-cloud-node-sharp -translate-y-1 -translate-x-2 lg:-translate-x-3 lg:translate-y-5">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <Globe className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Static Maps</span>
                    </Card>
                  </div>
                  <div className="ml-auto feature-cloud-node-blurred translate-y-3 translate-x-1 lg:translate-y-12 lg:-translate-x-5">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <BarChart3 className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Usage</span>
                    </Card>
                  </div>
                  <div className="feature-cloud-node-sharp -translate-y-2 -translate-x-1 lg:-translate-x-2 lg:-translate-y-4">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <Workflow className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Releases</span>
                    </Card>
                  </div>
                  <div className="feature-cloud-node-blurred translate-y-4 lg:translate-y-3">
                    <Card className="shadow-foreground/10 flex h-8 w-fit items-center gap-2 rounded-xl px-3 sm:h-10 sm:px-4">
                      <Boxes className="size-3 sm:size-4" />
                      <span className="text-nowrap font-medium max-sm:text-xs">Workers</span>
                    </Card>
                  </div>
                </div>
              </div>
              <div className="mx-auto max-w-md text-center">
                <h1 className="text-balance font-serif text-4xl font-medium sm:text-5xl">
                  Operate maps from source to delivery.
                </h1>
                <p className="text-muted-foreground mt-4 text-balance">
                  Planisfy gives teams one self-hostable control plane for styles, tilesets, API
                  keys, usage, and geodata operations.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button asChild className="pr-1.5 rounded-[20px] h-13 px-4">
                    <Link href={signUpHref}>
                      <span className="text-nowrap">Start Building</span>
                      <ChevronRight className="opacity-50" />
                    </Link>
                  </Button>
                  <Button variant="secondary" className="rounded-[20px] h-13 px-4" asChild>
                    <a href={consoleHref}>Open Console</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
