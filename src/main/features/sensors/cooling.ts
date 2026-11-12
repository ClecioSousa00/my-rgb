/**
 * The cooling summary: is the pump turning, are the fans turning, and is the
 * hardware hot while they are not.
 *
 * A fan channel is just a tachometer. The kernel does not say "this one is the
 * pump", so the role comes from the label the driver published (see
 * `hwmon.ts`); when no label says "pump", this module says so instead of
 * guessing from the header order.
 *
 * The thresholds are the only judgement here, and they are deliberately blunt:
 *
 * - a pump below `COOLING_STOPPED_RPM` is stopped, hot or cold, because a loop
 *   without flow has no upside;
 * - a fan at 0 RPM is normal (passive cooling, zero-RPM mode), so it only
 *   becomes a warning when the hardware it cools is above `COOLING_HOT_C`.
 *
 * Nothing is inferred: a channel without a paired temperature is reported
 * without one, and a machine without fan inputs says exactly that.
 */

import type {
  CoolingChannel,
  CoolingSnapshot,
  SensorGroup,
  SensorReading
} from '@shared/features/sensors'
import { COOLING_HOT_C, COOLING_STOPPED_RPM } from '@shared/features/sensors'
import { formatSensor } from '@shared/format'

/** Which temperature describes the hardware a channel cools. */
const PAIRED_GROUP: Partial<Record<SensorGroup, SensorGroup>> = {
  // A fan on a motherboard header cools the CPU (or the case around it); the
  // CPU package is the only temperature that makes a stopped header matter.
  board: 'cpu',
  cpu: 'cpu',
  gpu: 'gpu',
  storage: 'storage',
  ram: 'ram',
  network: 'network'
  // `other` is deliberately absent: an unknown driver's fan has no temperature
  // that can be attributed to it.
}

const GROUP_NOUN: Partial<Record<SensorGroup, string>> = {
  cpu: 'o processador',
  gpu: 'a GPU',
  storage: 'o disco',
  ram: 'a memória',
  network: 'o adaptador de rede'
}

function maxTemperature(readings: SensorReading[], group: SensorGroup): number | undefined {
  let max: number | undefined
  for (const reading of readings) {
    if (reading.kind !== 'temperature' || reading.group !== group) continue
    if (max === undefined || reading.value > max) max = reading.value
  }
  return max
}

function pairedTemperature(
  reading: SensorReading,
  readings: SensorReading[]
): { group: SensorGroup; value: number } | undefined {
  const group = PAIRED_GROUP[reading.group]
  if (!group) return undefined
  const value = maxTemperature(readings, group)
  return value === undefined ? undefined : { group, value }
}

/** A GPU fan that reports a duty cycle stops at 0 %, not below 100 RPM. */
function isStopped(channel: CoolingChannel): boolean {
  return channel.unit === '%'
    ? channel.value <= 0
    : channel.value < COOLING_STOPPED_RPM
}

/**
 * The fan range, one phrase per unit. RPM and a GPU duty cycle are different
 * scales, so they are never mixed into a single "between X and Y".
 */
function fanRangeText(fans: CoolingChannel[]): string | undefined {
  if (fans.length === 0) return undefined

  const byUnit = new Map<string, number[]>()
  for (const fan of fans) {
    const values = byUnit.get(fan.unit)
    if (values) values.push(fan.value)
    else byUnit.set(fan.unit, [fan.value])
  }

  const parts: string[] = []
  for (const [unit, values] of byUnit) {
    const min = Math.min(...values)
    const max = Math.max(...values)
    // The unit is written once: "2 entre 640 e 980 RPM", not "640 RPM e 980 RPM".
    const suffix = unit === '%' ? ' %' : ` ${unit}`
    const bare = (value: number): string => String(Math.round(value))
    if (values.length === 1) parts.push(`${bare(min)}${suffix}`)
    else if (min === max) parts.push(`${values.length} em ${bare(min)}${suffix}`)
    else parts.push(`${values.length} entre ${bare(min)} e ${bare(max)}${suffix}`)
  }
  return parts.join(', ')
}

/** A verdict reads better whole; the table keeps the decimal. */
function degrees(value: number): string {
  return `${Math.round(value)} °C`
}

/**
 * CoolingChannel plus the group its temperature came from. Kept out of the
 * shared type because the page only needs the number, not the pairing.
 */
type ChannelWithGroup = CoolingChannel & { temperatureGroup?: SensorGroup }

