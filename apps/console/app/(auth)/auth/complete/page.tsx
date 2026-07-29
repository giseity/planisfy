import { consoleMetadata } from '../../../../lib/metadata'
import ClientPage from './client-page'

export const metadata = consoleMetadata({
  title: 'Opening your workspace',
  description: 'Apply your saved Planisfy Console landing preference.',
  path: '/auth/complete',
})

export default function Page() {
  return <ClientPage />
}
