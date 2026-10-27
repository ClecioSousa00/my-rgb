/**
 * Overlay.
 *
 * Two switches in one page: the window itself (on/off, shortcut, screen) and
 * what it shows (metrics, size, opacity, corner). Everything is saved in the
 * app settings, so the overlay comes back after a restart.
 *
 * The FPS is the one part that depends on the platform: on Windows it comes
 * from the elevated helper; on Linux the overlay still works for sensors and
 * this page says why FPS is missing instead of showing a fake number.
 */

import { useCallback, useEffect, useState } from 'react'
import type {
  OverlayConfig,
  OverlayGroup,
  OverlayItemKey,
  OverlayState
} from '@shared/features/overlay'
import {
  DEFAULT_OVERLAY_SHORTCUT,
  FPS_IDLE_NOTE,
  OVERLAY_CORNERS,
  OVERLAY_GROUPS,
  OVERLAY_METRICS,
  OVERLAY_OPACITY_OPTIONS,
  OVERLAY_SCALES,
  OVERLAY_SCALE_LABEL,
  formatAccelerator
} from '@shared/features/overlay'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { showToast } from '../components/Toast'

const CORNER_SHORT: Record<string, string> = {
  tl: 'Superior esquerdo',
  tr: 'Superior direito',
  bl: 'Inferior esquerdo',
  br: 'Inferior direito'
}

function defaultItems(): OverlayItemKey[] {
  return OVERLAY_METRICS.filter((metric) => metric.default).map((metric) => metric.key)
}

/** Electron accelerator names for the keys a shortcut may use. */
function acceleratorKey(event: React.KeyboardEvent): string | undefined {
  const code = event.code
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^F\d{1,2}$/.test(code)) return code
  const named: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Space: 'Space',
    Escape: 'Escape',
    Enter: 'Return',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Backquote: '`'
  }
  return named[code]
}

/** Ctrl/Cmd + at least one more key, the shape Electron demands. */
function acceleratorFor(event: React.KeyboardEvent): string | undefined {
  const key = acceleratorKey(event)
  if (!key) return undefined
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (parts.length === 0) return undefined
  parts.push(key)
  return parts.join('+')
}

