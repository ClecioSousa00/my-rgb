/**
 * Storage analysis tab.
 *
 * Three states, one screen: choose what to scan, watch the scan, read the
 * report. Nothing starts on its own - a full disk walk is expensive and the
 * user asked for it.
 *
 * The report is produced by the main process (in a utilityProcess) and kept
 * there, so leaving the tab and coming back shows the last result instead of
 * pretending no scan ever ran. A scan started before the tab opened is joined,
 * not restarted.
 *
 * Everything here is read-only: the only actions are "scan", "cancel" and
 * "show in the file manager".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DriveInfo } from '@shared/features/system'
import type {
  StorageDuplicateProgress,
  StorageDuplicateReport,
  StorageFile,
  StorageGame,
  StorageNode,
  StorageProgress,
  StorageReport
} from '@shared/features/storage'
import {
  STORAGE_GROWTH_MIN_BYTES,
  STORAGE_GROWTH_PERCENT,
  STORAGE_LOW_SPACE_PERCENT,
  STORAGE_NOTABLE_BYTES,
  STORAGE_TOP_FILES
} from '@shared/features/storage'
import {
  filterStorageFiles,
  storageExtensions,
  storageShare,
  type StorageFileSort
} from '@shared/features/storage-view'
import { formatBytes, formatCount, formatPercent } from '@shared/format'
import { Card } from './ui/Card'
import { Metric, MetricGrid } from './ui/Metric'

const MAX_INDENT = 10

function fileDate(epoch?: number): string {
  if (epoch === undefined) return '—'
  const date = new Date(epoch)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR')
}

function fileDateFull(epoch?: number): string | undefined {
  if (epoch === undefined) return undefined
  const date = new Date(epoch)
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString('pt-BR')
}

function seconds(ms: number): string {
  // A small folder finishes in milliseconds; "0,0 s" would look like a
  // measurement that failed.
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

/** A share that is real but rounds to 0,1% is shown as "< 0,1%", not "0,0%". */
function shareText(share?: number): string {
  if (share === undefined) return '—'
  if (share > 0 && share < 0.1) return '< 0,1%'
  return formatPercent(share, 1)
}

/** Name to show for the volume that holds the report, when it was matched. */
function driveLabel(report: StorageReport, drives: DriveInfo[]): string | undefined {
  if (!report.driveId) return undefined
  const drive = drives.find((entry) => entry.id === report.driveId)
  if (!drive) return report.driveId
  return drive.label ?? (drive.mount === '/' ? 'Sistema' : drive.mount)
}

interface AnalysisProps {
  drives: DriveInfo[]
}

