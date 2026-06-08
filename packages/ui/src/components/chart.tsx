"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@planisfy/ui/lib/utils"

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    color?: string
  }
>

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }
  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-grid_line]:stroke-border/50 [&_.recharts-tooltip-cursor]:stroke-border [&_.recharts-sector]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, item]) => item.color)
  if (!colorConfig.length) return null

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: colorConfig
          .map(([key, item]) => `[data-chart=${id}] { --color-${key}: ${item.color}; }`)
          .join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

interface ChartTooltipPayloadItem {
  dataKey?: string | number
  name?: string | number
  value?: string | number
  color?: string
}

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
}: {
  active?: boolean
  payload?: ChartTooltipPayloadItem[]
  label?: React.ReactNode
  className?: string
}) {
  const { config } = useChart()
  if (!active || !payload?.length) return null

  return (
    <div className={cn("grid min-w-32 gap-1.5 rounded-md border bg-background px-3 py-2 text-xs shadow-xl", className)}>
      {label && <div className="font-medium">{label}</div>}
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "")
          const itemConfig = config[key]
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{itemConfig?.label ?? item.name}</span>
              <span className="ml-auto font-mono font-medium text-foreground">{String(item.value)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  payload,
  className,
}: React.ComponentProps<"div"> & {
  payload?: Array<{ value?: string; color?: string; dataKey?: string }>
}) {
  const { config } = useChart()
  if (!payload?.length) return null

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-4 text-xs", className)}>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value ?? "")
        const itemConfig = config[key]
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: item.color }} />
            <span>{itemConfig?.label ?? item.value}</span>
          </div>
        )
      })}
    </div>
  )
}

export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
}
