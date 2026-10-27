/**
 * Network diagnostic collection.
 *
 * One run answers the question the page is named after: the lag is in the
 * local network, in the provider, or nowhere. The order mirrors the Reset
 * Explode `NetworkTest`: discover the active adapter, ping the router and two
 * public resolvers, time three DNS lookups, then measure download (with a
 * concurrent ping for bufferbloat) and upload.
 *
 * Nothing needs privilege and nothing is written to disk. The run is
 * cancellable: the ping processes are killed and the HTTP requests aborted,
 * and the promise resolves to null.
 *
 * The last report is kept here so leaving the page and coming back does not
 * throw away a 30 second test.
 */

import si from 'systeminformation'
import { getServers, promises as dnsPromises } from 'dns'
import type {
  NetworkAdapter,
  NetworkDnsLookup,
  NetworkPingStat,
  NetworkProgress,
  NetworkReport
} from '@shared/features/network'
import {
  NETWORK_DOWNLOAD_SECONDS,
  NETWORK_PING_INTERVAL_MS,
  NETWORK_PING_SAMPLES,
  NETWORK_UPLOAD_SECONDS
} from '@shared/features/network'
import { pingAvailable, pingCountFor, pingHost, summarizePing, type PingRun } from './ping'
import { measureDownload, measureUpload, SpeedTestError } from './speed'
import { buildNetworkVerdict } from './verdict'

const INTERNET_TARGETS = [
  { name: 'Internet · Cloudflare', address: '1.1.1.1' },
  { name: 'Internet · Google', address: '8.8.8.8' }
] as const

const DNS_DOMAINS = ['www.cloudflare.com', 'www.google.com', 'github.com']

/** Windows pings once per second, so it gets fewer samples for the same wait. */
const PING_SAMPLES = process.platform === 'win32' ? 12 : NETWORK_PING_SAMPLES

type InterfacesResult = Awaited<ReturnType<typeof si.networkInterfaces>>

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, item) => sum + item, 0) / values.length
}

function ipv4(value: string | undefined): string | undefined {
  const text = value?.trim()
  if (!text || text === '0.0.0.0') return undefined
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(text) ? text : undefined
}

/** A speed test failure the page can explain, instead of a blank "—". */
function speedNote(kind: 'download' | 'upload', error: unknown): string {
  if (error instanceof SpeedTestError && error.status === 429) {
    return (
      `O servidor de velocidade recusou o ${kind} (limite de testes, HTTP 429). ` +
      'Tente de novo em alguns minutos.'
    )
  }
  const detail = error instanceof Error ? error.message : String(error)
  return `O ${kind} não pôde ser medido: ${detail}.`
}

/**
 * The adapter that actually carries the default route.
 *
 * `networkInterfaceDefault` is the same source the tray and the system page
 * trust; if it fails, the first connected interface with an IPv4 address is
 * used instead of showing an empty page.
 */
async function readAdapter(): Promise<NetworkAdapter | null> {
  const [defaultName, interfacesResult, defaultGateway] = await Promise.all([
    si.networkInterfaceDefault().catch(() => ''),
    si.networkInterfaces().catch(() => [] as InterfacesResult),
    si.networkGatewayDefault().catch(() => '')
  ])

  const interfaces = Array.isArray(interfacesResult) ? interfacesResult : [interfacesResult]

  const connected = interfaces.filter(
    (item) => !item.internal && item.operstate === 'up' && Boolean(item.ip4)
  )
  const iface =
    connected.find((item) => item.iface === defaultName) ??
    connected.find((item) => item.default) ??
    connected[0]

  if (!iface || !iface.ip4) return null

  const kind: NetworkAdapter['kind'] =
    iface.type === 'wireless' ? 'wifi' : iface.type === 'wired' ? 'ethernet' : 'other'

  const servers = getServers()
  const v4 = servers.filter((server) => /^\d/.test(server))
  const dnsServers = (v4.length > 0 ? v4 : servers).slice(0, 3)

  return {
    name: iface.iface,
    kind,
    linkMbps:
      typeof iface.speed === 'number' && iface.speed > 0 ? iface.speed : undefined,
    ip: iface.ip4,
    gateway: ipv4(defaultGateway),
    dns: dnsServers
  }
}

