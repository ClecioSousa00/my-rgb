/**
 * Sensores de placa-mãe no Windows via LibreHardwareMonitorLib no helper .NET.
 *
 * O helper já está elevado para o FPS (ETW); ler WMI/SMBIOS não precisa de
 * elevação extra, então reusa o mesmo processo e o mesmo named pipe. Os dados
 * vêm no mesmo formato do collector hwmon no Linux, então a página de
 * sensores e o cartão de refrigeração funcionam sem nenhuma mudança.
 */

import { app } from 'electron'
import { HelperBridge } from '../overlay/helper'
import { helperCandidates, findHelperPath } from '../overlay/helper'
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

  const bridge = new HelperBridge({
    executable: helper,
    connectTimeoutMs: 30_000,
    timeoutMs: 5_000
  })

  try {
    await bridge.start()
    const result = await bridge.request<{ readings: WindowsSensorReading[] }>('sensors.poll')
    return {
      readings: toReadings(result.readings ?? []),
      note: null
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      readings: [],
      note: `Não foi possível ler os sensores da placa-mãe no Windows: ${message}`
    }
  } finally {
    bridge.dispose()
  }
}
