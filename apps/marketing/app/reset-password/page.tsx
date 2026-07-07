import { marketingMetadata } from '../../lib/metadata'
import ClientPage from './client-page'

export const metadata = marketingMetadata({
  title: "Reset Password | Planisfy",
  description: "Recover access to your Planisfy account.",
  path: "/reset-password",
})

export default function Page() {
  return <ClientPage />
}
