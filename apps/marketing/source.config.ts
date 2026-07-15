import { defineCollections, defineConfig } from 'fumadocs-mdx/config'
import { z } from 'zod'

export const blog = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  files: ['**/*.mdx'],
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    author: z.string(),
    tags: z.array(z.string()).optional(),
    published: z.boolean(),
  }),
  postprocess: {
    includeProcessedMarkdown: true,
  },
})

export default defineConfig({
  mdxOptions: {},
})
