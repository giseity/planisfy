'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  ArchiveRestore,
  Bell,
  CalendarClock,
  ClipboardList,
  Globe,
  Map,
  RefreshCw,
  Route,
  ServerCog,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@planisfy/ui/components/button'
import { MetricCard } from '@planisfy/ui/components/metric-card'
import { LoadingState } from '@planisfy/ui/components/loading-state'
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from '@planisfy/ui/components/page-header'
import { cn } from '@planisfy/ui/lib/utils'
import {
  api,
  type ConsoleJobTimeline,
  type ConsoleOperationsOverview,
  type ConsoleSourceImport,
  type ConsoleTileset,
} from '@/lib/api'
import type { DeploymentMode } from '@/lib/deployment-mode'

const EMPTY_OVERVIEW: ConsoleOperationsOverview = {
  deploymentMode: 'self_host',
  recentJobs: [],
  jobSummary: {
    active: 0,
    completed24h: 0,
    failed24h: 0,
    averageDurationMs24h: null,
    windowStartedAt: new Date(0).toISOString(),
    latestActiveJob: null,
  },
  notificationChannels: [],
  scheduledOperations: [],
  artifactBackups: [],
  workerNodes: [],
  routingGraphBuilds: [],
  basemapBuilds: [],
  basemapReleases: [],
  runtimeInstallations: [],
  previewLinks: [],
  customDomains: [],
  workflowTemplates: [],
  truncatedCollections: [],
  workerHealth: { status: 'offline', message: 'Not checked', latencyMs: null },
  staleJobReconciliation: { reconciled: 0, latest: [] },
}

const operationRoutes = [
  { href: '/operations/jobs', label: 'Jobs', icon: Activity },
  { href: '/operations/schedules', label: 'Schedules', icon: CalendarClock },
  { href: '/operations/notifications', label: 'Notifications', icon: Bell },
  {
    href: '/operations/workers',
    label: 'Workers',
    icon: ServerCog,
    modes: ['self_host'] as DeploymentMode[],
  },
  {
    href: '/operations/routing',
    label: 'Routing',
    icon: Route,
    modes: ['self_host'] as DeploymentMode[],
  },
  {
    href: '/operations/basemaps',
    label: 'Basemaps',
    icon: Map,
    modes: ['self_host'] as DeploymentMode[],
  },
  {
    href: '/operations/backups',
    label: 'Backups',
    icon: ArchiveRestore,
    modes: ['self_host'] as DeploymentMode[],
  },
  { href: '/operations/delivery', label: 'Delivery', icon: Globe },
  {
    href: '/operations/templates',
    label: 'Templates',
    icon: ClipboardList,
    modes: ['self_host'] as DeploymentMode[],
  },
] satisfies Array<{
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  modes?: DeploymentMode[]
}>

interface OperationsContextValue {
  overview: ConsoleOperationsOverview
  timeline: ConsoleJobTimeline | null
  tilesets: ConsoleTileset[]
  sourceImports: ConsoleSourceImport[]
  loading: boolean
  load: (options?: { silent?: boolean }) => void
  openTimeline: (jobId: string) => void
  reconcileStaleJobs: () => void
}

const OperationsContext = React.createContext<OperationsContextValue | null>(null)

