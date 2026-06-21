import Link from 'next/link'
import { Check, Minus } from 'lucide-react'

import { Button } from '@planisfy/ui/components/button'
import { Card } from '@planisfy/ui/components/card'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    cta: 'Create account',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '$19',
    period: '/month',
    cta: 'Start starter plan',
    highlighted: true,
  },
  {
    name: 'Scale',
    price: '$79',
    period: '/month',
    cta: 'Start scale plan',
    highlighted: false,
  },
  {
    name: 'Platform',
    price: 'Custom',
    period: '',
    cta: 'Talk to sales',
    highlighted: false,
  },
]

const features = [
  {
    name: 'Published map styles',
    free: '3',
    starter: '10',
    scale: '50',
    platform: 'Unlimited',
  },
  { name: 'Hosted tilesets', free: '1', starter: '5', scale: '20', platform: 'Custom' },
  { name: 'API keys', free: '2', starter: '10', scale: '40', platform: 'Unlimited' },
  {
    name: 'Geocoding usage',
    free: 'Test volume',
    starter: 'Growing apps',
    scale: 'Production',
    platform: 'Custom',
  },
  { name: 'Usage dashboard', free: true, starter: true, scale: true, platform: true },
  { name: 'Team roles', free: false, starter: true, scale: true, platform: true },
  { name: 'Audit log', free: false, starter: false, scale: true, platform: true },
  { name: 'Self-host support', free: false, starter: false, scale: false, platform: true },
  { name: 'SLA and onboarding', free: false, starter: false, scale: false, platform: true },
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
                    <span className="text-2xl font-semibold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </p>
                </div>
              ))}
            </div>
            {features.map((feature) => (
              <div key={feature.name} className="grid grid-cols-5 border-b">
                <div className="p-4 text-sm text-muted-foreground">{feature.name}</div>
                {(['free', 'starter', 'scale', 'platform'] as const).map((planKey, index) => {
                  const value = feature[planKey]

                  return (
                    <div
                      key={planKey}
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
