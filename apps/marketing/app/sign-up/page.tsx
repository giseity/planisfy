import { marketingMetadata } from '../../lib/metadata'
import ClientPage from './client-page'

export const metadata = marketingMetadata({
  title: "Sign Up | Planisfy",
  description: "Create a Planisfy account to start building map infrastructure.",
  path: "/sign-up",
})

export default function Page() {
  return <ClientPage />
}
