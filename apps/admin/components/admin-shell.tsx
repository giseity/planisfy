import { cookies } from 'next/headers'
import { AdminShellClient } from '@/components/admin-shell-client'
import type { AdminDeploymentMode } from '@/features/navigation/admin-navigation'

const SIDEBAR_COOKIE_NAME = 'sidebar_state'

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const defaultSidebarOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === 'true'
  const deploymentMode: AdminDeploymentMode =
    process.env.DEPLOYMENT_MODE === 'managed' ? 'managed' : 'self_host'

  return (
    <AdminShellClient defaultSidebarOpen={defaultSidebarOpen} deploymentMode={deploymentMode}>
      {children}
    </AdminShellClient>
  )
}
