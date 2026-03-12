"use client"

import * as React from "react"
import { Checkbox as RadixCheckbox } from "radix-ui"
import { CheckIcon } from "lucide-react"
import { cn } from "@planisfy/ui/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof RadixCheckbox.Root>) {
  return (
    <RadixCheckbox.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary",
        className
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="flex items-center justify-center text-current transition-none">
        <CheckIcon className="size-3.5" />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  )
}

export { Checkbox }
