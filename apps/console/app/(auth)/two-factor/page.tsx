import { consoleMetadata } from '../../../lib/metadata'
import ClientPage from './client-page'

export const metadata = consoleMetadata({
  title: 'Two-factor authentication',
  description: 'Complete two-factor verification to continue to Planisfy Console.',
  path: '/two-factor',
})

export default function Page() {
  return <ClientPage />
}
