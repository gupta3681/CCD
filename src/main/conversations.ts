import { existsSync, readFileSync, renameSync } from 'fs'
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

function migrateConversation(c: Conversation): Conversation {
  // Pre-lastMessageAt records: seed it from updatedAt so existing sort order
  // doesn't get scrambled on first launch with this version.
  if (c.lastMessageAt == null) {
    c.lastMessageAt = c.updatedAt
  }
  return c
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
      parsed[id] = migrateConversation(parsed[id])
    }
    cache = parsed
  } catch (err) {
    // Don't silently overwrite the broken file with {}. Move it aside so the
    // user (or a recovery tool) can attempt to salvage their chat history.
    const backup = `${file}.corrupt-${Date.now()}`
    try {
      renameSync(file, backup)
      console.error(`[conversations] failed to read store, moved to ${backup}:`, err)
    } catch {
      console.error('[conversations] failed to read store and failed to back up:', err)
    }
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
    .map((c) => ({
      id: c.id,
      title: c.title,
      // The sidebar shows "5m ago" using this field. We expose lastMessageAt
      // (when a message was last exchanged) so old conversations stay put when
      // their metadata is edited.
      updatedAt: c.lastMessageAt ?? c.createdAt
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function get(id: string): Conversation | null {
  return load()[id] ?? null
}

export function getSessionId(id: string): string | null {
  return load()[id]?.sessionId ?? null
}

/**
 * Upsert helper. Every metadata setter in this module needs the same dance:
 * load the cache, find the record (or stub one if it doesn't exist yet —
 * happens when the SDK's init message lands before the renderer's first
 * bubble save), apply the patch, bump `updatedAt`, persist.
 *
 * Crucially this does NOT bump `lastMessageAt` — that's the sidebar sort
 * field and only `save()` (which means "real bubbles changed") touches it.
 */
function updateConversation(id: string, patch: Partial<Conversation>): Conversation {
  const store = load()
  const now = Date.now()
  const existing = store[id]
  const conv: Conversation = existing
    ? { ...existing, ...patch, updatedAt: now }
    : {
        id,
        title: 'New chat',
        createdAt: now,
        updatedAt: now,
        sessionId: null,
        bubbles: [],
        ...patch
      }
  store[id] = conv
  persist()
  return conv
}

export function setSessionId(id: string, sessionId: string): void {
  // SDK init message often arrives before the renderer's first debounced
  // bubble save, so the conversation record may not exist yet — the
  // updateConversation upsert handles that.
  updateConversation(id, { sessionId })
}

export function getCwd(id: string): string | null {
  return load()[id]?.cwd ?? null
}

export function setCwd(id: string, cwd: string | null): void {
  updateConversation(id, { cwd })
}

export function getTrustProject(id: string): boolean {
  return load()[id]?.trustProject === true
}

export function getInterrupted(id: string): boolean {
  return load()[id]?.lastInterrupted === true
}

export function setInterrupted(id: string, value: boolean): void {
  updateConversation(id, { lastInterrupted: value })
}

export function setTrustProject(id: string, trust: boolean): void {
  updateConversation(id, { trustProject: trust })
}

// ── Per-session permission allowlist ───────────────────────────────────
// These are tool-call patterns the user has approved for this conversation
// only. The agent:query handler consults them before opening a permission
// prompt, auto-approving any matching call.

export function getSessionAllowedPatterns(id: string): string[] {
  return load()[id]?.sessionAllowedPatterns ?? []
}

export function addSessionAllowedPattern(id: string, pattern: string): string[] {
  const current = load()[id]?.sessionAllowedPatterns ?? []
  // Dedupe — a re-approval of the same pattern shouldn't bloat the list.
  const next = current.includes(pattern) ? current : [...current, pattern]
  updateConversation(id, { sessionAllowedPatterns: next })
  return next
}

export function removeSessionAllowedPattern(id: string, pattern: string): string[] {
  // Early-return when the conversation doesn't exist — no point upserting a
  // stub just to remove from an empty list.
  const existing = load()[id]
  if (!existing) return []
  const next = (existing.sessionAllowedPatterns ?? []).filter((p) => p !== pattern)
  updateConversation(id, { sessionAllowedPatterns: next })
  return next
}

export function clearSessionAllowedPatterns(id: string): void {
  if (!load()[id]) return
  updateConversation(id, { sessionAllowedPatterns: [] })
}

// ── Per-conversation model override ────────────────────────────────────

export function getModel(id: string): string | null {
  return load()[id]?.model ?? null
}

export function setModel(id: string, model: string | null): void {
  // Empty / null clears the override → falls back to global default.
  const value = model && model.trim() ? model.trim() : undefined
  updateConversation(id, { model: value })
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
  // save() is the one path that means "a real message just happened" — only
  // here do we bump lastMessageAt. Metadata mutations (setCwd, rename, etc.)
  // bump updatedAt only and don't shuffle the sidebar.
  const conv: Conversation = existing
    ? { ...existing, title, bubbles, updatedAt: now, lastMessageAt: now }
    : {
        id,
        title,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        sessionId: null,
        bubbles
      }
  store[id] = conv
  persist()
  return { id: conv.id, title: conv.title, updatedAt: conv.lastMessageAt ?? conv.createdAt }
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
