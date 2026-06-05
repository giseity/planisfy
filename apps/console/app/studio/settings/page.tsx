"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { authClient, useSession } from "@planisfy/auth/client"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import { Label } from "@planisfy/ui/components/label"
import { Textarea } from "@planisfy/ui/components/textarea"
import { Separator } from "@planisfy/ui/components/separator"
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
import { Check, CreditCard, Monitor, Shield, User, X } from "lucide-react"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileData {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  email: string
  emailVerified: boolean
  createdAt: string
}

interface BillingInfo {
  plan: string
  planName: string
  price: number
  limits: {
    monthlyUnits: number
    requestsPerMinute: number
    maxStyles: number
    maxSources: number
    maxApiKeys: number
  }
  usage: {
    monthlyUnits: number
    styles: number
    sources: number
    apiKeys: number
  }
  quotaPercent: number
  polarConfigured: boolean
}

interface PlanInfo {
  id: string
  name: string
  price: number
  monthlyUnits: string | number
  requestsPerMinute: number
  maxStyles: string | number
  maxSources: string | number
  maxApiKeys: string | number
}

interface SessionData {
  id: string
  token: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="container max-w-6xl py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-1.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="account">
            <Shield className="h-4 w-4 mr-1.5" />
            Account
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="h-4 w-4 mr-1.5" />
            Billing
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="account" className="mt-6">
          <AccountTab />
        </TabsContent>
        <TabsContent value="billing" className="mt-6">
          <BillingTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile Tab
// ---------------------------------------------------------------------------

function ProfileTab() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const [displayName, setDisplayName] = useState("")
  const [handle, setHandle] = useState("")
  const [bio, setBio] = useState("")

