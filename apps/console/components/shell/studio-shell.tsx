'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@planisfy/ui/lib/utils'
import { CommandPalette } from '@/components/shell/command-palette'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { EmailVerificationBanner } from '@/components/shell/email-verification-banner'
import { NavAccountSwitcher, NavUser } from '@/components/shell/sidebar-nav'
import { AppShellContent, AppShellHeader } from '@planisfy/ui/components/app-shell'
import { RouteBreadcrumbs } from '@planisfy/ui/components/route-breadcrumbs'
import { Separator } from '@planisfy/ui/components/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMobile,
  SidebarProvider,
  SidebarTrigger,
} from '@planisfy/ui/components/sidebar'
import {
  consoleBreadcrumbs,
  filterConsoleNavGroups,
  isConsoleNavActive,
} from '@/lib/console-navigation'
import { api } from '@/lib/api'
import type { BillingInfo } from '@/features/settings/model'
import type { DeploymentMode } from '@/lib/deployment-mode'

export function StudioShell({
  children,
  defaultSidebarOpen,
}: {
  children: React.ReactNode
  defaultSidebarOpen: boolean
}) {
  const pathname = usePathname()
  const deploymentMode = useConsoleDeploymentMode()

  // Hide nav on the style editor page (full-screen)
  const isEditor = /^\/styles\/[^/]+$/.test(pathname)
  if (isEditor) return <>{children}</>

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <ConsoleSidebar pathname={pathname} deploymentMode={deploymentMode} />
      <SidebarInset>
        <AppShellHeader>
          <SidebarMobile title="Console navigation">
            <ConsoleSidebarContent pathname={pathname} deploymentMode={deploymentMode} />
          </SidebarMobile>
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <Separator orientation="vertical" className="hidden data-vertical:h-4 md:block" />
          <RouteBreadcrumbs
            items={consoleBreadcrumbs(pathname, deploymentMode)}
            LinkComponent={Link}
          />
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette />
            <ThemeToggle />
          </div>
        </AppShellHeader>
        <EmailVerificationBanner />
        <AppShellContent>
          <div className="mx-auto w-full max-w-7xl min-w-0">{children}</div>
        </AppShellContent>
      </SidebarInset>
    </SidebarProvider>
  )
}

function ConsoleSidebar({
  pathname,
  deploymentMode,
}: {
  pathname: string
  deploymentMode: DeploymentMode | null
}) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <ConsoleSidebarContent pathname={pathname} deploymentMode={deploymentMode} />
    </Sidebar>
  )
}

function ConsoleSidebarContent({
  pathname,
  deploymentMode,
}: {
  pathname: string
  deploymentMode: DeploymentMode | null
}) {
  const navGroups = filterConsoleNavGroups(deploymentMode)

  return (
    <>
      <SidebarHeader>
        <NavAccountSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive = isConsoleNavActive(item, pathname)
                return (
                  <SidebarMenuItem key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex min-h-8.5 group-data-[collapsible=icon]/sidebar:min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-[0.8125rem] text-muted-foreground transition-[background-color,color,width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]/sidebar:size-8 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:p-0 [&_svg]:size-4 [&_svg]:shrink-0',
                        isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="truncate group-data-[collapsible=icon]/sidebar:hidden">
                        {item.label}
                      </span>
                    </Link>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </>
  )
}

function useConsoleDeploymentMode() {
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode | null>(null)

  useEffect(() => {
    api
      .get<BillingInfo>('/billing')
      .then((billing) => setDeploymentMode(billing.deploymentMode))
      .catch(() => setDeploymentMode(null))
  }, [])

  return deploymentMode
}
