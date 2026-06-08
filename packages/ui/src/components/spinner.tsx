import * as React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@planisfy/ui/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2>) {
  return (
    <Loader2
      data-slot="spinner"
      className={cn("size-4 animate-spin text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Spinner }