export function StorageAnalysis({ drives }: AnalysisProps): React.JSX.Element {
  const [report, setReport] = useState<StorageReport | null>(null)
  const [progress, setProgress] = useState<StorageProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canceled, setCanceled] = useState(false)
  /** Folder picked for the next scan (a drive or anything from the dialog). */
  const [target, setTarget] = useState<string | null>(null)
  /** Duplicate scan state, separate from the storage scan. */
  const [duplicateReport, setDuplicateReport] = useState<StorageDuplicateReport | null>(null)
  const [duplicateProgress, setDuplicateProgress] = useState<StorageDuplicateProgress | null>(null)
  const [duplicateRunning, setDuplicateRunning] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const start = useCallback(async (root: string) => {
    setRunning(true)
    setCanceled(false)
    setError(null)
    setProgress({ files: 0, dirs: 0, bytes: 0, currentPath: root, elapsedMs: 0 })
    try {
      const result = await window.myrgb.startStorageScan(root)
      if (!alive.current) return
      if (result) setReport(result)
      else setCanceled(true)
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (alive.current) {
        setRunning(false)
        setProgress(null)
      }
    }
  }, [])

  /**
   * Reattach to a scan that was already running when the tab opened.
   *
   * `joinStorageScan` waits for the same promise without starting anything, so
   * the gap between the status check and the call cannot begin a second walk.
   */
  const attach = useCallback(async (initial: StorageProgress | null) => {
    setRunning(true)
    setCanceled(false)
    setError(null)
    setProgress(initial)
    try {
      const result = await window.myrgb.joinStorageScan()
      if (!alive.current) return
      if (result) {
        setReport(result)
      } else {
        // It finished between the status and the join; show what it left.
        const last = await window.myrgb.getStorageReport()
        if (alive.current && last) setReport(last)
      }
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (alive.current) {
        setRunning(false)
        setProgress(null)
      }
    }
  }, [])

  const startDuplicate = useCallback(async (root: string) => {
    setDuplicateRunning(true)
    setDuplicateProgress({
      stage: 'sizing',
      files: 0,
      sizeGroups: 0,
      candidates: 0,
      confirmed: 0,
      currentPath: root,
      elapsedMs: 0
    })
    try {
      const result = await window.myrgb.startStorageDuplicateScan(root)
      if (!alive.current) return
      if (result) setDuplicateReport(result)
      else {
        // It finished between the status and the join; show what it left.
        const last = await window.myrgb.getStorageDuplicateReport()
        if (alive.current && last) setDuplicateReport(last)
      }
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (alive.current) {
        setDuplicateRunning(false)
        setDuplicateProgress(null)
      }
    }
  }, [])

  /** Reattach to a duplicate analysis already in flight. */
  const attachDuplicate = useCallback(async (initial: StorageDuplicateProgress | null) => {
    setDuplicateRunning(true)
    setDuplicateProgress(initial)
    try {
      const result = await window.myrgb.getStorageDuplicateReport()
      if (!alive.current) return
      if (result) setDuplicateReport(result)
      else {
        const last = await window.myrgb.getStorageDuplicateReport()
        if (alive.current && last) setDuplicateReport(last)
      }
    } catch {
      // Ignore; the user can start a new scan.
    } finally {
      if (alive.current) {
        setDuplicateRunning(false)
        setDuplicateProgress(null)
      }
    }
  }, [])

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const [last, status, dupLast, dupStatus] = await Promise.all([
          window.myrgb.getStorageReport(),
          window.myrgb.getStorageStatus(),
          window.myrgb.getStorageDuplicateReport(),
          window.myrgb.getStorageDuplicateStatus()
        ])
        if (!mounted) return
        if (last) {
          setReport(last)
          // Coming back to "Outra pasta" keeps the last root selected.
          setTarget(last.root)
        }
        if (status.running) {
          if (status.root) setTarget(status.root)
          await attach(status.progress)
        }
        if (dupLast) setDuplicateReport(dupLast)
        if (dupStatus?.running) {
          await attachDuplicate(dupStatus.progress)
        }
      } catch {
        // The tab still works: the user can start a new scan.
      }
    })()
    return () => {
      mounted = false
    }
  }, [attach, attachDuplicate])

  useEffect(
    () =>
      window.myrgb.onStorageProgress((next) => {
        if (!alive.current) return
        setProgress(next)
      }),
    []
  )

  useEffect(
    () =>
      window.myrgb.onStorageDuplicateProgress((next) => {
        if (!alive.current) return
        setDuplicateProgress(next)
      }),
    []
  )

  const cancel = useCallback(async () => {
    try {
      await window.myrgb.cancelStorageScan()
    } catch {
      // The pending start call already reports the cancellation.
    }
  }, [])

  const cancelDuplicate = useCallback(async () => {
    try {
      await window.myrgb.cancelStorageDuplicateScan()
    } catch {
      // The pending start call already reports the cancellation.
    }
  }, [])

  const pick = useCallback(async () => {
    try {
      const path = await window.myrgb.pickStorageFolder()
      if (path) setTarget(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const reveal = useCallback((path: string) => {
    void window.myrgb.revealStoragePath(path).catch(() => undefined)
  }, [])

  return (
    <div className="space-y-4">
      {error && (
        <Card className="max-w-3xl">
          <div className="metric-label">Falha na análise</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
          <button className="btn mt-4" onClick={() => setError(null)}>
            Fechar
          </button>
        </Card>
      )}

      {!report && !running && !error && (
        <Chooser
          drives={drives}
          target={target}
          onPick={() => void pick()}
          onSelect={setTarget}
          onStart={() => target && void start(target)}
        />
      )}

      {canceled && !running && (
        <p className="text-[11.5px] text-ink-400">
          Análise cancelada. Nada foi alterado no disco; o último resultado, se houver, continua
          abaixo.
        </p>
      )}

      {running && <RunningCard progress={progress} onCancel={() => void cancel()} />}

      {report && (
        <>
          <SummaryCard
            report={report}
            drives={drives}
            running={running}
            onRescan={() => void start(report.root)}
            onAnother={() => {
              setCanceled(false)
              setReport(null)
            }}
          />
          <SuggestionsCard report={report} onReveal={reveal} />
          <GamesCard report={report} onReveal={reveal} />
          <DuplicatesCard
            report={duplicateReport}
            running={duplicateRunning}
            progress={duplicateProgress}
            onStart={() => target && void startDuplicate(target)}
            onCancel={() => void cancelDuplicate()}
            onReveal={reveal}
          />
          <div className="grid items-stretch gap-4 xl:grid-cols-2">
            <FilesCard report={report} onReveal={reveal} />
            <FoldersCard report={report} />
          </div>
        </>
      )}

      {!report && !running && !error && (
        <p className="max-w-3xl text-[11px] leading-relaxed text-ink-500">
          A análise é só de leitura: nada é apagado, movido ou alterado. Links simbólicos e pontos
          de montagem não são seguidos, e uma pasta sem permissão entra como observação em vez de
          interromper a varredura.
        </p>
      )}
    </div>
  )
}

function Chooser({
  drives,
  target,
  onPick,
  onSelect,
  onStart
}: {
  drives: DriveInfo[]
  target: string | null
  onPick: () => void
  onSelect: (path: string) => void
  onStart: () => void
}): React.JSX.Element {
  return (
    <Card className="max-w-3xl">
      <div className="text-[13.5px] font-medium text-ink-100">Análise de armazenamento</div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
        Escolha uma unidade ou uma pasta. A varredura mostra o tamanho de cada pasta, a quantidade
        de arquivos e os maiores arquivos — e pode ser cancelada a qualquer momento.
      </p>

      {drives.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {drives.map((drive) => {
            const selected = target === drive.mount
            const title = drive.label ?? (drive.mount === '/' ? 'Sistema' : drive.mount)
            // Same rule the suggestion card uses: the warning is a fact about
            // the volume, so it is shown before the scan, not only after it.
            const lowSpace =
              drive.totalBytes > 0 &&
              (drive.freeBytes / drive.totalBytes) * 100 < STORAGE_LOW_SPACE_PERCENT
            return (
              <button
                key={drive.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(drive.mount)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? 'border-ink-100 bg-ink-800 text-ink-100'
                    : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-500'
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[12.5px] font-medium">{title}</span>
                  {lowSpace && (
                    <span
                      className="chip shrink-0"
                      title={`Menos de ${STORAGE_LOW_SPACE_PERCENT}% de espaço livre`}
                    >
                      pouco espaço
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-500">
                  {drive.mount} · {formatBytes(drive.freeBytes)} livres
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn" onClick={onPick}>
          Escolher pasta…
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-400" title={target ?? undefined}>
          {target ?? 'nenhuma pasta escolhida'}
        </span>
        <button className="btn btn-primary shrink-0" onClick={onStart} disabled={!target}>
          Analisar
        </button>
      </div>

      {target && (
        <p className="mt-3 text-[10.5px] leading-relaxed text-ink-500">
          Quanto maior a pasta, mais tempo demora. A leitura respeita as permissões do sistema e
          nunca pede privilégio administrativo.
        </p>
      )}
    </Card>
  )
}

function RunningCard({
  progress,
  onCancel
}: {
  progress: StorageProgress | null
  onCancel: () => void
}): React.JSX.Element {
  const percent =
    progress?.fraction === undefined
      ? undefined
      : Math.round(Math.max(0, Math.min(1, progress.fraction)) * 100)

  return (
    <Card className="max-w-3xl">
      <div className="flex flex-nowrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink-100">Analisando…</div>
          <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-500" title={progress?.currentPath}>
            {progress?.currentPath ?? 'preparando a varredura'}
          </div>
        </div>
        <button className="btn shrink-0 whitespace-nowrap" onClick={onCancel}>
          Cancelar
        </button>
      </div>

      <div className="mt-4">
        <MetricGrid columns={3}>
          <Metric label="Arquivos" value={formatCount(progress?.files)} />
          <Metric label="Pastas" value={formatCount(progress?.dirs)} />
          <Metric label="Tamanho lido" value={formatBytes(progress?.bytes)} />
        </MetricGrid>
      </div>

      {percent !== undefined && (
        <div
          className="mt-4 h-1 w-full overflow-hidden rounded-full bg-ink-700"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full bg-ink-100 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed text-ink-500">
        A varredura corre num processo separado, então o resto do app continua respondendo.
        {percent === undefined
          ? ' O andamento em porcentagem só aparece quando a pasta é a raiz da unidade.'
          : ` ${percent}% do espaço usado da unidade já foi lido.`}
      </p>
    </Card>
  )
}

function SummaryCard({
  report,
  drives,
  running,
  onRescan,
  onAnother
}: {
  report: StorageReport
  drives: DriveInfo[]
  running: boolean
  onRescan: () => void
  onAnother: () => void
}): React.JSX.Element {
  const drive = report.driveId ? drives.find((entry) => entry.id === report.driveId) : undefined
  const usedShare =
    drive && drive.usedBytes > 0 ? storageShare(report.bytes, drive.usedBytes) : undefined
  const label = driveLabel(report, drives)

  return (
    <Card className="max-w-4xl">
      <div className="flex flex-nowrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium text-ink-100" title={report.root}>
            {report.root}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-ink-500">
            {label ? `Unidade ${label} · ` : ''}
            {fileDateFull(report.at) ?? '—'}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="btn" onClick={onAnother} disabled={running}>
            Outra pasta
          </button>
          <button className="btn" onClick={onRescan} disabled={running}>
            {running ? 'Analisando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <MetricGrid columns={3}>
          <Metric label="Tamanho analisado" value={formatBytes(report.bytes)} />
          <Metric label="Arquivos" value={formatCount(report.files)} />
          <Metric label="Pastas" value={formatCount(report.dirs)} />
          <Metric
            label="Da unidade"
            value={shareText(usedShare)}
            hint={
              drive
                ? `${formatBytes(drive.usedBytes)} usados na unidade`
                : 'unidade não identificada'
            }
          />
          <Metric label="Duração" value={seconds(report.durationMs)} />
          <Metric
            label="Sem permissão"
            value={formatCount(report.denied)}
            hint={report.denied > 0 ? 'o total não inclui essas pastas' : 'tudo foi lido'}
          />
        </MetricGrid>
      </div>

      {report.notes.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-ink-800 pt-3">
          {report.notes.map((note) => (
            <li key={note} className="flex gap-2 text-[11px] leading-relaxed text-ink-300">
              <span className="text-ink-500">—</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function SuggestionsCard({
  report,
  onReveal
}: {
  report: StorageReport
  onReveal: (path: string) => void
}): React.JSX.Element {
  const suggestions = report.suggestions

  return (
    <Card className="max-w-4xl">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
          Sugestões
        </h2>
        <span className="chip shrink-0">
          {suggestions.length === 0 ? 'nada a apontar' : formatCount(suggestions.length)}
        </span>
      </div>

      {suggestions.length === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-300">
          Nada a apontar nesta análise. Isso não atesta que o disco está saudável: as regras abaixo
          são as únicas verificações feitas.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-800">
          {suggestions.map((suggestion) => (
            <li key={suggestion.kind} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[12.5px] font-medium text-ink-100">{suggestion.title}</div>
                {suggestion.bytes !== undefined && (
                  <span className="shrink-0 font-mono text-[11.5px] text-ink-200">
                    {formatBytes(suggestion.bytes)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-300">{suggestion.detail}</p>

              {suggestion.items.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {suggestion.items.map((item) => (
                    <li key={item.path} className="flex items-center gap-2">
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-400"
                        title={item.path}
                      >
                        {item.path}
                      </span>
                      {item.note && (
                        <span className="shrink-0 font-mono text-[10.5px] text-ink-300">
                          {item.note}
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn shrink-0 px-2 py-0.5 text-[10.5px]"
                        title="Mostrar no gerenciador de arquivos"
                        aria-label={`Mostrar ${item.path} no gerenciador de arquivos`}
                        onClick={() => onReveal(item.path)}
                      >
                        ↗
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 border-t border-ink-800 pt-3 text-[10.5px] leading-relaxed text-ink-500">
        São sugestões, não problemas obrigatórios. Regras: unidade com menos de{' '}
        {STORAGE_LOW_SPACE_PERCENT}% livre; arquivo de {formatBytes(STORAGE_NOTABLE_BYTES)} ou mais
        entre os 500 maiores; pasta temporária, de downloads ou de cache com{' '}
        {formatBytes(STORAGE_NOTABLE_BYTES)} ou mais; pasta que cresceu{' '}
        {formatBytes(STORAGE_GROWTH_MIN_BYTES)} e {STORAGE_GROWTH_PERCENT}% desde a análise
        anterior desta mesma pasta.
      </p>
    </Card>
  )
}

const PLATFORM_LABEL: Record<StorageGame['platform'], string> = {
  steam: 'Steam',
  epic: 'Epic',
  riot: 'Riot'
}

function GamesCard({
  report,
  onReveal
}: {
  report: StorageReport
  onReveal: (path: string) => void
}): React.JSX.Element {
  const games = report.games
  const total = games.reduce((sum, game) => sum + game.bytes, 0)

  return (
    <Card className="card-scroll max-w-4xl">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
          Jogos
        </h2>
        <span className="chip shrink-0">
          {games.length === 0 ? 'nenhum' : `${formatCount(games.length)} · ${formatBytes(total)}`}
        </span>
      </div>

      <div className="card-scroll-body mt-3 pr-1">
        {games.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-ink-300">
            Nenhuma instalação conhecida nesta pasta. Os jogos aparecem quando a análise inclui a
            pasta de instalação do launcher.
          </p>
        ) : (
          games.map((game) => (
            <div
              key={`${game.platform}:${game.path}`}
              className="flex items-start gap-2 border-b border-ink-800 py-2 last:border-0"
            >
              <span className="mt-0.5 shrink-0">
                <span className="chip">{PLATFORM_LABEL[game.platform]}</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-ink-100" title={game.name}>
                  {game.name}
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-ink-500" title={game.path}>
                  {game.path}
                </div>
                {game.nameSource === 'folder' && (
                  <div className="mt-0.5 text-[10px] text-ink-500">nome pelo nome da pasta</div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[11.5px] text-ink-200">{formatBytes(game.bytes)}</div>
                <div className="mt-0.5 text-[10px] text-ink-500">
                  {formatCount(game.files)} arquivos
                </div>
              </div>
              <button
                type="button"
                className="btn shrink-0 px-2 py-1"
                title="Mostrar no gerenciador de arquivos"
                aria-label={`Mostrar ${game.name} no gerenciador de arquivos`}
                onClick={() => onReveal(game.path)}
              >
                ↗
              </button>
            </div>
          ))
        )}
      </div>

      <p className="mt-2 shrink-0 text-[10px] leading-relaxed text-ink-500">
        Reconhecidos pela pasta de instalação: Steam (<code>steamapps/common</code>), Epic Games e
        Riot Games. O nome vem do manifesto do Steam quando existe; sem manifesto, é o nome da
        pasta. Battle.net, Xbox/Microsoft Store e outras bibliotecas não são lidos — um jogo desses
        continua visível pelo tamanho nas maiores pastas.
      </p>
    </Card>
  )
}

function DuplicatesCard({
  report,
  running,
  progress,
  onStart,
  onCancel,
  onReveal
}: {
  report: StorageDuplicateReport | null
  running: boolean
  progress: StorageDuplicateProgress | null
  onStart: () => void
  onCancel: () => void
  onReveal: (path: string) => void
}): React.JSX.Element {
  const stageLabel: Record<StorageDuplicateProgress['stage'], string> = {
    idle: 'Aguardando',
    'sizing': 'Agrupando por tamanho',
    'partial-hash': 'Confirmação parcial',
    'full-hash': 'Confirmação completa',
    done: 'Concluído'
  }

  return (
    <Card className="card-scroll max-w-4xl">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
          Arquivos duplicados
        </h2>
        <span className="chip shrink-0">
          {report ? `${formatCount(report.duplicates.length)} sets · ${formatBytes(report.totalRecoverableBytes)}` : '—'}
        </span>
      </div>

      {running && (
        <div className="mt-3 flex flex-nowrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-ink-100">
              {stageLabel[progress?.stage ?? 'idle']}
            </div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-ink-500" title={progress?.currentPath}>
              {progress?.currentPath ?? 'preparando'}
            </div>
          </div>
          <button className="btn shrink-0 whitespace-nowrap" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      )}

      {!running && !report && (
        <div className="mt-3 flex items-center gap-2">
          <button className="btn" onClick={onStart}>
            Procurar duplicados
          </button>
          <p className="text-[11px] text-ink-500">
            Compara tamanho, depois hash parcial e hash completo. Nada é apagado.
          </p>
        </div>
      )}

      {running && progress && (
        <div className="mt-3">
          <MetricGrid columns={3}>
            <Metric label="Arquivos" value={formatCount(progress.files)} />
            <Metric label="Candidatos" value={formatCount(progress.candidates)} />
            <Metric label="Confirmados" value={formatCount(progress.confirmed)} />
          </MetricGrid>
        </div>
      )}

      {!running && report && report.duplicates.length === 0 && (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-300">
          Nenhum duplicado encontrado nesta pasta. Dois arquivos só são duplicados quando o conteúdo
          é idêntico — o nome sozinho não basta.
        </p>
      )}

      {!running && report && report.duplicates.length > 0 && (
        <div className="card-scroll-body mt-3 pr-1">
          {report.duplicates.map((dup) => (
            <div
              key={dup.hash}
              className="flex items-start gap-2 border-b border-ink-800 py-2 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[12px] font-medium text-ink-100" title={dup.name}>
                    {dup.name}
                  </span>
                  <span className="chip shrink-0">{formatBytes(dup.size)}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-ink-500">
                  {formatCount(dup.copies.length)} cópias · {formatBytes(dup.recoverableBytes)} recuperável
                </div>
                <ul className="mt-1 space-y-1">
                  {dup.copies.map((copy) => (
                    <li key={copy.path} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-ink-500">—</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] text-ink-200" title={copy.path}>
                          {copy.path}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn shrink-0 px-2 py-0.5 text-[10px]"
                        title="Mostrar no gerenciador de arquivos"
                        aria-label={`Mostrar ${copy.path} no gerenciador de arquivos`}
                        onClick={() => onReveal(copy.path)}
                      >
                        ↗
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[11.5px] text-ink-200">
                  {formatBytes(dup.recoverableBytes)}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-500">recuperável</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!running && report && report.duplicates.length > 0 && (
        <p className="mt-2 shrink-0 text-[10px] leading-relaxed text-ink-500">
          {formatBytes(report.totalRecoverableBytes)} poderiam ser liberados mantendo uma cópia de
          cada conjunto. Nada é apagado — cabe a você decidir o que remover.
        </p>
      )}
    </Card>
  )
}

function FilesCard({
  report,
  onReveal
}: {
  report: StorageReport
  onReveal: (path: string) => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [ext, setExt] = useState('')
  const [sort, setSort] = useState<StorageFileSort>('size')
  const extensions = useMemo(() => storageExtensions(report.topFiles), [report.topFiles])
  const files = useMemo(
    () => filterStorageFiles(report.topFiles, { text, ext, sort }),
    [report.topFiles, text, ext, sort]
  )

  return (
    <Card className="card-scroll">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
          Maiores arquivos
        </h2>
        <span className="chip shrink-0">
          {files.length} de {report.topFiles.length}
        </span>
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
        <input
          className="field w-40 flex-1"
          type="search"
          value={text}
          placeholder="Buscar pelo nome…"
          aria-label="Buscar arquivo pelo nome"
          onChange={(event) => setText(event.target.value)}
        />
        <select
          className="field w-32 shrink-0"
          value={ext}
          aria-label="Filtrar por extensão"
          onChange={(event) => setExt(event.target.value)}
        >
          <option value="">Todas</option>
          {extensions.map((value) => (
            <option key={value} value={value}>
              .{value}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className={`btn px-2 py-1 ${sort === 'size' ? 'border-ink-100 text-ink-100' : ''}`}
            aria-pressed={sort === 'size'}
            onClick={() => setSort('size')}
          >
            Tamanho
          </button>
          <button
            type="button"
            className={`btn px-2 py-1 ${sort === 'name' ? 'border-ink-100 text-ink-100' : ''}`}
            aria-pressed={sort === 'name'}
            onClick={() => setSort('name')}
          >
            Nome
          </button>
        </div>
      </div>

      <div className="card-scroll-body mt-2 pr-1">
        {files.length === 0 && (
          <p className="py-3 text-[11.5px] text-ink-400">
            Nenhum arquivo corresponde ao filtro.
          </p>
        )}

        {files.map((file) => (
          <FileRow key={file.path} file={file} onReveal={onReveal} />
        ))}
      </div>

      <p className="mt-2 shrink-0 text-[10px] leading-relaxed text-ink-500">
        A lista guarda os {STORAGE_TOP_FILES} maiores arquivos da varredura; o restante entra nos
        totais, não na lista.
      </p>
    </Card>
  )
}

function FileRow({
  file,
  onReveal
}: {
  file: StorageFile
  onReveal: (path: string) => void
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2 border-b border-ink-800 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[12px] text-ink-100" title={file.name}>
            {file.name}
          </span>
          {file.ext && <span className="chip shrink-0">{file.ext}</span>}
        </div>
        <div
          className="mt-0.5 truncate font-mono text-[10px] text-ink-500"
          title={file.path}
        >
          {file.path}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-[11.5px] text-ink-200">{formatBytes(file.bytes)}</div>
        <div className="mt-0.5 text-[10px] text-ink-500" title={fileDateFull(file.mtimeMs)}>
          {fileDate(file.mtimeMs)}
        </div>
      </div>
      <button
        type="button"
        className="btn shrink-0 px-2 py-1"
        title="Mostrar no gerenciador de arquivos"
        aria-label={`Mostrar ${file.name} no gerenciador de arquivos`}
        onClick={() => onReveal(file.path)}
      >
        ↗
      </button>
    </div>
  )
}

function FoldersCard({ report }: { report: StorageReport }): React.JSX.Element {
  return (
    <Card className="card-scroll">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-300">
          Maiores pastas
        </h2>
        <span className="chip shrink-0">por tamanho</span>
      </div>

      <div className="card-scroll-body mt-3 pr-1">
        <FolderRow node={report.tree} total={report.bytes} depth={0} />
      </div>

      <p className="mt-2 shrink-0 text-[10px] leading-relaxed text-ink-500">
        Expandir uma pasta não lê o disco de novo: a árvore veio da mesma varredura. Cada pasta
        mostra as 20 subpastas maiores.
      </p>
    </Card>
  )
}

function FolderRow({
  node,
  total,
  depth
}: {
  node: StorageNode
  total: number
  depth: number
}): React.JSX.Element {
  const [open, setOpen] = useState(depth === 0)
  const hasChildren = node.children.length > 0
  const share = storageShare(node.bytes, total)
  const date = fileDate(node.mtimeMs)

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-start gap-2 rounded px-1 py-1.5 text-left hover:bg-ink-700/40"
        style={{ paddingLeft: 4 + Math.min(depth, MAX_INDENT) * 14 }}
        aria-expanded={hasChildren ? open : undefined}
        title={node.path}
        onClick={() => hasChildren && setOpen((value) => !value)}
      >
        <span aria-hidden="true" className="mt-0.5 w-3 shrink-0 text-[9px] text-ink-500">
          {hasChildren ? (open ? '▾' : '▸') : '·'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-ink-100">{node.name}</span>
          <span className="mt-0.5 block truncate text-[10px] text-ink-500">
            {formatCount(node.files)} arquivos · {formatCount(node.dirs)} pastas · {date}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[11.5px] text-ink-200">
            {formatBytes(node.bytes)}
          </span>
          <span className="mt-0.5 block text-[10px] text-ink-500">{shareText(share)}</span>
        </span>
      </button>

      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderRow key={child.path} node={child} total={total} depth={depth + 1} />
          ))}
          {node.more && (
            <p
              className="py-1.5 text-[10px] text-ink-500"
              style={{ paddingLeft: 4 + Math.min(depth + 1, MAX_INDENT) * 14 }}
            >
              outras subpastas não listadas
            </p>
          )}
        </div>
      )}
    </div>
  )
}