async function measureDns(
  domains: string[],
  signal: AbortSignal
): Promise<NetworkDnsLookup[]> {
  return Promise.all(
    domains.map(async (domain): Promise<NetworkDnsLookup> => {
      if (signal.aborted) return { domain }
      const started = performance.now()
      try {
        await dnsPromises.resolve4(domain)
        return { domain, ms: round1(performance.now() - started) }
      } catch {
        return { domain }
      }
    })
  )
}

interface DiagnoseContext {
  signal: AbortSignal
  emit: (progress: NetworkProgress) => void
}

async function run(context: DiagnoseContext): Promise<NetworkReport | null> {
  const { signal, emit } = context
  const notes: string[] = []

  emit({ text: 'Procurando a conexão ativa…', fraction: 0.02 })
  const adapter = await readAdapter()
  if (signal.aborted) return null

  if (!adapter) {
    return {
      at: Date.now(),
      adapter: null,
      gateway: null,
      internet: [],
      dns: [],
      verdict: 'critical',
      reasons: [
        'O sistema não encontrou uma conexão ativa com acesso ao roteador. ' +
          'Verifique o cabo, o Wi-Fi ou o adaptador.'
      ],
      notes: []
    }
  }

  const hasPing = await pingAvailable()
  if (!hasPing) {
    notes.push(
      'O comando ping não está disponível; latência, jitter, perda e bufferbloat não puderam ' +
        'ser medidos. No Linux, instale o iputils-ping.'
    )
  }

  // --- latency, jitter and loss ------------------------------------------
  emit({
    text: hasPing
      ? `Medindo latência e perda de pacotes (${PING_SAMPLES} por alvo)…`
      : 'O ping não está disponível; seguindo para o DNS…',
    fraction: 0.08
  })

  const gatewayRun = adapter.gateway && hasPing ? adapter.gateway : undefined
  const gatewayPromise: Promise<PingRun | null> =
    gatewayRun === undefined
      ? Promise.resolve(null)
      : pingHost(gatewayRun, {
          count: PING_SAMPLES,
          intervalMs: NETWORK_PING_INTERVAL_MS,
          signal
        }).catch(() => null)

  const internetPromise: Promise<(PingRun | null)[]> = hasPing
    ? Promise.all(
        INTERNET_TARGETS.map((target) =>
          pingHost(target.address, {
            count: PING_SAMPLES,
            intervalMs: NETWORK_PING_INTERVAL_MS,
            signal
          }).catch(() => null)
        )
      )
    : Promise.resolve(INTERNET_TARGETS.map(() => null))

  const [gatewayResult, internetResults] = await Promise.all([
    gatewayPromise,
    internetPromise
  ])
  if (signal.aborted) return null

  if (!adapter.gateway) {
    notes.push(
      'Não foi possível descobrir o roteador (gateway); a latência da rede local não foi medida.'
    )
  }

  const gateway: NetworkPingStat | null =
    gatewayResult && gatewayRun ? summarizePing('Roteador', gatewayRun, gatewayResult) : null

  const internet: NetworkPingStat[] = hasPing
    ? INTERNET_TARGETS.map((target, index) => {
        const result = internetResults[index]
        return result
          ? summarizePing(target.name, target.address, result)
          : {
              name: target.name,
              address: target.address,
              sent: 0,
              lost: 0,
              lossPercent: 0,
              answered: false
            }
      })
    : []

  // --- DNS ---------------------------------------------------------------
  emit({ text: 'Testando o DNS…', fraction: 0.3 })
  const lookups = await measureDns(DNS_DOMAINS, signal)
  if (signal.aborted) return null

  const resolved = lookups.filter((lookup) => lookup.ms !== undefined)
  const dnsMs = resolved.length > 0 ? round1(average(resolved.map((l) => l.ms!))) : undefined
  if (resolved.length === 0) {
    notes.push('Nenhum domínio pôde ser resolvido; o DNS pode estar bloqueado ou fora do ar.')
  }

  // --- download, with a concurrent ping ----------------------------------
  emit({ text: 'Medindo a velocidade de download (≈ 8 s)…', fraction: 0.36 })

  const loaded = new AbortController()
  const forwardAbort = (): void => loaded.abort()
  signal.addEventListener('abort', forwardAbort)

  // Ping runs for the same 8 s as the download (a hair longer), so the link
  // is measured while saturated. It is aborted only if the user cancels.
  const loadedPromise: Promise<PingRun | null> = hasPing
    ? pingHost('1.1.1.1', {
        count: pingCountFor(NETWORK_DOWNLOAD_SECONDS * 1000, NETWORK_PING_INTERVAL_MS),
        intervalMs: NETWORK_PING_INTERVAL_MS,
        signal: loaded.signal
      }).catch(() => null)
    : Promise.resolve(null)

  let downloadMbps: number | undefined
  try {
    downloadMbps = await measureDownload(NETWORK_DOWNLOAD_SECONDS, signal)
  } catch (error) {
    if (signal.aborted) return null
    notes.push(speedNote('download', error))
  }
  if (signal.aborted) return null

  const loadedRun = await loadedPromise
  signal.removeEventListener('abort', forwardAbort)
  // Without a download there was no load: the concurrent ping would measure
  // an idle link, which says nothing about bufferbloat.
  const loadedMs =
    downloadMbps !== undefined && loadedRun && loadedRun.times.length >= 5
      ? round1(average(loadedRun.times))
      : undefined

  // --- upload ------------------------------------------------------------
  emit({ text: 'Medindo a velocidade de upload (≈ 6 s)…', fraction: 0.66 })
  let uploadMbps: number | undefined
  try {
    uploadMbps = await measureUpload(NETWORK_UPLOAD_SECONDS, signal)
  } catch (error) {
    if (signal.aborted) return null
    notes.push(speedNote('upload', error))
  }
  if (signal.aborted) return null

  const speedError = downloadMbps === undefined && uploadMbps === undefined
  if (speedError) {
    notes.push(
      'Não foi possível medir a velocidade: o speed.cloudflare.com está inacessível ou bloqueado.'
    )
  }

  emit({ text: 'Analisando…', fraction: 0.95 })

  const verdict = buildNetworkVerdict({
    gateway,
    internet,
    dnsMs,
    dnsFailures: lookups.length - resolved.length,
    downloadMbps,
    uploadMbps,
    loadedMs,
    speedError,
    pingAvailable: hasPing
  })

  return {
    at: Date.now(),
    adapter,
    gateway,
    internet,
    dns: lookups,
    dnsMs,
    downloadMbps,
    uploadMbps,
    loadedMs,
    verdict: verdict.verdict,
    reasons: verdict.reasons,
    notes
  }
}

interface ActiveRun {
  controller: AbortController
  promise: Promise<NetworkReport | null>
}

let active: ActiveRun | null = null
let lastReport: NetworkReport | null = null

/** The last completed report, so the page can show it again on open. */
export function lastNetworkReport(): NetworkReport | null {
  return lastReport
}

/** Stop the running diagnostic. The pending promise resolves to null. */
export function cancelNetworkDiagnosis(): void {
  active?.controller.abort()
}

/**
 * Run the diagnostic. Calling it again while a run is in flight returns the
 * same promise, so a double click cannot start two speed tests.
 */
export function diagnoseNetwork(
  onProgress: (progress: NetworkProgress) => void
): Promise<NetworkReport | null> {
  if (active) return active.promise

  const controller = new AbortController()
  const emit = (progress: NetworkProgress): void => {
    if (controller.signal.aborted) return
    try {
      onProgress(progress)
    } catch {
      // A closed window must not break the measurement.
    }
  }

  const promise = run({ signal: controller.signal, emit })
    .then((report) => {
      if (report) lastReport = report
      return report
    })
    .catch((error) => {
      if (controller.signal.aborted) return null
      throw error
    })
    .finally(() => {
      active = null
    })

  active = { controller, promise }
  return promise
}
