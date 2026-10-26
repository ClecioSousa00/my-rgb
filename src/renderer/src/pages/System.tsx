import type { PageId } from '@shared/types'
import { PagePlaceholder } from '../components/PagePlaceholder'

const PAGE: PageId = 'system'

export function SystemPage(): React.JSX.Element {
  return <PagePlaceholder page={PAGE} />
}
