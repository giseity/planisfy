import type { MDXComponents } from 'mdx/types'

import { cn } from '@planisfy/ui/lib/utils'

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    h2: ({ className, ...props }) => (
      <h2
        className={cn('mt-12 scroll-m-24 text-2xl font-medium tracking-normal', className)}
        {...props}
      />
    ),
    h3: ({ className, ...props }) => (
      <h3
        className={cn('mt-9 scroll-m-24 text-xl font-medium tracking-normal', className)}
        {...props}
      />
    ),
    p: ({ className, ...props }) => (
      <p className={cn('mt-5 leading-8 text-muted-foreground', className)} {...props} />
    ),
    a: ({ className, ...props }) => (
      <a
        className={cn('font-medium text-primary underline-offset-4 hover:underline', className)}
        {...props}
      />
    ),
    ul: ({ className, ...props }) => (
      <ul className={cn('mt-5 list-disc space-y-3 pl-6 text-muted-foreground', className)} {...props} />
    ),
    ol: ({ className, ...props }) => (
      <ol className={cn('mt-5 list-decimal space-y-3 pl-6 text-muted-foreground', className)} {...props} />
    ),
    li: ({ className, ...props }) => <li className={cn('leading-8', className)} {...props} />,
    blockquote: ({ className, ...props }) => (
      <blockquote
        className={cn('mt-6 border-l-2 border-primary pl-5 text-muted-foreground', className)}
        {...props}
      />
    ),
    code: ({ className, ...props }) => (
      <code
        className={cn(
          'rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground',
          className
        )}
        {...props}
      />
    ),
    pre: ({ className, ...props }) => (
      <pre
        className={cn('mt-6 overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm leading-7', className)}
        {...props}
      />
    ),
    hr: ({ className, ...props }) => (
      <hr className={cn('my-10 border-border', className)} {...props} />
    ),
    ...components,
  }
}
