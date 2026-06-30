import { cookies } from 'next/headers'
import { StudioShell } from '@/components/shell/studio-shell'

const SIDEBAR_COOKIE_NAME = 'sidebar_state'

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const defaultSidebarOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === 'true'

  return <StudioShell defaultSidebarOpen={defaultSidebarOpen}>{children}</StudioShell>
}
