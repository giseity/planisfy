"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { organization, useSession } from "@planisfy/auth/client"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import { Label } from "@planisfy/ui/components/label"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import { Skeleton } from "@planisfy/ui/components/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@planisfy/ui/components/alert-dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@planisfy/ui/components/tabs"
import {
  Building2,
  Settings,
  AlertTriangle,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgData {
  id: string
  name: string
  slug: string
  logo: string | null
  createdAt: string
  members: MemberData[]
  invitations?: InvitationData[]
}

interface MemberData {
  id: string
  userId: string
  role: string
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    image: string | null
  }
}

interface InvitationData {
  id: string
  email: string
  role: string | null
  status: string
  expiresAt: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrgPage() {
  const { data: session } = useSession()
  const [org, setOrg] = useState<OrgData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const activeOrgId = session?.session
    ? (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
    : null

  const fetchOrg = useCallback(async () => {
    try {
      const res = await organization.getFullOrganization()
      if (res.data) {
        setOrg(res.data as unknown as OrgData)
      }
    } catch {
      setOrg(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session?.user) {
      setCurrentUserId(session.user.id)
    }
  }, [session])

  useEffect(() => {
    if (activeOrgId) {
      fetchOrg()
    } else {
      setLoading(false)
    }
  }, [activeOrgId, fetchOrg])

  if (loading) {
    return (
      <div className="container max-w-6xl py-8 px-4">
        <h1 className="text-2xl font-bold mb-6">Organization</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!activeOrgId || !org) {
    return (
      <div className="container max-w-6xl py-8 px-4">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No organization selected</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Switch to an organization using the context switcher in the top
            navigation, or create a new one.
          </p>
        </div>
      </div>
    )
  }

  const currentMember = org.members.find((m) => m.userId === currentUserId)
  const isAdmin = currentMember?.role === "owner" || currentMember?.role === "admin"

  return (
    <div className="container max-w-6xl py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
          <Building2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{org.name}</h1>
          <p className="text-sm text-muted-foreground">@{org.slug}</p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <Building2 className="h-4 w-4 mr-1.5" />
            Overview
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-1.5" />
              Settings
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab org={org} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="settings" className="mt-6">
            <SettingsTab org={org} onRefresh={fetchOrg} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({ org }: { org: OrgData }) {
  const memberCount = org.members.length
  const adminCount = org.members.filter(
    (m) => m.role === "owner" || m.role === "admin"
  ).length
  const pendingInvites = org.invitations?.filter(
    (i) => i.status === "pending"
  ).length ?? 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{memberCount}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Admins
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{adminCount}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pending Invites
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{pendingInvites}</p>
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{org.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="font-medium">{org.slug}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-medium">
                {new Date(org.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

function SettingsTab({
  org,
  onRefresh,
}: {
  org: OrgData
  onRefresh: () => Promise<void>
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [deleting, setDeleting] = useState(false)

  const handleSave = async (formData: FormData) => {
    const name = formData.get("name") as string
    const slug = formData.get("slug") as string
    if (!name?.trim() || !slug?.trim()) return

    setSaving(true)
    try {
      await organization.update({
        organizationId: org.id,
        data: { name, slug },
      })
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update organization")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteConfirm !== org.name) return
    setDeleting(true)
    try {
      await organization.delete({ organizationId: org.id })
      router.push("/styles")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete organization")
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* General settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSave} className="space-y-4">
            <div>
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                name="name"
                defaultValue={org.name}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                name="slug"
                defaultValue={org.slug}
                required
                pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lowercase letters, numbers, and hyphens only.
              </p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Deleting an organization is permanent. All styles, tilesets, API
            keys, and usage data owned by this organization will be lost.
          </p>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete organization
          </Button>
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All resources owned by{" "}
              <strong>{org.name}</strong> will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="delete-confirm">
              Type <strong>{org.name}</strong> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={org.name}
              className="mt-1"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteOpen(false)
                setDeleteConfirm("")
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirm !== org.name || deleting}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete organization"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
