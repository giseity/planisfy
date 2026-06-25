import { CallToAction } from '@/components/call-to-action'
import FAQs from '@/components/faqs'
import { Features } from '@/components/features'
import { Footer } from '@/components/footer'
import { HeroSection } from '@/components/hero-section'
import { serverEnv } from '@/env.server'

const signInHref = `${serverEnv.NEXT_PUBLIC_AUTH_ORIGIN}/sign-in`
const signUpHref = `${serverEnv.NEXT_PUBLIC_AUTH_ORIGIN}/sign-up`

export default function Page() {
  return (
    <div className="min-h-svh bg-background">
      <HeroSection
        docsHref={serverEnv.NEXT_PUBLIC_DOCS_URL}
        signInHref={signInHref}
        signUpHref={signUpHref}
        consoleHref={serverEnv.NEXT_PUBLIC_CONSOLE_URL}
      />
      <Features />
      <FAQs />
      <CallToAction signUpHref={signUpHref} consoleHref={serverEnv.NEXT_PUBLIC_CONSOLE_URL} />
      <Footer docsHref={serverEnv.NEXT_PUBLIC_DOCS_URL} />
    </div>
  )
}
