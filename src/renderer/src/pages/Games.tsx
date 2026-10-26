import type { PageId } from '@shared/types'
import { PagePlaceholder } from '../components/PagePlaceholder'

const PAGE: PageId = 'games'

export function GamesPage(): React.JSX.Element {
  return <PagePlaceholder page={PAGE} />
}
