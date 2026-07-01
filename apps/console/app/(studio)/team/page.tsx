"use client"

import { useCallback, useEffect, useState } from "react"
import { organization, useSession } from "@planisfy/auth/client"
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
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
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
import { Input } from "@planisfy/ui/components/input"
import { Label } from "@planisfy/ui/components/label"
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select"
import { Skeleton } from "@planisfy/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import {
  Building2,
  Mail,
  MoreHorizontal,
  Plus,
  Shield,
  UserMinus,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { BillingInfo } from "@/features/settings/model"
import { allowsHostedUpgradePrompts } from "@/lib/deployment-mode"

interface OrgData {
  id: string
  name: string
  slug: string
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
  admin: "Admin",
  member: "Member",
  owner: "Owner",
}

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "success"> = {
  admin: "success",
  member: "secondary",
  owner: "default",
}

export default function TeamPage() {
  const { data: session } = useSession()
  const [org, setOrg] = useState<OrgData | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [billing, setBilling] = useState<BillingInfo | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [roleChange, setRoleChange] = useState<{
    memberId: string
    currentRole: string
  } | null>(null)

  const activeOrgId = session?.session
    ? (session.session as { activeOrganizationId?: string | null })
        .activeOrganizationId
    : null

  const fetchOrg = useCallback(async () => {
    try {
      const res = await organization.getFullOrganization()
      setOrg((res.data ?? null) as OrgData | null)
    } catch {
      setOrg(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    api
      .get<BillingInfo>("/billing")
      .then(setBilling)
      .catch(() => setBilling(null))
  }, [])

  useEffect(() => {
    if (session?.user) setCurrentUserId(session.user.id)
  }, [session])

  useEffect(() => {
    if (activeOrgId) void fetchOrg()
    else setLoading(false)
  }, [activeOrgId, fetchOrg])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    )
  }

  if (billing?.plan === "free" && allowsHostedUpgradePrompts(billing.deploymentMode)) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border">
        <div className="text-center">
          <Users className="mx-auto h-9 w-9 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">Team requires Starter</h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Free is for personal projects. Upgrade to Starter to create
            organizations, invite members, and manage roles.
          </p>
          <Button className="mt-4" onClick={() => location.assign("/billing")}>
            View plans
          </Button>
        </div>
      </div>
    )
  }

  if (!activeOrgId || !org) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border">
        <div className="text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">
            No organization selected
          </h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Team management is available after you switch to or create an
            organization.
          </p>
        </div>
      </div>
    )
  }

  const currentMember = org.members.find((m) => m.userId === currentUserId)
  const isAdmin =
    currentMember?.role === "owner" || currentMember?.role === "admin"
  const pendingInvitations =
    org.invitations?.filter((i) => i.status === "pending") ?? []

  async function handleInvite(formData: FormData) {
    const email = formData.get("email")
    const role = formData.get("role")
    if (typeof email !== "string" || !email.trim()) return
    setInviting(true)
    try {
      await organization.inviteMember({
        organizationId: org!.id,
        email,
        role: role === "admin" ? "admin" : "member",
      })
      setInviteOpen(false)
      await fetchOrg()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send invitation",
      )
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove() {
    if (!removeId) return
    try {
      await organization.removeMember({ memberIdOrEmail: removeId })
      setRemoveId(null)
      await fetchOrg()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member")
    }
  }

  async function handleRoleChange(newRole: string) {
    if (!roleChange) return
    try {
      await organization.updateMemberRole({
        memberId: roleChange.memberId,
        role: newRole === "admin" ? "admin" : "member",
      })
      setRoleChange(null)
      await fetchOrg()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change role")
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    try {
      await organization.cancelInvitation({ invitationId })
      await fetchOrg()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to cancel invitation",
      )
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Team</PageTitle>
          <PageDescription>
            Manage members, roles, and invitations for {org.name}.
          </PageDescription>
        </PageHeaderText>
        <PageActions>
          {isAdmin && (
            <Button onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4" />
              Invite member
            </Button>
          )}
        </PageActions>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric title="Members" value={org.members.length} icon={<Users />} />
        <Metric
          title="Admins"
          value={
            org.members.filter((m) => m.role === "owner" || m.role === "admin")
              .length
          }
          icon={<Shield />}
        />
        <Metric
          title="Pending invites"
          value={pendingInvitations.length}
          icon={<Mail />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
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
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {member.user.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <div>
                          <div className="font-medium">
                            {member.user.name}
                            {isCurrentUser && (
                              <span className="ml-1 text-muted-foreground">
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
                                <Shield className="mr-2 h-4 w-4" />
                                Change role
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setRemoveId(member.id)}
                              >
                                <UserMinus className="mr-2 h-4 w-4" />
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
        </CardContent>
      </Card>

      {pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent>
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
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ROLE_LABELS[invitation.role ?? "member"] ??
                          invitation.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(invitation.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleCancelInvitation(invitation.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form action={handleInvite}>
            <DialogHeader>
              <DialogTitle>Invite member</DialogTitle>
              <DialogDescription>
                Send an invitation email to add a new member to {org.name}.
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

      <AlertDialog open={!!removeId} onOpenChange={() => setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              This person will lose access to all organization resources
              immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!roleChange} onOpenChange={() => setRoleChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change member role</DialogTitle>
            <DialogDescription>Select a new role for this member.</DialogDescription>
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

function Metric({
  icon,
  title,
  value,
}: {
  icon: React.ReactElement<{ className?: string }>
  title: string
  value: number
}) {
  return (
    <Card>
      <CardContent className="flex min-h-24 items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
