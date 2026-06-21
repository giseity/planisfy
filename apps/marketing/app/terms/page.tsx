import { Footer } from '@/components/footer'
import { HeroHeader } from '@/components/header'
import { env } from '@/env'

const signInHref = `${env.NEXT_PUBLIC_AUTH_ORIGIN}/sign-in`
const signUpHref = `${env.NEXT_PUBLIC_AUTH_ORIGIN}/sign-up`

export default function TermsPage() {
  return (
    <div className="min-h-svh bg-background">
      <HeroHeader
        docsHref={env.NEXT_PUBLIC_DOCS_URL}
        signInHref={signInHref}
        signUpHref={signUpHref}
      />
      <main className="pt-24">
        <section className="py-24">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-primary">Planisfy Terms</p>
              <h1 className="mt-4 text-balance font-serif text-4xl font-medium md:text-5xl">
                Terms are being prepared.
              </h1>
              <p className="mt-6 text-balance text-muted-foreground">
                Planisfy is self-hostable under the published repository license and notices. A
                concise product terms page will be added here before launch.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer docsHref={env.NEXT_PUBLIC_DOCS_URL} />
    </div>
  )
}
