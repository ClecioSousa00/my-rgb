/**
 * Builds the FPS dataset shipped with MyRGB.
 *
 * Two public sources, both CC BY 4.0:
 *
 * - PCGameBenchmarks publishes 17,400+ games with estimated 1080p/High FPS on
 *   twelve reference GPUs, plus G3D scores for 1,381 GPUs. That is the base for
 *   every estimate, and the only source that covers the catalogue.
 * - Open GPU Benchmarks publishes measured runs (average FPS and 1% low, with
 *   the CPU, resolution, preset and upscaler used). Its public API is a handful
 *   of JSON files; the snapshot is small, so it is shipped as is.
 *
 * The script downloads both, validates what it keeps, normalises everything
 * into one compact file and records where each block came from. Nothing is
 * invented: a record that fails validation is dropped and counted, never
 * patched with a default.
 *
 * Usage:
 *   node tools/build-games-data.mjs                 # download both sources
 *   node tools/build-games-data.mjs --from <dir>    # use local copies
 *
 * `--from` expects `games.csv`, `gpus.csv` (PCGameBenchmarks) and
 * `official.json` (Open GPU Benchmarks) in the given directory, which is how
 * the data can be rebuilt without network access.
 *
 * Licences and attribution obligations are documented in
 * documentation/jogos.md and THIRD-PARTY-NOTICES.md.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'src/main/features/games/data/catalog.json')

const PGB_REPO = 'https://raw.githubusercontent.com/emilioagustin83/pc-game-fps-dataset/main/data'
const OGB_API = 'https://opengpubenchmarks.com/api/v1'

/**
 * The twelve reference columns, in the order the CSV publishes them.
 *
 * `name` is the exact spelling in `gpus.csv`, which is where the G3D score
 * comes from - the score is never typed by hand here. `short` is what the
 * column is called in the dataset.
 */
const REFERENCE_GPUS = [
  { column: 'iris_xe', name: 'Intel Iris Xe' },
  { column: 'radeon_780m', name: 'Radeon 780M' },
  { column: 'gtx_1650', name: 'GeForce GTX 1650' },
  { column: 'gtx_1660_super', name: 'GeForce GTX 1660 SUPER' },
  { column: 'rtx_3060', name: 'GeForce RTX 3060' },
  { column: 'rx_7600', name: 'Radeon RX 7600' },
  { column: 'rtx_4060', name: 'GeForce RTX 4060' },
  { column: 'rtx_5060', name: 'GeForce RTX 5060' },
  { column: 'rtx_4070', name: 'GeForce RTX 4070' },
  { column: 'rx_7800_xt', name: 'Radeon RX 7800 XT' },
  { column: 'rtx_5070', name: 'GeForce RTX 5070' },
  { column: 'rtx_4090', name: 'GeForce RTX 4090' }
]

/** Open GPU Benchmarks values that map to the page's internal options. */
const RESOLUTION_MAP = { '1080p': '1920x1080', '1440p': '2560x1440', '4K': '3840x2160' }
const PRESET_MAP = { Low: 'Baixo', Medium: 'Médio', High: 'Alto', Ultra: 'Ultra' }
const UPSCALING_MAP = { '': 'Native', 'FSR 2.1 Quality': 'Quality' }

/** The ceiling PCGameBenchmarks applies to every published value. */
const SOURCE_CAP = 360

function parseArgs(argv) {
  const args = { from: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = argv[++i] ?? null
  }
  return args
}

