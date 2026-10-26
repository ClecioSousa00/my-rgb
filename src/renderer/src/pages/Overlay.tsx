import type { PageId } from '@shared/types'
import { PagePlaceholder } from '../components/PagePlaceholder'

const PAGE: PageId = 'overlay'

export function OverlayPage(): React.JSX.Element {
  return <PagePlaceholder page={PAGE} />
}
