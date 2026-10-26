import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { pageTitle } from '../navigation'
import type { AppSettings } from '@shared/types'
import { showToast } from './Toast'

export function TopBar(): React.JSX.Element {
  const device = useApp((s) => s.device)
  const profile = useApp((s) => s.profile)
  const page = useApp((s) => s.page)
  const loadProfile = useApp((s) => s.loadProfile)
  const renameProfile = useApp((s) => s.renameProfile)
  const saveProfile = useApp((s) => s.saveProfile)
  const exportProfile = useApp((s) => s.exportProfile)
  const importProfile = useApp((s) => s.importProfile)

  const [profileNames, setProfileNames] = useState<string[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const [savePromptOpen, setSavePromptOpen] = useState(false)
  const [savePromptValue, setSavePromptValue] = useState('')
  const [savePromptError, setSavePromptError] = useState<string | null>(null)
  const savePromptInputRef = useRef<HTMLInputElement>(null)

  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.myrgb.listProfiles().then(setProfileNames)
    void window.myrgb.getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    void window.myrgb.listProfiles().then(setProfileNames)
  }, [profile?.name])

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
      setRenameError(null)
      setTimeout(() => renameInputRef.current?.select(), 0)
    }
  }, [renameOpen, profile])

  const updateSetting = async (patch: Partial<AppSettings>): Promise<void> => {
    setSettings(await window.myrgb.setSettings(patch))
  }

  const connected = device?.connected ?? false

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
    let overwrite = false
    if (profileNames.includes(trimmed)) {
      overwrite = window.confirm(`Já existe um perfil "${trimmed}". Sobrescrever?`)
      if (!overwrite) {
        setSavePromptError('Já existe um perfil com esse nome.')
        return
      }
    }
    try {
      await renameProfile(trimmed, overwrite)
      await saveProfile({ ...profile, name: trimmed })
      setProfileNames(await window.myrgb.listProfiles())
      setSavePromptOpen(false)
      showToast('Perfil salvo')
    } catch (err) {
      setSavePromptError(err instanceof Error ? err.message : 'Não foi possível salvar o perfil.')
    }
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
    let overwrite = false
    if (profileNames.includes(trimmed)) {
      overwrite = window.confirm(`Já existe um perfil "${trimmed}". Sobrescrever?`)
      if (!overwrite) {
        setRenameError('Já existe um perfil com esse nome.')
        return
      }
    }
    try {
      await renameProfile(trimmed, overwrite)
      setProfileNames(await window.myrgb.listProfiles())
      setRenameOpen(false)
      showToast(`Perfil renomeado para “${trimmed}”`)
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Não foi possível renomear o perfil.')
    }
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
        showToast(`Perfil importado como “${imported.name}”`)
      }
    } catch (err) {
      showToast('Erro ao importar perfil')
    }
  }

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-4 border-b border-ink-700 bg-ink-950 px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-ink-100 font-mono text-[12px] font-bold text-black">
          M
        </div>
        <span className="text-[14px] font-semibold tracking-tight">MyRGB</span>
      </div>

      <div className="h-5 w-px bg-ink-700" />

      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {pageTitle(page)}
      </span>

      <div className="h-5 w-px bg-ink-700" />

      {/* device status: filled dot = connected, hollow ring = missing */}
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? 'animate-pulse-dot bg-ink-100' : 'border border-ink-100'
          }`}
        />
        <span className="text-[12px] text-ink-300">
          {connected ? (device?.firmware || 'AURA USB') : 'Sem dispositivo'}
        </span>
        {device?.conflictSuspected && (
          <span
            className="chip border-ink-500 text-ink-200"
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

      </div>

      <div className="h-5 w-px bg-ink-700" />

      <div className="relative">
        <button
          className="btn btn-ghost px-2 text-[18px] leading-none"
          onClick={() => setShowSettings((v) => !v)}
          title="Configurações"
        >
          ⚙
        </button>

        {showSettings && settings && (
          <div className="panel absolute right-0 top-9 z-10 w-72 p-3 shadow-2xl">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">
              Configurações
            </div>

            <div className="mb-2">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">Inicialização</div>
              <div className="rounded-lg border border-ink-700 bg-ink-850/60 p-2">
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
              </div>
            </div>

            <div className="mb-2">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">Comportamento</div>
              <div className="rounded-lg border border-ink-700 bg-ink-850/60 p-2">
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
            </div>

            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">Perfis</div>
              <div className="rounded-lg border border-ink-700 bg-ink-850/60 p-2">
                <div className="mb-1 text-[11px] text-ink-300">Perfil ao iniciar</div>
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
              onChange={(e) => {
                setRenameValue(e.target.value)
                setRenameError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmRename()
                if (e.key === 'Escape') setRenameOpen(false)
              }}
            />
            {renameError && <div className="mt-1 text-[11px] text-bad-500">{renameError}</div>}
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
