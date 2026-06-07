"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  api,
  type ConsoleExecutionTarget,
  type ConsoleJobTimeline,
  type ConsoleOperationsOverview,
  type ConsoleTileset,
  type ConsoleWorkerProfile,
} from "@/lib/api";
import { Button } from "@planisfy/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@planisfy/ui/components/tabs";
import {
  Activity,
  ArchiveRestore,
  Bell,
  CalendarClock,
  ClipboardList,
  Globe,
  RefreshCw,
  ServerCog,
} from "lucide-react";
import { toast } from "sonner";
import {
  BackupsTab,
  DeliveryTab,
  JobsTab,
  NotificationsTab,
  SchedulesTab,
  TemplatesTab,
  WorkersTab,
} from "@/components/studio/operations-tabs";

const EMPTY_OVERVIEW: ConsoleOperationsOverview = {
  recentJobs: [],
  notificationChannels: [],
  scheduledOperations: [],
  artifactBackups: [],
  workerNodes: [],
  previewLinks: [],
  customDomains: [],
  workflowTemplates: [],
  workerHealth: { status: "offline", message: "Not checked", latencyMs: null },
};

export default function OperationsPage() {
  const [overview, setOverview] = useState<ConsoleOperationsOverview>(EMPTY_OVERVIEW);
  const [timeline, setTimeline] = useState<ConsoleJobTimeline | null>(null);
  const [tilesets, setTilesets] = useState<ConsoleTileset[]>([]);
  const [executionTargets, setExecutionTargets] = useState<ConsoleExecutionTarget[]>([]);
  const [workerProfiles, setWorkerProfiles] = useState<ConsoleWorkerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [operationsRes, tilesetsRes, targetsRes, profilesRes] =
        await Promise.all([
          api.getOperations(),
          api.listTilesets(),
          api.listExecutionTargets(),
          api.listWorkerProfiles(),
        ]);
      setOverview(operationsRes.data);
      setTilesets(tilesetsRes.data);
      setExecutionTargets(targetsRes.data);
      setWorkerProfiles(profilesRes.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load operations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const activeSchedules = useMemo(
    () => overview.scheduledOperations.filter((schedule) => schedule.status === "active").length,
    [overview.scheduledOperations],
  );

  async function openTimeline(jobId: string) {
    try {
      const res = await api.getJobTimeline(jobId);
      setTimeline(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load job timeline");
    }
  }

  return (
    <div className="container max-w-6xl py-8 px-4">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Operations</h1>
          <p className="text-sm text-muted-foreground">
            Monitor processing, automate rebuilds, validate workers, and manage delivery controls.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Worker"
          value={overview.workerHealth.status}
          detail={overview.workerHealth.message}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          title="Active schedules"
          value={activeSchedules.toString()}
          detail={`${overview.scheduledOperations.length} configured`}
          icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          title="Backups"
          value={overview.artifactBackups.length.toString()}
          detail="Recent artifact backups"
          icon={<ArchiveRestore className="h-4 w-4 text-muted-foreground" />}
        />
        <MetricCard
          title="Delivery"
          value={overview.customDomains.length.toString()}
          detail={`${overview.previewLinks.length} preview links`}
          icon={<Globe className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Tabs defaultValue="jobs">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="jobs"><Activity className="mr-1.5 h-4 w-4" />Jobs</TabsTrigger>
          <TabsTrigger value="schedules"><CalendarClock className="mr-1.5 h-4 w-4" />Schedules</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="mr-1.5 h-4 w-4" />Notifications</TabsTrigger>
          <TabsTrigger value="workers"><ServerCog className="mr-1.5 h-4 w-4" />Workers</TabsTrigger>
          <TabsTrigger value="backups"><ArchiveRestore className="mr-1.5 h-4 w-4" />Backups</TabsTrigger>
          <TabsTrigger value="delivery"><Globe className="mr-1.5 h-4 w-4" />Delivery</TabsTrigger>
          <TabsTrigger value="templates"><ClipboardList className="mr-1.5 h-4 w-4" />Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-6">
          <JobsTab jobs={overview.recentJobs} timeline={timeline} onTimeline={openTimeline} />
        </TabsContent>
        <TabsContent value="schedules" className="mt-6">
          <SchedulesTab
            executionTargets={executionTargets}
            schedules={overview.scheduledOperations}
            tilesets={tilesets}
            workerProfiles={workerProfiles}
            onChanged={load}
          />
        </TabsContent>
        <TabsContent value="notifications" className="mt-6">
          <NotificationsTab channels={overview.notificationChannels} onChanged={load} />
        </TabsContent>
        <TabsContent value="workers" className="mt-6">
          <WorkersTab nodes={overview.workerNodes} onChanged={load} />
        </TabsContent>
        <TabsContent value="backups" className="mt-6">
          <BackupsTab backups={overview.artifactBackups} onChanged={load} />
        </TabsContent>
        <TabsContent value="delivery" className="mt-6">
          <DeliveryTab
            domains={overview.customDomains}
            previews={overview.previewLinks}
            tilesets={tilesets}
            onChanged={load}
          />
        </TabsContent>
        <TabsContent value="templates" className="mt-6">
          <TemplatesTab templates={overview.workflowTemplates} onChanged={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold capitalize">{value}</div>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
