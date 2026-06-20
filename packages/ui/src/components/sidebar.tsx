"use client"

import * as React from "react"
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@planisfy/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@planisfy/ui/components/sheet"
import { cn } from "@planisfy/ui/lib/utils"

type SidebarContextValue = {
  collapsed: boolean
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  toggleCollapsed: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)

  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function SidebarProvider({
  children,
  className,
  defaultCollapsed = false,
  ...props
}: React.ComponentProps<"div"> & {
  defaultCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((current) => !current)
  }, [])
  const value = React.useMemo(
    () => ({ collapsed, setCollapsed, toggleCollapsed }),
    [collapsed, toggleCollapsed],
  )

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-provider"
        className={cn("flex h-svh w-full overflow-hidden bg-sidebar", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  className,
  children,
  collapsible = "none",
  variant = "sidebar",
  ...props
}: React.ComponentProps<"aside"> & {
  collapsible?: "icon" | "none"
  variant?: "sidebar" | "inset"
}) {
  const { collapsed } = useSidebar()
  const isIconCollapsed = collapsible === "icon" && collapsed

  return (
    <aside
      data-slot="sidebar"
      data-collapsible={isIconCollapsed ? "icon" : undefined}
      data-state={isIconCollapsed ? "collapsed" : "expanded"}
      data-variant={variant}
      className={cn(
        "group/sidebar hidden min-h-0 shrink-0 bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out md:flex md:flex-col",
        variant === "inset"
          ? "h-full py-1"
          : "min-h-svh border-r",
        isIconCollapsed ? "w-[2.6rem]" : "w-64",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  )
}

function SidebarMobile({
  children,
  title = "Navigation",
}: {
  children: React.ReactNode
  title?: string
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  )
}

function SidebarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { collapsed, toggleCollapsed } = useSidebar()
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      onClick={toggleCollapsed}
      {...props}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex min-h-14 flex-col gap-1.5 border-b px-1 py-1 pt-2 group-data-[collapsible=icon]/sidebar:items-center", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("border-t px-1 py-1 group-data-[collapsible=icon]/sidebar:flex group-data-[collapsible=icon]/sidebar:justify-center", className)}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group" className={cn("grid gap-1", className)} {...props} />
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "px-2 py-1 text-xs font-medium text-muted-foreground transition-[margin,opacity] duration-200 group-data-[collapsible=icon]/sidebar:-mt-7 group-data-[collapsible=icon]/sidebar:opacity-0",
        className,
      )}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("grid gap-0.5", className)} {...props} />
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={className} {...props} />
}

function SidebarMenuButton({
  className,
  isActive,
  ...props
}: React.ComponentProps<"a"> & { isActive?: boolean }) {
  return (
    <a
      data-slot="sidebar-menu-button"
      data-active={isActive ? "true" : undefined}
      className={cn(
        "flex min-h-8 w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-[0.8125rem] text-muted-foreground transition-[background-color,color,width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]/sidebar:size-8 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:p-0 [&_svg]:size-4 [&_svg]:shrink-0 [&_span]:truncate group-data-[collapsible=icon]/sidebar:[&_span]:hidden",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        className
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col bg-background md:m-2 md:overflow-hidden md:rounded-xl md:border md:shadow-sm",
        className,
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMobile,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
}
