import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Bubble, Conversation, ConversationSummary } from '../shared/types'
import { atomicWrite, porticoDir } from './util'

export type { Block, Bubble, Conversation, ConversationSummary } from '../shared/types'

type Store = Record<string, Conversation>

let cache: Store | null = null

function dataFile(): string {
  return join(porticoDir(), 'conversations.json')
}

function migrate(b: Bubble): Bubble {
  if (b.blocks && b.blocks.length > 0) return b
  if (b.text != null) return { ...b, blocks: [{ type: 'text', text: b.text }] }
  return { ...b, blocks: [] }
}

function load(): Store {
  if (cache) return cache
  const file = dataFile()
  if (!existsSync(file)) {
    cache = {}
    return cache
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Store
    for (const id of Object.keys(parsed)) {
      parsed[id].bubbles = parsed[id].bubbles.map(migrate)
    }
    cache = parsed
  } catch (err) {
    console.error('[conversations] failed to read store, starting fresh:', err)
    cache = {}
  }
  return cache
}

function persist(): void {
  if (!cache) return
  atomicWrite(dataFile(), JSON.stringify(cache, null, 2))
}

export function list(): ConversationSummary[] {
  const store = load()
  return Object.values(store)
    .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function get(id: string): Conversation | null {
  return load()[id] ?? null
}

export function getSessionId(id: string): string | null {
  return load()[id]?.sessionId ?? null
}

export function setSessionId(id: string, sessionId: string): void {
  const store = load()
  const now = Date.now()
  const existing = store[id]
  // Upsert: the SDK init event often arrives before the renderer's first
  // debounced bubble save, so the conversation record may not exist yet.
  // Create a stub here; the renderer's next save will fill in title + bubbles.
  store[id] = existing
    ? { ...existing, sessionId, updatedAt: now }
    : { id, title: 'New chat', createdAt: now, updatedAt: now, sessionId, bubbles: [] }
  persist()
}

function bubbleText(b: Bubble): string {
  if (b.text) return b.text
  if (!b.blocks) return ''
  return b.blocks
    .map((blk) => (blk.type === 'text' ? blk.text : ''))
    .join('')
    .trim()
}

function deriveTitle(bubbles: Bubble[]): string {
  const firstUser = bubbles.find((b) => b.role === 'user')
  const raw = firstUser ? bubbleText(firstUser) : 'New chat'
  const oneLine = raw.replace(/\s+/g, ' ').trim() || 'New chat'
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine
}

export function save(id: string, bubbles: Bubble[]): ConversationSummary {
  const store = load()
  const now = Date.now()
  const existing = store[id]
  const title = deriveTitle(bubbles)
  // Preserve sessionId if the init event already wrote a stub record before
  // the renderer's first save call.
  const conv: Conversation = existing
    ? { ...existing, title, bubbles, updatedAt: now }
    : { id, title, createdAt: now, updatedAt: now, sessionId: null, bubbles }
  store[id] = conv
  persist()
  return { id: conv.id, title: conv.title, updatedAt: conv.updatedAt }
}

export function remove(id: string): void {
  const store = load()
  if (!store[id]) return
  delete store[id]
  persist()
}

export function rename(id: string, title: string): void {
  const store = load()
  const conv = store[id]
  if (!conv) return
  conv.title = title
  conv.updatedAt = Date.now()
  persist()
}
