import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, CalendarDays } from 'lucide-react'

import { Badge } from '@planisfy/ui/components/badge'
import { Button } from '@planisfy/ui/components/button'

import { Footer } from '@/components/footer'
import { HeroHeader } from '@/components/header'
import { clientEnv } from '@/env.client'
import {
  formatBlogDate,
  getBlogPost,
  getBlogPostStaticParams,
  getBlogPostUrl,
} from '@/lib/blog'
import { marketingMetadata } from '@/lib/metadata'
import { getMDXComponents } from '@/mdx-components'

type BlogPostPageProps = {
  params: Promise<{
    slug: string
  }>
}

const signInHref = `${clientEnv.NEXT_PUBLIC_CONSOLE_URL}/sign-in`
const signUpHref = `${clientEnv.NEXT_PUBLIC_CONSOLE_URL}/sign-up`

export default async function BlogPostPage(props: BlogPostPageProps) {
  const params = await props.params
  const post = getBlogPost(params.slug)
  if (!post) notFound()

  const MDX = post.body

  return (
    <div className="min-h-svh bg-background">
      <HeroHeader
        consoleHref={clientEnv.NEXT_PUBLIC_CONSOLE_URL}
        docsHref={clientEnv.NEXT_PUBLIC_DOCS_URL}
        signInHref={signInHref}
        signUpHref={signUpHref}
      />
      <main className="pt-24">
        <article className="py-16 md:py-20">
          <div className="mx-auto max-w-3xl px-6">
            <Button asChild variant="ghost" className="-ml-3">
              <Link href="/blog">
                <ArrowLeft className="size-4" />
                <span>Blog</span>
              </Link>
            </Button>

            <header className="mt-8 border-b pb-10">
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="size-4" />
                  <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
                </span>
                <span>{post.author}</span>
              </div>
              <h1 className="mt-5 text-balance font-serif text-4xl font-medium md:text-5xl">
                {post.title}
              </h1>
              <p className="mt-5 text-balance text-lg leading-8 text-muted-foreground">
                {post.description}
              </p>
              {post.tags?.length ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </header>

            <div className="mt-10">
              <MDX components={getMDXComponents()} />
            </div>
          </div>
        </article>
      </main>
      <Footer docsHref={clientEnv.NEXT_PUBLIC_DOCS_URL} />
    </div>
  )
}

export function generateStaticParams() {
  return getBlogPostStaticParams()
}

export async function generateMetadata(props: BlogPostPageProps): Promise<Metadata> {
  const params = await props.params
  const post = getBlogPost(params.slug)
  if (!post) notFound()

  return marketingMetadata({
    title: post.title,
    description: post.description,
    path: getBlogPostUrl(post),
    type: 'article',
  })
}
