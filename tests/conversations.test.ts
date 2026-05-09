import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Each test uses a fresh module instance (vi.resetModules in setup), and a
// fresh userData dir, so module-scoped caches don't leak across tests.
async function load(): Promise<{
  conv: typeof import('../src/main/conversations')
  util: typeof import('../src/main/util')
}> {
  const conv = await import('../src/main/conversations')
  const util = await import('../src/main/util')
  return { conv, util }
}

const file = (util: { porticoDir: () => string }): string =>
  join(util.porticoDir(), 'conversations.json')

describe('conversations CRUD', () => {
  it('starts empty', async () => {
    const { conv } = await load()
    expect(conv.list()).toEqual([])
    expect(conv.get('nope')).toBeNull()
  })

  it('save creates a record with auto-derived title', async () => {
    const { conv } = await load()
    conv.save('id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'hello world' }] }])
    const got = conv.get('id')!
    expect(got.title).toBe('hello world')
    expect(got.bubbles).toHaveLength(1)
    expect(got.sessionId).toBeNull()
  })

  it('list sorts by updatedAt desc', async () => {
    const { conv } = await load()
    conv.save('a', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'a' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.save('b', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'b' }] }])
    expect(conv.list().map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('truncates long titles to 60 chars with ellipsis', async () => {
    const { conv } = await load()
    const long = 'x'.repeat(200)
    conv.save('id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: long }] }])
    const got = conv.get('id')!
    expect(got.title.length).toBe(58)
    expect(got.title.endsWith('…')).toBe(true)
  })

  it('remove deletes a record', async () => {
    const { conv } = await load()
    conv.save('id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'x' }] }])
    conv.remove('id')
    expect(conv.get('id')).toBeNull()
  })

  it('rename updates only the title', async () => {
    const { conv } = await load()
    conv.save('id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'orig' }] }])
    conv.rename('id', 'Custom title')
    expect(conv.get('id')!.title).toBe('Custom title')
  })
})

describe('setSessionId — upsert behavior (regression: lost-session bug)', () => {
  it('creates a stub record when no record exists yet', async () => {
    const { conv } = await load()
    conv.setSessionId('new', 'sdk-session-xyz')
    const got = conv.get('new')!
    expect(got.sessionId).toBe('sdk-session-xyz')
    expect(got.bubbles).toEqual([])
  })

  it('preserves bubbles + title when save() runs after setSessionId', async () => {
    const { conv } = await load()
    conv.setSessionId('id', 'sdk-1')
    conv.save('id', [
      { id: 'b', role: 'user', blocks: [{ type: 'text', text: 'first message' }] }
    ])
    const got = conv.get('id')!
    expect(got.sessionId).toBe('sdk-1')
    expect(got.title).toBe('first message')
    expect(got.bubbles).toHaveLength(1)
  })

  it('updates sessionId on existing records', async () => {
    const { conv } = await load()
    conv.save('id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'hi' }] }])
    conv.setSessionId('id', 'sdk-2')
    expect(conv.get('id')!.sessionId).toBe('sdk-2')
  })
})

describe('cwd persistence', () => {
  it('setCwd creates a stub when no record exists', async () => {
    const { conv } = await load()
    conv.setCwd('id', '/some/path')
    expect(conv.getCwd('id')).toBe('/some/path')
  })

  it('preserves cwd across save()', async () => {
    const { conv } = await load()
    conv.setCwd('id', '/work')
    conv.save('id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'hi' }] }])
    expect(conv.getCwd('id')).toBe('/work')
  })

  it('clears cwd when set to null', async () => {
    const { conv } = await load()
    conv.setCwd('id', '/work')
    conv.setCwd('id', null)
    expect(conv.getCwd('id')).toBeNull()
  })
})

describe('interrupted flag persistence', () => {
  it('defaults to false', async () => {
    const { conv } = await load()
    conv.save('id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'hi' }] }])
    expect(conv.getInterrupted('id')).toBe(false)
  })

  it('round-trips true', async () => {
    const { conv } = await load()
    conv.setInterrupted('id', true)
    expect(conv.getInterrupted('id')).toBe(true)
  })

  it('clearing it back to false', async () => {
    const { conv } = await load()
    conv.setInterrupted('id', true)
    conv.setInterrupted('id', false)
    expect(conv.getInterrupted('id')).toBe(false)
  })

  it('setInterrupted does NOT shuffle list order (only metadata change)', async () => {
    const { conv } = await load()
    conv.save('a', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'a' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.save('b', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'b' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.setInterrupted('a', true)
    expect(conv.list().map((c) => c.id)).toEqual(['b', 'a'])
  })
})

describe('trustProject persistence', () => {
  it('defaults to false when never set', async () => {
    const { conv } = await load()
    conv.save('id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'hi' }] }])
    expect(conv.getTrustProject('id')).toBe(false)
  })

  it('round-trips true', async () => {
    const { conv } = await load()
    conv.setCwd('id', '/work')
    conv.setTrustProject('id', true)
    expect(conv.getTrustProject('id')).toBe(true)
  })

  it('setTrustProject creates a stub when no record exists', async () => {
    const { conv } = await load()
    conv.setTrustProject('new', true)
    expect(conv.getTrustProject('new')).toBe(true)
  })

  it('persists across save()', async () => {
    const { conv } = await load()
    conv.setTrustProject('id', true)
    conv.save('id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'x' }] }])
    expect(conv.getTrustProject('id')).toBe(true)
  })

  it('survives a setCwd call (the renderer is responsible for resetting)', async () => {
    // The IPC handler in main resets trust when cwd changes; the conversations
    // module itself doesn't do that — keeps the storage layer dumb.
    const { conv } = await load()
    conv.setCwd('id', '/old')
    conv.setTrustProject('id', true)
    conv.setCwd('id', '/new')
    expect(conv.getTrustProject('id')).toBe(true)
  })
})

describe('migration', () => {
  it('wraps legacy { text } bubbles into a single text block on read', async () => {
    const { util } = await load()
    writeFileSync(
      file(util),
      JSON.stringify({
        legacy: {
          id: 'legacy',
          title: 'legacy',
          createdAt: 1,
          updatedAt: 1,
          sessionId: null,
          bubbles: [{ id: 'b1', role: 'user', text: 'old shape' }]
        }
      })
    )
    const { conv } = await load()
    const got = conv.get('legacy')!
    expect(got.bubbles[0].blocks).toEqual([{ type: 'text', text: 'old shape' }])
  })
})

describe('corruption handling', () => {
  it('backs up a corrupt file instead of overwriting it', async () => {
    const { util } = await load()
    writeFileSync(file(util), '{not valid json')
    const { conv } = await load()
    expect(conv.list()).toEqual([])
    const backups = readdirSync(util.porticoDir()).filter((f) =>
      f.startsWith('conversations.json.corrupt-')
    )
    expect(backups.length).toBe(1)
    expect(readFileSync(join(util.porticoDir(), backups[0]), 'utf-8')).toBe('{not valid json')
  })

  it('continues to function after recovering from corruption', async () => {
    const { util } = await load()
    writeFileSync(file(util), 'broken')
    const { conv } = await load()
    conv.list() // triggers backup
    conv.save('new', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'fresh' }] }])
    expect(conv.get('new')!.title).toBe('fresh')
  })
})

describe('sort order — lastMessageAt, not metadata bumps', () => {
  it('save() bumps lastMessageAt and moves the conversation up', async () => {
    const { conv } = await load()
    conv.save('a', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'a' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.save('b', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'b' }] }])
    expect(conv.list().map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('rename does NOT shuffle order', async () => {
    const { conv } = await load()
    conv.save('a', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'a' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.save('b', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'b' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.rename('a', 'Renamed')
    // 'a' was renamed AFTER 'b' was saved, but the sidebar should still show
    // 'b' on top because 'a' had no new message.
    expect(conv.list().map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('setCwd does NOT shuffle order', async () => {
    const { conv } = await load()
    conv.save('a', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'a' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.save('b', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'b' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.setCwd('a', '/some/path')
    expect(conv.list().map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('setSessionId does NOT shuffle order', async () => {
    const { conv } = await load()
    conv.save('a', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'a' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.save('b', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'b' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.setSessionId('a', 'sdk-new')
    expect(conv.list().map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('setTrustProject does NOT shuffle order', async () => {
    const { conv } = await load()
    conv.save('a', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'a' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.save('b', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'b' }] }])
    await new Promise((r) => setTimeout(r, 5))
    conv.setTrustProject('a', true)
    expect(conv.list().map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('migrates pre-lastMessageAt records from updatedAt', async () => {
    const { util } = await load()
    writeFileSync(
      file(util),
      JSON.stringify({
        legacy: {
          id: 'legacy',
          title: 'old',
          createdAt: 1000,
          updatedAt: 5000, // pre-version: this is the only timestamp
          sessionId: null,
          bubbles: []
        }
      })
    )
    const { conv } = await load()
    const summary = conv.list().find((c) => c.id === 'legacy')!
    expect(summary.updatedAt).toBe(5000) // seeded from the old updatedAt
  })
})

describe('persistence', () => {
  it('writes JSON atomically (no .tmp leftover)', async () => {
    const { conv, util } = await load()
    conv.save('id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'x' }] }])
    expect(existsSync(file(util))).toBe(true)
    expect(existsSync(`${file(util)}.tmp`)).toBe(false)
  })

  it('persisted JSON keys conversations by id', async () => {
    const { conv, util } = await load()
    conv.save('my-id', [{ id: 'b', role: 'user', blocks: [{ type: 'text', text: 'x' }] }])
    const raw = JSON.parse(readFileSync(file(util), 'utf-8'))
    expect(Array.isArray(raw)).toBe(false)
    expect(raw['my-id']).toBeDefined()
    expect(raw['my-id'].title).toBe('x')
  })
})
