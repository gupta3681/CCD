import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '../shared/types'
import { atomicWrite, porticoDir } from './util'

export type { AppSettings, PermissionMode } from '../shared/types'

const DEFAULTS: AppSettings = {
  permissionMode: 'auto',
  autoScreen: false
}

let cache: AppSettings | null = null

function file(): string {
  return join(porticoDir(), 'settings.json')
}

export function get(): AppSettings {
  if (cache) return cache
  const f = file()
  if (!existsSync(f)) {
    cache = { ...DEFAULTS }
    return cache
  }
  try {
    const raw = JSON.parse(readFileSync(f, 'utf-8'))
    cache = { ...DEFAULTS, ...raw }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache!
}

export function set(patch: Partial<AppSettings>): AppSettings {
  const next = { ...get(), ...patch }
  cache = next
  atomicWrite(file(), JSON.stringify(next, null, 2))
  return next
}
