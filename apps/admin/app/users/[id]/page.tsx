import { notFound } from "next/navigation"
import { db, users, accounts, styles, apiKeys, auditEvents } from "@planisfy/database"
import { eq, and, isNull, desc } from "drizzle-orm"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@planisfy/ui/components/tabs"
import Link from "next/link"
import { Ban, LogIn, Monitor, Shield } from "lucide-react"
import { requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      handle: accounts.handle,
      displayName: accounts.displayName,
      bio: accounts.bio,
    })
    .from(users)
    .leftJoin(accounts, eq(users.id, accounts.id))
    .where(eq(users.id, id))
    .limit(1)

  if (!user) notFound()

  const [userStyles, userKeys, recentAudit] = await Promise.all([
    db
      .select({
        id: styles.id,
        name: styles.name,
        handle: styles.handle,
        isPublic: styles.isPublic,
        version: styles.version,
        updatedAt: styles.updatedAt,
      })
      .from(styles)
      .where(and(eq(styles.ownerId, id), isNull(styles.deletedAt)))
      .orderBy(desc(styles.updatedAt)),
    db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
        expiresAt: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.ownerId, id), isNull(apiKeys.deletedAt)))
      .orderBy(desc(apiKeys.createdAt)),
    db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        resourceType: auditEvents.resourceType,
        resourceId: auditEvents.resourceId,
        timestamp: auditEvents.timestamp,
        ipAddress: auditEvents.ipAddress,
      })
      .from(auditEvents)
      .where(eq(auditEvents.profileId, id))
      .orderBy(desc(auditEvents.timestamp))
      .limit(50),
  ])

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/users" className="text-sm text-muted-foreground hover:text-foreground">
          Users
        </Link>
        <span className="text-sm text-muted-foreground">/</span>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{user.name}</h1>
            <RoleBadge role={user.role} />
          </div>
          <p className="text-sm text-muted-foreground">
            @{user.handle} - {user.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            <LogIn className="h-4 w-4" />
            Impersonate
          </Button>
          <Button variant="outline" size="sm">
            <Shield className="h-4 w-4" />
            Change role
          </Button>
          <Button variant="destructive" size="sm">
            <Ban className="h-4 w-4" />
            Suspend
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold">{user.name}</p>
              <RoleBadge role={user.role} />
              <Badge variant="success">Email verified</Badge>
            </div>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Handle" value={`@${user.handle ?? "-"}`} />
              <Fact label="Joined" value={new Date(user.createdAt).toLocaleDateString()} />
              <Fact label="Last active" value="Activity tracked in sessions" />
              <Fact label="Organization" value="See memberships" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Email</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{user.email}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Handle</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono">@{user.handle}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Joined</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{new Date(user.createdAt).toLocaleDateString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Resources</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{userStyles.length} styles, {userKeys.length} keys</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="styles">
        <TabsList>
          <TabsTrigger value="styles">Styles ({userStyles.length})</TabsTrigger>
          <TabsTrigger value="keys">API Keys ({userKeys.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit Log ({recentAudit.length})</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="styles">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Last Modified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userStyles.map((style) => (
                <TableRow key={style.id}>
                  <TableCell className="font-medium">{style.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{style.handle}</TableCell>
                  <TableCell>
                    <Badge variant={style.isPublic ? "success" : "secondary"}>
                      {style.isPublic ? "Public" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell>v{style.version}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(style.updatedAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {userStyles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No styles</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="keys">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell className="font-mono text-xs">{key.id.slice(0, 12)}...</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(key.scopes as string[]).slice(0, 3).map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                      ))}
                      {(key.scopes as string[]).length > 3 && (
                        <Badge variant="secondary" className="text-[10px]">+{(key.scopes as string[]).length - 3}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {userKeys.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No API keys</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="audit">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Resource ID</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentAudit.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(event.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{event.action}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{event.resourceType}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {event.resourceId?.slice(0, 12) || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{event.ipAddress || "—"}</TableCell>
                </TableRow>
              ))}
              {recentAudit.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit events</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="sessions">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>IP address</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                {
                  device: "Chrome on macOS",
                  ip: "192.168.1.42",
                  location: "San Francisco, US",
                  lastActive: "Active recently",
                  current: true,
                },
                {
                  device: "Safari on iPhone",
                  ip: "10.0.0.15",
                  location: "San Francisco, US",
                  lastActive: "2h ago",
                  current: false,
                },
              ].map((session) => (
                <TableRow key={session.device}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      {session.device}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{session.ip}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{session.location}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{session.lastActive}</TableCell>
                  <TableCell>
                    <Badge variant={session.current ? "success" : "secondary"}>
                      {session.current ? "Current" : "Active"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant={
        role === "SUPER"
          ? "destructive"
          : role === "ADMIN"
            ? "warning"
            : "secondary"
      }
    >
      {role}
    </Badge>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  )
}

function initials(name: string | null) {
  return (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}
