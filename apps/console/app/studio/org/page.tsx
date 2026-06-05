"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { organization, useSession } from "@planisfy/auth/client"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import { Label } from "@planisfy/ui/components/label"
import { Badge } from "@planisfy/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@planisfy/ui/components/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@planisfy/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@planisfy/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select"
import {
  Building2,
  Users,
  Settings,
  Plus,
  MoreHorizontal,
  UserMinus,
  Shield,
  Mail,
  X,
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

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "success"> = {
  owner: "default",
  admin: "success",
  member: "secondary",
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrgPage() {
  const router = useRouter()
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
            <div key={i} className="h-24 rounded-lg border bg-muted animate-pulse" />
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
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-1.5" />
            Members
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

        <TabsContent value="members" className="mt-6">
          <MembersTab
            org={org}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onRefresh={fetchOrg}
          />
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
// Members Tab
// ---------------------------------------------------------------------------

function MembersTab({
  org,
  currentUserId,
  isAdmin,
  onRefresh,
}: {
  org: OrgData
  currentUserId: string | null
  isAdmin: boolean
  onRefresh: () => Promise<void>
}) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [roleChange, setRoleChange] = useState<{
    memberId: string
    currentRole: string
  } | null>(null)

  const handleInvite = async (formData: FormData) => {
    const email = formData.get("email") as string
    const role = formData.get("role") as string
    if (!email?.trim()) return

    setInviting(true)
    try {
      await organization.inviteMember({
        organizationId: org.id,
        email,
        role: role as "member" | "admin",
      })
      setInviteOpen(false)
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invitation")
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async () => {
    if (!removeId) return
    try {
      await organization.removeMember({
        memberIdOrEmail: removeId,
      })
      setRemoveId(null)
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member")
    }
  }

  const handleRoleChange = async (newRole: string) => {
    if (!roleChange) return
    try {
      await organization.updateMemberRole({
        memberId: roleChange.memberId,
        role: newRole as "member" | "admin",
      })
      setRoleChange(null)
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change role")
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await organization.cancelInvitation({ invitationId })
      await onRefresh()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to cancel invitation"
      )
    }
  }

  const pendingInvitations =
    org.invitations?.filter((i) => i.status === "pending") ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Members ({org.members.length})
        </h2>
        {isAdmin && (
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Invite member
          </Button>
        )}
      </div>

      {/* Members table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
            {isAdmin && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {org.members.map((member) => {
            const isCurrentUser = member.userId === currentUserId
            const isOwner = member.role === "owner"
            return (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {member.user.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <div className="font-medium">
                        {member.user.name}
                        {isCurrentUser && (
                          <span className="text-muted-foreground ml-1">
                            (you)
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {member.user.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={ROLE_VARIANTS[member.role] ?? "secondary"}>
                    {ROLE_LABELS[member.role] ?? member.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(member.createdAt).toLocaleDateString()}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    {!isOwner && !isCurrentUser && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              setRoleChange({
                                memberId: member.id,
                                currentRole: member.role,
                              })
                            }
                          >
                            <Shield className="h-4 w-4 mr-2" />
                            Change role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setRemoveId(member.userId)}
                          >
                            <UserMinus className="h-4 w-4 mr-2" />
                            Remove member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
            Pending Invitations
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Expires</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {invitation.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {ROLE_LABELS[invitation.role ?? "member"] ??
                        invitation.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(invitation.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          handleCancelInvitation(invitation.id)
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form action={handleInvite}>
            <DialogHeader>
              <DialogTitle>Invite member</DialogTitle>
              <DialogDescription>
                Send an invitation email to add a new member to{" "}
                <strong>{org.name}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  name="email"
                  type="email"
                  placeholder="colleague@example.com"
                  required
                  autoFocus
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="invite-role">Role</Label>
                <Select name="role" defaultValue="member">
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? "Sending..." : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <Dialog open={!!removeId} onOpenChange={() => setRemoveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member?</DialogTitle>
            <DialogDescription>
              This person will lose access to all organization resources
              immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role change dialog */}
      <Dialog open={!!roleChange} onOpenChange={() => setRoleChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change member role</DialogTitle>
            <DialogDescription>
              Select a new role for this member.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select
              defaultValue={roleChange?.currentRole}
              onValueChange={handleRoleChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleChange(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      router.push("/studio/styles")
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
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete organization?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. All resources owned by{" "}
              <strong>{org.name}</strong> will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
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
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false)
                setDeleteConfirm("")
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== org.name || deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting..." : "Delete organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
