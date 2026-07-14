import Link from 'next/link'
import { ArrowUpRight, CalendarDays } from 'lucide-react'

import { Badge } from '@planisfy/ui/components/badge'

import { Footer } from '@/components/footer'
import { HeroHeader } from '@/components/header'
import { clientEnv } from '@/env.client'
import { formatBlogDate, getBlogPostUrl, getPublishedBlogPosts } from '@/lib/blog'
import { marketingMetadata } from '@/lib/metadata'

export const metadata = marketingMetadata({
  title: 'Planisfy Blog',
  description:
    'Technical notes on open map infrastructure, MapLibre platform architecture, self-hosting, vector tiles, routing, geocoding, and operations.',
  path: '/blog',
})

const signInHref = `${clientEnv.NEXT_PUBLIC_CONSOLE_URL}/sign-in`
const signUpHref = `${clientEnv.NEXT_PUBLIC_CONSOLE_URL}/sign-up`

export default function BlogPage() {
  const posts = getPublishedBlogPosts()

  return (
    <div className="min-h-svh bg-background">
      <HeroHeader
        consoleHref={clientEnv.NEXT_PUBLIC_CONSOLE_URL}
        docsHref={clientEnv.NEXT_PUBLIC_DOCS_URL}
        signInHref={signInHref}
        signUpHref={signUpHref}
      />
      <main className="pt-24">
        <section className="py-20 md:py-24">
          <div className="mx-auto max-w-5xl px-6">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-primary">Blog</p>
              <h1 className="mt-4 text-balance font-serif text-4xl font-medium md:text-5xl">
                Technical notes on open map infrastructure.
              </h1>
              <p className="mt-6 text-balance text-muted-foreground">
                Architecture, self-hosting, MapLibre platform design, vector tiles, geospatial
                APIs, and operations from the Planisfy codebase.
              </p>
            </div>

            <div className="mt-14 grid gap-5">
              {posts.map((post) => (
                <Link
                  key={post.info.path}
                  href={getBlogPostUrl(post)}
                  className="group rounded-lg border bg-card p-6 transition-colors hover:border-primary/30 hover:bg-muted/30"
                >
                  <article>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <CalendarDays className="size-4" />
                        <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
                      </span>
                      <span>{post.author}</span>
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-6">
                      <div>
                        <h2 className="text-2xl font-medium tracking-normal">{post.title}</h2>
                        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                          {post.description}
                        </p>
                      </div>
                      <ArrowUpRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                    </div>
                    {post.tags?.length ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {post.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer docsHref={clientEnv.NEXT_PUBLIC_DOCS_URL} />
    </div>
  )
}
