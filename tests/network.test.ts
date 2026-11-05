import { describe, expect, it } from 'vitest'
import { parsePingTimes, pingCountFor, summarizePing } from '@main/features/network/ping'
import { buildNetworkVerdict } from '@main/features/network/verdict'
import type { NetworkPingStat } from '@shared/features/network'

/**
 * The network diagnostic is tested from fixtures: CI has no router to ping
 * and no link to saturate. The ping parser is the part that has to survive
 * both systems, because Windows translates its output but never the TTL token.
 */

const LINUX_OUTPUT = `PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
64 bytes from 1.1.1.1: icmp_seq=1 ttl=50 time=15.4 ms
64 bytes from 1.1.1.1: icmp_seq=2 ttl=50 time=15.1 ms
64 bytes from 1.1.1.1: icmp_seq=3 ttl=50 time<1ms

--- 1.1.1.1 ping statistics ---
20 packets transmitted, 3 received, 85% packet loss, time 3800ms
rtt min/avg/max/mdev = 0.900/10.200/15.400/0.100 ms`

/** Windows pt-BR, which is what the target machine runs. */
const WINDOWS_OUTPUT = `Disparando 8.8.8.8 com 32 bytes de dados:
Resposta de 8.8.8.8: bytes=32 tempo=13ms TTL=117
Resposta de 8.8.8.8: bytes=32 tempo=13,4ms TTL=117
Resposta de 8.8.8.8: bytes=32 tempo<1ms TTL=117
Esgotado o tempo limite do pedido.

Estatísticas do Ping para 8.8.8.8:
    Pacotes: Enviados = 4, Recebidos = 3, Perdidos = 1 (25% de perda),
Aproximar um rtt em milissegundos:
    Mínimo = 12ms, Máximo = 20ms, Média = 13ms`

describe('parsePingTimes', () => {
  it('reads the per-packet times from Linux output', () => {
    expect(parsePingTimes(LINUX_OUTPUT)).toEqual([15.4, 15.1, 1])
  })

  it('reads the localized Windows output without the summary lines', () => {
    // "Mínimo = 12ms" has no TTL, so it cannot become a sample.
    expect(parsePingTimes(WINDOWS_OUTPUT)).toEqual([13, 13.4, 1])
  })

  it('accepts the English Windows wording', () => {
    const output = [
      'Reply from 1.1.1.1: bytes=32 time=12ms TTL=57',
      'Reply from 1.1.1.1: bytes=32 time=12.5ms TTL=57'
    ].join('\n')

    expect(parsePingTimes(output)).toEqual([12, 12.5])
  })

  it('returns nothing when no packet came back', () => {
    expect(parsePingTimes('Request timed out.\n100% packet loss')).toEqual([])
  })
})

describe('summarizePing', () => {
  it('computes min/avg/max, jitter and loss', () => {
    const stat = summarizePing('Roteador', '192.168.0.1', {
      times: [10, 20, 15],
      sent: 4
    })

    expect(stat).toMatchObject({
      name: 'Roteador',
      address: '192.168.0.1',
      sent: 4,
      lost: 1,
      lossPercent: 25,
      answered: true,
      minMs: 10,
      avgMs: 15,
      maxMs: 20,
      // |20-10| + |15-20|, divided by 2.
      jitterMs: 7.5
    })
  })

  it('reports a host that never answered as unanswered', () => {
    const stat = summarizePing('Internet · Google', '8.8.8.8', { times: [], sent: 20 })

    expect(stat).toMatchObject({
      answered: false,
      lost: 20,
      lossPercent: 100
    })
    expect(stat.avgMs).toBeUndefined()
    expect(stat.minMs).toBeUndefined()
  })
})

describe('pingCountFor', () => {
  it('covers the requested duration on each platform', () => {
    // Windows pings once per second; Linux honors the 200 ms interval.
    const expected = process.platform === 'win32' ? 9 : 41
    expect(pingCountFor(8000, 200)).toBe(expected)
  })
})

function stat(overrides: Partial<NetworkPingStat> = {}): NetworkPingStat {
  return {
    name: 'Internet · Cloudflare',
    address: '1.1.1.1',
    sent: 20,
    lost: 0,
    minMs: 10,
    avgMs: 12,
    maxMs: 15,
    jitterMs: 2,
    lossPercent: 0,
    answered: true,
    ...overrides
  }
}

