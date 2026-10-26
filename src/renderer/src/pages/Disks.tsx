/**
 * Discos.
 *
 * Two tabs: the volumes the user can fill ("Unidades") and the health of the
 * physical disks ("Saúde"). Health arrives in phase 3, so the tab explains
 * what it will show instead of being empty.
 *
 * Each volume card is built around the occupancy ring, because that is the
 * one number a person checks: how full it is. The sizes under it answer the
 * follow-up question (how much is left) without opening anything.
 */

import { useCallback, useEffect, useState } from 'react'
import type { DriveInfo, DriveKind } from '@shared/features/system'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Ring } from '../components/ui/Ring'
import { Section } from '../components/ui/Section'
import { Tabs } from '../components/ui/Tabs'
import { formatBytes } from '@shared/format'

type DiskTab = 'drives' | 'health'

const KIND_LABEL: Record<DriveKind, string> = {
  ssd: 'SSD',
  hdd: 'HDD',
  usb: 'USB',
  network: 'Rede',
  optical: 'Óptico',
  unknown: 'Unidade'
}

function DriveCard({ drive }: { drive: DriveInfo }): React.JSX.Element {
  // "/" is the system volume; nobody recognises it by the mount point alone.
  const title = drive.label ?? (drive.mount === '/' ? 'Sistema' : drive.mount)
  const disk = drive.physical
  const meta = [drive.fsType, disk?.name, disk?.interfaceType].filter(Boolean)

  return (
    <Card>
      <div className="flex items-center gap-4">
        <Ring percent={drive.usedPercent} title={title} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-[13.5px] font-medium text-ink-100">{title}</span>
            <span className="chip shrink-0">{KIND_LABEL[drive.kind]}</span>
          </div>

          {title !== drive.mount && (
            <div className="mt-0.5 font-mono text-[11px] text-ink-500">{drive.mount}</div>
          )}

          <div className="mt-1.5 font-mono text-[11.5px] text-ink-300">
            {formatBytes(drive.usedBytes)} de {formatBytes(drive.totalBytes)}
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-400">
            {formatBytes(drive.freeBytes)} livres
            {drive.readOnly ? ' · somente leitura' : ''}
          </div>

          {meta.length > 0 && (
            <div className="mt-1.5 truncate text-[10.5px] text-ink-500" title={meta.join(' · ')}>
              {meta.join(' · ')}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function HealthTab(): React.JSX.Element {
  return (
    <Card className="max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <span className="metric-label">Em construção</span>
        <span className="chip">Fase 3</span>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-300">
        A saúde de cada disco exige leitura S.M.A.R.T. No Linux isso vem do{' '}
        <span className="font-mono text-ink-200">smartctl</span> (pacote smartmontools) e alguns
        campos só aparecem com privilégio; no Windows, do helper que está na fase 7. Sem esses
        dados, a página prefere dizer “sem dados” a chamar um disco de saudável.
      </p>

      <ul className="mt-3 space-y-1.5">
        {[
          'Horas ligado, ciclos de energia e desgaste por disco',
          'Setores realocados e pendentes',
          'Temperatura e previsão de falha',
          'Veredito com os motivos, em vez de um número solto'
        ].map((item) => (
          <li key={item} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-200">
            <span className="text-ink-500">—</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] text-ink-500">
        Enquanto isso, a aba Unidades já mostra ocupação e o disco físico de cada volume.
      </p>
    </Card>
  )
}

export function DisksPage(): React.JSX.Element {
  const [tab, setTab] = useState<DiskTab>('drives')
  const [drives, setDrives] = useState<DriveInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDrives(await window.myrgb.listDrives())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const total = drives?.reduce((sum, drive) => sum + drive.totalBytes, 0) ?? 0
  const used = drives?.reduce((sum, drive) => sum + drive.usedBytes, 0) ?? 0
  const summary =
    drives && drives.length > 0
      ? `${drives.length} ${drives.length === 1 ? 'unidade' : 'unidades'} · ${formatBytes(
          used
        )} de ${formatBytes(total)} usados`
      : undefined

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
      <PageHeader page="disks" subtitle={tab === 'drives' ? summary : undefined}>
        <button
          className="btn"
          onClick={() => void load()}
          disabled={loading || tab === 'health'}
        >
          {loading ? 'Lendo…' : 'Atualizar'}
        </button>
      </PageHeader>

      <div className="mt-5">
        <Tabs
          label="Seções de Discos"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'drives', label: 'Unidades', count: drives?.length },
            { id: 'health', label: 'Saúde' }
          ]}
        />
      </div>

      <div className="mt-5">
        {tab === 'health' && <HealthTab />}

        {tab === 'drives' && (
          <>
            {error && (
              <Card className="max-w-3xl">
                <div className="metric-label">Falha ao listar as unidades</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-200">{error}</p>
                <button className="btn mt-4" onClick={() => void load()}>
                  Tentar de novo
                </button>
              </Card>
            )}

            {!error && !drives && loading && (
              <div className="text-[12px] text-ink-400">Lendo as unidades…</div>
            )}

            {!error && drives && drives.length === 0 && (
              <Section title="Unidades">
                <p className="text-[12.5px] text-ink-300">
                  Nenhuma unidade montada foi encontrada.
                </p>
              </Section>
            )}

            {drives && drives.length > 0 && (
              <div className="grid items-start gap-4 xl:grid-cols-2">
                {drives.map((drive) => (
                  <DriveCard key={drive.id} drive={drive} />
                ))}
              </div>
            )}

            {drives && drives.length > 0 && (
              <p className="mt-4 text-[11px] text-ink-500">
                Partições de sistema (EFI, snap) e volumes sem ponto de montagem ficam de fora,
                como no gerenciador de arquivos.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
