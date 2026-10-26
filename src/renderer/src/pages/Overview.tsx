import type { PageId } from '@shared/types'
import { PagePlaceholder } from '../components/PagePlaceholder'

const PAGE: PageId = 'overview'

export function OverviewPage(): React.JSX.Element {
  return <PagePlaceholder page={PAGE} />
}
