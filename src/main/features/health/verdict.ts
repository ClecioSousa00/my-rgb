/**
 * The disk verdict.
 *
 * One place decides what "saudável", "atenção" and "crítico" mean, so the
 * Linux reader and the Windows reader cannot drift apart. The thresholds are
 * the same ones the Reset Explode uses:
 *
 * - the drive itself says it will fail, or an attribute is at its threshold:
 *   critical;
 * - wear from 80% (plan the replacement) and 95% (end of life);
 * - temperature from 70 °C (85 °C critical) on flash, 55 °C (65 °C) on HDD;
 * - any reallocated/pending/uncorrectable sector: at least attention.
 *
 * A disk with no metric at all is "sem dados", never "saudável".
 *
 * Derived in part from the Reset Explode
 * (https://github.com/GustavoReset/ResetExplode), MIT © 2026 Gustavo.

 */

import type { DiskVerdict } from '@shared/features/health'
import type { SmartMetrics } from './smartctl'

export type DiskMedia = 'ssd' | 'hdd' | 'usb' | 'unknown'

export interface HealthFacts {
  media: DiskMedia
  /** At least one health metric was actually read. */
  dataAvailable: boolean
  temperatureC?: number
  wearPercent?: number
  smartPassed?: boolean
  criticalWarning?: number
  failedAttribute?: 'now' | 'past'
  reallocatedSectors?: number
  pendingSectors?: number
  uncorrectableSectors?: number
  mediaErrors?: number
  /** Sum of the uncorrected read/write errors (Windows counters). */
  uncorrectedErrors?: number
  /** Windows storage health: 0 healthy, 1 warning, 2 unhealthy, 5 unknown. */
  healthStatus?: number
  /** The drive's own S.M.A.R.T. failure prediction. */
  predictFailure?: boolean
}

export interface VerdictResult {
  verdict: DiskVerdict
  reasons: string[]
}

const UNKNOWN_REASON =
  'Este disco não informa dados de saúde (comum em pendrives e alguns HDs externos).'

/** Whether smartctl returned anything that describes the drive's condition. */
export function hasSmartMetrics(metrics: SmartMetrics): boolean {
  return (
    metrics.temperatureC !== undefined ||
    metrics.wearPercent !== undefined ||
    metrics.powerOnHours !== undefined ||
    metrics.powerCycles !== undefined ||
    metrics.reallocatedSectors !== undefined ||
    metrics.pendingSectors !== undefined ||
    metrics.uncorrectableSectors !== undefined ||
    metrics.mediaErrors !== undefined ||
    metrics.availableSpare !== undefined ||
    metrics.criticalWarning !== undefined ||
    metrics.failedAttribute !== undefined ||
    metrics.writtenBytes !== undefined ||
    metrics.readBytes !== undefined
  )
}

export function buildVerdict(facts: HealthFacts): VerdictResult {
  const critical: string[] = []
  const warning: string[] = []

  if (facts.predictFailure) {
    critical.push(
      'O próprio disco avisa (S.M.A.R.T.) que deve falhar em breve. Faça backup agora.'
    )
  }
  if (facts.smartPassed === false) {
    critical.push('O disco reprovou no autoteste S.M.A.R.T. (falha prevista).')
  }
  if (facts.healthStatus === 2) {
    critical.push('O Windows classifica o disco como não saudável.')
  } else if (facts.healthStatus === 1) {
    warning.push('O Windows classifica a saúde do disco como "atenção".')
  }
  if (facts.criticalWarning !== undefined && facts.criticalWarning > 0) {
    critical.push('O NVMe sinaliza um aviso crítico de saúde.')
  }
  if (facts.failedAttribute === 'now') {
    critical.push('Um atributo S.M.A.R.T. está no limite de falha agora.')
  } else if (facts.failedAttribute === 'past') {
    warning.push('Um atributo S.M.A.R.T. já passou do limite em algum momento.')
  }

  if (facts.wearPercent !== undefined) {
    const wear = Math.round(facts.wearPercent)
    if (wear >= 95) {
      critical.push(`Desgaste de ${wear}%: o disco está no fim da vida útil. Troque e faça backup.`)
    } else if (wear >= 80) {
      warning.push(
        `Desgaste de ${wear}%: o disco já gastou boa parte da vida útil. Planeje a troca.`
      )
    }
  }

  if (facts.temperatureC !== undefined) {
    const isHdd = facts.media === 'hdd'
    const okMax = isHdd ? 55 : 70
    const critMax = isHdd ? 65 : 85
    const temp = Math.round(facts.temperatureC)
    if (facts.temperatureC >= critMax) {
      critical.push(`Temperatura de ${temp} °C é muito alta para este disco.`)
    } else if (facts.temperatureC >= okMax) {
      warning.push(`Temperatura de ${temp} °C está alta. Melhore a ventilação.`)
    }
  }

  if (facts.reallocatedSectors !== undefined && facts.reallocatedSectors > 0) {
    warning.push(
      `Setores realocados: ${facts.reallocatedSectors}. O disco já remapeou áreas com defeito.`
    )
  }
  if (facts.pendingSectors !== undefined && facts.pendingSectors > 0) {
    warning.push(
      `Setores pendentes: ${facts.pendingSectors}. Há setores aguardando leitura ou remapeamento.`
    )
  }
  if (facts.uncorrectableSectors !== undefined && facts.uncorrectableSectors > 0) {
    warning.push(`Setores não corrigíveis: ${facts.uncorrectableSectors}.`)
  }
  if (facts.mediaErrors !== undefined && facts.mediaErrors > 0) {
    warning.push(`Erros de mídia reportados pelo NVMe: ${facts.mediaErrors}.`)
  }
  if (facts.uncorrectedErrors !== undefined && facts.uncorrectedErrors > 0) {
    warning.push(`Erros não corrigidos de leitura/escrita: ${facts.uncorrectedErrors}.`)
  }

  if (critical.length > 0) {
    return { verdict: 'critical', reasons: [...critical, ...warning] }
  }
  if (!facts.dataAvailable) {
    return { verdict: 'unknown', reasons: [UNKNOWN_REASON] }
  }
  if (warning.length > 0) {
    return { verdict: 'warning', reasons: warning }
  }
  return {
    verdict: 'good',
    reasons: ['Nenhum problema encontrado nas leituras disponíveis.']
  }
}
