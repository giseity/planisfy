import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { Button } from '@planisfy/ui/components/button'

type CallToActionProps = {
  signUpHref: string
  consoleHref: string
}

export function CallToAction({ signUpHref, consoleHref }: CallToActionProps) {
  return (
    <section className="bg-background @container py-24">
      <div className="mx-auto max-w-2xl px-6">
        <div className="text-center">
          <h2 className="text-balance font-serif text-4xl font-medium">
            Ready to Build with Planisfy?
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-md text-balance">
            Publish styles, operate tilesets, and manage map access from one self-hostable control
            plane.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild className="pr-1.5 rounded-[20px] h-13 px-4">
              <Link href={signUpHref}>
                <span>Start Building</span>
                <ChevronRight className="opacity-50" />
              </Link>
            </Button>
            <Button variant="secondary" asChild className="rounded-[20px] h-13 px-4">
              <a href={consoleHref}>Open Console</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
