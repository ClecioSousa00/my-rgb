import { useApp } from '../store'

export function ZoneRail(): React.JSX.Element {
  const zones = useApp((s) => s.zones)
  const profile = useApp((s) => s.profile)
  const selectedZoneId = useApp((s) => s.selectedZoneId)
  const selectZone = useApp((s) => s.selectZone)
  const setZoneConfig = useApp((s) => s.setZoneConfig)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900/40">
      <div className="panel-header">Zonas</div>

      <div className="flex-1 overflow-y-auto p-2">
        {zones.map((zone) => {
          const config = profile?.zones.find((z) => z.zoneId === zone.id)
          const active = zone.id === selectedZoneId
          const followed = config?.followZoneId
            ? profile?.zones.find((z) => z.zoneId === config.followZoneId)
            : undefined

          return (
            <div
              key={zone.id}
              onClick={() => selectZone(zone.id)}
              className={`mb-1.5 cursor-pointer rounded-lg border p-2.5 transition-colors ${
                active
                  ? 'border-brand-500/60 bg-brand-500/10'
                  : 'border-ink-700 bg-ink-850 hover:border-ink-600'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[12.5px] font-medium ${active ? 'text-ink-100' : 'text-ink-200'}`}>
                  {zone.label}
                </span>
                <input
                  type="checkbox"
                  className="accent-brand-500"
                  checked={config?.enabled ?? false}
                  title="Ativar esta zona"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    void setZoneConfig(zone.id, { enabled: e.target.checked })
                  }
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
                        void setZoneConfig(zone.id, {
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

              {followed && (
                <div className="mt-1.5 text-[10.5px] text-accent-400">
                  seguindo {followed.zoneId === 'mainboard' ? 'onboard' : followed.zoneId}
                </div>
              )}
            </div>
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
              {z.label}
            </option>
          ))}
      </select>
    </div>
  )
}
