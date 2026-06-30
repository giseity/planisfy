'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Clipboard, Code2, ExternalLink, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@planisfy/ui/components/alert'
import { Badge } from '@planisfy/ui/components/badge'
import { Button } from '@planisfy/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@planisfy/ui/components/card'
import { LoadingState } from '@planisfy/ui/components/loading-state'
import { api, type ConsoleDashboard } from '@/lib/api'
import { docsUrl } from '@/lib/docs-url'

const setupActions = [
  {
    label: 'API key',
    description: 'Create a key for authenticated production requests.',
    href: '/keys',
    complete: (dashboard: ConsoleDashboard) => dashboard.summary.activeApiKeys > 0,
  },
  {
    label: 'Published style',
    description: 'Publish a style before using public style URLs.',
    href: '/styles',
    complete: (dashboard: ConsoleDashboard) => dashboard.summary.publishedStyles > 0,
  },
  {
    label: 'Published tileset',
    description: 'Publish source data before using TileJSON and map snippets.',
    href: '/tilesets',
    complete: (dashboard: ConsoleDashboard) => dashboard.summary.publishedTilesets > 0,
  },
]

export default function IntegrationPage() {
  const [dashboard, setDashboard] = useState<ConsoleDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      try {
        const response = await api.getDashboard()
        if (cancelled) return
        setDashboard(response.data)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load integration details')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadDashboard()

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="py-8">
        <LoadingState label="Loading integration details..." />
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertTitle>Integration details unavailable</AlertTitle>
          <AlertDescription>{error ?? 'Dashboard data was not returned.'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const missing = dashboard.integration.missing

  return (
    <div className="space-y-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integration</h1>
          <p className="text-sm text-muted-foreground">
            Connect client applications to {dashboard.account.displayName}.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={docsUrl()} target="_blank">
            <ExternalLink className="h-4 w-4" />
            Open docs
          </Link>
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Code2 className="h-4 w-4" />
                Endpoints
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <CopyRow label="API base URL" value={dashboard.integration.apiBaseUrl} />
              {dashboard.integration.publicStyleUrl ? (
                <CopyRow label="Public style URL" value={dashboard.integration.publicStyleUrl} />
              ) : (
                <MissingRow label="Public style URL" action="Publish a style" />
              )}
              {dashboard.integration.tilejsonUrl ? (
                <CopyRow label="TileJSON URL" value={dashboard.integration.tilejsonUrl} />
              ) : (
                <MissingRow label="TileJSON URL" action="Publish a tileset" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Client snippets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {dashboard.integration.mapLibreSnippet ? (
                <CodeBlock label="MapLibre" value={dashboard.integration.mapLibreSnippet} />
              ) : (
                <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Complete {missing.join(', ')} to generate a MapLibre snippet.
                </p>
              )}
              {dashboard.integration.curlSnippet ? (
                <CodeBlock label="curl" value={dashboard.integration.curlSnippet} />
              ) : (
                <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Publish a tileset to generate a TileJSON curl example.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Setup checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {setupActions.map((item) => {
              const complete = item.complete(dashboard)
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50"
                >
                  {complete ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.label}</p>
                      <Badge variant={complete ? 'success' : 'warning'}>
                        {complete ? 'Ready' : 'Required'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const testId = copyRowTestId(label)

  return (
    <div className="rounded-md border p-3" data-testid={testId}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Button
          aria-label={`Copy ${label}`}
          onClick={() => copyText(value, `${label} copied`)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Clipboard className="h-4 w-4" />
        </Button>
      </div>
      <p className="truncate font-mono text-xs" data-testid={`${testId}-value`}>
        {value}
      </p>
    </div>
  )
}

function MissingRow({ label, action }: { label: string; action: string }) {
  return (
    <div className="rounded-md border border-dashed p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs">{action}</p>
    </div>
  )
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Button
          aria-label={`Copy ${label}`}
          onClick={() => copyText(value, `${label} copied`)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Clipboard className="h-4 w-4" />
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs">
        <code>{value}</code>
      </pre>
    </div>
  )
}

async function copyText(value: string, message: string) {
  await navigator.clipboard.writeText(value)
  toast.success(message)
}

function copyRowTestId(label: string) {
  switch (label) {
    case 'API base URL':
      return 'api-base-url'
    case 'Public style URL':
      return 'style-public-url'
    case 'TileJSON URL':
      return 'tilejson-url'
    default:
      return label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  }
}
