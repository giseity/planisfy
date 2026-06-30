import { cookies } from 'next/headers'
import { AdminShellClient } from '@/components/admin-shell-client'

const SIDEBAR_COOKIE_NAME = 'sidebar_state'

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const defaultSidebarOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === 'true'

  return <AdminShellClient defaultSidebarOpen={defaultSidebarOpen}>{children}</AdminShellClient>
}