export function OverlayPage(): React.JSX.Element {
  const [state, setState] = useState<OverlayState | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true

    void window.myrgb
      .getOverlayState()
      .then((initial) => {
        if (alive) setState(initial)
      })
      .catch((error: unknown) => showToast(`Overlay: ${messageOf(error)}`))

    const unsubscribe = window.myrgb.onOverlayState((next) => {
      if (alive) setState(next)
    })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const apply = useCallback(async (patch: Partial<OverlayConfig>) => {
    setBusy(true)
    try {
      setState(await window.myrgb.updateOverlay(patch))
    } catch (error) {
      showToast(`Overlay: ${messageOf(error)}`)
    } finally {
      setBusy(false)
    }
  }, [])

  const toggle = useCallback(async () => {
    setBusy(true)
    try {
      setState(await window.myrgb.toggleOverlay())
    } catch (error) {
      showToast(`Overlay: ${messageOf(error)}`)
    } finally {
      setBusy(false)
    }
  }, [])

  const retryFps = useCallback(async () => {
    setBusy(true)
    try {
      setState(await window.myrgb.retryOverlayFps())
    } catch (error) {
      showToast(`FPS: ${messageOf(error)}`)
    } finally {
      setBusy(false)
    }
  }, [])

  if (!state) {
    return (
      <div className="flex h-full flex-col gap-5">
        <PageHeader page="overlay" />
        <Card>
          <p className="text-[12px] text-ink-400">Carregando o overlay…</p>
        </Card>
      </div>
    )
  }

  const { config, fps } = state
  const selected = new Set<OverlayItemKey>(config.items)

  function toggleItem(key: OverlayItemKey): void {
    const items = selected.has(key)
      ? config.items.filter((item) => item !== key)
      : [...config.items, key]
    void apply({ items })
  }

  function toggleGroup(group: OverlayGroup): void {
    const keys = OVERLAY_METRICS.filter((metric) => metric.group === group).map(
      (metric) => metric.key
    )
    const all = keys.every((key) => selected.has(key))
    const items = all
      ? config.items.filter((item) => !keys.includes(item))
      : [...config.items, ...keys.filter((key) => !selected.has(key))]
    void apply({ items })
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader page="overlay">
        <span className="verdict" data-alert={state.open}>
          {state.open ? 'Ligado' : 'Desligado'}
        </span>
      </PageHeader>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Section
          title="Janela"
          chip={formatAccelerator(config.shortcut)}
          className="min-w-0"
        >
          <label className="flex cursor-pointer items-center justify-between gap-6">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink-100">
                Mostrar por cima do jogo
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-400">
                Janela transparente, sempre no topo, que ignora o mouse e não aparece na barra de
                tarefas. Funciona em jogos em tela cheia sem bordas.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-brand-500"
              checked={config.enabled}
              disabled={busy}
              onChange={() => void toggle()}
              aria-label="Ligar o overlay"
            />
          </label>

          <div className="mt-5 grid gap-4 border-t border-ink-700 pt-4 sm:grid-cols-2">
            <div>
              <div className="metric-label">Atalho global</div>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  className="btn font-mono"
                  disabled={busy}
                  aria-label="Alterar o atalho do overlay"
                  onClick={(event) => {
                    setCapturing(true)
                    event.currentTarget.focus()
                  }}
                  onBlur={() => setCapturing(false)}
                  onKeyDown={(event) => {
                    if (!capturing) return
                    event.preventDefault()
                    event.stopPropagation()
                    if (event.key === 'Escape') {
                      setCapturing(false)
                      return
                    }
                    const accelerator = acceleratorFor(event)
                    if (!accelerator) return
                    setCapturing(false)
                    void apply({ shortcut: accelerator })
                  }}
                >
                  {capturing ? 'Pressione a combinação…' : formatAccelerator(config.shortcut)}
                </button>
                {config.shortcut !== DEFAULT_OVERLAY_SHORTCUT && (
                  <button
                    type="button"
                    className="btn-ghost btn text-[11px]"
                    disabled={busy}
                    onClick={() => void apply({ shortcut: DEFAULT_OVERLAY_SHORTCUT })}
                  >
                    Padrão
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-500">
                {config.shortcut === DEFAULT_OVERLAY_SHORTCUT
                  ? 'Liga e desliga sem sair do jogo.'
                  : 'Use pelo menos um modificador (Ctrl, Alt ou Shift).'}
              </p>
            </div>

            <div>
              <div className="metric-label">Monitor</div>
              <select
                className="field mt-1.5"
                value={config.displayId}
                disabled={busy}
                onChange={(event) => void apply({ displayId: Number(event.target.value) })}
              >
                {state.displays.map((display) => (
                  <option key={display.id} value={display.id}>
                    {display.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[10.5px] text-ink-500">
                O overlay fica no monitor escolhido, mesmo que o jogo abra em outro.
              </p>
            </div>
          </div>

          <div className="mt-4 border-t border-ink-700 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">
                FPS{' '}
                {!fps.supported ? 'sem fonte no Linux' : fps.available ? 'ao vivo' : 'indisponível'}
              </span>
              {fps.supported && !fps.available && fps.reason !== FPS_IDLE_NOTE && (
                <button
                  type="button"
                  className="btn text-[11px]"
                  disabled={busy}
                  onClick={() => void retryFps()}
                >
                  Tentar novamente
                </button>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-[11.5px] leading-relaxed text-ink-400">
              {fps.reason ??
                'O FPS vem do jogo em primeiro plano. A primeira vez pede permissão de administrador para o helper do Windows.'}
            </p>
            {state.message && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-100">{state.message}</p>
            )}
          </div>
        </Section>

        <Section title="Aparência" chip={`${Math.round(config.opacity * 100)} %`}>
          <div className="grid gap-4">
            <div>
              <div className="metric-label">Tamanho</div>
              <div className="mt-1.5 flex gap-1.5">
                {OVERLAY_SCALES.map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    className="chip"
                    data-active={config.scale === scale}
                    disabled={busy}
                    onClick={() => void apply({ scale })}
                  >
                    {OVERLAY_SCALE_LABEL[scale]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="metric-label">Opacidade do fundo</div>
              <div className="mt-1.5 flex gap-1.5">
                {OVERLAY_OPACITY_OPTIONS.map((opacity) => (
                  <button
                    key={opacity}
                    type="button"
                    className="chip font-mono"
                    data-active={Math.abs(config.opacity - opacity) < 0.01}
                    disabled={busy}
                    onClick={() => void apply({ opacity })}
                  >
                    {Math.round(opacity * 100)} %
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="metric-label">Canto</div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {OVERLAY_CORNERS.map((corner) => (
                  <button
                    key={corner.value}
                    type="button"
                    className="chip justify-center"
                    data-active={config.corner === corner.value}
                    disabled={busy}
                    onClick={() => void apply({ corner: corner.value })}
                  >
                    {CORNER_SHORT[corner.value] ?? corner.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[10.5px] leading-relaxed text-ink-500">
              O texto é sempre opaco; a opacidade vale só para o fundo do cartão. As mudanças
              aparecem na hora, mesmo com o overlay aberto.
            </p>
          </div>
        </Section>
      </div>

      <Section
        title="Métricas"
        chip={`${config.items.length} de ${OVERLAY_METRICS.length}`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => void apply({ items: defaultItems() })}
            >
              Padrão
            </button>
            <button
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => void apply({ items: [...OVERLAY_METRICS.map((m) => m.key)] })}
            >
              Tudo
            </button>
            <button
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => void apply({ items: [] })}
            >
              Nada
            </button>
          </div>
        }
      >
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          {OVERLAY_GROUPS.map((group) => {
            const metrics = OVERLAY_METRICS.filter((metric) => metric.group === group)
            const all = metrics.every((metric) => selected.has(metric.key))
            return (
              <div key={group} className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="metric-label">{group}</h3>
                  <button
                    type="button"
                    className="text-[10.5px] text-ink-500 hover:text-ink-200"
                    disabled={busy}
                    onClick={() => toggleGroup(group)}
                  >
                    {all ? 'Nenhum' : 'Todos'}
                  </button>
                </div>
                <div className="mt-1.5 flex flex-col gap-1">
                  {metrics.map((metric) => (
                    <label
                      key={metric.key}
                      className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-300"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-brand-500"
                        checked={selected.has(metric.key)}
                        disabled={busy}
                        onChange={() => toggleItem(metric.key)}
                      />
                      <span>{metric.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-5 border-t border-ink-700 pt-3 text-[10.5px] leading-relaxed text-ink-500">
          Métricas sem leitura aparecem como “—” no overlay, nunca como zero. Hotspot, tensão,
          clock da memória e limitador da NVIDIA dependem do driver expor o dado; o FPS depende do
          helper do Windows.
        </p>
      </Section>
    </div>
  )
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
