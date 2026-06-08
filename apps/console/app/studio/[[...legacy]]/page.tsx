import { redirect } from "next/navigation"
import { legacyStudioPathToCanonical } from "@/lib/console-navigation"

export default async function LegacyStudioRedirectPage({
  params,
}: {
  params: Promise<{ legacy?: string[] }>
}) {
  const { legacy = [] } = await params
  redirect(legacyStudioPathToCanonical(legacy))
}
