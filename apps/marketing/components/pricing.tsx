import Link from 'next/link'
import { Check } from 'lucide-react'
import { PLAN_ORDER, PLANS } from '@planisfy/types'

import { Button } from '@planisfy/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@planisfy/ui/components/card'
import { cn } from '@planisfy/ui/lib/utils'

const plans = PLAN_ORDER.map((planId) => PLANS[planId])

type PricingProps = {
  signUpHref: string
}

export function Pricing({ signUpHref }: PricingProps) {
  return (
    <section id="pricing" className="bg-background py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Pricing for teams moving maps into production.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Start with hosted workflows and graduate to operational control as traffic, governance,
            and infrastructure requirements grow.
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={cn(
                'relative flex flex-col rounded-3xl',
                plan.name === 'Platform' && 'md:col-span-3 md:grid md:grid-cols-[1fr_1.3fr_auto]',
                plan.highlighted && 'border-primary shadow-md'
              )}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-6 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Recommended
                </span>
              ) : null}
              <CardHeader className={cn(plan.name === 'Platform' && 'md:pr-4')}>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="pt-4">
                  <span className="text-4xl font-semibold">{plan.priceLabel}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                  {plan.pricing.yearly ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan.pricing.yearly.priceLabel}/year
                    </p>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className={cn('flex-1', plan.name === 'Platform' && 'md:p-6')}>
                <ul
                  className={cn(
                    'space-y-3 text-sm',
                    plan.name === 'Platform' &&
                      'md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-3 md:space-y-0'
                  )}
                >
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className={cn(plan.name === 'Platform' && 'md:items-end md:pl-4')}>
                <Button
                  asChild
                  className="w-full"
                  size="marketing"
                  variant={plan.highlighted ? 'default' : 'outline'}
                >
                  <Link href={signUpHref}>{plan.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
