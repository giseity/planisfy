"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@planisfy/ui/lib/utils"
import {
  LayoutDashboard,
  Users,
  Building2,
  Key,
  BarChart3,
  ScrollText,
  Activity,
  ArrowLeft,
  Boxes,
  BriefcaseBusiness,
  Inbox,
  PackageCheck,
  TriangleAlert,
} from "lucide-react"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/orgs", label: "Organizations", icon: Building2 },
  { href: "/keys", label: "API Keys", icon: Key },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/outbox", label: "Outbox", icon: Inbox },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/artifacts", label: "Artifacts", icon: Boxes },
  { href: "/failures", label: "Failures", icon: TriangleAlert },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
  { href: "/health", label: "System Health", icon: Activity },
  { href: "/upgrade", label: "Upgrade", icon: PackageCheck },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 border-r bg-background flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-sm tracking-tight">Planisfy Admin</h2>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                isActive
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-2 border-t">
        <a
          href="https://console.planisfy.localhost/studio/styles"
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Console
        </a>
      </div>
    </aside>
  )
}
