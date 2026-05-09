import { useCallback, useEffect, useRef, useState } from 'react'

import { Sidebar, useCollapsedSidebar } from './components/Sidebar'
import { RightSidebar, useCollapsedRightSidebar } from './components/RightSidebar'
import { BubbleView } from './components/BubbleView'
import { Settings } from './components/Settings'
import type { Block, Bubble, ConversationSummary } from '../../preload'

// SDK partial-message stream events (see Anthropic SDK BetaRawMessageStreamEvent).
type StreamEvent =
  | { type: 'message_start'; message: { id: string } }
  | {
      type: 'content_block_start'
      index: number
      content_block:
        | { type: 'text'; text?: string }
        | { type: 'thinking'; thinking?: string }
        | { type: 'tool_use'; id: string; name: string; input?: unknown }
    }
  | {
      type: 'content_block_delta'
      index: number
      delta:
        | { type: 'text_delta'; text: string }
        | { type: 'thinking_delta'; thinking: string }
        | { type: 'input_json_delta'; partial_json: string }
        | { type: 'signature_delta'; signature: string }
    }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta' }
  | { type: 'message_stop' }

interface SDKMessage {
  type: string
  uuid?: string
  message?: {
    id?: string
    content?: Array<{
      type: string
      text?: string
      name?: string
      input?: unknown
      // tool_result fields
      content?: string | Array<{ type: string; text?: string }>
      is_error?: boolean
      tool_use_id?: string
    }>
    // Anthropic API usage. Available on assistant messages. input_tokens is
    // the current context window size at the moment this message was produced.
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
  event?: StreamEvent
  result?: string
  subtype?: string
}

// All current Claude models default to a 200k context window. (Sonnet 4.6
// supports 1M via the context-1m beta header, which we don't currently enable.)
const CONTEXT_WINDOW_MAX = 200_000

function extractToolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((b) => (b && typeof b === 'object' && b.type === 'text' ? b.text || '' : ''))
    .join('')
}

function makePermissionBubble(req: {
  requestId: string
  toolName: string
  input: Record<string, unknown>
  screening: import('../../preload').Screening | null
}): Bubble {
  return {
    id: `perm-${req.requestId}`,
    role: 'permission',
    blocks: [
      {
        type: 'permission_request',
        requestId: req.requestId,
        toolName: req.toolName,
        input: req.input,
        screening: req.screening,
        decision: null
      }
    ]
  }
}

function upsertBubble(prev: Bubble[], bubble: Bubble): Bubble[] {
  const idx = prev.findIndex((b) => b.id === bubble.id)
  if (idx === -1) return [...prev, bubble]
  const next = [...prev]
  next[idx] = bubble
  return next
}

