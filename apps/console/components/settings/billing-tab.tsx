"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  billingStatusLabel,
  billingStatusVariant,
  formatLimit,
  type BillingInfo,
  type PlanInfo,
} from "@/components/settings/model";
import { Badge } from "@planisfy/ui/components/badge";
import { Button } from "@planisfy/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import { Skeleton } from "@planisfy/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { Check } from "lucide-react";
import { toast } from "sonner";

export function BillingTab() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<BillingInfo>("/billing"),
      api.get<PlanInfo[]>("/billing/plans"),
    ])
      .then(([b, p]) => {
        setBilling(b);
        setPlans(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !billing) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const quotaColor =
    billing.quotaPercent >= 90
      ? "bg-red-500"
      : billing.quotaPercent >= 70
        ? "bg-yellow-500"
        : "bg-green-500";

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Current Plan</CardTitle>
            <Badge
              variant={
                billing.plan === "free"
                  ? "secondary"
                  : billing.plan === "enterprise"
                    ? "warning"
                    : "success"
              }
            >
              {billing.planName}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge
              variant={
                billing.deploymentMode === "managed" ? "success" : "secondary"
              }
            >
              {billing.deploymentMode === "managed" ? "Managed" : "Self-host"}
            </Badge>
            <Badge variant={billingStatusVariant(billing.billingStatus)}>
              {billingStatusLabel(billing.billingStatus)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-sm text-muted-foreground">Monthly Units</p>
              <p className="text-lg font-semibold">
                {billing.usage.monthlyUnits.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatLimit(billing.limits.monthlyUnits)}
                </span>
              </p>
              <div className="h-2 bg-muted rounded-full mt-1">
                <div
                  className={`h-full rounded-full ${quotaColor} transition-all`}
                  style={{
                    width: `${Math.min(billing.quotaPercent, 100)}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Styles</p>
              <p className="text-lg font-semibold">
                {billing.usage.styles}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatLimit(billing.limits.maxStyles)}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tilesets</p>
              <p className="text-lg font-semibold">
                {billing.usage.sources}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatLimit(billing.limits.maxSources)}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">API Keys</p>
              <p className="text-lg font-semibold">
                {billing.usage.apiKeys}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatLimit(billing.limits.maxApiKeys)}
                </span>
              </p>
            </div>
          </div>

          {billing.quotaPercent >= 80 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 px-4 py-3 text-sm mb-4">
              You&apos;ve used {billing.quotaPercent}% of your monthly quota.
              Consider upgrading to avoid service interruptions.
            </div>
          )}

          {billing.portalAvailable && billing.plan !== "free" && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const { url } = await api.get<{ url: string }>(
                    "/billing/portal",
                  );
                  window.open(url, "_blank");
                } catch {
                  toast.error("Billing portal is not available");
                }
              }}
            >
              Manage Subscription
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <h2 className="text-lg font-semibold">Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === billing.plan;
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Current</Badge>}
                </div>
                <p className="text-2xl font-bold">
                  {plan.price === 0 ? "Free" : `$${plan.price}`}
                  {plan.price > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  )}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.monthlyUnits === "Unlimited"
                      ? "Unlimited"
                      : Number(plan.monthlyUnits).toLocaleString()}{" "}
                    API units/month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.requestsPerMinute.toLocaleString()} requests/minute
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxStyles === "Unlimited"
                      ? "Unlimited"
                      : plan.maxStyles}{" "}
                    styles
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxSources === "Unlimited"
                      ? "Unlimited"
                      : plan.maxSources}{" "}
                    tilesets
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxApiKeys === "Unlimited"
                      ? "Unlimited"
                      : plan.maxApiKeys}{" "}
                    API keys
                  </li>
                </ul>

                {!isCurrent && plan.price > 0 && (
                  <Button
                    className="w-full mt-4"
                    variant={plan.id === "pro" ? "default" : "outline"}
                    disabled={!plan.checkoutAvailable}
                    onClick={async () => {
                      if (!plan.checkoutAvailable) {
                        toast.info(
                          "Billing is not configured yet. Set Dodo Payments credentials to enable payments.",
                        );
                        return;
                      }
                      try {
                        const { url } = await api.post<{ url: string }>(
                          "/billing/checkout",
                          { planId: plan.id },
                        );
                        window.open(url, "_blank");
                      } catch {
                        toast.error("Unable to start checkout");
                      }
                    }}
                  >
                    {plan.checkoutAvailable
                      ? `Upgrade to ${plan.name}`
                      : "Coming soon"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                {
                  id: "INV-2026-006",
                  period: "Jun 2026",
                  amount: "$0.00",
                  status: "current",
                },
                {
                  id: "INV-2026-005",
                  period: "May 2026",
                  amount: "$0.00",
                  status: "paid",
                },
                {
                  id: "INV-2026-004",
                  period: "Apr 2026",
                  amount: "$0.00",
                  status: "paid",
                },
              ].map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs">
                    {invoice.id}
                  </TableCell>
                  <TableCell>{invoice.period}</TableCell>
                  <TableCell className="font-medium">
                    {invoice.amount}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        invoice.status === "paid" ? "success" : "secondary"
                      }
                    >
                      {invoice.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
