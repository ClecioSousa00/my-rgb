import { useEffect, useState } from 'react'
import { useApp } from '../store'
import type { AppSettings } from '@shared/types'

const FPS_OPTIONS = [15, 20, 30, 60]

export function TopBar(): React.JSX.Element {
  const device = useApp((s) => s.device)
  const profile = useApp((s) => s.profile)
  const engineRunning = useApp((s) => s.engineRunning)
  const toggleEngine = useApp((s) => s.toggleEngine)
  const setGlobal = useApp((s) => s.setGlobal)
  const loadProfile = useApp((s) => s.loadProfile)
  const saveProfile = useApp((s) => s.saveProfile)
  const duplicateProfile = useApp((s) => s.duplicateProfile)
  const renameProfile = useApp((s) => s.renameProfile)

  const [profileNames, setProfileNames] = useState<string[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    void window.myrgb.listProfiles().then(setProfileNames)
    void window.myrgb.getSettings().then(setSettings)
  }, [])

  const updateSetting = async (patch: Partial<AppSettings>): Promise<void> => {
    setSettings(await window.myrgb.setSettings(patch))
  }

  const connected = device?.connected ?? false
  const lightsOn = profile?.global.outputEnabled ?? true

  const handleProfileChange = async (name: string): Promise<void> => {
    await loadProfile(name)
    setProfileNames(await window.myrgb.listProfiles())
  }

  const handleSave = async (): Promise<void> => {
    if (!profile) return
    await saveProfile(profile)
    setProfileNames(await window.myrgb.listProfiles())
  }

  const handleDuplicate = async (): Promise<void> => {
    if (!profile) return
    const name = window.prompt('Nome do novo perfil', `${profile.name} cópia`)
    if (name === null) return
    await duplicateProfile(name)
    setProfileNames(await window.myrgb.listProfiles())
  }

  const handleRename = async (): Promise<void> => {
    if (!profile) return
    const name = window.prompt('Renomear perfil', profile.name)
    if (name === null || name === profile.name) return
    await renameProfile(name)
    setProfileNames(await window.myrgb.listProfiles())
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-ink-700 bg-ink-900/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <div
          className="h-6 w-6 rounded-md"
          style={{
            background: 'linear-gradient(135deg,#7c5cff 0%,#00d4ff 50%,#29d67f 100%)'
          }}
        />
        <span className="text-[15px] font-semibold tracking-tight">MyRGB</span>
      </div>

      <div className="h-6 w-px bg-ink-700" />

      {/* device status */}
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? 'bg-good-500 animate-pulse-dot' : 'bg-bad-500'
          }`}
        />
        <span className="text-[12px] text-ink-300">
          {connected ? (device?.firmware || 'AURA USB') : 'Sem dispositivo'}
        </span>
        {device?.conflictSuspected && (
          <span
            className="chip border-warn-500/40 bg-warn-500/10 text-warn-500"
            title="Outro programa pode estar controlando o mesmo controlador"
          >
            conflito
          </span>
        )}
      </div>

      <div className="flex-1" />

      {/* profile */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-ink-400">Perfil</span>
        <select
          className="field w-36"
          value={profile?.name ?? ''}
          onChange={(e) => void handleProfileChange(e.target.value)}
        >
          {profileNames.length === 0 && <option value={profile?.name ?? ''}>{profile?.name}</option>}
          {profileNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => void handleSave()}>
          Salvar
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => void handleDuplicate()}
          title="Criar uma cópia deste perfil"
        >
          ⧉
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => void handleRename()}
          title="Renomear este perfil"
        >
          ✎
        </button>
      </div>

      <div className="h-6 w-px bg-ink-700" />

      {/* global controls */}
      <label className="flex items-center gap-2" title="Brilho global">
        <span className="text-[11px] uppercase tracking-wider text-ink-400">Brilho</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={profile?.global.brightness ?? 1}
          className="w-20"
          onChange={(e) => void setGlobal({ brightness: Number(e.target.value) })}
        />
        <span className="w-8 font-mono text-[11px] text-ink-400">
          {Math.round((profile?.global.brightness ?? 1) * 100)}%
        </span>
      </label>

      <label className="flex items-center gap-2" title="Velocidade global">
        <span className="text-[11px] uppercase tracking-wider text-ink-400">Veloc.</span>
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.05}
          value={profile?.global.speed ?? 1}
          className="w-20"
          onChange={(e) => void setGlobal({ speed: Number(e.target.value) })}
        />
        <span className="w-8 font-mono text-[11px] text-ink-400">
          {(profile?.global.speed ?? 1).toFixed(2)}x
        </span>
      </label>

      <select
        className="field w-16"
        value={profile?.global.fps ?? 30}
        onChange={(e) => void setGlobal({ fps: Number(e.target.value) })}
        title="Quadros por segundo"
      >
        {FPS_OPTIONS.map((fps) => (
          <option key={fps} value={fps}>
            {fps} fps
          </option>
        ))}
      </select>

      <div className="h-6 w-px bg-ink-700" />

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

      <div className="relative">
        <button
          className="btn btn-ghost"
          onClick={() => setShowSettings((v) => !v)}
          title="Configurações"
        >
          ⚙
        </button>

        {showSettings && settings && (
          <div className="panel absolute right-0 top-9 z-50 w-72 p-3 shadow-2xl">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">
              Configurações
            </div>

            <SettingToggle
              label="Iniciar o motor ao abrir"
              checked={settings.autoStart}
              onChange={(v) => void updateSetting({ autoStart: v })}
            />
            <SettingToggle
              label="Iniciar com o sistema"
              checked={settings.autostartAtLogin}
              onChange={(v) => void updateSetting({ autostartAtLogin: v })}
            />
            <SettingToggle
              label="Minimizar para a bandeja"
              checked={settings.minimizeToTray}
              onChange={(v) => void updateSetting({ minimizeToTray: v })}
            />
            <SettingToggle
              label="Abrir com as luzes apagadas"
              checked={settings.startWithLightingOff}
              onChange={(v) => void updateSetting({ startWithLightingOff: v })}
            />
          </div>
        )}
      </div>
    </header>
  )
}

function SettingToggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-[12px] text-ink-300">{label}</span>
      <input
        type="checkbox"
        className="accent-brand-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
