import { Button } from "@planisfy/ui/components/button"

export default function Page() {
  return (
    <div className="flex items-center justify-center min-h-svh">
      <div className="flex flex-col items-center justify-center gap-8 max-w-2xl px-4">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Welcome to Planisfy</h1>
          <p className="text-muted-foreground text-lg">
            A modern monorepo built with Next.js, TypeScript, and Tailwind CSS
          </p>
        </div>
        <div className="flex gap-4">
          <Button size="lg">Get Started</Button>
          <Button variant="outline" size="lg">Learn More</Button>
        </div>
      </div>
    </div>
  )
}
