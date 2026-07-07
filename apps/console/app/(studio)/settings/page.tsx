import { consoleMetadata } from "../../../lib/metadata";

export const metadata = consoleMetadata({
  title: "Settings",
  description: "Update personal Planisfy Console settings.",
  path: "/settings",
});

import { redirect } from "next/navigation"

export default function SettingsPage() {
  redirect("/settings/profile")
}
