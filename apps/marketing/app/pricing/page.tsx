import { Comparator } from '@/components/comparator'
import { Footer } from '@/components/footer'
import { HeroHeader } from '@/components/header'
import { Pricing } from '@/components/pricing'
import { env } from '@/env'

const signInHref = `${env.NEXT_PUBLIC_AUTH_ORIGIN}/sign-in`
const signUpHref = `${env.NEXT_PUBLIC_AUTH_ORIGIN}/sign-up`

export default function PricingPage() {
  return (
    <div className="min-h-svh bg-background">
      <HeroHeader
        docsHref={env.NEXT_PUBLIC_DOCS_URL}
        signInHref={signInHref}
        signUpHref={signUpHref}
      />
      <main className="pt-24">
        <Pricing signUpHref={signUpHref} />
        <Comparator signUpHref={signUpHref} />
      </main>
      <Footer docsHref={env.NEXT_PUBLIC_DOCS_URL} />
    </div>
  )
}
