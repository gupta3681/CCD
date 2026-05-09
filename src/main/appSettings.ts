import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'

export type PermissionMode = 'auto' | 'ask'

export interface AppSettings {
  permissionMode: PermissionMode
  autoScreen: boolean
}

const DEFAULTS: AppSettings = {
  permissionMode: 'auto',
  autoScreen: false
}

let cache: AppSettings | null = null

function file(): string {
  const dir = join(app.getPath('userData'), 'portico')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'settings.json')
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
  const f = file()
  const tmp = `${f}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8')
  renameSync(tmp, f)
  return next
}
