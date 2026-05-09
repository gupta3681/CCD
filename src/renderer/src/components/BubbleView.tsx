import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Block, Bubble, Verdict } from '../../../preload'
import { ArrowIcon, SparkIcon } from './Icons'

interface Props {
  bubble: Bubble
  onPermissionDecision?: (requestId: string, allow: boolean) => void
}

function blocksOf(b: Bubble): Block[] {
  if (b.blocks && b.blocks.length > 0) return b.blocks
  if (b.text != null) return [{ type: 'text', text: b.text }]
  return []
}

export function BubbleView({ bubble, onPermissionDecision }: Props): React.JSX.Element {
  const blocks = blocksOf(bubble)

  if (bubble.role === 'permission') {
    const block = blocks.find((b) => b.type === 'permission_request')
    if (block && block.type === 'permission_request') {
      return <PermissionPrompt block={block} onDecision={onPermissionDecision} />
    }
    return <></>
  }

  if (bubble.role === 'system') {
    const text = blocks.map((b) => (b.type === 'text' ? b.text : '')).join('')
    return (
      <div className="rounded-[9.6px] border border-terra/30 bg-terra/5 px-4 py-3 text-[13px] text-ink">
        {text}
      </div>
    )
  }

  if (bubble.role === 'tool') {
    const result = blocks.find((b) => b.type === 'tool_result')
    if (result && result.type === 'tool_result') {
      return <ToolResultBlock text={result.text} isError={!!result.isError} />
    }
    return <></>
  }

  if (bubble.role === 'user') {
    const text = blocks.map((b) => (b.type === 'text' ? b.text : '')).join('')
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-[9.6px] bg-ink px-4 py-3 text-[15px] leading-[1.5] text-snow">
          {text}
        </div>
      </div>
    )
  }

  // Once any text block in this assistant turn has content, the thinking is
  // "done" — auto-collapse it so the answer is visible.
  const hasFinalText = blocks.some((b) => b.type === 'text' && b.text.trim().length > 0)

  return (
    <div className="flex justify-start">
      <div className="prose-portico flex max-w-[85%] flex-col gap-2 rounded-[9.6px] border border-parchment bg-snow px-4 py-3 text-[15px] leading-[1.5] text-ink">
        {blocks.map((blk, i) => {
          if (blk.type === 'thinking')
            return <ThinkingBlock key={i} text={blk.thinking} done={hasFinalText} />
          if (blk.type === 'tool_use') return <ToolUseBlock key={i} name={blk.name} input={blk.input} />
          if (blk.type === 'text') return <TextBlock key={i} text={blk.text} />
          return null
        })}
      </div>
    </div>
  )
}

function TextBlock({ text }: { text: string }): React.JSX.Element {
  if (!text) return <span className="text-stone">…</span>
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
}

function ThinkingBlock({ text, done }: { text: string; done: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  // Auto-collapse once when the assistant's final text starts arriving. Tracked
  // by a ref so a subsequent re-render doesn't override the user re-expanding it.
  const autoCollapsedRef = useRef(false)
  useEffect(() => {
    if (done && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true
      setOpen(false)
    }
  }, [done])

  const lines = text.trim().split('\n').filter(Boolean)
  const preview = lines.length > 0 ? lines[lines.length - 1] : '…'
  return (
    <div className="rounded-[8px] border border-parchment bg-vellum/60 px-3 py-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-[11px] font-medium uppercase tracking-wider text-dusty hover:text-ink"
      >
        <span className="flex items-center gap-1.5"><SparkIcon /> Thinking</span>
        <span className="text-stone">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="mt-1.5 whitespace-pre-wrap text-[13px] leading-[1.5] text-graphite">{text}</div>
      ) : (
        <div className="mt-1 truncate text-[12px] text-stone italic">{preview}</div>
      )}
    </div>
  )
}

