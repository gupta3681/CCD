import { useCallback, useEffect, useRef, useState } from 'react'
import { Sidebar, useCollapsedSidebar } from './components/Sidebar'
import { BubbleView } from './components/BubbleView'
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
    content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>
  }
  event?: StreamEvent
  result?: string
  subtype?: string
}

function App(): React.JSX.Element {
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [gateway, setGateway] = useState<{ gateway: string; configured: boolean; model: string } | null>(
    null
  )
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID())
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [collapsed, toggleCollapsed] = useCollapsedSidebar()
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Tracks the in-flight assistant bubble id per run so deltas know where to land.
  const inFlightBubbleIdRef = useRef<Map<string, string>>(new Map())

  const refreshList = useCallback(async () => {
    const list = await window.api.conversations.list()
    setConversations(list)
  }, [])

  // Apply a stream_event into the current bubble list.
  const applyStreamEvent = useCallback((runId: string, ev: StreamEvent) => {
    setBubbles((prev) => {
      let nextBubbles = prev
      const existingId = inFlightBubbleIdRef.current.get(runId)

      // Make sure we have an in-flight assistant bubble for this run.
      let bubbleId = existingId
      if (!bubbleId) {
        if (ev.type !== 'message_start' && ev.type !== 'content_block_start') return prev
        bubbleId = `${runId}-a`
        inFlightBubbleIdRef.current.set(runId, bubbleId)
        nextBubbles = [...nextBubbles, { id: bubbleId, role: 'assistant', blocks: [] }]
      }

      const idx = nextBubbles.findIndex((b) => b.id === bubbleId)
      if (idx === -1) return nextBubbles
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
      } else if (ev.type === 'content_block_delta') {
        const existing = blocks[ev.index]
        if (!existing) return nextBubbles
        const d = ev.delta
        if (d.type === 'text_delta' && existing.type === 'text') {
          blocks[ev.index] = { ...existing, text: existing.text + d.text }
        } else if (d.type === 'thinking_delta' && existing.type === 'thinking') {
          blocks[ev.index] = { ...existing, thinking: existing.thinking + d.thinking }
        }
        // input_json_delta and signature_delta are intentionally ignored for V1.
      } else {
        return nextBubbles
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
        const text = msg.message.content
          .map((b) => (b.type === 'tool_result' ? `← tool result` : ''))
          .join('')
        if (!text) return
        setBubbles((prev) => [
          ...prev,
          { id: `${runId}-tr-${prev.length}`, role: 'tool', blocks: [{ type: 'tool_result', text }] }
        ])
        return
      }

      // Full assistant messages also arrive when streaming; they duplicate what the
      // stream events already built. Ignore.
    })

    const offDone = window.api.onDone((runId) => {
      inFlightBubbleIdRef.current.delete(runId)
      setBusy(false)
    })
    const offErr = window.api.onError((runId, err) => {
      inFlightBubbleIdRef.current.delete(runId)
      setBubbles((prev) => [
        ...prev,
        {
          id: `${runId}-err`,
          role: 'system',
          blocks: [{ type: 'text', text: `Error: ${err.message}` }]
        }
      ])
      setBusy(false)
    })

    return () => {
      offMsg()
      offDone()
      offErr()
    }
  }, [refreshList, applyStreamEvent])

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles])

  // Persist whenever bubbles settle (debounced 400ms — covers token-streaming bursts).
  useEffect(() => {
    if (bubbles.length === 0) return
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
    await window.api.query(prompt, runId, conversationId)
  }

  async function newSession(): Promise<void> {
    if (busy) return
    setConversationId(crypto.randomUUID())
    setBubbles([])
  }

  async function selectSession(id: string): Promise<void> {
    if (busy || id === conversationId) return
    const conv = await window.api.conversations.get(id)
    if (!conv) return
    setConversationId(id)
    setBubbles(conv.bubbles)
  }

  async function deleteSession(id: string): Promise<void> {
    await window.api.conversations.delete(id)
    if (id === conversationId) {
      setConversationId(crypto.randomUUID())
      setBubbles([])
    }
    refreshList()
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
        onNewSession={newSession}
        onSelect={selectSession}
        onDelete={deleteSession}
      />

      <div className="flex flex-1 flex-col">
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
            {bubbles.length === 0 && (
              <div className="mt-12 text-center">
                <h1 className="font-serif text-[40px] font-[330] leading-tight text-ink">
                  What can I help you with?
                </h1>
                <p className="mt-3 text-[14px] text-dusty">
                  Routed through {gateway?.gateway ?? 'your configured gateway'}. Read-only mode — I can
                  read, search, and answer, but I won't change files or run commands.
                </p>
              </div>
            )}
            {bubbles.map((b) => (
              <BubbleView key={b.id} bubble={b} />
            ))}
            {busy && <div className="text-[12px] text-stone">Working…</div>}
          </div>
        </div>

        <div className="border-t border-parchment bg-vellum px-6 py-4">
          <div className="mx-auto flex max-w-[760px] items-end gap-3">
            <textarea
              className="min-h-[52px] flex-1 resize-none rounded-[9.6px] border border-onyx/15 bg-snow px-3 py-3 text-[15px] text-ink outline-none placeholder:text-stone focus:border-onyx/30"
              placeholder="Ask anything…  (Enter to send, Shift+Enter for newline)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              disabled={busy}
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="h-[52px] rounded-[9.6px] bg-ink px-5 text-[15px] font-medium text-snow transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
