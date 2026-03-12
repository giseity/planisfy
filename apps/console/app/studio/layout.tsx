"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@planisfy/ui/lib/utils"
import { Palette, Key, BarChart3, Settings } from "lucide-react"

const navItems = [
  { href: "/studio/styles", label: "Styles", icon: Palette },
  { href: "/studio/keys", label: "API Keys", icon: Key },
  { href: "/studio/usage", label: "Usage", icon: BarChart3 },
  { href: "/studio/settings", label: "Settings", icon: Settings },
]

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // Hide nav on the style editor page (full-screen)
  const isEditor = /^\/studio\/styles\/[^/]+$/.test(pathname)
  if (isEditor) return <>{children}</>

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container max-w-6xl flex h-12 items-center gap-6 px-4">
          <Link href="/studio/styles" className="font-semibold text-lg tracking-tight">
            Planisfy
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
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
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
