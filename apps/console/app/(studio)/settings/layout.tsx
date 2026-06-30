"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Shield, User } from "lucide-react"
import { Button } from "@planisfy/ui/components/button"
import {
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"

const settingsRoutes = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/security", label: "Security", icon: Shield },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Settings</PageTitle>
          <PageDescription>Manage profile and account security.</PageDescription>
        </PageHeaderText>
      </PageHeader>
      <nav className="flex flex-wrap gap-1 rounded-md border bg-muted/20 p-1">
        {settingsRoutes.map((route) => (
          <Button
            key={route.href}
            asChild
            size="sm"
            variant={pathname === route.href ? "secondary" : "ghost"}
          >
            <Link href={route.href}>
              <route.icon className="h-4 w-4" />
              {route.label}
            </Link>
          </Button>
        ))}
      </nav>
      {children}
    </div>
  )
}
