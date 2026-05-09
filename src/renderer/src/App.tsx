import { useEffect, useRef, useState } from 'react'

type Role = 'user' | 'assistant' | 'system' | 'tool'

interface Bubble {
  id: string
  role: Role
  text: string
}

interface SDKMessage {
  type: string
  message?: {
    content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>
  }
  result?: string
  subtype?: string
}

function extractText(msg: SDKMessage): { role: Role; text: string } | null {
  if (msg.type === 'assistant' && msg.message?.content) {
    const text = msg.message.content
      .map((b) => {
        if (b.type === 'text') return b.text ?? ''
        if (b.type === 'tool_use') return `\n→ ${b.name}(${JSON.stringify(b.input)})\n`
        return ''
      })
      .join('')
    return text ? { role: 'assistant', text } : null
  }
  if (msg.type === 'user' && msg.message?.content) {
    const text = msg.message.content
      .map((b) => (b.type === 'tool_result' ? `← tool result` : ''))
      .join('')
    return text ? { role: 'tool', text } : null
  }
  // Intentionally ignore msg.type === 'result' — it duplicates the final assistant turn.
  return null
}

function App(): React.JSX.Element {
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [gateway, setGateway] = useState<{ gateway: string; configured: boolean; model: string } | null>(
    null
  )
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID())
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.gatewayInfo().then(setGateway)

    const offMsg = window.api.onMessage((runId, raw) => {
      const msg = raw as SDKMessage
      const piece = extractText(msg)
      if (!piece) return
      setBubbles((prev) => [...prev, { id: `${runId}-${prev.length}`, role: piece.role, text: piece.text }])
    })
    const offDone = window.api.onDone(() => setBusy(false))
    const offErr = window.api.onError((runId, err) => {
      setBubbles((prev) => [...prev, { id: `${runId}-err`, role: 'system', text: `Error: ${err.message}` }])
      setBusy(false)
    })

    return () => {
      offMsg()
      offDone()
      offErr()
    }
  }, [])

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles])

  async function send(): Promise<void> {
    const prompt = input.trim()
    if (!prompt || busy) return
    const runId = crypto.randomUUID()
    setBubbles((prev) => [...prev, { id: `${runId}-u`, role: 'user', text: prompt }])
    setInput('')
    setBusy(true)
    await window.api.query(prompt, runId, conversationId)
  }

  async function newChat(): Promise<void> {
    if (busy) return
    await window.api.resetConversation(conversationId)
    setConversationId(crypto.randomUUID())
    setBubbles([])
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex h-screen flex-col bg-vellum text-ink">
      <header className="flex items-center justify-between border-b border-parchment px-6 py-3 [-webkit-app-region:drag]">
        <div className="flex items-baseline gap-2 [-webkit-app-region:no-drag]">
          <div className="font-serif text-[18px] font-[330]">Portico</div>
          <span className="text-[11px] text-dusty">Powered by Claude · v0.1</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-dusty [-webkit-app-region:no-drag]">
          <button
            onClick={newChat}
            disabled={busy || bubbles.length === 0}
            className="rounded-[9.6px] border border-onyx/20 px-2.5 py-1 text-ink hover:bg-snow disabled:opacity-30"
          >
            New chat
          </button>
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
                Routed through {gateway?.gateway ?? 'your configured gateway'}. Read-only mode — I can read,
                search, and answer, but I won't change files or run commands.
              </p>
            </div>
          )}
          {bubbles.map((b) => (
            <Bubble key={b.id} bubble={b} />
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
  )
}

function Bubble({ bubble }: { bubble: Bubble }): React.JSX.Element {
  const isUser = bubble.role === 'user'
  const isSystem = bubble.role === 'system'
  const isTool = bubble.role === 'tool'

  if (isSystem) {
    return (
      <div className="rounded-[9.6px] border border-terra/30 bg-terra/5 px-4 py-3 text-[13px] text-ink">
        {bubble.text}
      </div>
    )
  }
  if (isTool) {
    return <div className="text-[12px] text-stone italic">{bubble.text}</div>
  }
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-[9.6px] px-4 py-3 text-[15px] leading-[1.5] ${
          isUser ? 'bg-ink text-snow' : 'border border-parchment bg-snow text-ink'
        }`}
      >
        {bubble.text}
      </div>
    </div>
  )
}

export default App
