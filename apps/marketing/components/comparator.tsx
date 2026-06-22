import Link from 'next/link'
import { Check, Minus } from 'lucide-react'
import { PLAN_ORDER, PLANS } from '@planisfy/types'

import { Button } from '@planisfy/ui/components/button'
import { Card } from '@planisfy/ui/components/card'

const plans = PLAN_ORDER.map((planId) => PLANS[planId])

const features = [
  {
    name: 'Published map styles',
    values: plans.map((plan) => plan.comparison.publishedStyles),
  },
  { name: 'Hosted tilesets', values: plans.map((plan) => plan.comparison.hostedTilesets) },
  { name: 'API keys', values: plans.map((plan) => plan.comparison.apiKeys) },
  {
    name: 'Planisfy credits',
    values: plans.map((plan) => plan.comparison.geocodingUsage),
  },
  { name: 'Usage dashboard', values: plans.map((plan) => plan.comparison.usageDashboard) },
  { name: 'Team roles', values: plans.map((plan) => plan.comparison.teamRoles) },
  { name: 'Audit log', values: plans.map((plan) => plan.comparison.auditLog) },
  {
    name: 'Operations controls',
    values: plans.map((plan) => plan.comparison.operationsControls),
  },
  { name: 'Self-host support', values: plans.map((plan) => plan.comparison.selfHostSupport) },
  { name: 'SLA and onboarding', values: plans.map((plan) => plan.comparison.slaAndOnboarding) },
]

type ComparatorProps = {
  signUpHref: string
}

export function Comparator({ signUpHref }: ComparatorProps) {
  return (
    <section id="compare" className="bg-background py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Compare plans by operational scope.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Pick the level of hosted capacity, governance, and deployment support your mapping
            workload needs.
          </p>
        </div>
        <Card className="mt-10 overflow-x-auto rounded-3xl">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-5 border-b">
              <div className="p-4" />
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={['border-l p-4 text-center', plan.highlighted ? 'bg-accent' : ''].join(
                    ' '
                  )}
                >
                  <p className="font-medium">{plan.name}</p>
                  <p className="mt-1">
                    <span className="text-2xl font-semibold">{plan.priceLabel}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </p>
                </div>
              ))}
            </div>
            {features.map((feature) => (
              <div key={feature.name} className="grid grid-cols-5 border-b">
                <div className="p-4 text-sm text-muted-foreground">{feature.name}</div>
                {feature.values.map((value, index) => {
                  return (
                    <div
                      key={`${feature.name}-${plans[index]?.id ?? index}`}
                      className={[
                        'flex items-center justify-center border-l p-4 text-sm',
                        index === 1 ? 'bg-accent' : '',
                      ].join(' ')}
                    >
                      {typeof value === 'boolean' ? (
                        value ? (
                          <Check className="size-4 text-primary" />
                        ) : (
                          <Minus className="size-4 text-muted-foreground" />
                        )
                      ) : (
                        <span>{value}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            <div className="grid grid-cols-5">
              <div className="p-4" />
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={['border-l p-4', plan.highlighted ? 'bg-accent' : ''].join(' ')}
                >
                  <Button
                    asChild
                    className="w-full"
                    size="marketing"
                    variant={plan.highlighted ? 'default' : 'outline'}
                  >
                    <Link href={signUpHref}>{plan.cta}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </section>
  )
}
