import { describe, it, expect, beforeEach, vi } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

async function load(): Promise<{
  app: typeof import('../src/main/appSettings')
  util: typeof import('../src/main/util')
}> {
  const app = await import('../src/main/appSettings')
  const util = await import('../src/main/util')
  return { app, util }
}

const file = (util: { porticoDir: () => string }): string =>
  join(util.porticoDir(), 'settings.json')

describe('first-run defaults', () => {
  it('returns ask + autoScreen when no file exists', async () => {
    const { app } = await load()
    const s = app.get()
    expect(s.permissionMode).toBe('ask')
    expect(s.autoScreen).toBe(true)
    expect(s.gatewayKeySet).toBe(false)
    expect(s.keyStorage).toBe('none')
  })
})

describe('set + get', () => {
  it('persists permissionMode', async () => {
    const { app } = await load()
    app.set({ permissionMode: 'auto' })
    expect(app.get().permissionMode).toBe('auto')
  })

  it('persists autoScreen', async () => {
    const { app } = await load()
    app.set({ autoScreen: false })
    expect(app.get().autoScreen).toBe(false)
  })

  it('persists gatewayBaseUrl', async () => {
    const { app } = await load()
    app.set({ gatewayBaseUrl: 'https://api.portkey.ai/v1' })
    expect(app.get().gatewayBaseUrl).toBe('https://api.portkey.ai/v1')
  })

  it('writes JSON to disk', async () => {
    const { app, util } = await load()
    app.set({ permissionMode: 'auto' })
    expect(existsSync(file(util))).toBe(true)
    expect(JSON.parse(readFileSync(file(util), 'utf-8')).permissionMode).toBe('auto')
  })
})

describe('writable-key whitelist', () => {
  it('ignores unknown keys at the top level', async () => {
    const { app, util } = await load()
    app.set({
      permissionMode: 'auto',
      // @ts-expect-error testing the whitelist
      maliciousKey: 'pwn',
      // @ts-expect-error testing the whitelist
      anotherJunk: { nested: true }
    })
    const raw = JSON.parse(readFileSync(file(util), 'utf-8'))
    expect(raw.maliciousKey).toBeUndefined()
    expect(raw.anotherJunk).toBeUndefined()
    expect(raw.permissionMode).toBe('auto')
  })

  it('does not allow proto pollution via __proto__', async () => {
    const { app } = await load()
    const evil = JSON.parse('{"__proto__": {"polluted": true}, "permissionMode": "auto"}')
    app.set(evil)
    // Object.prototype should remain clean
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('API key handling', () => {
  it('encrypted-mode set + get returns gatewayKeySet=true and keyStorage=encrypted', async () => {
    const { app } = await load()
    app.set({ gatewayApiKey: 'sk-ant-secret' })
    const s = app.get()
    expect(s.gatewayKeySet).toBe(true)
    expect(s.keyStorage).toBe('encrypted')
  })

  it('does not return the raw key from get()', async () => {
    const { app } = await load()
    app.set({ gatewayApiKey: 'sk-ant-do-not-leak' })
    const s = app.get() as Record<string, unknown>
    expect(JSON.stringify(s)).not.toContain('sk-ant-do-not-leak')
    expect(s.apiKeyEnc).toBeUndefined()
    expect(s.apiKeyPlain).toBeUndefined()
    expect(s.gatewayApiKey).toBeUndefined()
  })

  it('clearing the key (null) removes it from disk and state', async () => {
    const { app, util } = await load()
    app.set({ gatewayApiKey: 'sk-ant-1' })
    app.set({ gatewayApiKey: null })
    const s = app.get()
    expect(s.gatewayKeySet).toBe(false)
    expect(s.keyStorage).toBe('none')
    const raw = JSON.parse(readFileSync(file(util), 'utf-8'))
    expect(raw.apiKeyEnc).toBeUndefined()
    expect(raw.apiKeyPlain).toBeUndefined()
  })

  it('clearing the key removes process.env.ANTHROPIC_API_KEY', async () => {
    process.env.ANTHROPIC_API_KEY = 'from-dotenv'
    const { app } = await load()
    app.set({ gatewayApiKey: 'sk-overrides-env' })
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-overrides-env')
    app.set({ gatewayApiKey: null })
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('falls back to plaintext when encryption is unavailable', async () => {
    const electron = await import('electron')
    vi.spyOn(electron.safeStorage, 'isEncryptionAvailable').mockReturnValue(false)
    const { app, util } = await load()
    app.set({ gatewayApiKey: 'plain-key' })
    const s = app.get()
    expect(s.gatewayKeySet).toBe(true)
    expect(s.keyStorage).toBe('plaintext')
    const raw = JSON.parse(readFileSync(file(util), 'utf-8'))
    expect(raw.apiKeyPlain).toBe('plain-key')
    expect(raw.apiKeyEnc).toBeUndefined()
  })
})

describe('applyToEnv', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_BASE_URL
  })

  it('sets ANTHROPIC_BASE_URL when configured', async () => {
    const { app } = await load()
    app.set({ gatewayBaseUrl: 'https://api.portkey.ai/v1' })
    expect(process.env.ANTHROPIC_BASE_URL).toBe('https://api.portkey.ai/v1')
  })

  it('sets ANTHROPIC_API_KEY when key is configured', async () => {
    const { app } = await load()
    app.set({ gatewayApiKey: 'sk-test' })
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-test')
  })
})

describe('onChange listeners', () => {
  it('fires after each set()', async () => {
    const { app } = await load()
    const cb = vi.fn()
    const off = app.onChange(cb)
    app.set({ permissionMode: 'auto' })
    app.set({ autoScreen: false })
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    app.set({ permissionMode: 'ask' })
    expect(cb).toHaveBeenCalledTimes(2)
  })
})
