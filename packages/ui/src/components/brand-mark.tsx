import * as React from 'react'
import { planisfyMarkPaths, planisfyMarkViewBox } from 'assets/brand'
import { cn } from '@planisfy/ui/lib/utils'

function PlanisfyMark({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={planisfyMarkViewBox}
      data-slot="planisfy-mark"
      aria-hidden="true"
      className={cn('size-8 shrink-0', className)}
      {...props}
    >
      {planisfyMarkPaths.map((path, index) => (
        <path key={path.d} d={path.d} fill={index < 2 ? 'var(--primary)' : 'var(--secondary)'} />
      ))}
    </svg>
  )
}

function PlanisfyLogo({
  className,
  markClassName,
  label = 'Planisfy',
  sublabel,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & {
  markClassName?: string
  label?: string
  sublabel?: string
  size?: 'default' | 'lg'
}) {
  const isLarge = size === 'lg'

  return (
    <div
      data-slot="planisfy-logo"
      className={cn('flex min-w-0 items-center', isLarge ? 'gap-3' : 'gap-2', className)}
      {...props}
    >
      <PlanisfyMark className={cn(isLarge ? 'size-10' : 'size-8', markClassName)} />
      <div className="min-w-0">
        <div
          className={cn('truncate font-semibold tracking-tight', isLarge ? 'text-base' : 'text-sm')}
        >
          {label}
        </div>
        {sublabel && (
          <div className={cn('truncate text-muted-foreground', isLarge ? 'text-sm' : 'text-xs')}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  )
}

export { PlanisfyLogo, PlanisfyMark }
