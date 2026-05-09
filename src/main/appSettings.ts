import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { safeStorage } from 'electron'
import type { AppSettings } from '../shared/types'
import { atomicWrite, porticoDir } from './util'

export type { AppSettings, PermissionMode } from '../shared/types'

interface PersistedSettings extends AppSettings {
  // Encrypted via safeStorage when available, base64-encoded. Plaintext fallback
  // (Linux without keyring) is allowed but tagged so we can warn the user.
  apiKeyEnc?: string
  apiKeyPlain?: string
}

// First-run defaults are conservative: the agent has Bash/Write/etc. so we
// require user approval per tool, with Haiku auto-screening on. Existing
// users keep whatever they had — the merge in load() preserves their values.
const DEFAULTS: AppSettings = {
  permissionMode: 'ask',
  autoScreen: true
}

// Listeners notified after settings change so caches that depend on env vars
// (e.g. screenTool's Anthropic client) can invalidate.
const changeListeners: Array<() => void> = []
export function onChange(cb: () => void): () => void {
  changeListeners.push(cb)
  return () => {
    const i = changeListeners.indexOf(cb)
    if (i >= 0) changeListeners.splice(i, 1)
  }
}

let cache: PersistedSettings | null = null

function file(): string {
  return join(porticoDir(), 'settings.json')
}

function load(): PersistedSettings {
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

function persist(): void {
  if (!cache) return
  atomicWrite(file(), JSON.stringify(cache, null, 2))
}

function decryptKey(s: PersistedSettings): string | null {
  if (s.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(s.apiKeyEnc, 'base64'))
    } catch {
      return null
    }
  }
  if (s.apiKeyPlain) return s.apiKeyPlain
  return null
}

export type KeyStorage = 'encrypted' | 'plaintext' | 'none'

export interface PublicSettings extends AppSettings {
  gatewayKeySet: boolean
  keyStorage: KeyStorage
}

/** Public-facing snapshot — never includes the raw API key. */
export function get(): PublicSettings {
  const s = load()
  const { apiKeyEnc, apiKeyPlain, ...publicFields } = s
  const keyStorage: KeyStorage = apiKeyEnc ? 'encrypted' : apiKeyPlain ? 'plaintext' : 'none'
  return {
    ...DEFAULTS,
    ...publicFields,
    gatewayKeySet: keyStorage !== 'none' && !!decryptKey(s),
    keyStorage
  }
}

// Whitelist of writable keys — defense against a compromised renderer
// poisoning arbitrary fields into the persisted file.
const WRITABLE: ReadonlySet<keyof AppSettings> = new Set([
  'permissionMode',
  'autoScreen',
  'gatewayBaseUrl'
])

export function set(
  patch: Partial<AppSettings> & { gatewayApiKey?: string | null }
): PublicSettings {
  const s = load()
  // Track previous env values so we can clear them when the user clears the key.
  const hadKey = !!(s.apiKeyEnc || s.apiKeyPlain)

  if (patch.gatewayApiKey !== undefined) {
    if (patch.gatewayApiKey === null || patch.gatewayApiKey === '') {
      delete s.apiKeyEnc
      delete s.apiKeyPlain
    } else if (safeStorage.isEncryptionAvailable()) {
      s.apiKeyEnc = safeStorage.encryptString(patch.gatewayApiKey).toString('base64')
      delete s.apiKeyPlain
    } else {
      s.apiKeyPlain = patch.gatewayApiKey
      delete s.apiKeyEnc
    }
  }
  for (const k of Object.keys(patch) as Array<keyof typeof patch>) {
    if (k === 'gatewayApiKey') continue
    if (WRITABLE.has(k as keyof AppSettings)) {
      ;(s as unknown as Record<string, unknown>)[k] = patch[k]
    }
  }
  cache = s

  // If the in-app key was cleared, also clear the corresponding env var so
  // gatewayInfo() correctly reports configured: false. (Otherwise the .env
  // value lingers in process.env from initial dotenv load.)
  if (hadKey && !s.apiKeyEnc && !s.apiKeyPlain) {
    delete process.env.ANTHROPIC_API_KEY
  }
  persist()
  applyToEnv()
  for (const cb of changeListeners) cb()
  return get()
}

/**
 * Push gateway config into process.env so the Agent SDK and the screening
 * client pick it up. Settings always override .env.
 */
export function applyToEnv(): void {
  const s = load()
  const url = s.gatewayBaseUrl?.trim()
  const key = decryptKey(s)
  if (url) process.env.ANTHROPIC_BASE_URL = url
  if (key) process.env.ANTHROPIC_API_KEY = key
}
