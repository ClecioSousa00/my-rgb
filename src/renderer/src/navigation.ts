/**
 * The sidebar map.
 *
 * One source of truth for the pages, their groups and the text each one shows
 * while it is still a placeholder. The sidebar, the page title and the
 * placeholder card all read from here, so adding a page is a single edit.
 */

import type { PageId } from '@shared/types'

export interface PageMeta {
  /** Sidebar label and page title. */
  title: string
  /** One line under the title. */
  subtitle: string
  /** What the page will show once it is implemented. */
  planned: string[]
  /** Plan phase that fills this page in. */
  phase: string
}

export interface NavGroup {
  id: string
  label: string
  items: PageId[]
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'myrgb', label: 'MyRGB', items: ['overview', 'lighting'] },
  { id: 'diagnostico', label: 'Diagnóstico', items: ['system', 'sensors', 'disks', 'network'] },
  { id: 'desempenho', label: 'Desempenho', items: ['games', 'bottleneck', 'overlay'] },
  { id: 'integracoes', label: 'Integrações', items: ['integrations'] }
]

export const PAGE_META: Record<PageId, PageMeta> = {
  overview: {
    title: 'Visão geral',
    subtitle: 'Hardware, desempenho e iluminação em uma tela só.',
    planned: [],
    phase: ''
  },
  lighting: {
    title: 'Iluminação',
    subtitle: 'Efeitos por zona, gradiente e parâmetros.',
    planned: [],
    phase: ''
  },
  system: {
    title: 'Sistema',
    subtitle: 'O que está dentro da máquina, sem precisar abrir o gabinete.',
    planned: [
      'Sistema operacional, placa-mãe e versão da BIOS',
      'Processador: núcleos, threads, clocks e cache',
      'Memória RAM por módulo: fabricante, part number, slot e clock',
      'Placa de vídeo, driver e memória'
    ],
    phase: 'Fase 1'
  },
  sensors: {
    title: 'Sensores',
    subtitle: 'Temperatura, clock, carga, voltagem, ventoinhas e consumo em tempo real.',
    planned: [
      'Leitura a cada segundo, com filtro por tipo de sensor',
      'Mínimo e máximo da sessão por leitura',
      'Destaque quando um sensor passa do limite'
    ],
    phase: 'Fase 2'
  },
  disks: {
    title: 'Discos',
    subtitle: 'Unidades, ocupação e saúde de cada disco físico.',
    planned: [
      'Um cartão por unidade, com anel de ocupação e tipo',
      'Horas ligado, ciclos, desgaste e setores realocados',
      'Veredito com os motivos, em vez de um número solto'
    ],
    phase: 'Fases 1 e 3'
  },
  network: {
    title: 'Rede',
    subtitle: 'Onde está o lag: na sua rede, no provedor ou em lugar nenhum.',
    planned: [
      'Latência, jitter e perda até o roteador e até a internet',
      'Tempo de DNS e velocidade de download e upload',
      'Latência sob carga (bufferbloat) e veredito'
    ],
    phase: 'Fase 4'
  },
  games: {
    title: 'Jogos',
    subtitle: 'Quanto FPS esperar em cada jogo, com o seu hardware.',
    planned: [
      'FPS médio e 1% low por resolução, preset e upscaling',
      'Estimativa local quando não houver chave da HowManyFPS',
      'Selo do limitador: GPU, CPU ou trava do próprio jogo'
    ],
    phase: 'Fase 5'
  },
  bottleneck: {
    title: 'Gargalo',
    subtitle: 'O que está segurando o FPS: GPU, CPU, memória ou temperatura.',
    planned: [
      'Equilíbrio teórico entre processador e placa de vídeo',
      'Leitura ao vivo com o limitador do momento',
      'Análise de sessão de 1, 3 ou 5 minutos com recomendações'
    ],
    phase: 'Fase 6'
  },
  overlay: {
    title: 'Overlay',
    subtitle: 'FPS, frametime e sensores por cima do jogo.',
    planned: [
      'Janela transparente, sempre no topo e que ignora cliques',
      'Atalho global Ctrl+Shift+O para ligar e desligar',
      'Escolha das métricas, opacidade, escala e canto'
    ],
    phase: 'Fase 7'
  },
  integrations: {
    title: 'Integrações',
    subtitle: 'Iluminação de outros fabricantes junto com o AURA.',
    planned: [
      'OpenRGB: placas, memórias e periféricos',
      'Razer Chroma e Corsair iCUE',
      'Um alvo de luz por zona, com o backend escolhido'
    ],
    phase: 'Fase 8'
  }
}

export const PAGE_IDS = Object.keys(PAGE_META) as PageId[]

export function isPageId(value: unknown): value is PageId {
  return typeof value === 'string' && (PAGE_IDS as string[]).includes(value)
}

/** Breadcrumb text for a page. */
export function pageTitle(page: PageId): string {
  return PAGE_META[page].title
}
