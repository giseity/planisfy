import { Badge } from "@planisfy/ui/components/badge"
import {
  Database,
  FilePlus,
  KeyRound,
  Palette,
  Search,
  Upload,
} from "lucide-react"

const sections = [
  {
    label: "Navigation",
    items: [
      { icon: Palette, label: "Styles", hint: "Studio" },
      { icon: Database, label: "Tilesets", hint: "Studio" },
      { icon: KeyRound, label: "API Keys", hint: "Developers" },
    ],
  },
  {
    label: "Actions",
    items: [
      { icon: FilePlus, label: "Create new style", hint: "Cmd+N" },
      { icon: Upload, label: "Upload tileset", hint: "" },
      { icon: KeyRound, label: "Generate API key", hint: "" },
    ],
  },
  {
    label: "Recent",
    items: [
      { icon: Palette, label: "Satellite Streets", hint: "Style v3" },
      { icon: Database, label: "Buildings USA", hint: "Tileset v3" },
    ],
  },
]

export default function CommandPalettePage() {
  return (
    <div className="flex min-h-[620px] items-center justify-center rounded-lg border bg-muted/30 p-6">
      <div className="w-full max-w-xl overflow-hidden rounded-xl border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 text-sm text-muted-foreground">Search pages, actions, resources...</span>
          <Badge variant="secondary">ESC</Badge>
        </div>
        <div className="py-2">
          {sections.map((section) => (
            <div key={section.label} className="py-1">
              <p className="px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
                {section.label}
              </p>
              {section.items.map((item, index) => (
                <div
                  key={item.label}
                  className={
                    index === 0 && section.label === "Navigation"
                      ? "flex items-center gap-3 bg-muted px-4 py-2"
                      : "flex items-center gap-3 px-4 py-2"
                  }
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex gap-4 border-t px-4 py-3 text-xs text-muted-foreground">
          <span>Arrow keys Navigate</span>
          <span>Enter Open</span>
          <span>ESC Close</span>
        </div>
      </div>
    </div>
  )
}
