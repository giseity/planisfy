import { marketingMetadata } from '../../lib/metadata'
import ClientPage from './client-page'

export const metadata = marketingMetadata({
  title: "Sign In | Planisfy",
  description: "Sign in to your Planisfy account.",
  path: "/sign-in",
})

export default function Page() {
  return <ClientPage />
}