function stoppedText(channel: ChannelWithGroup, temperature?: number): string {
  const noun = channel.temperatureGroup ? GROUP_NOUN[channel.temperatureGroup] : undefined
  const heat = temperature !== undefined && noun ? ` com ${noun} a ${degrees(temperature)}` : ''
  return `${channel.label} (${channel.chip}) parada${heat}.`
}

export function buildCooling(
  readings: SensorReading[],
  platform: NodeJS.Platform = process.platform
): CoolingSnapshot {
  const notes: string[] = []
  const alarms: string[] = []

  const channels: ChannelWithGroup[] = readings
    .filter((reading) => reading.kind === 'fan')
    .map((reading) => {
      const paired = pairedTemperature(reading, readings)
      return {
        id: reading.id,
        role: reading.role ?? 'fan',
        chip: reading.chip,
        label: reading.label,
        value: reading.value,
        unit: reading.unit,
        min: reading.min,
        max: reading.max,
        history: reading.history,
        temperature: paired?.value,
        temperatureGroup: paired?.group
      }
    })
    // Pumps first: if there is only one number worth reading on the card, it
    // is the one that keeps the loop moving.
    .sort((a, b) => Number(b.role === 'pump') - Number(a.role === 'pump'))

  const pumps = channels.filter((channel) => channel.role === 'pump')
  const fans = channels.filter((channel) => channel.role === 'fan')

  for (const channel of channels) {
    const stopped = isStopped(channel)
    if (!stopped) continue

    // A stopped pump has no benign explanation, unlike a fan in zero-RPM mode.
    if (channel.role === 'pump') {
      alarms.push(stoppedText(channel))
      continue
    }

    const hot = channel.temperature !== undefined && channel.temperature >= COOLING_HOT_C
    if (hot) alarms.push(stoppedText(channel, channel.temperature))
  }

  if (channels.length === 0) {
    notes.push(
      platform === 'win32'
        ? 'Temperaturas, ventoinhas e bomba da placa-mãe ainda não apareceram no Windows. O helper do MyRGB lê essas rotações via LibreHardwareMonitorLib; confira se ele foi iniciado (o overlay ou o FPS precisam ter sido abertos pelo menos uma vez).'
        : 'Nenhuma ventoinha ou bomba apareceu em /sys/class/hwmon. Se a placa-mãe tem o sensor e o driver não está carregado, carregue-o (por exemplo: sudo modprobe nct6775); se o water cooler é ligado por USB, o RPM só existe no software do fabricante.'
    )
  } else if (pumps.length === 0) {
    notes.push(
      'Nenhum canal foi identificado como bomba: o driver de sensores não informa qual header é o AIO_PUMP, então as rotações aparecem como ventoinhas. Confira o manual da placa para saber qual canal é a bomba.'
    )
  }

  if (channels.some((channel) => channel.unit === '%')) {
    notes.push(
      'A ventoinha da GPU é publicada em percentual pelo nvidia-smi, não em RPM; o percentual não é convertido em rotação.'
    )
  }

  if (pumps.some((pump) => isStopped(pump))) {
    notes.push(
      'Um water cooler com a bomba parada não refrigera, mesmo que o processador ainda esteja frio no momento da leitura.'
    )
  }

  const cpuTemp = maxTemperature(readings, 'cpu')
  const gpuTemp = maxTemperature(readings, 'gpu')

  let status: CoolingSnapshot['status']
  let verdict: string

  if (channels.length === 0) {
    status = 'unknown'
    verdict = 'Sem dados de rotação: o sistema não expôs ventoinhas nem bomba.'
  } else if (alarms.length > 0) {
    status = 'warning'
    verdict = alarms[0]
  } else if (channels.every((channel) => isStopped(channel))) {
    status = 'idle'
    verdict =
      `Todos os canais estão parados` +
      (cpuTemp !== undefined ? ` com o processador a ${degrees(cpuTemp)}` : '') +
      '. Isso é normal em modo sem ventoinha; se a temperatura subir, o aviso aparece.'
  } else {
    status = 'ok'
    const parts: string[] = []
    if (pumps.length > 0) {
      parts.push(`Bomba a ${formatSensor(pumps[0].value, pumps[0].unit)}`)
    }
    const range = fanRangeText(fans)
    if (range) parts.push(`Ventoinhas: ${range}`)
    if (gpuTemp !== undefined) parts.push(`GPU a ${degrees(gpuTemp)}`)
    if (cpuTemp !== undefined) parts.push(`processador a ${degrees(cpuTemp)}`)
    verdict = parts.join(' · ')
  }

  return {
    status,
    verdict,
    channels: channels.map(({ temperatureGroup: _group, ...channel }) => channel),
    alarms,
    notes
  }
}
