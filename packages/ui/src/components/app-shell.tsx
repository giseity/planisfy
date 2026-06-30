import * as React from 'react'
import { cn } from '@planisfy/ui/lib/utils'

function AppShell({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="app-shell"
      className={cn('flex min-h-svh w-full bg-background', className)}
      {...props}
    />
  )
}

function AppShellHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      data-slot="app-shell-header"
      className={cn(
        'sticky top-0 z-30 flex h-12 items-center gap-2 bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className
      )}
      {...props}
    />
  )
}

function AppShellContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="app-shell-content"
      className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6', className)}
      {...props}
    />
  )
}

export { AppShell, AppShellContent, AppShellHeader }
