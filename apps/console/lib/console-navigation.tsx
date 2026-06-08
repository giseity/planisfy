import type { ComponentType } from "react"
import {
  BarChart3,
  Building2,
  CreditCard,
  Database,
  Home,
  Key,
  Layers,
  Palette,
  ServerCog,
  Settings,
  Shield,
  SlidersHorizontal,
  Users,
} from "lucide-react"

export interface ConsoleNavItem {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  match?: (pathname: string) => boolean
}

export interface ConsoleNavGroup {
  label: string
  items: ConsoleNavItem[]
}

export const consoleNavGroups: ConsoleNavGroup[] = [
  {
    label: "Home",
    items: [{ href: "/", label: "Dashboard", icon: Home, match: (pathname) => pathname === "/" }],
  },
  {
    label: "Studio",
    items: [
      { href: "/styles", label: "Styles", icon: Palette, match: (pathname) => pathname.startsWith("/styles") },
      { href: "/tilesets", label: "Tilesets", icon: Database, match: (pathname) => pathname.startsWith("/tilesets") },
    ],
  },
  {
    label: "Developers",
    items: [
      { href: "/keys", label: "API Keys", icon: Key },
      { href: "/usage", label: "Usage", icon: BarChart3 },
      { href: "/integration", label: "Integration", icon: Layers },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/operations", label: "Operations", icon: ServerCog, match: (pathname) => pathname.startsWith("/operations") },
      { href: "/platform", label: "Platform", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/organization", label: "Organization", icon: Building2 },
      { href: "/team", label: "Team", icon: Users },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/settings/profile", label: "Profile", icon: Settings },
      { href: "/settings/security", label: "Security", icon: Shield },
    ],
  },
]

export function isConsoleNavActive(item: ConsoleNavItem, pathname: string) {
  if (item.match) return item.match(pathname)
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function consoleBreadcrumbs(pathname: string) {
  if (pathname === "/") return [{ label: "Dashboard" }]
  const allItems = consoleNavGroups.flatMap((group) => group.items)
  const match = allItems
    .filter((item) => item.href !== "/")
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isConsoleNavActive(item, pathname))
  if (!match) return [{ label: "Dashboard", href: "/" }]
  const crumbs: Array<{ label: string; href?: string }> = [
    { label: "Dashboard", href: "/" },
    { label: match.label, href: match.href },
  ]
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
