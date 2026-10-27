/**
 * Jogos.
 *
 * One table, two sources. The local estimate is computed from the catalog
 * tables the moment the page opens (no network, 32 rows in a millisecond); the
 * HowManyFPS numbers, measured in real sessions, only arrive when a key is
 * stored and always say where they came from.
 *
 * The table is the page: every row carries FPS, 1% low, the limiter and the
 * source, because the useful question is not "how many FPS" but "what is
 * holding it back".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiKeyState, FpsRow, GamesReport, GameOptions } from '@shared/features/games'
import {
  DEFAULT_GAME_OPTIONS,
  FPS_RATING_BANDS,
  GAME_PRESETS,
  GAME_RESOLUTIONS,
  GAME_UPSCALING
} from '@shared/features/games'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'

type SortKey = 'fps' | 'low' | 'name'

const LIMITER_LABEL: Record<FpsRow['limiter'], string> = {
  gpu: 'GPU',
  cpu: 'CPU',
  engine: 'Trava',
  none: '—'
}

function rating(fps?: number): string {
  if (fps === undefined) return '—'
  return FPS_RATING_BANDS.find((band) => fps >= band.min)?.label ?? '—'
}

function limiterTitle(row: FpsRow): string {
  if (row.limiter === 'engine') return row.detail ?? 'Trava do jogo'
  if (row.limiter === 'gpu') return 'Limitado pela placa de vídeo'
  if (row.limiter === 'cpu') return 'Limitado pelo processador'
  return 'Medido pela API'
}

/** A chip group: one line of options, the active one inverted. */
function Options({
  label,
  items,
  value,
  onChange
}: {
  label: string
  items: ReadonlyArray<{ id: string; label: string }>
  value: string
  onChange: (id: string) => void
}): React.JSX.Element {
  return (
    <div>
      <div className="metric-label">{label}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            className="chip"
            data-active={item.id === value}
            aria-pressed={item.id === value}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SourceCard({
  report,
  keyState,
  api,
  onSaveKey,
  onClearKey
}: {
  report: GamesReport
  keyState: ApiKeyState | null
  api: { running: boolean; ok: number; done: boolean; error: string | null }
  onSaveKey: (key: string) => void
  onClearKey: () => void
}): React.JSX.Element {
  const [input, setInput] = useState('')
  const configured = keyState?.configured === true
  const total = report.rows.length

  const description = configured
    ? api.done && api.ok > 0
      ? `${api.ok} de ${total} jogos com dados medidos pela HowManyFPS; os demais usam a ` +
        'estimativa local. As respostas ficam em cache por 7 dias.'
      : 'FPS médio e 1% low medidos em sessões reais. A API usa a resolução e o upscaling da ' +
        'consulta; o preset gráfico vale só para a estimativa local.'
    : 'Calculada a partir do desempenho relativo da sua GPU e CPU, com as mesmas tabelas do ' +
      'Reset Explode. Para FPS medido em jogo, peça uma chave da API em info@howmanyfps.com.'

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="text-[13px] font-medium text-ink-100">
            {configured ? 'Fonte: HowManyFPS (dados reais)' : 'Fonte: estimativa local (aproximada)'}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{description}</p>

          {api.running && (
            <p className="mt-2 text-[11px] text-ink-300">Consultando a HowManyFPS…</p>
          )}
          {!api.running && api.error && (
            <p className="mt-2 text-[11px] text-ink-200">
              A API recusou a consulta ({api.error}). Mostrando a estimativa local.
            </p>
          )}

          {keyState && keyState.configured && !keyState.available && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-200">
              O chaveiro do sistema não está disponível: a chave foi gravada em texto puro em{' '}
              <span className="font-mono">secrets.bin</span>, sem criptografia.
            </p>
          )}
        </div>

        <div className="flex w-full max-w-md flex-col gap-2 sm:w-auto">
          <input
            className="field"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={configured ? 'Trocar a chave da API' : 'Chave da API HowManyFPS'}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && input.trim().length > 0) {
                onSaveKey(input.trim())
                setInput('')
              }
            }}
          />
          <div className="flex gap-2">
            <button
              className="btn flex-1"
              disabled={input.trim().length === 0}
              onClick={() => {
                onSaveKey(input.trim())
                setInput('')
              }}
            >
              {configured ? 'Atualizar chave' : 'Salvar chave'}
            </button>
            {configured && (
              <button className="btn btn-ghost" onClick={onClearKey}>
                Remover
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

/** One table row: the numbers, the limiter and where they came from. */
function Row({ row }: { row: FpsRow }): React.JSX.Element {
  return (
    <tr className="border-t border-ink-800 align-middle">
      <td className="py-2.5 pr-4">
        <div className="truncate text-[12.5px] text-ink-100" title={row.game}>
          {row.game}
        </div>
        <div className="truncate text-[10.5px] text-ink-500">{row.genre}</div>
      </td>
      <td className="py-2.5 pr-4">
        <div className="font-mono text-[16px] leading-none text-ink-100">
          {row.avg !== undefined ? row.avg : '—'}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.06em] text-ink-500">
          {rating(row.avg)}
        </div>
      </td>
      <td className="py-2.5 pr-4 font-mono text-[12px] text-ink-300">
        {row.low1 !== undefined ? row.low1 : '—'}
      </td>
      <td className="py-2.5 pr-4" title={limiterTitle(row)}>
        <span className="chip" data-active={row.limiter === 'engine'}>
          {row.limiter === 'engine' && row.detail
            ? `Trava ${row.detail.replace(/[^0-9]/g, '')}`
            : LIMITER_LABEL[row.limiter]}
        </span>
      </td>
      <td className="py-2.5">
        <span className="chip" data-active={row.source === 'api'}>
          {row.source === 'api' ? 'API' : 'estimativa'}
        </span>
      </td>
    </tr>
  )
}

export function GamesPage(): React.JSX.Element {
  const [options, setOptions] = useState<GameOptions>(DEFAULT_GAME_OPTIONS)
  const [report, setReport] = useState<GamesReport | null>(null)
  const [keyState, setKeyState] = useState<ApiKeyState | null>(null)
  const [apiRows, setApiRows] = useState<Map<string, FpsRow>>(new Map())
  const [apiMisses, setApiMisses] = useState<Map<string, string>>(new Map())
  const [api, setApi] = useState({
    running: false,
    ok: 0,
    done: false,
    error: null as string | null
  })
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('fps')
  const [query, setQuery] = useState('')
  const seq = useRef(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const loadApi = useCallback(async (next: GameOptions, current: number) => {
    setApi((state) => ({ ...state, running: true, done: false, error: null }))
    try {
      const result = await window.myrgb.fetchGameFps(next)
      if (!alive.current || seq.current !== current) return

      setApiRows(new Map(result.rows.map((row) => [row.game, row])))
      setApiMisses(new Map(result.failed.map((miss) => [miss.game, miss.reason])))
      setApi({ running: false, ok: result.ok, done: true, error: result.error ?? null })
    } catch (err) {
      if (!alive.current || seq.current !== current) return
      setApi({
        running: false,
        ok: 0,
        done: true,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }, [])

  const load = useCallback(
    async (next: GameOptions) => {
      const current = ++seq.current
      setError(null)
      try {
        const [state, local] = await Promise.all([
          window.myrgb.getGamesApiKeyState(),
          window.myrgb.listGames(next)
        ])
        if (!alive.current || seq.current !== current) return

        setKeyState(state)
        setReport(local)
        setApiRows(new Map())
        setApiMisses(new Map())
        setApi({ running: false, ok: 0, done: false, error: null })

        if (local.apiKey) void loadApi(next, current)
      } catch (err) {
        if (!alive.current || seq.current !== current) return
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [loadApi]
  )

  useEffect(() => {
    void load(options)
    // `load` is stable; the options are the actual trigger.
  }, [load, options])

  const change = useCallback(<K extends keyof GameOptions>(key: K, value: GameOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }))
  }, [])

  const saveKey = useCallback(
    async (key: string) => {
      try {
        const state = await window.myrgb.setGamesApiKey(key)
        setKeyState(state)
        if (state.configured) {
          setApiRows(new Map())
          setApiMisses(new Map())
          void loadApi(options, seq.current)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [loadApi, options]
  )

  const clearKey = useCallback(async () => {
    try {
      const state = await window.myrgb.setGamesApiKey(null)
      setKeyState(state)
      setApiRows(new Map())
      setApiMisses(new Map())
      setApi({ running: false, ok: 0, done: false, error: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const rows = useMemo<FpsRow[]>(() => {
    if (!report) return []
    return report.rows.map((row) => {
      const measured = apiRows.get(row.game)
      if (measured) return measured
      const miss = apiMisses.get(row.game)
      return miss ? { ...row, detail: `API: ${miss}` } : row
    })
  }, [report, apiRows, apiMisses])

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = normalized
      ? rows.filter(
          (row) =>
            row.game.toLowerCase().includes(normalized) ||
            row.genre.toLowerCase().includes(normalized)
        )
      : rows.slice()

    if (sort === 'fps') filtered.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
    else if (sort === 'low') filtered.sort((a, b) => (b.low1 ?? -1) - (a.low1 ?? -1))
    else filtered.sort((a, b) => a.game.localeCompare(b.game, 'pt-BR'))

    return filtered
  }, [rows, query, sort])

  const subtitle = report
    ? `${report.gpu.short || report.gpu.name} · ${report.cpu.short || report.cpu.name}`
    : 'Quanto FPS esperar em cada jogo, com o seu hardware.'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <PageHeader page="games" subtitle={subtitle}>
        <span className="text-[11px] text-ink-400">
          {api.running
            ? 'consultando a API…'
            : keyState?.configured
              ? 'HowManyFPS ativa'
              : 'estimativa local'}
        </span>
      </PageHeader>

      {error && (
        <Card className="mt-5 max-w-3xl">
          <div className="metric-label">Falha ao montar a tabela</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
          <button className="btn mt-4" onClick={() => void load(options)}>
            Tentar de novo
          </button>
        </Card>
      )}

      {!report && !error && (
        <div className="mt-8 text-[12px] text-ink-400">Lendo o hardware…</div>
      )}

      {report && (
        <>
          <Card className="mt-5">
            <div className="flex flex-wrap gap-x-10 gap-y-5">
              <Options
                label="Resolução"
                items={GAME_RESOLUTIONS}
                value={options.resolution}
                onChange={(id) => change('resolution', id as GameOptions['resolution'])}
              />
              <Options
                label="Gráficos"
                items={GAME_PRESETS.map((preset) => ({ id: preset, label: preset }))}
                value={options.preset}
                onChange={(id) => change('preset', id as GameOptions['preset'])}
              />
              <Options
                label="Upscaling (DLSS / FSR)"
                items={GAME_UPSCALING}
                value={options.upscaling}
                onChange={(id) => change('upscaling', id as GameOptions['upscaling'])}
              />
              <div className="ml-auto self-end">
                <div className="metric-label">Hardware</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="chip" title={report.gpu.name}>
                    {report.gpu.short || 'GPU —'}
                  </span>
                  <span className="chip" title={report.cpu.name}>
                    {report.cpu.short || 'CPU —'}
                  </span>
                  {report.gpu.index === undefined && <span className="chip">GPU fora da tabela</span>}
                  {report.cpu.index === undefined && <span className="chip">CPU fora da tabela</span>}
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-4">
            <SourceCard
              report={report}
              keyState={keyState}
              api={api}
              onSaveKey={(key) => void saveKey(key)}
              onClearKey={() => void clearKey()}
            />
          </div>

          <Card className="mt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="metric-label">Ordenar</span>
                {(
                  [
                    { id: 'fps', label: 'FPS' },
                    { id: 'low', label: '1% low' },
                    { id: 'name', label: 'Nome' }
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    className="chip"
                    data-active={sort === item.id}
                    aria-pressed={sort === item.id}
                    onClick={() => setSort(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto w-60">
                <input
                  className="field"
                  type="search"
                  placeholder="Buscar jogo"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.08em] text-ink-500">
                    <th scope="col" className="pb-2 pr-4 font-semibold">
                      <button
                        className="hover:text-ink-200"
                        onClick={() => setSort('name')}
                        aria-sort={sort === 'name' ? 'ascending' : 'none'}
                      >
                        Jogo
                      </button>
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-semibold">
                      <button
                        className="hover:text-ink-200"
                        onClick={() => setSort('fps')}
                        aria-sort={sort === 'fps' ? 'descending' : 'none'}
                      >
                        FPS médio
                      </button>
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-semibold">
                      <button
                        className="hover:text-ink-200"
                        onClick={() => setSort('low')}
                        aria-sort={sort === 'low' ? 'descending' : 'none'}
                      >
                        1% low
                      </button>
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-semibold">
                      Limitador
                    </th>
                    <th scope="col" className="pb-2 font-semibold">
                      Fonte
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <Row key={row.game} row={row} />
                  ))}
                </tbody>
              </table>
            </div>

            {visible.length === 0 && (
              <p className="mt-4 text-[11.5px] text-ink-400">Nenhum jogo corresponde à busca.</p>
            )}
          </Card>

          {report.notes.length > 0 && (
            <Card className="mt-4 max-w-3xl">
              <div className="metric-label">Observações</div>
              <ul className="mt-3 space-y-1.5">
                {report.notes.map((note) => (
                  <li key={note} className="flex gap-2 text-[11.5px] leading-relaxed text-ink-300">
                    <span className="text-ink-500">—</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-ink-500">
            A estimativa usa tabelas de referência (RTX 4070 e Ryzen 7 7700X = 100) e a fórmula do
            Reset Explode: o menor entre o teto da GPU, o teto da CPU e a trava do jogo. O 1% low
            estimado é 75% da média. A chave da API fica só no processo principal e nunca é enviada
            de volta à interface.
          </p>
        </>
      )}
    </div>
  )
}
