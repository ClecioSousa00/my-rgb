import type { PageId } from '@shared/types'
import { PagePlaceholder } from '../components/PagePlaceholder'

const PAGE: PageId = 'network'

export function NetworkPage(): React.JSX.Element {
  return <PagePlaceholder page={PAGE} />
}
