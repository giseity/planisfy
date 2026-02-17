import { Button } from "@planisfy/ui/components/button"

export default function Page() {
  return (
    <div className="flex items-center justify-center min-h-svh">
      <div className="flex flex-col items-center justify-center gap-8 max-w-2xl px-4">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Platform Administration</h1>
          <p className="text-muted-foreground text-lg">
            Manage users, billing, and system configuration
          </p>
        </div>
        <div className="flex gap-4">
          <Button size="lg">Users</Button>
          <Button variant="outline" size="lg">Settings</Button>
        </div>
      </div>
    </div>
  )
}