function ToolResultBlock({ text, isError }: { text: string; isError: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const lines = text.split('\n')
  const lineCount = lines.length
  const trimmed = text.trim()
  if (!trimmed) {
    return (
      <div className="text-[11px] text-stone italic">
        ← tool result {isError && <span className="text-terra">· error</span>} (empty)
      </div>
    )
  }
  const preview = trimmed.slice(0, 110).replace(/\s+/g, ' ')
  return (
    <div
      className={`rounded-[8px] border px-3 py-2 text-[12px] ${
        isError ? 'border-terra/40 bg-terra/5' : 'border-parchment bg-vellum/40'
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left text-[11px] uppercase tracking-wider text-dusty hover:text-ink"
      >
        <span className="flex items-center gap-1.5">
          <ArrowIcon /> {isError ? 'tool error' : 'tool result'} · {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>
        <span className="text-stone">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <pre className="mt-2 max-h-[300px] overflow-auto rounded-[6px] bg-snow p-2 text-[11.5px] leading-[1.5] text-graphite whitespace-pre-wrap break-words">
          {text}
        </pre>
      ) : (
        <div className="mt-1 truncate text-[11.5px] text-graphite">{preview}…</div>
      )}
    </div>
  )
}

function ToolUseBlock({ name, input }: { name: string; input: unknown }): React.JSX.Element {
  const summary = (() => {
    try {
      const s = JSON.stringify(input)
      return s.length > 80 ? `${s.slice(0, 77)}…` : s
    } catch {
      return ''
    }
  })()
  return (
    <div className="flex items-center gap-2 rounded-[6px] bg-vellum/60 px-2.5 py-1 text-[12px] text-graphite">
      <ArrowIcon />
      <span className="font-medium">{name}</span>
      {summary && <span className="text-stone">{summary}</span>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Permission prompt
// ─────────────────────────────────────────────────────────────────────────

function verdictStyle(v: Verdict): { bar: string; chip: string; label: string } {
  if (v === 'SAFE') return { bar: 'bg-[#4a8a5e]', chip: 'bg-[#4a8a5e]/10 text-[#2f6240]', label: 'Safe' }
  if (v === 'DANGEROUS')
    return { bar: 'bg-terra', chip: 'bg-terra/15 text-terra', label: 'Dangerous' }
  return { bar: 'bg-[#b89456]', chip: 'bg-[#b89456]/15 text-[#7a5d2e]', label: 'Caution' }
}

function PermissionPrompt({
  block,
  onDecision
}: {
  block: Extract<Block, { type: 'permission_request' }>
  onDecision?: (requestId: string, allow: boolean) => void
}): React.JSX.Element {
  const inputJson = JSON.stringify(block.input, null, 2)
  const decided = !!block.decision
  const screening = block.screening
  const styles = screening ? verdictStyle(screening.verdict) : null

  return (
    <div className="rounded-[12px] border border-onyx/15 bg-snow p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="rounded-[6px] bg-vellum px-2 py-0.5 text-[11px] font-medium text-graphite">
          {block.toolName}
        </span>
        <span className="text-[12px] text-dusty">wants to run</span>
        {styles && (
          <span className={`ml-auto rounded-[6px] px-2 py-0.5 text-[11px] font-medium ${styles.chip}`}>
            {styles.label}
          </span>
        )}
      </div>

      {screening ? (
        <div className="mt-3 flex gap-3">
          <div className={`w-[3px] flex-shrink-0 rounded-full ${styles!.bar}`} />
          <div className="flex-1">
            <div className="text-[13px] text-ink">{screening.summary}</div>
            {screening.reason && (
              <div className="mt-1 text-[12px] text-graphite">{screening.reason}</div>
            )}
            <div className="mt-1 text-[10px] text-stone">
              Screened in {screening.ms}ms by Haiku
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[12px] text-stone italic">Screening with Haiku…</div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] text-dusty hover:text-ink">View input</summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-[6px] border border-parchment bg-vellum/60 p-2 text-[11.5px] leading-[1.5] text-graphite">
          {inputJson}
        </pre>
      </details>

      {decided ? (
        <div className="mt-3 text-[12px] text-stone">
          {block.decision!.allow ? '✓ Approved' : '✕ Denied'} ·{' '}
          {new Date(block.decision!.at).toLocaleTimeString()}
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => onDecision?.(block.requestId, false)}
            className="rounded-[9.6px] border border-onyx/15 px-3 py-1.5 text-[13px] text-ink hover:bg-vellum"
          >
            Deny
          </button>
          <button
            onClick={() => onDecision?.(block.requestId, true)}
            className="rounded-[9.6px] bg-ink px-3 py-1.5 text-[13px] font-medium text-snow hover:opacity-90"
          >
            Approve
          </button>
        </div>
      )}
    </div>
  )
}