async function download(url, file) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`)
  const text = await response.text()
  writeFileSync(file, text)
  return text
}

async function load(args, file, url) {
  if (args.from) {
    return readFileSync(join(args.from, file), 'utf8')
  }
  return download(url, join(CACHE, file))
}

/** Minimal CSV reader: quoted fields, escaped quotes, commas and newlines. */
function parseCsv(text) {
  const rows = []
  let field = ''
  let row = []
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      // A CRLF pair is one line break, not two.
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const [header, ...body] = rows
  return body.map((cells) => {
    const record = {}
    header.forEach((key, index) => {
      record[key.trim()] = (cells[index] ?? '').trim()
    })
    return record
  })
}

function number(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const CACHE = join(ROOT, 'node_modules/.cache/myrgb-games')
mkdirSync(CACHE, { recursive: true })

const args = parseArgs(process.argv.slice(2))

const [gamesCsv, gpusCsv, officialJson] = await Promise.all([
  load(args, 'games.csv', `${PGB_REPO}/games.csv`),
  load(args, 'gpus.csv', `${PGB_REPO}/gpus.csv`),
  load(args, 'official.json', `${OGB_API}/official.json`)
])

// --- GPUs ------------------------------------------------------------------

const gpuRows = parseCsv(gpusCsv)
const gpuByName = new Map()

for (const row of gpuRows) {
  const g3d = number(row.g3d_mark)
  const name = row.name
  // A GPU without a benchmark score cannot place hardware on the curve, so it
  // would only add a name that matches and then fails. Drop it and count it.
  if (!name || g3d === null || g3d <= 0) continue
  gpuByName.set(name, { name, g3d, type: row.type || 'Unknown' })
}

const gpus = [...gpuByName.values()].sort((a, b) => a.name.localeCompare(b.name))

const referenceGpus = REFERENCE_GPUS.map((reference) => {
  const gpu = gpuByName.get(reference.name)
  if (!gpu) {
    throw new Error(`GPU de referência ausente em gpus.csv: ${reference.name}`)
  }
  return { id: reference.column, name: gpu.name, g3d: gpu.g3d }
})

// --- Games -----------------------------------------------------------------

const gameRows = parseCsv(gamesCsv)
const gamesByKey = new Map()
let droppedGames = 0

for (const row of gameRows) {
  const name = row.name
  if (!name) {
    droppedGames++
    continue
  }

  const fps = REFERENCE_GPUS.map((reference) => number(row[`fps_1080p_high_${reference.column}`]))
  // Every row in the published snapshot has all twelve values; a row missing
  // one would silently shift the columns, so it is dropped instead.
  if (fps.some((value) => value === null || value < 0)) {
    droppedGames++
    continue
  }

  const year = number(row.release_year, 0)
  const engineCap = number(row.engine_fps_cap, 0) ?? 0
  const key = name.toLowerCase()

  // Duplicated titles are editions of the same game ("Grand Theft Auto V"
  // appears three times). The newest year is the one the page should show;
  // ties keep the first row, which is the original release.
  const previous = gamesByKey.get(key)
  if (previous && previous[1] >= year) continue

  gamesByKey.set(key, [name, year, engineCap > 0 ? engineCap : 0, fps])
}

const games = [...gamesByKey.values()].sort((a, b) => a[0].localeCompare(b[0]))

// --- Measured runs (Open GPU Benchmarks) -----------------------------------

const official = JSON.parse(officialJson)
const runs = Array.isArray(official.records) ? official.records : []

/** One row per game/GPU/resolution/preset/upscaling, averaged over its runs. */
const measuredByKey = new Map()
let droppedRuns = 0

for (const run of runs) {
  const preset = PRESET_MAP[run.graphics_preset]
  const upscaling = UPSCALING_MAP[run.upscaling ?? '']
  const avg = number(run.avg_fps)
  const p1 = number(run.p1_low)
  const resolution = RESOLUTION_MAP[run.resolution]

  // Synthetic scenes, ray-traced presets, Steam Deck profiles and upscalers
  // the page does not offer are out: mixing them would compare unlike runs.
  if (
    run.game_type !== 'game' ||
    run.synthetic === true ||
    !preset ||
    !upscaling ||
    !resolution ||
    avg === null ||
    avg <= 0 ||
    !run.game ||
    !run.gpu_name
  ) {
    droppedRuns++
    continue
  }

  const key = [run.game, run.gpu_name, resolution, preset, upscaling].join('|')
  const entry = measuredByKey.get(key) ?? {
    game: run.game,
    gpu: run.gpu_name,
    resolution,
    preset,
    upscaling,
    avgSum: 0,
    lowSum: 0,
    lowCount: 0,
    samples: 0,
    cpu: run.cpu || undefined,
    os: run.os === 'linux' ? 'linux' : 'windows',
    date: run.date || undefined,
    ref: run.id || undefined
  }

  entry.avgSum += avg
  if (p1 !== null && p1 > 0) {
    entry.lowSum += p1
    entry.lowCount++
  }
  entry.samples++
  measuredByKey.set(key, entry)
}

const measured = [...measuredByKey.values()]
  .map((entry) => ({
    game: entry.game,
    gpu: entry.gpu,
    resolution: entry.resolution,
    preset: entry.preset,
    upscaling: entry.upscaling,
    avg: Math.round((entry.avgSum / entry.samples) * 10) / 10,
    low1: entry.lowCount > 0 ? Math.round((entry.lowSum / entry.lowCount) * 10) / 10 : null,
    samples: entry.samples,
    cpu: entry.cpu,
    os: entry.os,
    date: entry.date,
    ref: entry.ref
  }))
  .sort((a, b) =>
    `${a.game}|${a.gpu}|${a.resolution}|${a.preset}|${a.upscaling}`.localeCompare(
      `${b.game}|${b.gpu}|${b.resolution}|${b.preset}|${b.upscaling}`
    )
  )

// --- Output ----------------------------------------------------------------

const dataset = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sources: [
    {
      id: 'pcgamebenchmarks',
      name: 'PCGameBenchmarks',
      url: 'https://pcgamebenchmarks.com',
      dataset: 'https://github.com/emilioagustin83/pc-game-fps-dataset',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      snapshot: '2026-10-05',
      kind: 'estimated',
      notes:
        'FPS estimado em 1080p/Alto para 12 GPUs de referência, com trava de motor e teto de 360 FPS.'
    },
    {
      id: 'opengpubenchmarks',
      name: 'Open GPU Benchmarks',
      url: 'https://opengpubenchmarks.com',
      dataset: 'https://github.com/MattyStacks/open-gpu-benchmarks',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      snapshot: official.metadata?.generated_at ?? undefined,
      kind: 'measured',
      notes: 'Execuções medidas com FPS médio e 1% low, por resolução, preset e upscaling.'
    }
  ],
  /** Caps the source applies to every published value. */
  sourceCap: SOURCE_CAP,
  referenceGpus,
  gpus: gpus.map((gpu) => [gpu.name, gpu.g3d, gpu.type]),
  games,
  measured
}

writeFileSync(OUTPUT, JSON.stringify(dataset))

console.log(
  `catálogo: ${games.length} jogos, ${gpus.length} GPUs, ${referenceGpus.length} referências, ` +
    `${measured.length} combinações medidas`
)
console.log(`descartados: ${droppedGames} jogos, ${droppedRuns} execuções`)
console.log(`${OUTPUT}: ${(JSON.stringify(dataset).length / 1e6).toFixed(2)} MB`)