export function OperationsProvider({ children }: { children: React.ReactNode }) {
  const [overview, setOverview] = React.useState<ConsoleOperationsOverview>(EMPTY_OVERVIEW)
  const [timeline, setTimeline] = React.useState<ConsoleJobTimeline | null>(null)
  const [tilesets, setTilesets] = React.useState<ConsoleTileset[]>([])
  const [sourceImports, setSourceImports] = React.useState<ConsoleSourceImport[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async (options: { silent?: boolean } = {}) => {
    try {
      const [operationsRes, tilesetsRes, sourceImportsRes] = await Promise.all([
        api.getOperations(),
        api.listTilesets(),
        api.listSourceImports(),
      ])
      setOverview(operationsRes.data)
      setTilesets(tilesetsRes.data)
      setSourceImports(sourceImportsRes.data)
    } catch (err) {
      if (!options.silent) {
        toast.error(err instanceof Error ? err.message : 'Failed to load operations')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    let requestInFlight = false
    const refresh = async () => {
      if (
        requestInFlight ||
        document.visibilityState !== 'visible' ||
        !navigator.onLine
      ) {
        return
      }
      requestInFlight = true
      try {
        await load({ silent: true })
      } finally {
        requestInFlight = false
      }
    }
    const onAvailabilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh()
    }
    const timer = window.setInterval(() => void refresh(), 10_000)
    document.addEventListener('visibilitychange', onAvailabilityChange)
    window.addEventListener('focus', onAvailabilityChange)
    window.addEventListener('online', onAvailabilityChange)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onAvailabilityChange)
      window.removeEventListener('focus', onAvailabilityChange)
      window.removeEventListener('online', onAvailabilityChange)
    }
  }, [load])

  const openTimeline = React.useCallback(async (jobId: string) => {
    try {
      const res = await api.getJobTimeline(jobId)
      setTimeline(res.data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load job timeline')
    }
  }, [])

  const reconcileStaleJobs = React.useCallback(async () => {
    try {
      const res = await api.reconcileStaleJobs()
      toast.success(
        `Reconciled ${res.data.reconciled} stale job${res.data.reconciled === 1 ? '' : 's'}.`
      )
      await load({ silent: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reconcile stale jobs')
    }
  }, [load])

  const value = React.useMemo(
    () => ({
      overview,
      timeline,
      tilesets,
      sourceImports,
      loading,
      load,
      openTimeline,
      reconcileStaleJobs,
    }),
    [load, loading, openTimeline, reconcileStaleJobs, overview, sourceImports, tilesets, timeline]
  )

  return (
    <OperationsContext.Provider value={value}>
      <OperationsShell>{children}</OperationsShell>
    </OperationsContext.Provider>
  )
}

export function useOperations() {
  const value = React.useContext(OperationsContext)
  if (!value) throw new Error('useOperations must be used within OperationsProvider')
  return value
}

function OperationsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { overview, loading, load } = useOperations()
  const visibleRoutes = operationRoutes.filter(
    (route) => !route.modes || route.modes.includes(overview.deploymentMode)
  )
  const activeRouteVisible = visibleRoutes.some(
    (route) =>
      pathname === route.href ||
      (pathname === '/operations' && route.href === '/operations/jobs')
  )
  const activeSchedules = overview.scheduledOperations.filter(
    (schedule) => schedule.status === 'active'
  ).length

  React.useEffect(() => {
    if (!loading && !activeRouteVisible) {
      router.replace('/operations/jobs')
    }
  }, [activeRouteVisible, loading, router])

  if (loading) return <LoadingState label="Loading operations..." />
  if (!activeRouteVisible) return <LoadingState label="Opening operations..." />

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Operations</PageTitle>
          <PageDescription>
            {overview.deploymentMode === 'managed'
              ? 'Monitor processing, automate rebuilds, and manage delivery controls.'
              : 'Monitor processing, automate rebuilds, validate workers, and manage delivery controls.'}
          </PageDescription>
        </PageHeaderText>
        <PageActions>
          <Button variant="outline" onClick={() => load()}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        </PageActions>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overview.deploymentMode === 'self_host' ? (
          <MetricCard
            label="Worker"
            value={overview.workerHealth.status}
            detail={overview.workerHealth.message}
            icon={<Activity className="h-4 w-4" />}
          />
        ) : (
          <MetricCard
            label="Deployment"
            value="managed"
            detail="Runtime workers are platform-operated"
            icon={<Activity className="h-4 w-4" />}
          />
        )}
        <MetricCard
          label="Active schedules"
          value={activeSchedules.toString()}
          detail={`${overview.scheduledOperations.length} configured`}
          icon={<CalendarClock className="h-4 w-4" />}
        />
        <MetricCard
          label="Recent jobs"
          value={overview.recentJobs.length.toString()}
          detail="Latest tenant processing activity"
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          label="Delivery"
          value={overview.customDomains.length.toString()}
          detail={`${overview.previewLinks.length} preview links`}
          icon={<Globe className="h-4 w-4" />}
        />
      </div>

      {overview.truncatedCollections.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Some operational lists are limited to the newest 100 entries. Open the resource page for
          complete history.
        </p>
      )}

      <nav className="flex flex-wrap gap-1 rounded-md bg-muted/20 p-1">
        {visibleRoutes.map((route) => {
          const active =
            pathname === route.href ||
            (pathname === '/operations' && route.href === '/operations/jobs')
          return (
            <Button
              key={route.href}
              asChild
              size="sm"
              variant={active ? 'secondary' : 'ghost'}
              className={cn('justify-start', active && 'font-medium')}
            >
              <Link href={route.href}>
                <route.icon className="h-4 w-4" />
                {route.label}
              </Link>
            </Button>
          )
        })}
      </nav>

      {children}
    </div>
  )
}
