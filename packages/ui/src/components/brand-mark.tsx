import * as React from "react"
import { Map } from "lucide-react"
import { cn } from "@planisfy/ui/lib/utils"

function PlanisfyMark({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="planisfy-mark"
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg border bg-primary text-primary-foreground shadow-sm",
        className,
      )}
      {...props}
    >
      <Map className="size-4" />
    </div>
  )
}

function PlanisfyLogo({
  className,
  markClassName,
  label = "Planisfy",
  sublabel,
  ...props
}: React.ComponentProps<"div"> & {
  markClassName?: string
  label?: string
  sublabel?: string
}) {
  return (
    <div
      data-slot="planisfy-logo"
      className={cn("flex min-w-0 items-center gap-2", className)}
      {...props}
    >
      <PlanisfyMark className={markClassName} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold tracking-tight">
          {label}
        </div>
        {sublabel && (
          <div className="truncate text-xs text-muted-foreground">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  )
}

export { PlanisfyLogo, PlanisfyMark }
