"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  api,
  type PlatformPreflight,
  type PlatformPreflightCheck,
  type PlatformPreflightStatus,
} from "@/lib/api";
import { Badge } from "@planisfy/ui/components/badge";
import { Button } from "@planisfy/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Database,
  HardDrive,
  Loader2,
  Map,
  RefreshCw,
  ShieldCheck,
  ServerCog,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const statusIcon = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
} satisfies Record<
  PlatformPreflightStatus,
  ComponentType<{ className?: string }>
>;

export default function PlatformPage() {
  const [preflight, setPreflight] = useState<PlatformPreflight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.getPlatformPreflight();
      setPreflight(res.data);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load platform checks",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const blocking = useMemo(
    () =>
      preflight?.checks.filter(
        (check) => check.status === "fail" && check.severity === "required",
      ) ?? [],
    [preflight],
  );

  if (loading) {
    return (
      <div className="container max-w-6xl px-4 py-8">
        <div className="flex min-h-[360px] items-center justify-center rounded-md border">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!preflight) {
    return (
      <div className="container max-w-6xl px-4 py-8">
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <p className="text-sm text-muted-foreground">
              Platform checks are unavailable.
            </p>
            <Button size="sm" onClick={() => load()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl space-y-5 px-4 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Platform</h1>
          <p className="text-sm text-muted-foreground">
            Deployment readiness for {preflight.environment} / v
            {preflight.appVersion}
          </p>
        </div>
        <Button variant="outline" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {blocking.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <p className="text-sm font-medium">
                {blocking.length} required check
                {blocking.length === 1 ? "" : "s"} need attention
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {blocking.map((check) => check.label).join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Passing" value={preflight.summary.pass} status="pass" />
        <MetricCard label="Warnings" value={preflight.summary.warn} status="warn" />
        <MetricCard label="Failing" value={preflight.summary.fail} status="fail" />
        <MetricCard
          label="Blocking"
          value={preflight.summary.blocking}
          status={preflight.summary.blocking > 0 ? "fail" : "pass"}
        />
      </div>

      <CapabilitySurface preflight={preflight} />

      <div className="grid gap-5 lg:grid-cols-2">
        {preflight.groups.map((group) => (
          <Card key={group.name}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span className="flex items-center gap-2">
                  <ServerCog className="h-4 w-4 text-muted-foreground" />
                  {group.name}
                </span>
                <span className="flex items-center gap-1">
                  {group.fail > 0 && <Badge variant="destructive">{group.fail}</Badge>}
                  {group.warn > 0 && <Badge variant="warning">{group.warn}</Badge>}
                  {group.pass > 0 && <Badge variant="success">{group.pass}</Badge>}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              {group.checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

type CapabilityState = "configured" | "degraded" | "unavailable";

const capabilityDefinitions = [
  {
    ids: ["storage"],
    label: "Storage provider",
    icon: Database,
  },
  {
    ids: ["martin", "martin-source-aliases", "upgrade-martin-url"],
    label: "Martin vector tiles",
    icon: Map,
  },
  {
    ids: ["valhalla"],
    label: "Valhalla routing",
    icon: Cloud,
  },
  {
    ids: ["geocoding"],
    label: "Geocoding",
    icon: Cloud,
  },
  {
    ids: ["static-maps"],
    label: "Static maps",
    icon: Map,
  },
  {
    ids: ["overture"],
    label: "Overture imports",
    icon: Database,
  },
  {
    ids: ["email"],
    label: "Email",
    icon: Cloud,
  },
  {
    ids: ["billing"],
    label: "Billing",
    icon: Cloud,
  },
  {
    ids: ["worker-toolchain", "upgrade-worker-heartbeat"],
    label: "Worker toolchain",
    icon: Wrench,
  },
  {
    ids: ["credential-encryption"],
    label: "Credential encryption",
    icon: ShieldCheck,
  },
] satisfies Array<{
  ids: string[];
  label: string;
  icon: ComponentType<{ className?: string }>;
}>;

function CapabilitySurface({ preflight }: { preflight: PlatformPreflight }) {
  const mode = inferDeploymentMode(preflight);
  const capabilities = capabilityDefinitions.map((definition) =>
    capabilityFromChecks(definition, preflight.checks),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Capability Surface</h2>
          <p className="text-sm text-muted-foreground">
            {mode.label}: {mode.detail}
          </p>
        </div>
        <Badge variant={mode.variant}>{mode.badge}</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((capability) => (
          <CapabilityCard key={capability.label} capability={capability} />
        ))}
      </div>
    </div>
  );
}

function CapabilityCard({
  capability,
}: {
  capability: {
    detail: string;
    icon: ComponentType<{ className?: string }>;
    label: string;
    state: CapabilityState;
    value: string | null;
  };
}) {
  const Icon = capability.icon;
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{capability.label}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {capability.detail}
              </p>
            </div>
          </div>
          <Badge variant={capabilityVariant(capability.state)}>
            {capability.state}
          </Badge>
        </div>
        {capability.value && (
          <div className="flex items-center gap-1 truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
            <HardDrive className="h-3 w-3 shrink-0" />
            <span className="truncate">{capability.value}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function capabilityFromChecks(
  definition: (typeof capabilityDefinitions)[number],
  checks: PlatformPreflightCheck[],
) {
  const matched = definition.ids
    .map((id) => checks.find((check) => check.id === id))
    .filter((check): check is PlatformPreflightCheck => Boolean(check));
  const primary = matched[0];
  const requiredFailure = matched.some(
    (check) => check.status === "fail" && check.severity === "required",
  );
  const optionalOnlyMissing =
    matched.length > 0 &&
    matched.every(
      (check) => check.status !== "pass" && check.severity === "optional",
    );
  const state: CapabilityState =
    matched.length === 0 || requiredFailure || optionalOnlyMissing
      ? "unavailable"
      : matched.every((check) => check.status === "pass")
        ? "configured"
        : "degraded";

  return {
    detail: primary?.message ?? "No platform signal is available.",
    icon: definition.icon,
    label: definition.label,
    state,
    value:
      primary?.value === undefined || primary?.value === null
        ? null
        : String(primary.value),
  };
}

function inferDeploymentMode(preflight: PlatformPreflight) {
  const selfHost = preflight.groups.some(
    (group) => group.name === "Self-host product loop",
  );
  const managedSignals = ["billing", "email"].map((id) =>
    preflight.checks.find((check) => check.id === id),
  );
  const managedConfigured = managedSignals.some(
    (check) => check?.status === "pass",
  );

  if (selfHost) {
    return {
      badge: "Self-host",
      detail: "local storage and self-host product-loop checks are active",
      label: "Deployment mode",
      variant: "secondary" as const,
    };
  }

  return {
    badge: managedConfigured ? "Managed-ready" : "Base platform",
    detail: managedConfigured
      ? "managed-service integrations are configured"
      : "managed-service integrations are not configured",
    label: "Deployment mode",
    variant: managedConfigured ? ("success" as const) : ("warning" as const),
  };
}

function capabilityVariant(state: CapabilityState) {
  if (state === "configured") return "success";
  if (state === "degraded") return "warning";
  return "secondary";
}

function MetricCard({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status: PlatformPreflightStatus;
}) {
  const Icon = statusIcon[status];
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
          <Icon className={iconClass(status)} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckRow({ check }: { check: PlatformPreflightCheck }) {
  const Icon = statusIcon[check.status];
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className={iconClass(check.status, "mt-0.5")} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{check.label}</p>
              <Badge variant={severityVariant(check.severity)}>
                {check.severity}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {check.message}
            </p>
            {check.action && check.status !== "pass" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {check.action}
              </p>
            )}
          </div>
        </div>
        {check.value !== undefined && check.value !== null && (
          <div className="flex max-w-[180px] items-center gap-1 truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
            <ClipboardCheck className="h-3 w-3 shrink-0" />
            <span className="truncate">{String(check.value)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function iconClass(status: PlatformPreflightStatus, extra = "") {
  const color =
    status === "pass"
      ? "text-emerald-600"
      : status === "warn"
        ? "text-amber-600"
        : "text-destructive";
  return `h-4 w-4 ${color} ${extra}`;
}

function severityVariant(severity: PlatformPreflightCheck["severity"]) {
  if (severity === "required") return "destructive";
  if (severity === "recommended") return "warning";
  return "secondary";
}
