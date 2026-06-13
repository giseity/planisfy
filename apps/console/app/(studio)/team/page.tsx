import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import { Mail, MoreHorizontal, Plus, X } from "lucide-react"
import type { ComponentProps } from "react"

const members = [
  { name: "Alex Chen", email: "alex@acme.com", role: "owner", joined: "Mar 12, 2026", avatar: "AC" },
  { name: "Sarah Kim", email: "sarah@acme.com", role: "admin", joined: "Mar 15, 2026", avatar: "SK" },
  { name: "Dev Patel", email: "dev@acme.com", role: "member", joined: "Apr 2, 2026", avatar: "DP" },
  { name: "Lisa Wang", email: "lisa@acme.com", role: "member", joined: "May 10, 2026", avatar: "LW" },
  { name: "Tom Rivera", email: "tom@acme.com", role: "member", joined: "Jun 1, 2026", avatar: "TR" },
]

const invites = [
  { email: "jordan@acme.com", role: "member", sent: "Jun 8, 2026", expires: "Jun 15, 2026" },
]

const roles = [
  {
    role: "Owner",
    count: 1,
    desc: "Full access. Can delete the organization, manage billing, and transfer ownership.",
  },
  {
    role: "Admin",
    count: 1,
    desc: "Manage members, styles, tilesets, and API keys. Cannot delete org or manage billing.",
  },
  {
    role: "Member",
    count: 3,
    desc: "Create and edit own styles and tilesets. Read-only access to organization settings.",
  },
]

export default function TeamPage() {
  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Team</PageTitle>
          <PageDescription>Manage members and access for Acme Corp.</PageDescription>
        </PageHeaderText>
        <PageActions>
          <Button>
            <Plus className="h-4 w-4" />
            Invite member
          </Button>
        </PageActions>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>{members.length} people</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.email}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {member.avatar}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleVariant(member.role)}>
                      {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{member.joined}</TableCell>
                  <TableCell>
                    {member.role !== "owner" && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending invitations</CardTitle>
          <CardDescription>{invites.length} pending</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => (
                <TableRow key={invite.email}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {invite.email}
                    </span>
                  </TableCell>
                  <TableCell><Badge variant="secondary">Member</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{invite.sent}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{invite.expires}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={`Cancel invite to ${invite.email}`}>
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles & permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {roles.map((role) => (
            <div key={role.role} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{role.role}</p>
                <Badge variant="secondary">{role.count}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{role.desc}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function roleVariant(role: string): ComponentProps<typeof Badge>["variant"] {
  if (role === "owner") return "default"
  if (role === "admin") return "success"
  return "secondary"
}
