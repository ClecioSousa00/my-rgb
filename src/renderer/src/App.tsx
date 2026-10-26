import { useEffect } from 'react'
import { useApp } from './store'
import { TopBar } from './components/TopBar'
import { ZoneRail } from './components/ZoneRail'
import { StripPreview } from './components/StripPreview'
import { PatternPicker } from './components/PatternPicker'
import { GradientEditor } from './components/GradientEditor'
import { ParamSliders } from './components/ParamSliders'
import { ToastHost } from './components/Toast'

export default function App(): React.JSX.Element {
  const ready = useApp((s) => s.ready)
  const init = useApp((s) => s.init)
  const device = useApp((s) => s.device)
  const error = useApp((s) => s.error)
  const reconnect = useApp((s) => s.reconnect)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="relative flex h-full flex-col bg-ink-950">
      <TopBar />

      {device?.conflictSuspected && (
        <div className="flex items-center gap-2 border-b border-warn-500/30 bg-warn-500/10 px-4 py-2 text-[11.5px] text-warn-500">
          <span className="font-semibold">Possível conflito.</span>
          <span className="text-ink-300">
            Outro programa também está controlando este controlador - isso causa cintilação.
            Desative a iluminação dele para evitar isso.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 border-b border-bad-500/30 bg-bad-500/10 px-4 py-2 text-[11.5px] text-bad-500">
          <span className="font-semibold">Problema no dispositivo.</span>
          <span className="flex-1 text-ink-300">{error}</span>
          <button className="btn h-7 px-3" onClick={() => void reconnect()}>
            Reconectar
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <ZoneRail />

        <main className="flex min-w-0 flex-1 flex-col gap-3 p-3">
          <StripPreview />

          <div className="flex min-h-0 flex-1 gap-3">
            <PatternPicker />

            <div className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto">
              <GradientEditor />
              <ParamSliders />
            </div>
          </div>
        </main>
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