  useEffect(() => {
    api
      .get<{ data: ProfileData }>("/profile")
      .then((res) => {
        setProfile(res.data)
        setDisplayName(res.data.displayName)
        setHandle(res.data.handle)
        setBio(res.data.bio ?? "")
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError("")
    setSuccess(false)

    try {
      const res = await api.put<{ data: ProfileData }>("/profile", {
        displayName,
        handle,
        bio,
      })
      setProfile({ ...profile!, ...res.data })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update profile"
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg border bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!profile) {
    return <p className="text-sm text-destructive">{error || "Failed to load profile"}</p>
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Manage your public profile information.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={1}
            maxLength={128}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="handle">Handle</Label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">@</span>
            <Input
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              required
              minLength={2}
              maxLength={64}
              pattern="^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$"
              title="Lowercase letters, numbers, hyphens, and underscores"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Lowercase letters, numbers, hyphens, and underscores only.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            placeholder="A short bio about yourself"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={profile.email} disabled />
          <p className="text-xs text-muted-foreground">
            Email cannot be changed here.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-600">Profile updated.</p>}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Account Tab (Password + Sessions + Danger Zone)
// ---------------------------------------------------------------------------

function AccountTab() {
  return (
    <div className="space-y-10">
      <ChangePasswordSection />
      <Separator />
      <SessionsSection />
      <Separator />
      <DangerZone />
    </div>
  )
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setLoading(true)
    try {
      await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      })
      setSuccess(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError("Failed to change password. Check your current password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Change password</h2>
        <p className="text-sm text-muted-foreground">
          Update your password. You&apos;ll stay signed in on this device.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-600">Password changed.</p>}

        <Button type="submit" disabled={loading}>
          {loading ? "Changing..." : "Change password"}
        </Button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sessions Section
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device"
  if (ua.includes("Firefox")) return "Firefox"
  if (ua.includes("Edg/")) return "Edge"
  if (ua.includes("Chrome")) return "Chrome"
  if (ua.includes("Safari")) return "Safari"
  if (ua.includes("curl")) return "curl"
  return "Unknown browser"
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

function SessionsSection() {
  const { data: session } = useSession()
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [revokeAllOpen, setRevokeAllOpen] = useState(false)

  const currentToken = session?.session?.token

  const fetchSessions = useCallback(async () => {
    try {
      const res = await authClient.listSessions()
      if (res.data) {
        setSessions(res.data as unknown as SessionData[])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const handleRevoke = async () => {
    if (!revokeId) return
    const sessionToRevoke = sessions.find((s) => s.id === revokeId)
    if (!sessionToRevoke) return
    try {
      await authClient.revokeSession({ token: sessionToRevoke.token })
      setRevokeId(null)
      await fetchSessions()
    } catch {
      // ignore
    }
  }

  const handleRevokeAll = async () => {
    try {
      await authClient.revokeOtherSessions()
      setRevokeAllOpen(false)
      await fetchSessions()
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg border bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  const otherSessions = sessions.filter((s) => s.token !== currentToken)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Active Sessions</h2>
          <p className="text-sm text-muted-foreground">
            Manage your active sessions across devices.
          </p>
        </div>
        {otherSessions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevokeAllOpen(true)}
          >
            Revoke all other sessions
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead>Last active</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => {
            const isCurrent = s.token === currentToken
            return (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {parseUserAgent(s.userAgent)}
                    </span>
                    {isCurrent && (
                      <Badge variant="success" className="text-[10px]">
                        Current
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.ipAddress ?? "Unknown"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {timeAgo(s.updatedAt)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(s.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {!isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setRevokeId(s.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Revoke single session */}
      <Dialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke session?</DialogTitle>
            <DialogDescription>
              This will sign out the device immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke all others */}
      <Dialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke all other sessions?</DialogTitle>
            <DialogDescription>
              All devices except your current session will be signed out
              immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeAllOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevokeAll}>
              Revoke all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Danger Zone
// ---------------------------------------------------------------------------

function DangerZone() {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const [profile, setProfile] = useState<ProfileData | null>(null)

  useEffect(() => {
    api
      .get<{ data: ProfileData }>("/profile")
      .then((res) => setProfile(res.data))
      .catch(() => {})
  }, [])

  const handleDelete = async () => {
    setError("")
    setDeleting(true)
    try {
      await api.delete("/profile", { confirmation })
      router.push("/sign-in")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete account"
      setError(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">
          Irreversible actions. Proceed with caution.
        </p>
      </div>

      <Card className="border-destructive/30">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium">Delete account</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            Delete account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This action is permanent. All your styles, API keys, sources, and data
              will be deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>
              Type <span className="font-mono font-semibold">{profile?.email}</span> to confirm
            </Label>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="your@email.com"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || confirmation !== profile?.email}
            >
              {deleting ? "Deleting..." : "Delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Billing Tab
// ---------------------------------------------------------------------------

function BillingTab() {
  const [billing, setBilling] = useState<BillingInfo | null>(null)
  const [plans, setPlans] = useState<PlanInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<BillingInfo>("/billing"),
      api.get<PlanInfo[]>("/billing/plans"),
    ])
      .then(([b, p]) => {
        setBilling(b)
        setPlans(p)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading || !billing) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg border bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  const quotaColor =
    billing.quotaPercent >= 90
      ? "bg-red-500"
      : billing.quotaPercent >= 70
        ? "bg-yellow-500"
        : "bg-green-500"

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Current Plan</CardTitle>
            <Badge
              variant={
                billing.plan === "free"
                  ? "secondary"
                  : billing.plan === "enterprise"
                    ? "warning"
                    : "success"
              }
            >
              {billing.planName}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-sm text-muted-foreground">Monthly Units</p>
              <p className="text-lg font-semibold">
                {billing.usage.monthlyUnits.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  /{" "}
                  {billing.limits.monthlyUnits === Infinity
                    ? "\u221e"
                    : billing.limits.monthlyUnits.toLocaleString()}
                </span>
              </p>
              <div className="h-2 bg-muted rounded-full mt-1">
                <div
                  className={`h-full rounded-full ${quotaColor} transition-all`}
                  style={{
                    width: `${Math.min(billing.quotaPercent, 100)}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Styles</p>
              <p className="text-lg font-semibold">
                {billing.usage.styles}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  /{" "}
                  {billing.limits.maxStyles === Infinity
                    ? "\u221e"
                    : billing.limits.maxStyles}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tilesets</p>
              <p className="text-lg font-semibold">
                {billing.usage.sources}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  /{" "}
                  {billing.limits.maxSources === Infinity
                    ? "\u221e"
                    : billing.limits.maxSources}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">API Keys</p>
              <p className="text-lg font-semibold">
                {billing.usage.apiKeys}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  /{" "}
                  {billing.limits.maxApiKeys === Infinity
                    ? "\u221e"
                    : billing.limits.maxApiKeys}
                </span>
              </p>
            </div>
          </div>

          {billing.quotaPercent >= 80 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 px-4 py-3 text-sm mb-4">
              You&apos;ve used {billing.quotaPercent}% of your monthly quota.
              Consider upgrading to avoid service interruptions.
            </div>
          )}

          {billing.polarConfigured && billing.plan !== "free" && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const { url } = await api.get<{ url: string }>(
                    "/billing/portal"
                  )
                  window.open(url, "_blank")
                } catch {
                  toast.error("Billing portal is not available")
                }
              }}
            >
              Manage Subscription
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <h2 className="text-lg font-semibold">Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === billing.plan
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Current</Badge>}
                </div>
                <p className="text-2xl font-bold">
                  {plan.price === 0 ? "Free" : `$${plan.price}`}
                  {plan.price > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  )}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.monthlyUnits === "Unlimited"
                      ? "Unlimited"
                      : Number(plan.monthlyUnits).toLocaleString()}{" "}
                    API units/month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.requestsPerMinute.toLocaleString()} requests/minute
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxStyles === "Unlimited"
                      ? "Unlimited"
                      : plan.maxStyles}{" "}
                    styles
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxSources === "Unlimited"
                      ? "Unlimited"
                      : plan.maxSources}{" "}
                    tilesets
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxApiKeys === "Unlimited"
                      ? "Unlimited"
                      : plan.maxApiKeys}{" "}
                    API keys
                  </li>
                </ul>

                {!isCurrent && plan.price > 0 && (
                  <Button
                    className="w-full mt-4"
                    variant={plan.id === "pro" ? "default" : "outline"}
                    disabled={!billing.polarConfigured}
                    onClick={async () => {
                      if (!billing.polarConfigured) {
                        toast.info(
                          "Billing is not configured yet. Set POLAR_ACCESS_TOKEN to enable payments."
                        )
                        return
                      }
                      toast.info(
                        `Upgrade to ${plan.name} — payment integration coming soon`
                      )
                    }}
                  >
                    {billing.polarConfigured
                      ? `Upgrade to ${plan.name}`
                      : "Coming soon"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
