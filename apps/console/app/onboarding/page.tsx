"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@planisfy/ui/components/alert"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import { LoadingState } from "@planisfy/ui/components/loading-state"
import { api, type PlatformPreflight } from "@/lib/api"

export default function OnboardingPage() {
  const [preflight, setPreflight] = useState<PlatformPreflight | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await api.getPlatformPreflight()
      setPreflight(res.data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load setup")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const groups = useMemo(
    () => preflight?.groups ?? [],
    [preflight?.groups],
  )

  if (loading && !preflight) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <LoadingState label="Checking platform setup..." />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Set up Planisfy
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live readiness checks for this {preflight?.deploymentMode ?? "active"} deployment.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button asChild>
              <Link href="/">
                Open console
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Setup checks unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {preflight && (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Summary label="Passing" value={preflight.summary.pass} />
              <Summary label="Warnings" value={preflight.summary.warn} />
              <Summary label="Failing" value={preflight.summary.fail} />
              <Summary label="Blocking" value={preflight.summary.blocking} />
            </div>

            {preflight.summary.blocking > 0 ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Required setup is incomplete</AlertTitle>
                <AlertDescription>
                  Resolve blocking checks before treating this deployment as
                  production ready.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Required checks passed</AlertTitle>
                <AlertDescription>
                  Optional and recommended checks may still improve production
                  readiness.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {groups.map((group) => (
                <Card key={group.name}>
                  <CardHeader>
                    <CardTitle className="text-base">{group.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {group.checks.map((check) => (
                      <div key={check.id} className="flex gap-3 rounded-md border p-3">
                        <StatusIcon status={check.status} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{check.label}</p>
                            <Badge variant={statusVariant(check.status)}>
                              {check.status}
                            </Badge>
                            <Badge variant="outline">{check.severity}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {check.message}
                          </p>
                          {check.action && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {check.action}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function StatusIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
  if (status === "warn") return <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
  return <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
}

function statusVariant(status: "pass" | "warn" | "fail") {
  if (status === "pass") return "success"
  if (status === "warn") return "warning"
  return "destructive"
}
