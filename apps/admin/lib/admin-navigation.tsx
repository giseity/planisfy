import type { ComponentType } from "react"
import {
  Activity,
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Inbox,
  Key,
  LayoutDashboard,
  PackageCheck,
  ScrollText,
  TriangleAlert,
  Users,
} from "lucide-react"

export interface AdminNavItem {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Accounts",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/orgs", label: "Organizations", icon: Building2 },
      { href: "/keys", label: "API Keys", icon: Key },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/usage", label: "Usage", icon: BarChart3 },
      { href: "/outbox", label: "Outbox", icon: Inbox },
      { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
      { href: "/artifacts", label: "Artifacts", icon: Boxes },
      { href: "/failures", label: "Failures", icon: TriangleAlert },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/audit", label: "Audit Log", icon: ScrollText },
      { href: "/health", label: "System Health", icon: Activity },
      { href: "/upgrade", label: "Upgrade", icon: PackageCheck },
    ],
  },
]

export function isAdminNavActive(item: AdminNavItem, pathname: string) {
  if (item.href === "/") return pathname === "/"
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function adminBreadcrumbs(pathname: string) {
  if (pathname === "/") return [{ label: "Dashboard" }]

  const items = adminNavGroups.flatMap((group) => group.items)
  const match = items
    .filter((item) => item.href !== "/")
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isAdminNavActive(item, pathname))

  const crumbs: Array<{ label: string; href?: string }> = [
    { label: "Dashboard", href: "/" },
  ]

  if (!match) return crumbs
  crumbs.push({ label: match.label, href: match.href })

  if (pathname !== match.href) {
    const rest = pathname
      .slice(match.href.length)
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.replace(/-/g, " "))

    for (const segment of rest) {
      crumbs.push({ label: titleCase(segment) })
    }
  }

  return crumbs
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}
