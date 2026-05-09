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

const DEFAULTS: AppSettings = {
  permissionMode: 'auto',
  autoScreen: false
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

/** Public-facing snapshot — never includes the raw API key. */
export function get(): AppSettings & { gatewayKeySet: boolean } {
  const s = load()
  const { apiKeyEnc, apiKeyPlain, ...publicFields } = s
  void apiKeyEnc
  void apiKeyPlain
  return {
    ...DEFAULTS,
    ...publicFields,
    gatewayKeySet: !!decryptKey(s)
  }
}

export function set(
  patch: Partial<AppSettings> & { gatewayApiKey?: string | null }
): AppSettings & { gatewayKeySet: boolean } {
  const s = load()
  // Handle key set/clear separately.
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
  const { gatewayApiKey, ...rest } = patch
  void gatewayApiKey
  Object.assign(s, rest)
  cache = s
  persist()
  applyToEnv()
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
