import Link from "next/link"
import { Button } from "@planisfy/ui/components/button"
import { ArrowLeft, Home, MapPinOff } from "lucide-react"

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <MapPinOff className="h-9 w-9 text-muted-foreground/70" />
        </div>
        <div>
          <p className="text-6xl font-bold tracking-tight text-muted-foreground/30">404</p>
          <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Go back
            </Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
