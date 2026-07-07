import { marketingMetadata } from '../lib/metadata'

export const metadata = marketingMetadata({
  title: "Planisfy",
  description: "Open-source, self-hostable map infrastructure for MapLibre styles, vector tiles, geospatial APIs, and operations.",
  path: "/",
})

import { CallToAction } from '@/components/call-to-action'
import FAQs from '@/components/faqs'
import { Features } from '@/components/features'
import { Footer } from '@/components/footer'
import { HeroSection } from '@/components/hero-section'
import { WorkflowSection } from '@/components/workflow'
import { clientEnv } from '@/env.client'

const signInHref = `${clientEnv.NEXT_PUBLIC_CONSOLE_URL}/sign-in`
const signUpHref = `${clientEnv.NEXT_PUBLIC_CONSOLE_URL}/sign-up`

export default function Page() {
  return (
    <div className="min-h-svh bg-background">
      <HeroSection
        docsHref={clientEnv.NEXT_PUBLIC_DOCS_URL}
        signInHref={signInHref}
        signUpHref={signUpHref}
        consoleHref={clientEnv.NEXT_PUBLIC_CONSOLE_URL}
      />
      <Features />
      <WorkflowSection />
      <FAQs />
      <CallToAction signUpHref={signUpHref} consoleHref={clientEnv.NEXT_PUBLIC_CONSOLE_URL} />
      <Footer docsHref={clientEnv.NEXT_PUBLIC_DOCS_URL} />
    </div>
  )
}
