import { useEffect, useRef, useState } from 'react'
import { useApp, zoneDisplayName } from '../store'
import { HelpTip } from './HelpTip'
import { showToast } from './Toast'
import type { ZoneConfig, ZoneState } from '@shared/types'

export function ZoneRail(): React.JSX.Element {
  const zones = useApp((s) => s.zones)
  const profile = useApp((s) => s.profile)
  const selectedZoneId = useApp((s) => s.selectedZoneId)
  const selectZone = useApp((s) => s.selectZone)
  const setZoneConfig = useApp((s) => s.setZoneConfig)
  const setGlobal = useApp((s) => s.setGlobal)

  const configFor = (zoneId: string): ZoneConfig | undefined =>
    profile?.zones.find((z) => z.zoneId === zoneId)

  const applyToAllZones = profile?.global?.applyToAllZones ?? false

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900/40">
      <div className="panel-header">
        <span className="flex items-center gap-1.5">
          Zonas
          <HelpTip text="Cada zona é uma parte física da placa. O número é quantos LEDs aquele header tem - o controlador não conta isso, então você informa. Desmarque a caixa para apagar a zona. Em 'Seguir zona' você faz esta zona espelhar o efeito de outra." />
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {zones.length > 1 && (
          <label className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2">
            <span className="text-[11.5px] text-ink-300">Aplicar a todas as zonas</span>
            <input
              type="checkbox"
              className="accent-brand-500"
              checked={applyToAllZones}
              title="Ao marcar, qualquer efeito escolhido será aplicado a todas as zonas ao mesmo tempo."
              onChange={(e) => void setGlobal({ applyToAllZones: e.target.checked })}
            />
          </label>
        )}

        {zones.map((zone) => {
          const config = configFor(zone.id)
          const active = zone.id === selectedZoneId
          const followed = config?.followZoneId
            ? profile?.zones.find((z) => z.zoneId === config.followZoneId)
            : undefined
          const followedZone = followed
            ? zones.find((z) => z.id === followed.zoneId)
            : undefined

          return (
            <ZoneCard
              key={zone.id}
              zone={zone}
              config={config}
              active={active}
              followedName={
                followedZone ? zoneDisplayName(followedZone, followed) : undefined
              }
              onSelect={() => selectZone(zone.id)}
              onConfig={(patch) => void setZoneConfig(zone.id, patch)}
            />
          )
        })}

        {zones.length === 0 && (
          <p className="px-2 py-4 text-[11.5px] leading-relaxed text-ink-400">
            Nenhum dispositivo AURA encontrado. Conecte o controlador ou verifique as permissões do
            dispositivo.
          </p>
        )}
      </div>

      <ZoneFollowPicker />
    </aside>
  )
}

function ZoneCard({
  zone,
  config,
  active,
  followedName,
  onSelect,
  onConfig
}: {
  zone: ZoneState
  config: ZoneConfig | undefined
  active: boolean
  followedName: string | undefined
  onSelect: () => void
  onConfig: (patch: Partial<ZoneConfig>) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  /** Enter commits and then blurs the input, so the commit must happen once. */
  const committing = useRef(false)

  const displayName = zoneDisplayName(zone, config)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEditing = (): void => {
    committing.current = false
    setDraft(config?.name ?? '')
    setEditing(true)
  }

  const commit = (): void => {
    if (committing.current) return
    committing.current = true
    const trimmed = draft.trim()
    setEditing(false)
    // An empty name means "go back to the name the hardware reports".
    if (trimmed === (config?.name ?? '')) return
    onConfig({ name: trimmed })
  }

  const cancel = (): void => {
    setEditing(false)
  }

  return (
    <div
      onClick={onSelect}
      className={`mb-1.5 cursor-pointer rounded-lg border p-2.5 transition-colors ${
        active
          ? 'border-brand-500/60 bg-brand-500/10'
          : 'border-ink-700 bg-ink-850 hover:border-ink-600'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <input
            ref={inputRef}
            className="field h-6 min-w-0 flex-1 px-1.5 py-0 text-[12px]"
            value={draft}
            placeholder={zone.label}
            maxLength={40}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancel()
              }
            }}
          />
        ) : (
          <span
            className={`min-w-0 flex-1 truncate text-[12.5px] font-medium ${
              active ? 'text-ink-100' : 'text-ink-200'
            }`}
            title={config?.name ? `${displayName} (padrão: ${zone.label})` : displayName}
          >
            {displayName}
          </span>
        )}

        {!editing && (
          <button
            className="shrink-0 rounded px-1 text-[13px] text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-200"
            title="Renomear esta zona"
            onClick={(e) => {
              e.stopPropagation()
              startEditing()
            }}
          >
            ✎
          </button>
        )}

        <input
          type="checkbox"
          className="accent-brand-500"
          checked={config?.enabled ?? false}
          title="Ativar esta zona"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void onConfig({ enabled: e.target.checked })}
        />
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        {zone.kind === 'addressable' ? (
          <>
            <input
              type="number"
              className="field h-6 w-14 px-1.5 py-0 text-[11px]"
              min={0}
              max={zone.maxLedCount}
              value={config?.ledCount ?? 0}
              title="Quantidade de LEDs neste header"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                void onConfig({
                  ledCount: Math.max(0, Math.min(zone.maxLedCount, Number(e.target.value)))
                })
              }
            />
            <span className="text-[10.5px] text-ink-400">/ {zone.maxLedCount} LEDs</span>
          </>
        ) : (
          <span className="text-[10.5px] text-ink-400">
            {zone.maxLedCount} LED fixo onboard
          </span>
        )}
      </div>

      {followedName && (
        <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-accent-400">
          <span className="rounded-full bg-accent-400/15 px-1.5 py-0.5">↷ seguindo {followedName}</span>
        </div>
      )}
    </div>
  )
}

/** Lets the selected zone mirror another zone instead of holding its own effect. */
function ZoneFollowPicker(): React.JSX.Element {
  const zones = useApp((s) => s.zones)
  const profile = useApp((s) => s.profile)
  const selectedZoneId = useApp((s) => s.selectedZoneId)
  const setZoneConfig = useApp((s) => s.setZoneConfig)

  const config = profile?.zones.find((z) => z.zoneId === selectedZoneId)
  const value = config?.followZoneId ?? ''

  return (
    <div className="border-t border-ink-700 p-3">
      <label className="mb-1 block text-[10.5px] uppercase tracking-wider text-ink-400">
        Seguir zona
      </label>
      <select
        className="field"
        value={value}
        onChange={(e) =>
          void setZoneConfig(selectedZoneId, {
            followZoneId: e.target.value || null,
            enabled: e.target.value ? true : (config?.enabled ?? false)
          })
        }
      >
        <option value="">— efeito próprio —</option>
        {zones
          .filter((z) => z.id !== selectedZoneId)
          .map((z) => (
            <option key={z.id} value={z.id}>
              {zoneDisplayName(z, profile?.zones.find((c) => c.zoneId === z.id))}
            </option>
          ))}
      </select>
    </div>
  )
}
