"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  AppShellContent,
  AppShellHeader,
} from "@planisfy/ui/components/app-shell"
import { RouteBreadcrumbs } from "@planisfy/ui/components/route-breadcrumbs"
import {
  SidebarInset,
  SidebarMobile,
  SidebarProvider,
} from "@planisfy/ui/components/sidebar"
import { AdminSidebar, AdminSidebarContent } from "@/components/admin-sidebar"
import { adminBreadcrumbs } from "@/lib/admin-navigation"

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === "/sign-in") {
    return <>{children}</>
  }

  return (
    <SidebarProvider>
      <AdminSidebar pathname={pathname} />
      <SidebarInset>
        <AppShellHeader>
          <SidebarMobile title="Admin navigation">
            <AdminSidebarContent pathname={pathname} />
          </SidebarMobile>
          <RouteBreadcrumbs
            items={adminBreadcrumbs(pathname)}
            LinkComponent={Link}
          />
        </AppShellHeader>
        <AppShellContent>{children}</AppShellContent>
      </SidebarInset>
    </SidebarProvider>
  )
}
