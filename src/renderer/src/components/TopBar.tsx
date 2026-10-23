import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import type { AppSettings } from '@shared/types'
import { showToast } from './Toast'

export function TopBar(): React.JSX.Element {
  const device = useApp((s) => s.device)
  const profile = useApp((s) => s.profile)
  const engineRunning = useApp((s) => s.engineRunning)
  const toggleEngine = useApp((s) => s.toggleEngine)
  const setGlobal = useApp((s) => s.setGlobal)
  const loadProfile = useApp((s) => s.loadProfile)
  const duplicateProfile = useApp((s) => s.duplicateProfile)
  const renameProfile = useApp((s) => s.renameProfile)
  const saveProfile = useApp((s) => s.saveProfile)
  const exportProfile = useApp((s) => s.exportProfile)
  const importProfile = useApp((s) => s.importProfile)

  const [profileNames, setProfileNames] = useState<string[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const dirty = useApp((s) => s.dirty)

  const [savePromptOpen, setSavePromptOpen] = useState(false)
  const [savePromptValue, setSavePromptValue] = useState('')
  const [savePromptError, setSavePromptError] = useState<string | null>(null)
  const savePromptInputRef = useRef<HTMLInputElement>(null)

  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.myrgb.listProfiles().then(setProfileNames)
    void window.myrgb.getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    void window.myrgb.listProfiles().then(setProfileNames)
  }, [profile?.name])

  useEffect(() => {
    void window.myrgb.listProfiles().then(setProfileNames)
  }, [])

  useEffect(() => {
    if (savePromptOpen) {
      setSavePromptValue(profile ? profile.name : '')
      setSavePromptError(null)
      setTimeout(() => savePromptInputRef.current?.select(), 0)
    }
  }, [savePromptOpen, profile])

  useEffect(() => {
    if (renameOpen && profile) {
      setRenameValue(profile.name)
      setTimeout(() => renameInputRef.current?.select(), 0)
    }
  }, [renameOpen, profile])

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
    setSavePromptValue(profile.name)
    setSavePromptError(null)
    setSavePromptOpen(true)
  }

  const confirmSavePrompt = async (): Promise<void> => {
    if (!profile) return
    const trimmed = savePromptValue.trim()
    if (!trimmed) {
      setSavePromptError('Digite um nome para o perfil.')
      return
    }
    if (trimmed === profile.name) {
      await saveProfile(profile)
      setSavePromptOpen(false)
      showToast('Perfil salvo')
      return
    }
    if (profileNames.includes(trimmed)) {
      const overwrite = window.confirm(`Já existe um perfil "${trimmed}". Sobrescrever?`)
      if (!overwrite) {
        setSavePromptError('Já existe um perfil com esse nome.')
        return
      }
    }
    await renameProfile(trimmed)
    await saveProfile({ ...profile, name: trimmed })
    setProfileNames(await window.myrgb.listProfiles())
    setSavePromptOpen(false)
    showToast('Perfil salvo')
  }

  const handleRename = async (): Promise<void> => {
    if (!profile) return
    setRenameOpen(true)
  }

  const confirmRename = async (): Promise<void> => {
    if (!profile) return
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === profile.name) {
      setRenameOpen(false)
      return
    }
    await renameProfile(trimmed)
    setProfileNames(await window.myrgb.listProfiles())
    setRenameOpen(false)
    showToast(`Perfil renomeado para “${trimmed}”`)
  }

  const handleExport = async (): Promise<void> => {
    try {
      const path = await exportProfile()
      if (path) showToast('Perfil exportado')
      else showToast('Exportação cancelada')
    } catch (err) {
      showToast('Erro ao exportar perfil')
    }
  }

  const handleImport = async (): Promise<void> => {
    try {
      const imported = await importProfile()
      if (imported) {
        const names = await window.myrgb.listProfiles()
        setProfileNames(names)
        await handleProfileChange(imported.name)
        setProfileNames(await window.myrgb.listProfiles())
        showToast('Perfil importado')
      }
    } catch (err) {
      showToast('Erro ao importar perfil')
    }
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
        <button
          className="btn btn-primary"
          onClick={() => void handleSave()}
          title="Salvar alterações no perfil atual por cima deste arquivo"
        >
          Salvar
        </button>

        <button
          className="btn btn-ghost"
          onClick={() => void handleRename()}
          title="Renomear este perfil"
        >
          ✎
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => void handleExport()}
          title="Exportar perfil para arquivo"
        >
          Exportar
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => void handleImport()}
          title="Importar perfil de arquivo"
        >
          Importar
        </button>
        {dirty && (
          <span
            className="chip border-transparent bg-warn-500/10 text-warn-500"
            title="Alterações pendentes. O perfil é salvo automaticamente no disco após alguns instantes. Use 'Salvar' para renomear ou criar uma cópia."
          >
            ● alterações pendentes
          </span>
        )}
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
            <div className="mt-2">
              <div className="mb-1 text-[10.5px] uppercase tracking-wider text-ink-400">Perfil ao iniciar</div>
              <select
                className="field"
                value={settings.startupProfile || ''}
                onChange={(e) => void updateSetting({ startupProfile: e.target.value || null })}
              >
                <option value="">Usar último perfil</option>
                {profileNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {savePromptOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <div className="panel w-80 p-4 shadow-2xl">
            <div className="mb-2 text-sm font-semibold">Salvar perfil</div>
            <div className="mb-1 text-[11px] text-ink-400">
              Informe o nome do perfil. Se já existir, você pode optar por sobrescrever.
            </div>
            <input
              ref={savePromptInputRef}
              className="field"
              value={savePromptValue}
              onChange={(e) => {
                setSavePromptValue(e.target.value)
                setSavePromptError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmSavePrompt()
                if (e.key === 'Escape') setSavePromptOpen(false)
              }}
            />
            {savePromptError && <div className="mt-1 text-[11px] text-bad-500">{savePromptError}</div>}
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setSavePromptOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={() => void confirmSavePrompt()}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {renameOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
          <div className="panel w-80 p-4 shadow-2xl">
            <div className="mb-2 text-sm font-semibold">Renomear perfil</div>
            <input
              ref={renameInputRef}
              className="field"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmRename()
                if (e.key === 'Escape') setRenameOpen(false)
              }}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setRenameOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={() => void confirmRename()}>
                Renomear
              </button>
            </div>
          </div>
        </div>
      )}
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

/** Suggests a free name for a copy of a profile. */
function suggestProfileName(current: string): string {
  const base = current.replace(/\s+cópia(\s+\d+)?$/i, '').trim() || current
  return `${base} cópia`
}
