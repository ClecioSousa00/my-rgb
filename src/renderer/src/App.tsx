import { useEffect } from 'react'
import { useApp } from './store'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { ToastHost } from './components/Toast'
import { LightingPage } from './pages/Lighting'
import { OverviewPage } from './pages/Overview'
import { SystemPage } from './pages/System'
import { SensorsPage } from './pages/Sensors'
import { DisksPage } from './pages/Disks'
import { NetworkPage } from './pages/Network'
import { GamesPage } from './pages/Games'
import { BottleneckPage } from './pages/Bottleneck'
import { OverlayPage } from './pages/Overlay'
import { IntegrationsPage } from './pages/Integrations'
import type { PageId } from '@shared/types'

const PAGES: Record<PageId, () => React.JSX.Element> = {
  overview: OverviewPage,
  lighting: LightingPage,
  system: SystemPage,
  sensors: SensorsPage,
  disks: DisksPage,
  network: NetworkPage,
  games: GamesPage,
  bottleneck: BottleneckPage,
  overlay: OverlayPage,
  integrations: IntegrationsPage
}

export default function App(): React.JSX.Element {
  const ready = useApp((s) => s.ready)
  const init = useApp((s) => s.init)
  const device = useApp((s) => s.device)
  const error = useApp((s) => s.error)
  const reconnect = useApp((s) => s.reconnect)
  const page = useApp((s) => s.page)

  useEffect(() => {
    void init()
  }, [init])

  const Page = PAGES[page]

  return (
    <div className="relative flex h-full flex-col bg-ink-950">
      <TopBar />

      {device?.conflictSuspected && (
        <div className="flex items-center gap-2 border-b border-ink-600 bg-ink-800 px-4 py-2 text-[11.5px] text-ink-100">
          <span className="font-semibold">Possível conflito.</span>
          <span className="text-ink-300">
            Outro programa também está controlando este controlador - isso causa cintilação.
            Desative a iluminação dele para evitar isso.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 border-b border-ink-600 bg-ink-800 px-4 py-2 text-[11.5px] text-ink-100">
          <span className="font-semibold">Problema no dispositivo.</span>
          <span className="flex-1 text-ink-300">{error}</span>
          <button className="btn h-7 px-3" onClick={() => void reconnect()}>
            Reconectar
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <Page />
      </div>

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-950/80 text-[12px] text-ink-400">
          Carregando…
        </div>
      )}

      <ToastHost />
    </div>
  )
}
