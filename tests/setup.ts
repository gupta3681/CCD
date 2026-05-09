import { vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Per-test scratch dirs so writes don't leak across tests. Each test file's
// modules cache module-scoped state (e.g. conversations.ts has `cache`),
// so we reset modules between tests too.

declare global {
  // eslint-disable-next-line no-var
  var __PORTICO_TEST_USER_DATA__: string
  // eslint-disable-next-line no-var
  var __PORTICO_TEST_HOME__: string
}

beforeEach(() => {
  globalThis.__PORTICO_TEST_USER_DATA__ = mkdtempSync(join(tmpdir(), 'portico-userdata-'))
  globalThis.__PORTICO_TEST_HOME__ = mkdtempSync(join(tmpdir(), 'portico-home-'))
  // Reset module registry so each test gets fresh module-scoped caches.
  vi.resetModules()
})

afterEach(() => {
  try {
    rmSync(globalThis.__PORTICO_TEST_USER_DATA__, { recursive: true, force: true })
  } catch {
    // ignore
  }
  try {
    rmSync(globalThis.__PORTICO_TEST_HOME__, { recursive: true, force: true })
  } catch {
    // ignore
  }
  vi.restoreAllMocks()
})

// Global mock for the 'electron' module — main-process code imports `app`
// and `safeStorage`, both of which need to exist in a non-Electron context.
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return globalThis.__PORTICO_TEST_USER_DATA__
      throw new Error(`mock electron.app.getPath: unknown path '${name}'`)
    }
  },
  safeStorage: {
    // Default to "encryption available" to exercise the happy path. Tests can
    // override per-suite via vi.mocked() to test the plaintext fallback.
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (b: Buffer) => {
      const raw = b.toString()
      return raw.startsWith('enc:') ? raw.slice(4) : raw
    }
  }
}))

// homedir() is read at module-load time in userSettings.ts; vi.stubEnv lets
// tests override HOME so that ~/.claude maps into the per-test home dir.
vi.stubGlobal('__getMockedHome__', () => globalThis.__PORTICO_TEST_HOME__)
