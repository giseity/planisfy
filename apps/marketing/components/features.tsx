import { BarChart3, KeyRound, Layers3, LocateFixed, ServerCog, UploadCloud } from 'lucide-react'

import { Card } from '@planisfy/ui/components/card'

const features = [
  {
    title: 'Map Delivery',
    description:
      'Publish MapLibre styles, serve vector tiles, support tilequery, and expose static map surfaces from the same platform.',
    icon: Layers3,
  },
  {
    title: 'Search and Location',
    description:
      'Offer geocoding, reverse geocoding, and places workflows alongside the maps your users already consume.',
    icon: LocateFixed,
  },
  {
    title: 'Data Workflows',
    description:
      'Move source uploads through imports, processing jobs, review steps, and releases before they become production tilesets.',
    icon: UploadCloud,
  },
  {
    title: 'Access Control',
    description:
      'Create scoped API keys, separate environments, and keep customer access visible without mixing operational concerns.',
    icon: KeyRound,
  },
  {
    title: 'Operations',
    description:
      'Track jobs, workers, usage, and delivery health from one place, with enough context to debug map infrastructure quickly.',
    icon: BarChart3,
  },
  {
    title: 'Self-Hostable Core',
    description:
      'Run the control plane and geospatial services where your team needs them, while keeping a clear path to managed delivery.',
    icon: ServerCog,
  },
]

export function Features() {
  return (
    <section id="features" className="bg-background py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary">Platform Capabilities</p>
          <h2 className="mt-4 text-balance font-serif text-4xl font-medium">
            Everything needed to operate map infrastructure.
          </h2>
          <p className="mt-4 text-balance text-muted-foreground">
            Planisfy connects publishing, serving, access control, and operations so teams can move
            from geodata to reliable map APIs without stitching separate tools together.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="rounded-3xl p-6">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <feature.icon className="size-5" />
              </div>
              <h3 className="mt-5 text-lg font-medium">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