const router = stat({
  name: 'Roteador',
  address: '192.168.0.1',
  minMs: 1,
  avgMs: 2,
  maxMs: 4,
  jitterMs: 1
})

describe('buildNetworkVerdict', () => {
  it('calls a quiet router and a fast internet "estável"', () => {
    const result = buildNetworkVerdict({
      gateway: router,
      internet: [stat(), stat({ name: 'Internet · Google', address: '8.8.8.8' })],
      dnsMs: 12,
      downloadMbps: 300,
      uploadMbps: 150,
      loadedMs: 20
    })

    expect(result.verdict).toBe('good')
    expect(result.reasons[0]).toMatch(/Latência baixa/)
  })

  it('keeps "estável" when only the router refuses ping', () => {
    const result = buildNetworkVerdict({ gateway: null, internet: [stat()] })

    expect(result.verdict).toBe('good')
    expect(result.reasons[0]).toMatch(/O roteador não responde/)
  })

  it('flags the local network before blaming the provider', () => {
    const result = buildNetworkVerdict({
      gateway: stat({ name: 'Roteador', avgMs: 45, jitterMs: 20, lossPercent: 3 }),
      internet: [stat()]
    })

    expect(result.verdict).toBe('warning')
    expect(result.reasons[0]).toMatch(/rede local está instável/)
  })

  it('is critical when no internet server answers', () => {
    const result = buildNetworkVerdict({
      gateway: router,
      internet: [stat({ answered: false, avgMs: undefined, lossPercent: 100 })]
    })

    expect(result.verdict).toBe('critical')
    expect(result.reasons[0]).toMatch(/Nenhum dos servidores da internet respondeu/)
  })

  it('is critical for more than 5% loss, and names the reason', () => {
    const result = buildNetworkVerdict({
      gateway: router,
      internet: [stat({ lossPercent: 6, lost: 2 })]
    })

    expect(result.verdict).toBe('critical')
    expect(result.reasons[0]).toMatch(/Perda de pacotes alta/)
  })

  it('is critical above 150 ms, even without any other warning', () => {
    const result = buildNetworkVerdict({
      gateway: router,
      internet: [stat({ avgMs: 160, minMs: 150, maxMs: 170 })]
    })

    expect(result.verdict).toBe('critical')
    expect(result.reasons[0]).toMatch(/Latência muito alta/)
  })

  it('warns about jitter and bufferbloat', () => {
    const jitter = buildNetworkVerdict({
      gateway: router,
      internet: [stat({ jitterMs: 25 })]
    })
    expect(jitter.verdict).toBe('warning')
    expect(jitter.reasons.join(' ')).toMatch(/jitter está alto/)

    const bufferbloat = buildNetworkVerdict({
      gateway: router,
      internet: [stat({ avgMs: 15 })],
      loadedMs: 180
    })
    expect(bufferbloat.verdict).toBe('warning')
    expect(bufferbloat.reasons.join(' ')).toMatch(/bufferbloat/)
  })

  it('warns about slow DNS, failed DNS and slow download', () => {
    const slowDns = buildNetworkVerdict({
      gateway: router,
      internet: [stat()],
      dnsMs: 200
    })
    expect(slowDns.reasons.join(' ')).toMatch(/O DNS demorou/)

    const noDns = buildNetworkVerdict({
      gateway: router,
      internet: [stat()],
      dnsFailures: 3
    })
    expect(noDns.verdict).toBe('warning')
    expect(noDns.reasons.join(' ')).toMatch(/Nenhum domínio pôde ser resolvido/)

    const slow = buildNetworkVerdict({
      gateway: router,
      internet: [stat()],
      downloadMbps: 6
    })
    expect(slow.verdict).toBe('warning')
    expect(slow.reasons.join(' ')).toMatch(/Download baixo/)
  })

  it('warns when the speed test could not run at all', () => {
    const result = buildNetworkVerdict({
      gateway: router,
      internet: [stat()],
      speedError: true
    })

    expect(result.verdict).toBe('warning')
    expect(result.reasons.join(' ')).toMatch(/Não foi possível medir a velocidade/)
  })

  it('never pretends to know the connection without ping', () => {
    const result = buildNetworkVerdict({
      gateway: null,
      internet: [],
      pingAvailable: false,
      downloadMbps: 100
    })

    expect(result.verdict).toBe('unknown')
    expect(result.reasons[0]).toMatch(/ping não está disponível/)
  })
})
