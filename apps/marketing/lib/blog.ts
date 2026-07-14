import { blog } from 'fumadocs-mdx:collections/server'

const blogUrlPrefix = '/blog'

export type BlogPost = (typeof blog)[number]

export function getBlogPostSlug(post: BlogPost) {
  return post.info.path.replace(/\.mdx$/, '')
}

export function getBlogPostUrl(post: BlogPost) {
  return `${blogUrlPrefix}/${getBlogPostSlug(post)}`
}

export function getPublishedBlogPosts() {
  return blog
    .filter((post) => post.published)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function getBlogPost(slug: string) {
  return getPublishedBlogPosts().find((post) => getBlogPostSlug(post) === slug)
}

export function getBlogPostStaticParams() {
  return getPublishedBlogPosts().map((post) => ({
    slug: getBlogPostSlug(post),
  }))
}

export function formatBlogDate(date: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`))
}
