import type { PageId } from '@shared/types'
import { PagePlaceholder } from '../components/PagePlaceholder'

const PAGE: PageId = 'disks'

export function DisksPage(): React.JSX.Element {
  return <PagePlaceholder page={PAGE} />
}
