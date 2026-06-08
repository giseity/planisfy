"use client"

import Link from "next/link"
import { cn } from "@planisfy/ui/lib/utils"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@planisfy/ui/components/sidebar"
import {
  ArrowLeft,
} from "lucide-react"
import {
  adminNavGroups,
  isAdminNavActive,
} from "@/lib/admin-navigation"

export function AdminSidebar({ pathname }: { pathname: string }) {
  return (
    <Sidebar>
      <AdminSidebarContent pathname={pathname} />
    </Sidebar>
  )
}

export function AdminSidebarContent({ pathname }: { pathname: string }) {
  return (
    <>
      <SidebarHeader>
        <Link href="/" className="font-semibold text-lg tracking-tight">
          Planisfy Admin
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {adminNavGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive = isAdminNavActive(item, pathname)
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
        <a
          href="https://console.planisfy.localhost/styles"
          className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Console
        </a>
      </SidebarFooter>
    </>
  )
}