function App(): React.JSX.Element {
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [gateway, setGateway] = useState<{ gateway: string; configured: boolean; model: string } | null>(
    null
  )
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID())
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [collapsed, toggleCollapsed] = useCollapsedSidebar()
  const [rightCollapsed, toggleRightCollapsed] = useCollapsedRightSidebar()
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [cwd, setCwd] = useState<string | null>(null)
  const [trustProject, setTrustProject] = useState<boolean>(false)
  const [contextTokens, setContextTokens] = useState<number | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  // Tracks the SDK message.id of the assistant turn currently being streamed,
  // per runId. Each agent turn = its own bubble; without this, tool-use loops
  // pile multiple turns into one visual bubble.
  const currentMessageIdRef = useRef<Map<string, string>>(new Map())
  // Tracks the bubble-array reference we just loaded from disk for an existing
  // session. The persistence effect skips save when bubbles still === this ref,
  // so re-opening an old session doesn't bump its lastMessageAt.
  const loadedBubblesRef = useRef<Bubble[] | null>(null)

  const refreshList = useCallback(async () => {
    const list = await window.api.conversations.list()
    setConversations(list)
  }, [])

  // Apply a stream_event into the current bubble list. Each assistant turn
  // (message_start) gets its own bubble keyed by SDK message.id, so tool-use
  // loops produce visually separate turns.
  const applyStreamEvent = useCallback((runId: string, ev: StreamEvent) => {
    if (
      ev.type !== 'content_block_start' &&
      ev.type !== 'content_block_delta' &&
      ev.type !== 'message_start'
    ) {
      return
    }

    if (ev.type === 'message_start') {
      currentMessageIdRef.current.set(runId, ev.message.id)
    }
    const messageId = currentMessageIdRef.current.get(runId)
    if (!messageId) return // delta arrived before message_start; can't place it
    const bubbleId = `${runId}-${messageId}`

    setBubbles((prev) => {
      let nextBubbles = prev
      let idx = nextBubbles.findIndex((b) => b.id === bubbleId)
      if (idx === -1) {
        nextBubbles = [...nextBubbles, { id: bubbleId, role: 'assistant', blocks: [] }]
        idx = nextBubbles.length - 1
      }

      if (ev.type === 'message_start') return nextBubbles

      const bubble = nextBubbles[idx]
      const blocks = [...(bubble.blocks ?? [])]

      if (ev.type === 'content_block_start') {
        const cb = ev.content_block
        const newBlock: Block | null =
          cb.type === 'text'
            ? { type: 'text', text: cb.text ?? '' }
            : cb.type === 'thinking'
              ? { type: 'thinking', thinking: cb.thinking ?? '' }
              : cb.type === 'tool_use'
                ? { type: 'tool_use', name: cb.name, input: cb.input ?? {} }
                : null
        if (!newBlock) return nextBubbles
        blocks[ev.index] = newBlock
      } else {
        // content_block_delta
        const existing = blocks[ev.index]
        if (!existing) return nextBubbles
        const d = ev.delta
        if (d.type === 'text_delta' && existing.type === 'text') {
          blocks[ev.index] = { ...existing, text: existing.text + d.text }
        } else if (d.type === 'thinking_delta' && existing.type === 'thinking') {
          blocks[ev.index] = { ...existing, thinking: existing.thinking + d.thinking }
        }
        // input_json_delta and signature_delta intentionally ignored for V1.
      }

      nextBubbles = [...nextBubbles]
      nextBubbles[idx] = { ...bubble, blocks }
      return nextBubbles
    })
  }, [])

  useEffect(() => {
    window.api.gatewayInfo().then(setGateway)
    refreshList()

    const offMsg = window.api.onMessage((runId, raw) => {
      const msg = raw as SDKMessage

      // Streaming path
      if (msg.type === 'stream_event' && msg.event) {
        applyStreamEvent(runId, msg.event)
        return
      }

      // Tool results from the agent loop appear as user messages with tool_result content.
      if (msg.type === 'user' && msg.message?.content) {
        const results = msg.message.content
          .filter((b) => b.type === 'tool_result')
          .map((b) => ({
            text: extractToolResultText(b.content),
            isError: !!b.is_error,
            id: b.tool_use_id ?? crypto.randomUUID()
          }))
        if (results.length === 0) return
        setBubbles((prev) => {
          const next = [...prev]
          for (const r of results) {
            next.push({
              id: `${runId}-tr-${r.id}`,
              role: 'tool',
              blocks: [{ type: 'tool_result', text: r.text, isError: r.isError }]
            })
          }
          return next
        })
        return
      }

      // Assistant messages duplicate the streamed content (we already built
      // bubbles from stream_event), so we don't render them. But they DO carry
      // the canonical usage block — so use them to track context window size.
      if (msg.type === 'assistant' && msg.message?.usage) {
        const u = msg.message.usage
        const inputs =
          (u.input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0)
        if (inputs > 0) setContextTokens(inputs)
      }
    })

    const offScreening = window.api.onPermissionScreening((s) => {
      const placeholder = makePermissionBubble({
        requestId: s.requestId,
        toolName: s.toolName,
        input: {},
        screening: null
      })
      setBubbles((prev) => upsertBubble(prev, placeholder))
    })

    const offRequest = window.api.onPermissionRequest((req) => {
      const bubble = makePermissionBubble(req)
      setBubbles((prev) => upsertBubble(prev, bubble))
    })

    const offCancelled = window.api.onCancelled((runId) => {
      // Tag the in-flight assistant bubble for this run so the UI shows a
      // "Stopped" badge under whatever was streamed so far.
      const messageId = currentMessageIdRef.current.get(runId)
      if (messageId) {
        const bubbleId = `${runId}-${messageId}`
        setBubbles((prev) =>
          prev.map((b) => (b.id === bubbleId ? { ...b, interrupted: true } : b))
        )
      }
    })

    const offDone = window.api.onDone((runId) => {
      currentMessageIdRef.current.delete(runId)
      setBusy(false)
      setActiveRunId(null)
    })
    const offErr = window.api.onError((runId, err) => {
      currentMessageIdRef.current.delete(runId)
      setBubbles((prev) => [
        ...prev,
        {
          id: `${runId}-err`,
          role: 'system',
          blocks: [{ type: 'text', text: `Error: ${err.message}` }]
        }
      ])
      setBusy(false)
      setActiveRunId(null)
    })

    return () => {
      offMsg()
      offDone()
      offErr()
      offScreening()
      offRequest()
      offCancelled()
    }
  }, [refreshList, applyStreamEvent])

  async function decidePermission(requestId: string, allow: boolean): Promise<void> {
    await window.api.respondPermission(requestId, { allow })
    setBubbles((prev) =>
      prev.map((b) => {
        if (b.role !== 'permission' || !b.blocks) return b
        const blocks = b.blocks.map((blk) =>
          blk.type === 'permission_request' && blk.requestId === requestId
            ? { ...blk, decision: { allow, at: Date.now() } }
            : blk
        )
        return { ...b, blocks }
      })
    )
  }

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles])

  // Persist whenever bubbles settle (debounced 400ms — covers token-streaming bursts).
  // Skip when bubbles are still the freshly-loaded reference: opening an old
  // session shouldn't write the same content back to disk and bump
  // lastMessageAt (which would shuffle the sidebar).
  useEffect(() => {
    if (bubbles.length === 0) return
    if (bubbles === loadedBubblesRef.current) return
    const t = setTimeout(async () => {
      await window.api.conversations.save(conversationId, bubbles)
      refreshList()
    }, 400)
    return () => clearTimeout(t)
  }, [bubbles, conversationId, refreshList])

  async function send(): Promise<void> {
    const prompt = input.trim()
    if (!prompt || busy) return
    const runId = crypto.randomUUID()
    setBubbles((prev) => [
      ...prev,
      { id: `${runId}-u`, role: 'user', blocks: [{ type: 'text', text: prompt }] }
    ])
    setInput('')
    setBusy(true)
    setActiveRunId(runId)
    await window.api.query(prompt, runId, conversationId)
  }

  async function stop(): Promise<void> {
    if (!activeRunId) return
    await window.api.cancel(activeRunId)
  }

  async function newSession(): Promise<void> {
    if (busy) return
    setConversationId(crypto.randomUUID())
    setBubbles([])
    setCwd(null)
    setTrustProject(false)
    setContextTokens(null)
    loadedBubblesRef.current = null
  }

  async function selectSession(id: string): Promise<void> {
    if (busy || id === conversationId) return
    const conv = await window.api.conversations.get(id)
    if (!conv) return
    setConversationId(id)
    setBubbles(conv.bubbles)
    // Mark this exact array reference as "loaded from disk" so the
    // persistence effect skips writing it back.
    loadedBubblesRef.current = conv.bubbles
    setCwd(conv.cwd ?? null)
    setTrustProject(!!conv.trustProject)
    // Reset until the next assistant message tells us actual usage.
    setContextTokens(null)
  }

  async function deleteSession(id: string): Promise<void> {
    await window.api.conversations.delete(id)
    if (id === conversationId) {
      setConversationId(crypto.randomUUID())
      setBubbles([])
      setCwd(null)
      setTrustProject(false)
      setContextTokens(null)
      loadedBubblesRef.current = null
    }
    refreshList()
  }

  async function pickCwd(): Promise<void> {
    const picked = await window.api.dialog.pickFolder(cwd ?? undefined)
    if (!picked) return
    setCwd(picked)
    setTrustProject(false) // changing folder always resets trust
    await window.api.conversations.setCwd(conversationId, picked)
    refreshList()
  }

  async function clearCwd(): Promise<void> {
    setCwd(null)
    setTrustProject(false)
    await window.api.conversations.setCwd(conversationId, null)
    refreshList()
  }

  async function revealCwd(): Promise<void> {
    if (!cwd) return
    await window.api.shell.revealPath(cwd)
  }

  async function toggleTrustProject(next: boolean): Promise<void> {
    setTrustProject(next)
    await window.api.conversations.setTrustProject(conversationId, next)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex h-screen bg-vellum text-ink">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        activeConversationId={conversationId}
        conversations={conversations}
        onNewSession={() => {
          newSession()
          setView('chat')
        }}
        onSelect={(id) => {
          selectSession(id)
          setView('chat')
        }}
        onDelete={deleteSession}
        onOpenSettings={() => setView('settings')}
        settingsActive={view === 'settings'}
      />

      {view === 'settings' && <Settings onClose={() => setView('chat')} />}

      {view === 'chat' && (
      <div className="flex flex-1 min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-parchment px-6 py-3 [-webkit-app-region:drag]">
          <div className="flex items-baseline gap-2 [-webkit-app-region:no-drag]">
            <span className="text-[11px] text-dusty">Powered by Claude · v0.1</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-dusty [-webkit-app-region:no-drag]">
            {gateway ? (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    gateway.configured ? 'bg-[#4a8a5e]' : 'bg-terra'
                  }`}
                />
                <span>
                  {gateway.gateway} · {gateway.model}
                  {gateway.configured ? '' : ' · not configured'}
                </span>
              </div>
            ) : (
              <span>…</span>
            )}
          </div>
        </header>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto flex max-w-[760px] flex-col gap-5">
            {bubbles.length === 0 && gateway && !gateway.configured && (
              <div className="mt-10 rounded-[12px] border border-onyx/15 bg-snow p-6">
                <h1 className="font-serif text-[28px] font-[330] leading-tight text-ink">
                  Welcome to Portico
                </h1>
                <p className="mt-2 text-[14px] text-graphite">
                  Before you can chat, point Portico at your gateway and paste an API key. Portkey, direct Anthropic, or any compatible endpoint works.
                </p>
                <button
                  onClick={() => setView('settings')}
                  className="mt-4 rounded-[9.6px] bg-ink px-4 py-2 text-[13px] font-medium text-snow hover:opacity-90"
                >
                  Set up gateway
                </button>
                <p className="mt-3 text-[11px] text-dusty">
                  The key is encrypted at rest using your OS keychain. Settings live under your Portico user-data folder.
                </p>
              </div>
            )}
            {bubbles.length === 0 && gateway?.configured && (
              <div className="mt-12 text-center">
                <h1 className="font-serif text-[40px] font-[330] leading-tight text-ink">
                  What can I help you with?
                </h1>
                <p className="mt-3 text-[14px] text-dusty">
                  Routed through {gateway.gateway}. {cwd ? <>Working in <code className="rounded bg-vellum px-1 text-[12px]">{cwd.split('/').slice(-2).join('/')}</code>.</> : 'No working folder set — pick one in the right panel for file operations.'}
                </p>
              </div>
            )}
            {bubbles.map((b) => (
              <BubbleView key={b.id} bubble={b} onPermissionDecision={decidePermission} />
            ))}
            {busy && <div className="text-[12px] text-stone">Working…</div>}
          </div>
        </div>

        <div className="border-t border-parchment bg-vellum px-6 py-4">
          <div className="mx-auto flex max-w-[760px] flex-col gap-1">
            <div className="flex items-end gap-3">
              <textarea
                className="min-h-[52px] flex-1 resize-none rounded-[9.6px] border border-onyx/15 bg-snow px-3 py-3 text-[15px] text-ink outline-none placeholder:text-stone focus:border-onyx/30"
                placeholder="Ask anything…  (Enter to send, Shift+Enter for newline)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                disabled={busy}
              />
              {busy ? (
                <button
                  onClick={stop}
                  className="flex h-[52px] items-center gap-2 rounded-[9.6px] border border-onyx/20 bg-snow px-5 text-[15px] font-medium text-ink transition-opacity hover:bg-vellum"
                  title="Stop generating"
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-ink" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!input.trim()}
                  className="h-[52px] rounded-[9.6px] bg-ink px-5 text-[15px] font-medium text-snow transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Send
                </button>
              )}
            </div>
            <div className="mt-1 flex justify-end">
              <ContextMeter tokens={contextTokens} max={CONTEXT_WINDOW_MAX} model={gateway?.model} />
            </div>
          </div>
        </div>
      </div>
      )}

      {view === 'chat' && (
        <RightSidebar
          collapsed={rightCollapsed}
          onToggleCollapsed={toggleRightCollapsed}
          cwd={cwd}
          trustProject={trustProject}
          onChangeCwd={pickCwd}
          onClearCwd={clearCwd}
          onRevealCwd={revealCwd}
          onToggleTrustProject={toggleTrustProject}
        />
      )}
    </div>
  )
}

function ContextMeter({
  tokens,
  max,
  model
}: {
  tokens: number | null
  max: number
  model: string | undefined
}): React.JSX.Element {
  const used = tokens ?? 0
  const pct = Math.min(1, used / max)
  // arc from 0 -> circumference based on pct
  const r = 7
  const c = 2 * Math.PI * r
  const dash = c * pct
  const colorClass = pct >= 0.85 ? 'text-terra' : pct >= 0.6 ? 'text-[#b89456]' : 'text-graphite'

  const tooltip = tokens == null
    ? 'Context window — fills up after the first reply.'
    : `${formatTokens(used)} / ${formatTokens(max)} (${Math.round(pct * 100)}%)${
        model ? ` · ${model}` : ''
      }`

  return (
    <div
      className="flex items-center gap-1.5 text-[10.5px] text-dusty"
      title={tooltip}
    >
      <span>
        {tokens == null ? '—' : `${formatTokens(used)} / ${formatTokens(max)}`}
      </span>
      <svg width="18" height="18" viewBox="0 0 18 18" className={colorClass}>
        <circle cx="9" cy="9" r={r} stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" fill="none" />
        <circle
          cx="9"
          cy="9"
          r={r}
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 9 9)"
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
    </div>
  )
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(2)}k`
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export default App
