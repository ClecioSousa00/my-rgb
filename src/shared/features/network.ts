/**
 * Network diagnostic (latency, DNS, speed and bufferbloat).
 *
 * The shape mirrors the Reset Explode "Rede" page: one report with the active
 * adapter, one latency block per target, the DNS lookups, the speed test and
 * a verdict with the reasons.
 *
 * A field is absent when it could not be measured - the UI shows "—" instead
 * of zero. A network that answers nothing is not "stable": it is "sem dados"
 * (or "ruim", when the adapter itself is missing).
 */

export type NetworkVerdict = 'good' | 'warning' | 'critical' | 'unknown'

/** Latency and packet loss to one host. */
export interface NetworkPingStat {
  /** Human label: "Roteador", "Internet · Cloudflare"... */
  name: string
  address: string
  /** Packets sent by the diagnostic. */
  sent: number
  lost: number
  minMs?: number
  avgMs?: number
  maxMs?: number
  /** Mean absolute difference between consecutive round trips. */
  jitterMs?: number
  lossPercent: number
  /** At least one reply arrived. */
  answered: boolean
}

export interface NetworkDnsLookup {
  domain: string
  /** Resolution time; absent when the lookup failed. */
  ms?: number
}

export interface NetworkAdapter {
  /** Interface name, e.g. `eno1` or `Wi-Fi`. */
  name: string
  kind: 'wifi' | 'ethernet' | 'other'
  /** Link speed reported by the driver, in Mbps. */
  linkMbps?: number
  ip?: string
  gateway?: string
  /** DNS servers configured on the machine. */
  dns: string[]
}

export interface NetworkReport {
  /** Epoch milliseconds of the collection. */
  at: number
  /** Null when no connected adapter with a gateway was found. */
  adapter: NetworkAdapter | null
  /** Null when the gateway could not be discovered. */
  gateway: NetworkPingStat | null
  /** Cloudflare and Google, in that order. */
  internet: NetworkPingStat[]
  dns: NetworkDnsLookup[]
  /** Average of the successful DNS lookups. */
  dnsMs?: number
  downloadMbps?: number
  uploadMbps?: number
  /** Average latency while the download was saturating the link. */
  loadedMs?: number
  verdict: NetworkVerdict
  /** Why the verdict is what it is, most serious first. */
  reasons: string[]
  /** Page-level limitations (missing ping, blocked speed test, ...). */
  notes: string[]
}

/** Pushed while the diagnostic runs. */
export interface NetworkProgress {
  text: string
  /** 0..1. */
  fraction: number
}

/** How many packets each target receives, and how far apart. */
export const NETWORK_PING_SAMPLES = 20
export const NETWORK_PING_INTERVAL_MS = 200
/** The speed test holds the link for this long, in seconds. */
export const NETWORK_DOWNLOAD_SECONDS = 8
export const NETWORK_UPLOAD_SECONDS = 6
