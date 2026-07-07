import { adminMetadata } from "../../lib/metadata";

export const metadata = adminMetadata({
  title: "Feature Flags",
  description: "Manage platform feature flags and rollout metadata.",
  path: "/feature-flags",
});

import { isNull } from "drizzle-orm"
import { db, featureFlags } from "@planisfy/database"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import { Checkbox } from "@planisfy/ui/components/checkbox"
import { Input } from "@planisfy/ui/components/input"
import { Label } from "@planisfy/ui/components/label"
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"
import { Textarea } from "@planisfy/ui/components/textarea"
import { Archive, Flag, Plus } from "lucide-react"
import { requirePlatformPermission } from "@/features/auth/admin-auth"
import {
  archiveFeatureFlagAction,
  createFeatureFlagAction,
  updateFeatureFlagAction,
} from "@/features/platform/platform-admin-actions"

export const dynamic = "force-dynamic"

export default async function FeatureFlagsPage() {
  await requirePlatformPermission("platform.configuration.manage")
  const flags = await db
    .select()
    .from(featureFlags)
    .where(isNull(featureFlags.archivedAt))
    .orderBy(featureFlags.scope, featureFlags.key)

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Feature Flags</PageTitle>
          <PageDescription>
            Persisted platform feature flags with rollout metadata.
          </PageDescription>
        </PageHeaderText>
        <PageActions>
          <Badge variant="secondary">{flags.length} active</Badge>
        </PageActions>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-muted-foreground" />
            Create Flag
          </CardTitle>
          <CardDescription>
            Use stable keys; application code can read these rows to gate
            features.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createFeatureFlagAction} className="grid gap-3 lg:grid-cols-[1fr_1fr_0.7fr_0.5fr_auto]">
            <Field label="Key">
              <Input name="key" required placeholder="static_maps" />
            </Field>
            <Field label="Label">
              <Input name="label" required placeholder="Static maps" />
            </Field>
            <Field label="Scope">
              <Input name="scope" defaultValue="global" />
            </Field>
            <Field label="Rollout %">
              <Input
                name="rolloutPercent"
                type="number"
                min={0}
                max={100}
                defaultValue={0}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Create</Button>
            </div>
            <Field label="Description">
              <Textarea name="description" rows={3} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox name="enabled" />
              Enabled
            </label>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {flags.map((flag) => (
          <Card key={flag.id}>
            <CardContent className="p-4">
              <form
                action={updateFeatureFlagAction}
                className="grid gap-3 lg:grid-cols-[1fr_1fr_0.7fr_0.5fr_auto]"
              >
                <input type="hidden" name="id" value={flag.id} />
                <Field label="Key">
                  <div className="rounded-md border bg-muted px-2.5 py-2 font-mono text-xs">
                    {flag.key}
                  </div>
                </Field>
                <Field label="Label">
                  <Input name="label" defaultValue={flag.label} required />
                </Field>
                <Field label="Scope">
                  <Input name="scope" defaultValue={flag.scope} />
                </Field>
                <Field label="Rollout %">
                  <Input
                    name="rolloutPercent"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={flag.rolloutPercent}
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    formAction={archiveFeatureFlagAction}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
                <Field label="Description">
                  <Textarea
                    name="description"
                    rows={2}
                    defaultValue={flag.description ?? ""}
                  />
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <Checkbox name="enabled" defaultChecked={flag.enabled} />
                  Enabled
                </label>
                <div className="flex items-end pb-2">
                  <Badge variant={flag.enabled ? "success" : "secondary"}>
                    {flag.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </form>
            </CardContent>
          </Card>
        ))}
        {flags.length === 0 && (
          <Card>
            <CardContent className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
              No feature flags have been created.
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Flag className="h-4 w-4 text-muted-foreground" />
            Application integration
          </CardTitle>
          <CardDescription>
            The control plane is now persisted. Runtime callers should read the
            `feature_flags` table or a cached projection before gating product
            behavior.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
