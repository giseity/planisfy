"use client"

import { Settings } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="container max-w-6xl py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Settings className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">Coming soon</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Profile, account, and billing settings will be available here.
        </p>
      </div>
    </div>
  )
}
