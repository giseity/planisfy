"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@planisfy/ui/components/chart"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"

const COLORS = [
  "hsl(142, 71%, 45%)",
  "hsl(47, 96%, 53%)",
  "hsl(221, 83%, 53%)",
  "hsl(0, 84%, 60%)",
  "hsl(262, 83%, 58%)",
]

const adminUsageChartConfig = {
  requests: { label: "Requests", color: COLORS[2] },
  errors: { label: "Errors", color: COLORS[3] },
  count: { label: "Count", color: COLORS[0] },
  cost: { label: "Units", color: COLORS[4] },
} satisfies ChartConfig

interface UsageChartsProps {
  timeseries: { date: string; requests: number; errors: number; cost: number }[]
  byEndpoint: { endpoint: string; requests: number; cost: number }[]
  byStatus: { status: string; count: number }[]
}

export function UsageCharts({ timeseries, byEndpoint, byStatus }: UsageChartsProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Requests Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {timeseries.length > 0 ? (
              <ChartContainer
                config={adminUsageChartConfig}
                className="h-[280px] aspect-auto"
              >
                <AreaChart data={timeseries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="requests"
                    stroke="var(--color-requests)"
                    fill="var(--color-requests)"
                    fillOpacity={0.15}
                    name="Requests"
                  />
                  <Area
                    type="monotone"
                    dataKey="errors"
                    stroke="var(--color-errors)"
                    fill="var(--color-errors)"
                    fillOpacity={0.15}
                    name="Errors"
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {byStatus.length > 0 ? (
              <ChartContainer
                config={adminUsageChartConfig}
                className="h-[280px] aspect-auto"
              >
                <PieChart>
                  <Pie
                    data={byStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="count"
                    nameKey="status"
                    label={((props: { status?: string; count?: number }) => `${props.status}: ${props.count}`) as unknown as boolean}
                  >
                    {byStatus.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Endpoints (Requests)</CardTitle>
          </CardHeader>
          <CardContent>
            {byEndpoint.length > 0 ? (
              <ChartContainer
                config={adminUsageChartConfig}
                className="h-[280px] aspect-auto"
              >
                <BarChart data={byEndpoint} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="endpoint" type="category" width={120} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="requests" fill="var(--color-requests)" name="Requests" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Endpoints (Cost)</CardTitle>
          </CardHeader>
          <CardContent>
            {byEndpoint.length > 0 ? (
              <ChartContainer
                config={adminUsageChartConfig}
                className="h-[280px] aspect-auto"
              >
                <BarChart data={byEndpoint}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="endpoint" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="cost" fill="var(--color-cost)" name="Units" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">No data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
