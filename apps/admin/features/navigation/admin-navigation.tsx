import type { ComponentType } from "react"
import {
  Activity,
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Flag,
  Inbox,
  Key,
  LayoutDashboard,
  Megaphone,
  PackageCheck,
  ScrollText,
  SlidersHorizontal,
  TriangleAlert,
  Users,
} from "lucide-react"

export type AdminDeploymentMode = "self_host" | "managed"

export interface AdminNavItem {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  modes?: AdminDeploymentMode[]
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
      { href: "/upgrade", label: "Upgrade", icon: PackageCheck, modes: ["self_host"] },
      { href: "/configuration", label: "Configuration", icon: SlidersHorizontal },
      { href: "/feature-flags", label: "Feature Flags", icon: Flag },
      { href: "/announcements", label: "Announcements", icon: Megaphone },
    ],
  },
]

export function isAdminNavActive(item: AdminNavItem, pathname: string) {
  if (item.href === "/") return pathname === "/"
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function filterAdminNavGroups(deploymentMode: AdminDeploymentMode) {
  return adminNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.modes || item.modes.includes(deploymentMode)),
    }))
    .filter((group) => group.items.length > 0)
}

export function adminBreadcrumbs(pathname: string, deploymentMode: AdminDeploymentMode) {
  if (pathname === "/") return [{ label: "Dashboard" }]

  const items = filterAdminNavGroups(deploymentMode).flatMap((group) => group.items)
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
