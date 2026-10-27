/**
 * The network verdict.
 *
 * Same decision tree as the Reset Explode `NetworkTest.Run`, with one change:
 * every "bad" case gets its own reason. In the original, a latency above
 * 150 ms or a loss above 5% made the result critical without adding a line,
 * which could show "RUIM" next to "Latência baixa...". Here the verdict can
 * never contradict its reasons.
 *
 * The router is judged separately from the internet, because that is the
 * whole point of the page: if the gateway is fine and the internet is not,
 * the provider is the suspect; if the gateway is also bad, it is the local
 * network (or the Wi-Fi).
 */

import type { NetworkPingStat, NetworkVerdict } from '@shared/features/network'

export interface NetworkVerdictInput {
  gateway: NetworkPingStat | null
  internet: NetworkPingStat[]
  /** Average of the successful DNS lookups. */
  dnsMs?: number
  /** How many domains did not resolve. */
  dnsFailures?: number
  downloadMbps?: number
  uploadMbps?: number
  /** Average latency during the download. */
  loadedMs?: number
  /** Both speed tests failed (Cloudflare blocked or offline). */
  speedError?: boolean
  /** False when the system has no `ping`. */
  pingAvailable?: boolean
}

export interface NetworkVerdictResult {
  verdict: NetworkVerdict
  reasons: string[]
}

const ROUTER_SILENT =
  'O roteador não responde a ping (alguns modelos bloqueiam). Isso por si só não é problema.'

const ALL_GOOD =
  'Latência baixa, sem perda de pacotes e sem sinais de bufferbloat. Se o jogo ainda engasga, ' +
  'o problema provavelmente não é a conexão: veja o Gargalo e as temperaturas.'

function value(value: number | undefined): number {
  return value ?? 0
}

function formatMs(ms: number): string {
  return `${ms.toFixed(ms < 10 ? 1 : 0).replace('.', ',')} ms`
}

function formatPercent(percent: number): string {
  return `${percent.toFixed(1).replace('.', ',')}%`
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, item) => sum + item, 0) / values.length
}

export function buildNetworkVerdict(input: NetworkVerdictInput): NetworkVerdictResult {
  const critical: string[] = []
  const warning: string[] = []

  // --- local network ------------------------------------------------------
  const router = input.gateway
  const lanBad =
    router?.answered === true &&
    (router.lossPercent > 2 || value(router.avgMs) > 30 || value(router.jitterMs) > 15)

  if (router?.answered === true) {
    if (lanBad) {
      warning.push(
        `A rede local está instável (roteador: ${formatMs(value(router.avgMs))}, ` +
          `perda ${formatPercent(router.lossPercent)}, jitter ${formatMs(value(router.jitterMs))}). ` +
          'Se for Wi-Fi, aproxime-se do roteador ou use cabo.'
      )
    }
  } else if (input.gateway !== undefined) {
    // A missing gateway is not the same as a silent one, but neither can be
    // blamed without a measurement.
    warning.push(ROUTER_SILENT)
  }

  // --- internet -----------------------------------------------------------
  const answered = input.internet.filter((stat) => stat.answered)

  if (input.pingAvailable === false) {
    return {
      verdict: 'unknown',
      reasons: [
        'Não foi possível medir a latência: o comando ping não está disponível neste sistema. ' +
          'Sem ele, a conexão não pode ser classificada.'
      ]
    }
  }

  if (input.internet.length === 0) {
    critical.push(
      'Nenhum servidor da internet foi testado: a conexão não tem rota para fora da rede local.'
    )
  } else if (answered.length === 0) {
    critical.push(
      'Nenhum dos servidores da internet respondeu: sem acesso à internet ou ping bloqueado pela rede.'
    )
  } else {
    const netAvg = average(answered.map((stat) => value(stat.avgMs)))
    const netLoss = average(input.internet.map((stat) => stat.lossPercent))
    const netJitter = Math.max(...answered.map((stat) => value(stat.jitterMs)))

    if (netLoss > 5) {
      critical.push(
        `Perda de pacotes alta até a internet (${formatPercent(netLoss)}). ` +
          (lanBad
            ? 'Como a rede local também está instável, comece por ela.'
            : 'O roteador responde bem, então o problema deve estar na linha ou no provedor.')
      )
    } else if (netLoss > 1) {
      warning.push(
        `Há perda de pacotes até a internet (${formatPercent(netLoss)}). ` +
          (lanBad
            ? 'Provavelmente vem da rede local.'
            : 'Como o roteador está bem, o problema deve estar na linha ou no provedor.')
      )
    }

    if (netAvg > 150) {
      critical.push(
        `Latência muito alta até a internet (${formatMs(netAvg)}). ` +
          (lanBad ? 'A rede local também está ruim.' : 'O atraso vem do provedor ou da linha.')
      )
    } else if (netAvg > 80) {
      warning.push(
        `Latência alta até a internet (${formatMs(netAvg)}).` +
          (lanBad ? '' : ' O roteador responde bem, então o atraso vem do provedor.')
      )
    }

    if (netJitter > 20) {
      warning.push(
        `O jitter está alto (${formatMs(netJitter)}): a latência oscila, o que causa engasgos em jogos online.`
      )
    }

    // Bufferbloat: the link is stable when idle and collapses under load.
    const best = Math.min(...answered.map((stat) => value(stat.avgMs)))
    if (
      input.loadedMs !== undefined &&
      input.loadedMs - best > 100
    ) {
      warning.push(
        `A latência sobe para ${formatMs(input.loadedMs)} quando a conexão está cheia ` +
          '(bufferbloat). Ative SQM/QoS no roteador ou limite a velocidade a ~90%.'
      )
    }
  }

  // --- DNS ----------------------------------------------------------------
  if (input.dnsMs !== undefined && input.dnsMs > 150) {
    warning.push(
      `O DNS demorou ${formatMs(input.dnsMs)}. Trocar para 1.1.1.1 ou 8.8.8.8 pode acelerar o ` +
        'carregamento de sites.'
    )
  } else if (input.dnsMs === undefined && (input.dnsFailures ?? 0) > 0) {
    warning.push(
      'Nenhum domínio pôde ser resolvido: o DNS pode estar bloqueado ou fora do ar. ' +
        'A internet pode funcionar por IP, mas sites e jogos que dependem de nomes vão falhar.'
    )
  }

  // --- speed --------------------------------------------------------------
  if (input.downloadMbps !== undefined && input.downloadMbps < 10) {
    warning.push(
      `Download baixo (${input.downloadMbps.toFixed(1).replace('.', ',')} Mbps) para jogos, ` +
        'streaming e atualizações.'
    )
  }
  if (input.speedError) {
    warning.push(
      'Não foi possível medir a velocidade (speed.cloudflare.com inacessível ou bloqueado).'
    )
  }

  if (critical.length > 0) {
    return { verdict: 'critical', reasons: [...critical, ...warning] }
  }

  const meaningful = warning.filter((reason) => !reason.startsWith('O roteador não responde'))
  if (meaningful.length > 0) {
    return { verdict: 'warning', reasons: warning }
  }

  // A silent router is common and, on its own, not a problem - the original
  // keeps "good" and shows that line as the explanation.
  return { verdict: 'good', reasons: warning.length > 0 ? warning : [ALL_GOOD] }
}
