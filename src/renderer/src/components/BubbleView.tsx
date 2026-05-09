import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Block, Bubble } from '../../../preload'

function blocksOf(b: Bubble): Block[] {
  if (b.blocks && b.blocks.length > 0) return b.blocks
  if (b.text != null) return [{ type: 'text', text: b.text }]
  return []
}

export function BubbleView({ bubble }: { bubble: Bubble }): React.JSX.Element {
  const blocks = blocksOf(bubble)

  if (bubble.role === 'system') {
    const text = blocks.map((b) => (b.type === 'text' ? b.text : '')).join('')
    return (
      <div className="rounded-[9.6px] border border-terra/30 bg-terra/5 px-4 py-3 text-[13px] text-ink">
        {text}
      </div>
    )
  }

  if (bubble.role === 'tool') {
    const text = blocks
      .map((b) => (b.type === 'tool_result' ? b.text : b.type === 'text' ? b.text : ''))
      .join('')
    return <div className="text-[12px] text-stone italic">{text}</div>
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

  // Assistant — render each block in order.
  return (
    <div className="flex justify-start">
      <div className="prose-portico flex max-w-[85%] flex-col gap-2 rounded-[9.6px] border border-parchment bg-snow px-4 py-3 text-[15px] leading-[1.5] text-ink">
        {blocks.map((blk, i) => {
          if (blk.type === 'thinking') return <ThinkingBlock key={i} text={blk.thinking} />
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

function ThinkingBlock({ text }: { text: string }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const lines = text.trim().split('\n').filter(Boolean)
  const preview = lines.length > 0 ? lines[lines.length - 1] : '…'

  return (
    <div className="rounded-[8px] border border-parchment bg-vellum/60 px-3 py-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-[11px] font-medium uppercase tracking-wider text-dusty hover:text-ink"
      >
        <span className="flex items-center gap-1.5">
          <SparkIcon /> Thinking
        </span>
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

function SparkIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.5l1.5 4.5L14 7.5 9.5 9 8 14.5 6.5 9 2 7.5 6.5 6 8 1.5z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ArrowIcon(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10m-4-4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
