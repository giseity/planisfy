import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

export default function PlatformLayout({ children }: { children: ReactNode }) {
  if (process.env.DEPLOYMENT_MODE === 'managed') {
    notFound()
  }

  return children
}
