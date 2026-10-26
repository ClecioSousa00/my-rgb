/**
 * Global lighting controls.
 *
 * These used to live in the top bar. With the sidebar, the top bar has to
 * stay narrow, and brightness/speed/output only make sense next to the
 * lighting editor - so they moved here without changing behaviour.
 */

import { useApp } from '../store'

export function LightingControls(): React.JSX.Element {
  const profile = useApp((s) => s.profile)
  const engineRunning = useApp((s) => s.engineRunning)
  const toggleEngine = useApp((s) => s.toggleEngine)
  const setGlobal = useApp((s) => s.setGlobal)

  const lightsOn = profile?.global.outputEnabled ?? true

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2">
      <label className="flex items-center gap-2" title="Brilho global">
        <span className="metric-label">Brilho</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={profile?.global.brightness ?? 1}
          className="w-20"
          onChange={(e) => void setGlobal({ brightness: Number(e.target.value) })}
        />
        <span className="w-9 font-mono text-[11px] text-ink-400">
          {Math.round((profile?.global.brightness ?? 1) * 100)}%
        </span>
      </label>

      <label className="flex items-center gap-2" title="Velocidade global">
        <span className="metric-label">Veloc.</span>
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.05}
          value={profile?.global.speed ?? 1}
          className="w-20"
          onChange={(e) => void setGlobal({ speed: Number(e.target.value) })}
        />
        <span className="w-9 font-mono text-[11px] text-ink-400">
          {(profile?.global.speed ?? 1).toFixed(2)}x
        </span>
      </label>

      <div className="h-5 w-px bg-ink-700" />

      <button
        className={`btn ${lightsOn ? 'btn-primary' : ''}`}
        onClick={() => void setGlobal({ outputEnabled: !lightsOn })}
        title="Envia os quadros para o hardware"
      >
        {lightsOn ? 'Luzes ligadas' : 'Luzes desligadas'}
      </button>

      <button
        className="btn btn-ghost"
        onClick={() => void toggleEngine()}
        title={engineRunning ? 'Pausar o motor de efeitos' : 'Retomar o motor de efeitos'}
      >
        {engineRunning ? 'Pausar' : 'Retomar'}
      </button>
    </div>
  )
}
