import type { PageId } from '@shared/types'
import { PagePlaceholder } from '../components/PagePlaceholder'

const PAGE: PageId = 'bottleneck'

export function BottleneckPage(): React.JSX.Element {
  return <PagePlaceholder page={PAGE} />
}
