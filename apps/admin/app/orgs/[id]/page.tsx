import { adminMetadata } from "../../../lib/metadata";

export const metadata = adminMetadata({
  title: "Organization Details",
  description: "Inspect organization membership, resources, and usage.",
  path: "/orgs",
});

import { notFound } from "next/navigation"
import { db, organizations, members, invitations, accounts, users, styles, apiKeys } from "@planisfy/database"
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
import { Settings, Trash2 } from "lucide-react"
import { requireAdmin } from "@/features/auth/admin-auth"

export const dynamic = "force-dynamic"

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
      deletedAt: organizations.deletedAt,
      handle: accounts.handle,
      displayName: accounts.displayName,
      bio: accounts.bio,
    })
    .from(organizations)
    .leftJoin(accounts, eq(organizations.id, accounts.id))
    .where(eq(organizations.id, id))
    .limit(1)

  if (!org) notFound()

  const [orgMembers, orgInvitations, orgStyles, orgKeys] = await Promise.all([
    db
      .select({
        id: members.id,
        userId: members.userId,
        role: members.role,
        createdAt: members.createdAt,
        userName: users.name,
        userEmail: users.email,
        userHandle: accounts.handle,
      })
      .from(members)
      .leftJoin(users, eq(members.userId, users.id))
      .leftJoin(accounts, eq(members.userId, accounts.id))
      .where(eq(members.organizationId, id))
      .orderBy(desc(members.createdAt)),
    db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(eq(invitations.organizationId, id))
      .orderBy(desc(invitations.createdAt)),
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
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastRequest,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.referenceId, id), eq(apiKeys.enabled, true)))
      .orderBy(desc(apiKeys.createdAt)),
  ])

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/orgs" className="text-sm text-muted-foreground hover:text-foreground">
          Organizations
        </Link>
        <span className="text-sm text-muted-foreground">/</span>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{org.name}</h1>
            <Badge variant={org.deletedAt ? "destructive" : "success"}>
              {org.deletedAt ? "Deleted" : "Active"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            @{org.slug} - Created {new Date(org.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" size="sm">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Slug</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono">{org.slug}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Handle</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono">@{org.handle}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{new Date(org.createdAt).toLocaleDateString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Resources</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {orgMembers.length} members, {orgStyles.length} styles, {orgKeys.length} keys
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members ({orgMembers.length})</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="invitations">Invitations ({orgInvitations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <Link href={`/users/${member.userId}`} className="font-medium hover:underline">
                      {member.userName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.userEmail}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    @{member.userHandle}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === "owner" ? "warning" : "secondary"}>
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {orgMembers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No members
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="invitations">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgInvitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{inv.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        inv.status === "accepted" ? "success" :
                        inv.status === "pending" ? "warning" : "secondary"
                      }
                    >
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {orgInvitations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No invitations
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="resources">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Organization resources</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <ResourceSummary
                  title={`Styles (${orgStyles.length})`}
                  detail={
                    orgStyles.length > 0
                      ? orgStyles.map((style) => style.handle).slice(0, 4).join(", ")
                      : "No styles"
                  }
                />
                <ResourceSummary
                  title={`API Keys (${orgKeys.length})`}
                  detail={
                    orgKeys.length > 0
                      ? orgKeys.map((key) => key.name).slice(0, 4).join(", ")
                      : "No API keys"
                  }
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Styles</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
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
                    {orgStyles.map((style) => (
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
                    {orgStyles.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No styles
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">API Keys</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
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
                    {orgKeys.map((key) => {
                      const scopes = keyScopes(key.permissions)
                      return (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell className="font-mono text-xs">{key.id.slice(0, 12)}...</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {scopes.slice(0, 3).map((scope) => (
                              <Badge key={scope} variant="secondary" className="text-[10px]">
                                {scope}
                              </Badge>
                            ))}
                            {scopes.length > 3 && (
                              <Badge variant="secondary" className="text-[10px]">
                                +{scopes.length - 3}
                              </Badge>
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
                      )
                    })}
                    {orgKeys.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No API keys
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="usage">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Requests (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">-</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Units (30d)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">-</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Error rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">-</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  )
}

function ResourceSummary({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function keyScopes(permissions: string | null) {
  if (!permissions) return []
  try {
    const parsed = JSON.parse(permissions) as { scopes?: unknown }
    return Array.isArray(parsed.scopes)
      ? parsed.scopes.filter((scope): scope is string => typeof scope === "string")
      : []
  } catch {
    return []
  }
}
