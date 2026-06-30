'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppShellContent, AppShellHeader } from '@planisfy/ui/components/app-shell'
import { RouteBreadcrumbs } from '@planisfy/ui/components/route-breadcrumbs'
import { SidebarInset, SidebarMobile, SidebarProvider } from '@planisfy/ui/components/sidebar'
import { AdminSidebar, AdminSidebarContent } from '@/components/admin-sidebar'
import { AdminThemeToggle } from '@/components/admin-theme-toggle'
import { adminBreadcrumbs } from '@/features/navigation/admin-navigation'

export function AdminShellClient({
  children,
  defaultSidebarOpen,
}: {
  children: React.ReactNode
  defaultSidebarOpen: boolean
}) {
  const pathname = usePathname()

  if (pathname === '/sign-in') {
    return <>{children}</>
  }

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <AdminSidebar pathname={pathname} />
      <SidebarInset>
        <AppShellHeader>
          <SidebarMobile title="Admin navigation">
            <AdminSidebarContent pathname={pathname} />
          </SidebarMobile>
          <RouteBreadcrumbs items={adminBreadcrumbs(pathname)} LinkComponent={Link} />
          <div className="ml-auto">
            <AdminThemeToggle />
          </div>
        </AppShellHeader>
        <AppShellContent>{children}</AppShellContent>
      </SidebarInset>
    </SidebarProvider>
  )
}
