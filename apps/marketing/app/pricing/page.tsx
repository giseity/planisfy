import { Comparator } from '@/components/comparator'
import { Footer } from '@/components/footer'
import { HeroHeader } from '@/components/header'
import { Pricing } from '@/components/pricing'
import { clientEnv } from '@/env.client'

const signInHref = `${clientEnv.NEXT_PUBLIC_CONSOLE_URL}/sign-in`
const signUpHref = `${clientEnv.NEXT_PUBLIC_CONSOLE_URL}/sign-up`

export default function PricingPage() {
  return (
    <div className="min-h-svh bg-background">
      <HeroHeader
        consoleHref={clientEnv.NEXT_PUBLIC_CONSOLE_URL}
        docsHref={clientEnv.NEXT_PUBLIC_DOCS_URL}
        signInHref={signInHref}
        signUpHref={signUpHref}
      />
      <main className="pt-24">
        <Pricing signUpHref={signUpHref} />
        <Comparator signUpHref={signUpHref} />
      </main>
      <Footer docsHref={clientEnv.NEXT_PUBLIC_DOCS_URL} />
    </div>
  )
}
