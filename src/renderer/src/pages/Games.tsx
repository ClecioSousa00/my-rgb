/**
 * Jogos.
 *
 * One question: with this machine, what should this game run at? The answer
 * comes from the dataset shipped with the app - PCGameBenchmarks estimates for
 * 1080p/High on twelve reference GPUs, plus the measured runs Open GPU
 * Benchmarks publishes - so the page works offline and never waits for a
 * server.
 *
 * Two rules shape the UI:
 *
 * - a measured number and an estimate never look the same (each row and the
 *   detail card carry the source and the confidence as text, not colour);
 * - the 1% low is shown only when a run measured it. There is no universal
 *   ratio from the average, so an estimate leaves it "não disponível".
 *
 * The table is the page; the detail card explains the selected row and the
 * sources card carries the attribution the licences require.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  GameOptions,
  GameResult,
  GameHardware,
  GamesReport,
  GpuMatch
} from '@shared/features/games'
import {
  CONFIDENCE_LABEL,
  DEFAULT_GAME_OPTIONS,
  FPS_RATING_BANDS,
  FPS_SOURCE_LABEL,
  GAME_PRESETS,
  GAME_RESOLUTIONS,
  GAME_UPSCALING,
  describeOptions
} from '@shared/features/games'
import { Card } from '../components/ui/Card'
import { Metric, MetricGrid } from '../components/ui/Metric'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'

type SortKey = 'fps' | 'name' | 'source'

const SHORT_SOURCE: Record<GameResult['source'], string> = {
  measured: 'Medido',
  estimated: 'Estimativa',
  none: 'Sem dados'
}

const SOURCE_ORDER: Record<GameResult['source'], number> = {
  measured: 0,
  estimated: 1,
  none: 2
}

function rating(fps: number | null): string {
  if (fps === null) return 'Sem dados'
  return FPS_RATING_BANDS.find((band) => fps >= band.min)?.label ?? '—'
}

function fpsText(row: GameResult): string {
  if (row.avg === null) return '—'
  // A capped estimate means "at least this much", which is not a measurement.
  return row.cap !== undefined ? `≥${row.avg}` : String(row.avg)
}

function shortDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('pt-BR')
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
            type="button"
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

/** Hardware line: what was detected, what it matched and how to override it. */
function HardwareCard({
  gpu,
  cpu,
  override,
  onOverride,
  onClearOverride
}: {
  gpu: GameHardware
  cpu: string
  override: string | null
  onOverride: (name: string) => void
  onClearOverride: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GpuMatch[]>([])
  const [searching, setSearching] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    const current = ++seq.current
    setSearching(true)
    const timer = setTimeout(() => {
      window.myrgb
        .searchGpus(trimmed, 8)
        .then((found) => {
          if (seq.current !== current) return
          setResults(found)
          setSearching(false)
        })
        .catch(() => {
          if (seq.current !== current) return
          setResults([])
          setSearching(false)
        })
    }, 200)

    return () => clearTimeout(timer)
  }, [query, open])

  const matched = gpu.matched !== undefined

  return (
    <Section
      title="Hardware considerado"
      chip={matched ? `${gpu.g3d} G3D` : 'GPU fora da base'}
      action={
        <button type="button" className="btn btn-ghost" onClick={() => setOpen((value) => !value)}>
          {open ? 'Fechar' : override ? 'Trocar GPU' : 'Escolher GPU'}
        </button>
      }
    >
      <MetricGrid columns={2}>
        <Metric
          label="Placa de vídeo detectada"
          value={gpu.detected}
          hint={gpu.manual ? 'detecção do sistema preservada' : undefined}
        />
        <Metric label="Processador detectado" value={cpu} />
        <Metric
          label="GPU usada na consulta"
          value={gpu.matched ?? 'Não identificada na base'}
          hint={
            gpu.manual
              ? 'modelo escolhido manualmente'
              : matched
                ? 'correspondência com a base de GPUs'
                : 'escolha o modelo para ver uma estimativa'
          }
        />
        <Metric
          label="Score de referência"
          value={gpu.g3d !== undefined ? String(gpu.g3d) : '—'}
          hint="PassMark G3D, usado para colocar a placa na curva"
        />
      </MetricGrid>

      {!matched && (
        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-300">
          A GPU detectada não foi encontrada entre as 1.381 placas da base. Nenhum índice padrão
          é usado para preencher a lacuna: selecione o modelo mais próximo abaixo. A detecção do
          sistema não é alterada.
        </p>
      )}

      {override && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-[11.5px] text-ink-300">
            Usando <span className="text-ink-100">{override}</span> manualmente.
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClearOverride}>
            Voltar à detecção
          </button>
        </div>
      )}

      {open && (
        <div className="mt-4 border-t border-ink-800 pt-4">
          <div className="metric-label">Buscar modelo na base</div>
          <input
            className="field mt-2 max-w-md"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Ex.: RTX 4070, RX 7800 XT, Radeon 780M"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          {searching && <p className="mt-2 text-[11px] text-ink-400">Procurando…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="mt-2 text-[11px] text-ink-400">Nenhum modelo corresponde à busca.</p>
          )}

          {results.length > 0 && (
            <ul className="mt-2 max-h-56 divide-y divide-ink-800 overflow-y-auto rounded border border-ink-800">
              {results.map((gpuMatch) => (
                <li key={gpuMatch.name}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left hover:bg-ink-800"
                    onClick={() => {
                      onOverride(gpuMatch.name)
                      setOpen(false)
                      setQuery('')
                      setResults([])
                    }}
                  >
                    <span className="min-w-0 truncate text-[12px] text-ink-100">
                      {gpuMatch.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
                      {gpuMatch.g3d} · {gpuMatch.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  )
}

/** Everything the reader needs to trust (or distrust) the selected row. */
function ResultCard({ row }: { row: GameResult }): React.JSX.Element {
  return (
    <Section
      title={`Resultado · ${row.game}`}
      chip={FPS_SOURCE_LABEL[row.source]}
      action={<span className="text-[10.5px] text-ink-500">confiança {CONFIDENCE_LABEL[row.confidence]}</span>}
    >
      <MetricGrid columns={3}>
        <Metric
          label="FPS médio"
          value={fpsText(row)}
          hint={row.avg !== null ? rating(row.avg) : undefined}
        />
        <Metric
          label="1% low"
          value={row.low1 !== null ? String(row.low1) : 'Não disponível'}
          hint={row.low1 === null ? 'só é exibido quando medido' : 'medido na execução'}
        />
        <Metric label="Tipo de resultado" value={FPS_SOURCE_LABEL[row.source]} />
        <Metric label="GPU considerada" value={row.gpu ?? '—'} />
        <Metric
          label="CPU considerada"
          value={row.cpu ?? 'Não considerada na estimativa'}
          hint={row.cpu ? 'informada pela execução medida' : 'a base estima apenas pela GPU'}
        />
        <Metric
          label="Confiança"
          value={CONFIDENCE_LABEL[row.confidence]}
          hint={row.confidence === 'unknown' ? 'sem base para prever' : undefined}
        />
        {row.cap !== undefined && <Metric label="Teto aplicado" value={`${row.cap} FPS`} />}
        {row.sampleCount !== undefined && (
          <Metric label="Amostras" value={String(row.sampleCount)} />
        )}
        {row.year !== undefined && <Metric label="Ano" value={String(row.year)} />}
        {row.sourceRef && (
          <Metric label="Referência da fonte" value={row.sourceRef} hint="identificador do registo" />
        )}
      </MetricGrid>

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-300">{row.explanation}</p>

      {row.warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {row.warnings.map((warning) => (
            <li key={warning} className="flex gap-2 text-[11px] leading-relaxed text-ink-400">
              <span className="text-ink-500">—</span>
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Attribution, licence and the version of the data that is bundled. */
function SourcesCard({ report }: { report: GamesReport }): React.JSX.Element {
  return (
    <Section title="Fontes e licenças" chip="offline">
      <ul className="space-y-3">
        {report.sources.map((source) => (
          <li key={source.id} className="text-[11.5px] leading-relaxed text-ink-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-100">{source.name}</span>
              <span className="chip">{source.kind === 'measured' ? 'medido' : 'estimado'}</span>
              {source.snapshot && (
                <span className="text-[10.5px] text-ink-500">
                  versão {shortDate(source.snapshot) ?? source.snapshot}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-ink-500">
              <a
                className="underline decoration-ink-600 underline-offset-2 hover:text-ink-100"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.url}
              </a>
              {source.dataset && (
                <a
                  className="underline decoration-ink-600 underline-offset-2 hover:text-ink-100"
                  href={source.dataset}
                  target="_blank"
                  rel="noreferrer"
                >
                  conjunto de dados
                </a>
              )}
              <a
                className="underline decoration-ink-600 underline-offset-2 hover:text-ink-100"
                href={source.licenseUrl}
                target="_blank"
                rel="noreferrer"
              >
                licença {source.license}
              </a>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-1 border-t border-ink-800 pt-3 text-[10.5px] leading-relaxed text-ink-500">
        <p>
          Base normalizada distribuída com o aplicativo
          {report.dataGeneratedAt ? ` (gerada em ${shortDate(report.dataGeneratedAt)})` : ''}. Os
          dados foram adaptados ao formato do MyRGB; a fonte original mantém a autoria.
        </p>
        <p>
          A página funciona sem internet. Nenhum valor é calculado a partir de um índice padrão de
          GPU ou CPU: hardware fora da base fica explicitamente sem dados.
        </p>
        <p>
          O 1% low só aparece quando uma execução o mediu; nunca é derivado de uma percentagem
          fixa do FPS médio.
        </p>
      </div>
    </Section>
  )
}

export function GamesPage(): React.JSX.Element {
  const [options, setOptions] = useState<GameOptions>(DEFAULT_GAME_OPTIONS)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [override, setOverride] = useState<string | null>(null)
  const [report, setReport] = useState<GamesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('fps')
  const seq = useRef(0)

  // Typing should not fire a query per key; the dataset lives in the main
  // process, but a 17k-row search still deserves a small pause.
  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  const load = useCallback(async () => {
    const current = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const next = await window.myrgb.listGames({
        ...options,
        search: appliedSearch,
        gpu: override
      })
      if (seq.current !== current) return
      setReport(next)
    } catch (err) {
      if (seq.current !== current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (seq.current === current) setLoading(false)
    }
  }, [options, appliedSearch, override])

  useEffect(() => {
    void load()
  }, [load])

  // Keep a row selected across option/search changes; fall back to the first.
  useEffect(() => {
    if (!report) return
    if (selected && report.rows.some((row) => row.game === selected)) return
    setSelected(report.rows[0]?.game ?? null)
  }, [report, selected])

  const change = useCallback(<K extends keyof GameOptions>(key: K, value: GameOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }))
  }, [])

  const rows = useMemo(() => {
    const copy = report ? report.rows.slice() : []
    if (sort === 'fps') {
      copy.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
    } else if (sort === 'source') {
      copy.sort(
        (a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a.game.localeCompare(b.game, 'pt-BR')
      )
    } else {
      copy.sort((a, b) => a.game.localeCompare(b.game, 'pt-BR'))
    }
    return copy
  }, [report, sort])

  const selectedRow = useMemo(() => {
    if (!report) return undefined
    return report.rows.find((row) => row.game === selected) ?? report.rows[0]
  }, [report, selected])

  const subtitle = report
    ? `${report.gpu.matched ?? report.gpu.detected} · ${report.cpu.detected}`
    : 'Quanto FPS esperar em cada jogo, com o hardware detectado.'

  const countLine = report
    ? report.matched === 0
      ? 'nenhum jogo'
      : appliedSearch
        ? `${report.rows.length} de ${report.matched} ${report.matched === 1 ? 'jogo' : 'jogos'}` +
          (report.truncated ? ' (refine a busca)' : '')
        : `${report.rows.length} em destaque de ${report.catalogSize.toLocaleString('pt-BR')}`
    : undefined

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <PageHeader page="games" subtitle={subtitle}>
        <span className="text-[11px] text-ink-400">
          {loading ? 'consultando a base local…' : 'base local · offline'}
        </span>
      </PageHeader>

      {error && (
        <Card className="mt-5 max-w-3xl">
          <div className="metric-label">Falha ao montar a tabela</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
          <button className="btn mt-4" onClick={() => void load()}>
            Tentar de novo
          </button>
        </Card>
      )}

      {!report && !error && (
        <div className="mt-8 text-[12px] text-ink-400">Lendo a base local de jogos…</div>
      )}

      {report && (
        <div className="mt-5 space-y-4">
          <Card>
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
              <div className="ml-auto self-end text-right">
                <div className="metric-label">Configuração</div>
                <div className="mt-2 font-mono text-[11.5px] text-ink-300">
                  {describeOptions(options)}
                </div>
              </div>
            </div>
          </Card>

          <HardwareCard
            gpu={report.gpu}
            cpu={report.cpu.detected}
            override={override}
            onOverride={(name) => setOverride(name)}
            onClearOverride={() => setOverride(null)}
          />

          {selectedRow && <ResultCard row={selectedRow} />}

          <Section
            title="Catálogo"
            chip={countLine}
            scroll
            action={
              <div className="flex items-center gap-2">
                <span className="metric-label">Ordenar</span>
                {(
                  [
                    { id: 'fps', label: 'FPS' },
                    { id: 'source', label: 'Fonte' },
                    { id: 'name', label: 'Nome' }
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="chip"
                    data-active={sort === item.id}
                    aria-pressed={sort === item.id}
                    onClick={() => setSort(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="field w-full max-w-sm"
                type="search"
                placeholder="Buscar entre os 17 mil jogos da base"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {loading && <span className="text-[10.5px] text-ink-500">atualizando…</span>}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.08em] text-ink-500">
                    <th scope="col" className="pb-2 pr-4 font-semibold">
                      Jogo
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-semibold">
                      FPS médio
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-semibold">
                      1% low
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-semibold">
                      Fonte
                    </th>
                    <th scope="col" className="pb-2 font-semibold">
                      Confiança
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const active = row.game === selected
                    return (
                      <tr
                        key={row.game}
                        className={`cursor-pointer border-t border-ink-800 align-middle hover:bg-ink-900 ${
                          active ? 'bg-ink-900' : ''
                        }`}
                        onClick={() => setSelected(row.game)}
                      >
                        <td className="py-2.5 pr-4">
                          <button
                            type="button"
                            className="block max-w-[260px] truncate text-left text-[12.5px] text-ink-100 hover:underline"
                            title={row.game}
                            onClick={() => setSelected(row.game)}
                          >
                            {row.game}
                          </button>
                          <div className="text-[10.5px] text-ink-500">
                            {row.year ?? 'ano não informado'}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="font-mono text-[16px] leading-none text-ink-100">
                            {fpsText(row)}
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.06em] text-ink-500">
                            {rating(row.avg)}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          {row.low1 !== null ? (
                            <span className="font-mono text-[12px] text-ink-300">{row.low1}</span>
                          ) : (
                            <span className="text-[10.5px] text-ink-500">Não disponível</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="chip" data-active={row.source === 'measured'}>
                            {SHORT_SOURCE[row.source]}
                          </span>
                        </td>
                        <td className="py-2.5 text-[11px] text-ink-400">
                          {CONFIDENCE_LABEL[row.confidence]}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {rows.length === 0 && (
              <p className="mt-4 text-[11.5px] text-ink-400">
                {loading
                  ? 'Procurando…'
                  : 'Nenhum jogo corresponde à busca. A base cobre 17 mil títulos; tente parte do nome.'}
              </p>
            )}
          </Section>

          {report.notes.length > 0 && (
            <Section title="Observações" collapsible>
              <ul className="space-y-1.5">
                {report.notes.map((note) => (
                  <li
                    key={note}
                    className="flex gap-2 text-[11.5px] leading-relaxed text-ink-300"
                  >
                    <span className="text-ink-500">—</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <SourcesCard report={report} />
        </div>
      )}
    </div>
  )
}
