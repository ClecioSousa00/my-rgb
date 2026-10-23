/**
 * Detects other software that might be fighting us for the lighting.
 *
 * On Windows the usual suspect is Armoury Crate / Aura Sync, which installs
 * a service that owns the controller. On Linux it is OpenRGB. Both write
 * frames on their own schedule, which shows up as flickering.
 */

import { execFile } from 'child_process'

interface ConflictProcess {
  name: string
  pid: string
}

/** Processes known to drive AURA hardware. */
const KNOWN_CONFLICTS: Record<string, string[]> = {
  win32: [
    'LightingService.exe',
    'Armoury Crate.exe',
    'ArmouryCrate.UserSessionHelper.exe',
    'Aac.exe',
    'LightingService',
    'AsusOptimization.exe',
    'AsusSoftwareManager.exe',
    'ArmourySwAgent.exe',
    'AsusOSD.exe'
  ],
  linux: ['openrgb', 'OpenRGB', 'openrgb-server']
}

export interface ConflictReport {
  conflicting: boolean
  processes: ConflictProcess[]
  /** Human readable hint for the user. */
  hint: string
}

/** Names of the application's own process, never treated as a conflict. */
const OWN_PROCESSES = new Set([
  'my-rgb',
  'my-rgb.exe',
  'electron',
  'electron.exe',
  'vitest',
  'vitest.exe',
  'node',
  'node.exe',
  'npm',
  'npm.exe',
  'pnpm',
  'pnpm.exe',
  'yarn',
  'yarn.exe',
  'npx',
  'npx.exe'
])

export async function detectConflicts(platform = process.platform): Promise<ConflictReport> {
  const names = KNOWN_CONFLICTS[platform] ?? []

  if (platform === 'win32') {
    const found = await listWindowsProcesses()
    const relevant = found.filter(
      (p) =>
        names.some((n) => p.name.toLowerCase().includes(n.toLowerCase())) &&
        !OWN_PROCESSES.has(p.name.toLowerCase())
    )
    return {
      conflicting: relevant.length > 0,
      processes: relevant,
      hint:
        'O Armoury Crate / Aura Sync também controla este controlador. ' +
        'Desative a iluminação nas configurações do Armoury Crate (ou encerre o serviço LightingService) ' +
        'para evitar cintilação.'
    }
  }

  const found = await listLinuxProcesses()
  const relevant = found.filter(
    (p) =>
      names.some((n) => p.name.toLowerCase() === n.toLowerCase()) &&
      !OWN_PROCESSES.has(p.name.toLowerCase())
  )
  return {
    conflicting: relevant.length > 0,
    processes: relevant,
    hint:
      'O OpenRGB também está rodando e pode escrever frames no mesmo controlador. ' +
      'Feche-o para evitar cintilação.'
  }
}

async function listWindowsProcesses(): Promise<ConflictProcess[]> {
  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FO', 'CSV', '/NH'],
      { timeout: 4000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve([])
        const out: ConflictProcess[] = []
        for (const line of stdout.split(/\r?\n/)) {
          const m = line.match(/^"([^"]+)","(\d+)"/)
          if (m) out.push({ name: m[1], pid: m[2] })
        }
        resolve(out)
      }
    )
  })
}

async function listLinuxProcesses(): Promise<ConflictProcess[]> {
  return new Promise((resolve) => {
    execFile('ps', ['-eo', 'comm=,pid='], { timeout: 4000 }, (err, stdout) => {
      if (err) return resolve([])
      const out: ConflictProcess[] = []
      for (const line of stdout.split(/\n/)) {
        const m = line.trim().match(/^(\S+)\s+(\d+)$/)
        if (m) out.push({ name: m[1], pid: m[2] })
      }
      resolve(out)
    })
  })
}
