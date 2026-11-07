/**
 * Sensores de placa-mãe no Windows via LibreHardwareMonitorLib no helper .NET.
 *
 * O helper já é elevado para o FPS (ETW); ler WMI/SMBIOS não precisa de
 * elevação extra, então usa o mesmo executável e o mesmo protocolo de named
 * pipe. Os dados vêm no mesmo formato do collector hwmon no Linux, então a
 * página de sensores e o cartão de refrigeração funcionam sem nenhuma mudança.
 *
 * A bridge é um singleton de módulo. O `SensorsStore` faz poll de 1 em 1
 * segundo enquanto a página está aberta; criar uma bridge (e um helper
 * elevado) por poll dispararia um UAC e um processo novo a cada segundo. A
 * bridge é reutilizada e fechada depois de um período sem pedidos. Uma falha
 * fica em cache por alguns minutos: se o utilizador recusou o UAC, o app não
 * pode voltar a perguntar a cada segundo.
 */

import { app } from 'electron'
import { HelperBridge, helperCandidates, findHelperPath } from '../overlay/helper'
import type { SensorReading } from '@shared/features/sensors'

export interface WindowsSensorReading {
  id: string
  kind: string
  group: string
  chip: string
  label: string
  value: number
  unit: string
  order: number
  critical: string | null
  role: string | null
  min: number | null
  max: number | null
  history: number[] | null
}

/** A página fecha e o poll para; o helper não precisa ficar vivo para sempre. */
const IDLE_AFTER_MS = 20_000
/** Depois de uma falha (UAC recusado, helper morto), não tentar de novo já. */
const RETRY_AFTER_MS = 5 * 60_000

let bridge: HelperBridge | null = null
let starting: Promise<HelperBridge> | null = null
let idleTimer: NodeJS.Timeout | null = null
let failure: { message: string; at: number } | null = null

function clearIdleTimer(): void {
  if (!idleTimer) return
  clearTimeout(idleTimer)
  idleTimer = null
}

function scheduleIdleClose(): void {
  clearIdleTimer()
  idleTimer = setTimeout(() => {
    idleTimer = null
    bridge?.dispose()
    bridge = null
  }, IDLE_AFTER_MS)
  idleTimer.unref?.()
}

async function getBridge(executable: string): Promise<HelperBridge> {
  if (bridge) return bridge

  if (!starting) {
    starting = (async () => {
      const candidate = new HelperBridge({
        executable,
        connectTimeoutMs: 30_000,
        timeoutMs: 5_000
      })
      try {
        await candidate.start()
        return candidate
      } catch (error) {
        // A failed start never reaches the caller's `finally`, so release the
        // pipe and the helper here instead of leaking them.
        candidate.dispose()
        throw error
      }
    })()
  }

  const attempt = starting
  try {
    const created = await attempt
    if (!bridge) bridge = created
    return bridge
  } finally {
    if (starting === attempt) starting = null
  }
}

/**
 * Converte a resposta do helper em SensorReading[]. Valores fora dos limites
 * de plausibilidade são descartados: o helper já filtra, mas nunca custa
 * defender a fronteira TypeScript ↔ .NET.
 */
function toReadings(raw: WindowsSensorReading[]): SensorReading[] {
  const readings: SensorReading[] = []
  for (const r of raw) {
    const kind = r.kind as SensorReading['kind']
    const group = r.group as SensorReading['group']
    if (
      !['temperature', 'load', 'clock', 'power', 'voltage', 'fan', 'memory'].includes(kind)
    ) continue
    if (!['cpu', 'gpu', 'board', 'ram', 'storage', 'network', 'other'].includes(group)) continue
    if (!Number.isFinite(r.value)) continue

    readings.push({
      id: r.id,
      kind,
      group,
      chip: r.chip,
      label: r.label,
      value: r.value,
      unit: r.unit,
      order: r.order,
      critical: r.critical ? Number(r.critical) : undefined,
      role: r.role === 'pump' ? 'pump' : r.role === 'fan' ? 'fan' : undefined,
      min: r.min ?? undefined,
      max: r.max ?? undefined,
      history: r.history ?? undefined
    })
  }
  return readings
}

/**
 * Lê todos os sensores disponíveis no helper. Retorna null quando o helper
 * não existe ou não respondeu — o chamador decide o que mostrar no lugar.
 */
export async function readWindowsSensors(): Promise<{
  readings: SensorReading[]
  note: string | null
} | null> {
  const helper = findHelperPath(helperCandidates(app.getAppPath(), process.resourcesPath))
  if (!helper) {
    return {
      readings: [],
      note: 'O helper do MyRGB não foi encontrado no Windows: temperaturas, ventoinhas e bomba da placa-mãe não podem ser lidos.'
    }
  }

  if (failure && Date.now() - failure.at < RETRY_AFTER_MS) {
    return {
      readings: [],
      note: `Não foi possível ler os sensores da placa-mãe no Windows: ${failure.message}`
    }
  }

  try {
    const active = await getBridge(helper)
    const result = await active.request<{ readings: WindowsSensorReading[] }>('sensors.poll')
    failure = null
    scheduleIdleClose()
    return {
      readings: toReadings(result.readings ?? []),
      note: null
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failure = { message, at: Date.now() }
    clearIdleTimer()
    bridge?.dispose()
    bridge = null
    return {
      readings: [],
      note: `Não foi possível ler os sensores da placa-mãe no Windows: ${message}`
    }
  }
}
