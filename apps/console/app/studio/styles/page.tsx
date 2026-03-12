import { Suspense } from "react"
import { getStyles, createStyle } from "./actions"
import { StyleCard } from "@/components/studio/style-card"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@planisfy/ui/components/dialog"
import { Plus, Map } from "lucide-react"

async function StyleGrid() {
  const styles = await getStyles()

  if (styles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Map className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">No styles yet</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Create your first map style to get started.
        </p>
        <CreateStyleButton />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {styles.map((style) => (
        <StyleCard key={style.id} style={style} />
      ))}
    </div>
  )
}

function CreateStyleButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create style
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={createStyle}>
          <DialogHeader>
            <DialogTitle>Create a new style</DialogTitle>
            <DialogDescription>
              Start with a blank style. You can import an existing style from JSON later.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              name="name"
              placeholder="Style name"
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function StylesPage() {
  return (
    <div className="container max-w-6xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Styles</h1>
        <CreateStyleButton />
      </div>
      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-48 rounded-lg border bg-muted animate-pulse" />
            ))}
          </div>
        }
      >
        <StyleGrid />
      </Suspense>
    </div>
  )
}
