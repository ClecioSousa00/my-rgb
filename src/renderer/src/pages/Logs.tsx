/**
 * Registos (logs).
 *
 * O processo principal espelha o console para `<userData>/logs/my-rgb.log`
 * (rotação a 2 MB, três ficheiros) e os dumps de crash ficam em
 * `logs/crash`. Nada sai da máquina: não há servidor de relatórios, nada é
 * enviado.
 *
 * Esta página lista os ficheiros de log, lê o conteúdo de cada um e permite
 * exportar como texto simples para anexar a um relatório de problema.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  LogEntry,
  LogFile,
  LogList,
  LogRead,
  LogLevelFilter
} from '@shared/features/log'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'

const LEVEL_LABEL: Record<LogEntry['level'], string> = {
  error: 'Erro',
  warn: 'Aviso',
  info: 'Info',
  debug: 'Depuração'
}

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  error: 'text-ink-100',
  warn: 'text-ink-300',
  info: 'text-ink-400',
  debug: 'text-ink-500'
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  const digits = unit >= 2 ? 1 : 0
  return `${value.toFixed(digits).replace('.', ',')} ${units[unit]}`
}

export function LogsPage(): React.JSX.Element {
  const [list, setList] = useState<LogList | null>(null)
  const [selected, setSelected] = useState<LogFile | null>(null)
  const [read, setRead] = useState<LogRead | null>(null)
  const [filter, setFilter] = useState<LogLevelFilter>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  const autoRead = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const loadList = useCallback(async () => {
    try {
      const result = await window.myrgb.listLogs()
      if (alive.current) setList(result)
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  const readLog = useCallback(async (file: LogFile) => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.myrgb.readLog(file.name)
      if (alive.current) {
        setSelected(file)
        setRead(result)
      }
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  // The first file is the current log. Open it without making the user click
  // the card that is already highlighted.
  useEffect(() => {
    if (autoRead.current || !list || list.files.length === 0) return
    autoRead.current = true
    void readLog(list.files[0])
  }, [list, readLog])

  const exportLog = useCallback(async () => {
    if (!selected) return
    setLoading(true)
    try {
      const path = await window.myrgb.exportLog(selected.name)
      // A null path means the user closed the save dialog; there is nothing
      // to report. A write failure rejects and reaches the catch below.
      if (alive.current && path) setError(null)
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [selected])

  const filteredEntries = useMemo(() => {
    if (!read) return []
    if (filter === 'all') return read.entries
    return read.entries.filter((entry) => entry.level === filter)
  }, [read, filter])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <PageHeader page="logs">
        {list && (
          <div className="flex shrink-0 items-center gap-3">
            <button
              className="btn btn-ghost"
              onClick={() => void window.myrgb.openLogsFolder?.()}
              title="Abrir a pasta de registos"
            >
              📂
            </button>
          </div>
        )}
      </PageHeader>

      {error && (
        <Card className="max-w-3xl">
          <div className="metric-label">Falha ao ler registos</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
          <button className="btn mt-4" onClick={() => setError(null)}>
            Fechar
          </button>
        </Card>
      )}

      {!list && !error && (
        <p className="max-w-3xl text-[11px] leading-relaxed text-ink-500">
          A ler registos…
        </p>
      )}

      {list && list.files.length === 0 && (
        <Card className="max-w-3xl">
          <div className="metric-label">Sem registos</div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-300">
            Ainda não há ficheiros de registo. Eles são criados na primeira execução e
            guardados em <span className="font-mono">{list.directory}</span>.
          </p>
        </Card>
      )}

      {list && list.files.length > 0 && (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <Section title="Ficheiros de registo">
            <div className="space-y-2">
              {list.files.map((file) => {
                const isSelected = selected?.name === file.name
                return (
                  <button
                    key={file.name}
                    type="button"
                    onClick={() => void readLog(file)}
                    className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'border-ink-100 bg-ink-800 text-ink-100'
                        : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-500'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate font-medium">{file.name}</span>
                        {file.current && <span className="text-[10px] text-ink-500">atual</span>}
                      </div>
                      <div className="mt-0.5 text-[10px] text-ink-500">
                        {formatBytes(file.size)} · {formatDate(new Date(file.mtimeMs).toISOString())}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </Section>

          <Section title="Conteúdo">
            {loading && !read && (
              <p className="text-[11px] text-ink-500">A ler ficheiro…</p>
            )}

            {!loading && read && (
              <div className="space-y-1 max-h-[60vh] overflow-y-auto border border-ink-800 rounded-lg p-3 bg-ink-900/50">
                {filteredEntries.length === 0 && (
                  <p className="text-[11px] text-ink-500">
                    Sem entradas para exibir com este filtro.
                  </p>
                )}
                {filteredEntries.map((entry) => (
                  <div
                    key={`${entry.at}-${entry.message.slice(0, 40)}`}
                    className="flex gap-2 text-[10.5px] leading-relaxed font-mono"
                  >
                    <span className="shrink-0 text-ink-600">{formatTime(entry.at)}</span>
                    <span className={`shrink-0 font-bold ${LEVEL_COLOR[entry.level]}`}>
                      {LEVEL_LABEL[entry.level]}
                    </span>
                    <span className="flex-1 text-ink-200 whitespace-pre-wrap break-words">
                      {entry.message}
                    </span>
                  </div>
                ))}
                {read.skipped > 0 && (
                  <p className="mt-1 text-[10px] text-ink-500">
                    {read.skipped} linha(s) ignorada(s) por não corresponder ao formato.
                  </p>
                )}
              </div>
            )}

            {read && read.entries.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-ink-500">Filtrar por nível:</span>
                {(['error', 'warn', 'info', 'debug'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFilter(level)}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                      filter === level
                        ? 'border-ink-100 bg-ink-800 text-ink-100'
                        : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-500'
                    }`}
                  >
                    {LEVEL_LABEL[level]}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                    filter === 'all'
                      ? 'border-ink-100 bg-ink-800 text-ink-100'
                      : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-500'
                  }`}
                >
                  Todos
                </button>
                <button
                  className="btn btn-ghost ml-auto"
                  onClick={exportLog}
                  disabled={loading}
                  title="Exportar como ficheiro de texto"
                >
                  Exportar .txt
                </button>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}
