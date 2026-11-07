import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { pageTitle } from '../navigation'
import type { AppSettings } from '@shared/types'
import type { AutoUpdateState } from '@shared/api'
import { LOG_LEVELS } from '@shared/logging'
import { showToast } from './Toast'
import { Modal } from './ui/Modal'

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
  const settingsRef = useRef<HTMLDivElement>(null)

  // --- auto-update -------------------------------------------------------

  const [updateState, setUpdateState] = useState<AutoUpdateState>({
    checking: false,
    available: false,
    version: null,
    releaseNotes: null,
    releaseDate: null,
    progress: null,
    error: null,
    downloaded: false,
    canQuitAndInstall: false
  })

  useEffect(() => {
    const unsub = window.myrgb.onAutoUpdateState(setUpdateState)
    return unsub
  }, [])

  const handleCheckForUpdates = async (): Promise<void> => {
    try {
      await window.myrgb.checkForUpdates()
      showToast('A verificação de atualização foi iniciada')
    } catch {
      showToast('Não foi possível verificar atualizações')
    }
  }

  const handleDownloadUpdate = async (): Promise<void> => {
    try {
      await window.myrgb.downloadUpdate()
      showToast('Download da atualização iniciado')
    } catch {
      showToast('Não foi possível iniciar o download')
    }
  }

  const handleQuitAndInstall = async (): Promise<void> => {
    try {
      await window.myrgb.quitAndInstall()
    } catch {
      showToast('Não foi possível instalar a atualização')
    }
  }

  // The settings popover is not a modal, but it must not stay open on top of
  // another page or after a click elsewhere in the bar.
  useEffect(() => {
    if (!showSettings) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!settingsRef.current?.contains(event.target as Node)) setShowSettings(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setShowSettings(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showSettings])

  // Changing pages closes it too: it belongs to the bar, not to the page.
  useEffect(() => {
    setShowSettings(false)
  }, [page])

  const [savePromptOpen, setSavePromptOpen] = useState(false)
  const [savePromptValue, setSavePromptValue] = useState('')
  const [savePromptError, setSavePromptError] = useState<string | null>(null)
  const savePromptInputRef = useRef<HTMLInputElement>(null)

  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  /** Pending "overwrite this profile?" confirmation, with the action to run. */
  const [overwrite, setOverwrite] = useState<{
    name: string
    kind: 'save' | 'rename'
  } | null>(null)

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

  /** Open the folder holding the log and the crash reports. */
  const openLogs = async (): Promise<void> => {
    try {
      const result = await window.myrgb.openLogsFolder()
      // Success needs no message: the file manager is the answer. A failure
      // still tells where the files are, which is the useful part.
      if (result.error) showToast(`Não foi possível abrir a pasta. Registos em ${result.path}`)
    } catch {
      showToast('Não foi possível abrir a pasta de registos')
    }
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
    if (profileNames.includes(trimmed)) {
      // Replaced the native `window.confirm`: the rest of the app uses modals,
      // and this is the decision that overwrites a file.
      setOverwrite({ name: trimmed, kind: 'save' })
      return
    }
    await saveAs(trimmed, false)
  }

  const saveAs = async (trimmed: string, overwrite: boolean): Promise<void> => {
    if (!profile) return
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
    if (profileNames.includes(trimmed)) {
      setOverwrite({ name: trimmed, kind: 'rename' })
      return
    }
    await renameAs(trimmed, false)
  }

  const renameAs = async (trimmed: string, overwrite: boolean): Promise<void> => {
    try {
      await renameProfile(trimmed, overwrite)
      setProfileNames(await window.myrgb.listProfiles())
      setRenameOpen(false)
      showToast(`Perfil renomeado para “${trimmed}”`)
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Não foi possível renomear o perfil.')
    }
  }

  const confirmOverwrite = async (): Promise<void> => {
    const request = overwrite
    setOverwrite(null)
    if (!request) return
    if (request.kind === 'save') await saveAs(request.name, true)
    else await renameAs(request.name, true)
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
      // Electron wraps handler failures ("Error invoking remote method…").
      // Strip that so the message the main process wrote is what the user sees.
      const raw = err instanceof Error ? err.message : String(err)
      showToast(
        raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') ||
          'Erro ao importar perfil'
      )
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

      {/* The profile belongs to the lighting screen. On the other pages there
          is nothing to edit, so the whole group stays out of the header. */}
      {page === 'lighting' && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-ink-400">Perfil</span>
            <select
              className="field w-36"
              value={profile?.name ?? ''}
              onChange={(e) => void handleProfileChange(e.target.value)}
            >
              {profileNames.length === 0 && (
                <option value={profile?.name ?? ''}>{profile?.name}</option>
              )}
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
        </>
      )}

      <div className="relative" ref={settingsRef}>
        <button
          className="btn btn-ghost px-2 text-[18px] leading-none"
          onClick={() => setShowSettings((v) => !v)}
          title="Configurações"
          aria-expanded={showSettings}
          aria-haspopup="dialog"
        >
          ⚙
        </button>

        {showSettings && settings && (
          <>
            <div
              role="dialog"
              aria-label="Configurações"
              className="panel absolute right-0 top-9 z-10 max-h-[calc(100vh-5rem)] w-72 overflow-y-auto p-3 shadow-2xl"
            >
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

            <div className="mb-2">
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

            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">
                Diagnóstico
              </div>
              <div className="rounded-lg border border-ink-700 bg-ink-850/60 p-2">
                <div className="mb-1 text-[11px] text-ink-300">Nível de registo</div>
                <select
                  className="field"
                  aria-label="Nível de registo"
                  value={settings.logLevel ?? 'info'}
                  onChange={(e) =>
                    void updateSetting({ logLevel: e.target.value as AppSettings['logLevel'] })
                  }
                >
                  {LOG_LEVELS.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost mt-2 w-full justify-start px-2 text-[11px]"
                  onClick={() => void openLogs()}
                  title="Pasta com o registo (my-rgb.log) e os relatórios de crash"
                >
                  Abrir pasta de registos
                </button>
              </div>
            </div>
          </div>

          <div className="mb-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">
              Atualizações
            </div>
            <div className="rounded-lg border border-ink-700 bg-ink-850/60 p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] text-ink-300">
                  Verificar atualizações automaticamente
                </span>
                <input
                  type="checkbox"
                  className="accent-brand-500"
                  checked={settings.autoUpdateEnabled ?? true}
                  onChange={(e) =>
                    void updateSetting({ autoUpdateEnabled: e.target.checked })
                  }
                />
              </div>
              <div className="mb-1">
                <button
                  className="btn btn-ghost w-full justify-start px-2 text-[11px]"
                  onClick={() => void handleCheckForUpdates()}
                  disabled={updateState.checking}
                  title="Verificar o GitHub Releases por uma nova versão"
                >
                  {updateState.checking
                    ? 'A verificar…'
                    : 'Verificar agora'}
                </button>
              </div>
              {updateState.available && !updateState.downloaded && (
                <div className="mb-1">
                  <p className="text-[11px] text-ink-200">
                    Versão {updateState.version ?? 'desconhecida'} disponível
                  </p>
                  <button
                    className="btn btn-primary w-full justify-start px-2 text-[11px]"
                    onClick={() => void handleDownloadUpdate()}
                  >
                    Baixar atualização
                  </button>
                </div>
              )}
              {updateState.downloaded && updateState.canQuitAndInstall && (
                <div className="mb-1">
                  <p className="text-[11px] text-ink-200">
                    Atualização {updateState.version ?? 'desconhecida'} pronta
                  </p>
                  <button
                    className="btn btn-primary w-full justify-start px-2 text-[11px]"
                    onClick={() => void handleQuitAndInstall()}
                  >
                    Instalar e reiniciar
                  </button>
                </div>
              )}
              {updateState.progress != null && (
                <div className="mb-1">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-ink-300">A baixar</span>
                    <span className="text-ink-300">
                      {Math.round(updateState.progress)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-ink-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${updateState.progress}%` }}
                    />
                  </div>
                </div>
              )}
              {updateState.error && (
                <div className="mb-1">
                  <p className="text-[11px] text-bad-500">
                    {updateState.error}
                  </p>
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </div>

      {savePromptOpen && (
        <Modal
          title="Salvar perfil"
          description="Informe o nome do perfil. Se já existir, você pode optar por sobrescrever."
          onClose={() => setSavePromptOpen(false)}
        >
          <input
            ref={savePromptInputRef}
            className="field"
            value={savePromptValue}
            aria-label="Nome do perfil"
            onChange={(e) => {
              setSavePromptValue(e.target.value)
              setSavePromptError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void confirmSavePrompt()
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
        </Modal>
      )}

      {renameOpen && (
        <Modal title="Renomear perfil" onClose={() => setRenameOpen(false)}>
          <input
            ref={renameInputRef}
            className="field"
            value={renameValue}
            aria-label="Novo nome do perfil"
            onChange={(e) => {
              setRenameValue(e.target.value)
              setRenameError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void confirmRename()
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
        </Modal>
      )}
      {overwrite && (
        <Modal
          title="Sobrescrever perfil?"
          description={`Já existe um perfil chamado “${overwrite.name}”. O conteúdo atual desse perfil será substituído.`}
          onClose={() => setOverwrite(null)}
        >
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setOverwrite(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={() => void confirmOverwrite()}>
              Sobrescrever
            </button>
          </div>
        </Modal>
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
