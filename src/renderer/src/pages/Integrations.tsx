import type { PageId } from '@shared/types'
import { PagePlaceholder } from '../components/PagePlaceholder'

const PAGE: PageId = 'integrations'

export function IntegrationsPage(): React.JSX.Element {
  return <PagePlaceholder page={PAGE} />
}
