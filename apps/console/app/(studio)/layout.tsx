"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@planisfy/ui/lib/utils"
import { ContextSwitcher } from "@/components/shell/context-switcher"
import { ThemeToggle } from "@/components/shell/theme-toggle"
import { EmailVerificationBanner } from "@/components/shell/email-verification-banner"
import {
  AppShellContent,
  AppShellHeader,
} from "@planisfy/ui/components/app-shell"
import { PlanisfyLogo } from "@planisfy/ui/components/brand-mark"
import {
  RouteBreadcrumbs,
} from "@planisfy/ui/components/route-breadcrumbs"
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
} from "@planisfy/ui/components/sidebar"
import {
  consoleBreadcrumbs,
  consoleNavGroups,
  isConsoleNavActive,
} from "@/lib/console-navigation"

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // Hide nav on the style editor page (full-screen)
  const isEditor = /^\/styles\/[^/]+$/.test(pathname)
  if (isEditor) return <>{children}</>

  return (
    <SidebarProvider>
      <ConsoleSidebar pathname={pathname} />
      <SidebarInset>
        <AppShellHeader>
          <SidebarMobile title="Console navigation">
            <ConsoleSidebarContent pathname={pathname} />
          </SidebarMobile>
          <RouteBreadcrumbs
            items={consoleBreadcrumbs(pathname)}
            LinkComponent={Link}
          />
          <div className="ml-auto flex items-center gap-2">
            <ContextSwitcher />
            <ThemeToggle />
          </div>
        </AppShellHeader>
        <EmailVerificationBanner />
        <AppShellContent>{children}</AppShellContent>
      </SidebarInset>
    </SidebarProvider>
  )
}

function ConsoleSidebar({ pathname }: { pathname: string }) {
  return (
    <Sidebar>
      <ConsoleSidebarContent pathname={pathname} />
    </Sidebar>
  )
}

function ConsoleSidebarContent({ pathname }: { pathname: string }) {
  return (
    <>
      <SidebarHeader>
        <Link href="/" className="block min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <PlanisfyLogo sublabel="Customer console" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {consoleNavGroups.map((group) => (
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
                        "flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
                        isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="rounded-md border bg-background/60 px-2 py-1.5 text-xs text-muted-foreground">
          Self-host ready
        </div>
      </SidebarFooter>
    </>
  )
}
