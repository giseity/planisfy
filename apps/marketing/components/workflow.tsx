import {
  CheckCircle2,
  Database,
  FileCheck2,
  KeyRound,
  Layers3,
  RadioTower,
  Route,
  UploadCloud,
} from 'lucide-react'

import { Card } from '@planisfy/ui/components/card'

const workflowSteps = [
  {
    title: 'Import sources',
    description: 'Upload GeoJSON, MBTiles, or Overture extracts and keep each source traceable.',
    icon: UploadCloud,
  },
  {
    title: 'Process jobs',
    description: 'Run tiling jobs, inspect artifacts, and promote clean outputs into review.',
    icon: Database,
  },
  {
    title: 'Review artifacts',
    description: 'Check generated tiles, metadata, and source lineage before publishing.',
    icon: FileCheck2,
  },
  {
    title: 'Publish styles',
    description: 'Connect tilesets to MapLibre styles with controlled draft and release states.',
    icon: Layers3,
  },
  {
    title: 'Scope access',
    description: 'Issue API keys for the environments and workloads that should consume the map.',
    icon: KeyRound,
  },
  {
    title: 'Serve APIs',
    description: 'Deliver tiles, styles, tilequery, static maps, and search endpoints behind keys.',
    icon: RadioTower,
  },
  {
    title: 'Monitor usage',
    description: 'Watch health, jobs, and usage signals as releases move through production.',
    icon: Route,
  },
]

const checks = ['Schema validated', 'Worker capacity healthy', 'Release ready']

export function WorkflowSection() {
  return (
    <section id="workflow" className="bg-muted/25 py-24">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <p className="text-sm font-medium text-primary">Workflow</p>
          <h2 className="mt-4 max-w-xl text-balance font-serif text-4xl font-medium">
            A controlled path from raw geodata to production map delivery.
          </h2>
          <p className="mt-4 max-w-xl text-balance text-muted-foreground">
            Planisfy keeps imports, jobs, styles, releases, keys, and delivery health connected so
            teams can ship map changes without losing operational context.
          </p>

          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
            {checks.map((check) => (
              <div key={check} className="flex items-center gap-2 whitespace-nowrap">
                <CheckCircle2 className="size-4 shrink-0 text-secondary" />
                <span>{check}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-5 top-7 hidden h-[calc(100%-3.5rem)] w-px bg-border md:block" />
          <div className="grid gap-3">
            {workflowSteps.map((step, index) => (
              <Card key={step.title} className="relative rounded-2xl p-4 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <step.icon className="size-4.5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Step {index + 1}
                      </span>
                      <h3 className="text-base font-medium">{step.title}</h3>
                    </div>
                    <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
