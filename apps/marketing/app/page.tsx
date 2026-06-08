import Link from "next/link"
import { ArrowRight, Database, KeyRound, Map, ServerCog } from "lucide-react"
import { Button } from "@planisfy/ui/components/button"

const authOrigin =
  process.env.NEXT_PUBLIC_AUTH_ORIGIN ||
  process.env.NEXT_PUBLIC_MARKETING_URL ||
  "https://planisfy.localhost"
const consoleUrl =
  process.env.NEXT_PUBLIC_CONSOLE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://console.planisfy.localhost"

export default function Page() {
  return (
    <main className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Planisfy
          </Link>
          <nav className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <a href={`${authOrigin}/sign-in`}>Sign in</a>
            </Button>
            <Button asChild size="sm">
              <a href={`${authOrigin}/sign-up`}>Get started</a>
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100svh-3.5rem)] max-w-6xl content-center gap-10 px-4 py-12 lg:grid-cols-[1fr_420px] lg:items-center">
        <div className="max-w-2xl space-y-6">
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Planisfy
            </h1>
            <p className="text-lg text-muted-foreground">
              A self-hostable maps platform for styles, tilesets, API keys, and operational control.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <a href={`${authOrigin}/sign-up`}>
                Start building
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={consoleUrl}>Open console</a>
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          {[
            { icon: Map, title: "Style studio", text: "Design and publish MapLibre-compatible styles." },
            { icon: Database, title: "Tileset pipeline", text: "Upload, process, version, and promote geospatial artifacts." },
            { icon: KeyRound, title: "Developer access", text: "Manage scoped keys, usage, and integration URLs." },
            { icon: ServerCog, title: "Operations", text: "Monitor jobs, workers, delivery, backups, and platform readiness." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 rounded-md border bg-card p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <item.icon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-medium">{item.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
