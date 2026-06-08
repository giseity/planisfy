import * as React from "react"
import { Card, CardContent } from "@planisfy/ui/components/card"
import { cn } from "@planisfy/ui/lib/utils"

function MetricCard({
  label,
  value,
  detail,
  icon,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  detail?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("min-h-[104px]", className)}>
      <CardContent className="flex h-full items-center gap-3 p-4">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold">{value}</p>
          {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export { MetricCard }
