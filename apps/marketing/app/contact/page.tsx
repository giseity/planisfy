import { Footer } from '@/components/footer'
import { HeroHeader } from '@/components/header'
import { serverEnv } from '@/env.server'

const signInHref = `${serverEnv.NEXT_PUBLIC_AUTH_ORIGIN}/sign-in`
const signUpHref = `${serverEnv.NEXT_PUBLIC_AUTH_ORIGIN}/sign-up`

export default function ContactPage() {
  return (
    <div className="min-h-svh bg-background">
      <HeroHeader
        docsHref={serverEnv.NEXT_PUBLIC_DOCS_URL}
        signInHref={signInHref}
        signUpHref={signUpHref}
      />
      <main className="pt-24">
        <section className="py-24">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <p className="text-sm font-medium text-primary">Contact</p>
            <h1 className="mt-4 text-balance font-serif text-4xl font-medium md:text-5xl">
              Contact page is being prepared.
            </h1>
            <p className="mt-6 text-balance text-muted-foreground">
              A dedicated contact path for deployment, self-hosting, and platform questions will be
              added here before launch.
            </p>
          </div>
        </section>
      </main>
      <Footer docsHref={serverEnv.NEXT_PUBLIC_DOCS_URL} />
    </div>
  )
}
