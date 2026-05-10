import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Block, Bubble, Verdict } from '../../../preload'
import { ArrowIcon, SparkIcon } from './Icons'

interface Props {
  bubble: Bubble
  onPermissionDecision?: (
    requestId: string,
    allow: boolean,
    opts?: { allowPattern?: string }
  ) => void
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
    // Soft-azure card sized to its content. `self-start` opts out of the
    // flex-column's stretch so short messages ("hi") don't bloom to full
    // width; long messages grow to the column max and wrap.
    return (
      <div className="self-start max-w-full rounded-[12px] bg-azure/35 px-4 py-2.5 text-[15px] leading-[1.55] text-ink whitespace-pre-wrap break-words">
        {text}
      </div>
    )
  }

  // Once any text block in this assistant turn has content, the thinking is
  // "done" — auto-collapse it so the answer is visible.
  const hasFinalText = blocks.some((b) => b.type === 'text' && b.text.trim().length > 0)
  const interrupted = !!bubble.interrupted

  // Assistant turn — no outer bubble. Content flows directly on the page like
  // a document. Special blocks (thinking, tool_use, tool_result) get their
  // own framing as inset cards so they're still visually distinct.
  return (
    <div className="prose-portico flex flex-col gap-3 px-1 text-[15px] leading-[1.6] text-ink">
      {blocks.map((blk, i) => {
        if (blk.type === 'thinking')
          return <ThinkingBlock key={i} text={blk.thinking} done={hasFinalText} />
        if (blk.type === 'tool_use') return <ToolUseBlock key={i} name={blk.name} input={blk.input} />
        if (blk.type === 'text') return <TextBlock key={i} text={blk.text} />
        return null
      })}
      {interrupted && (
        <div className="flex items-center gap-1.5 text-[11px] text-terra">
          <span>✕</span>
          <span>Stopped by you. Your next message will let Claude know it was interrupted.</span>
        </div>
      )}
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
    <div className="rounded-[8px] border border-parchment bg-snow px-3 py-2">
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

  // Detect AskUserQuestion answer round-trip — main returns the user's
  // selection via canUseTool's deny-with-message channel (the only way to
  // smuggle a tool result through that callback). The SDK marks it isError,
  // but it's not an error — render it as an "answered" panel.
  const isAnswered = isError && trimmed.startsWith('User selected:')

  if (!trimmed) {
    return (
      <div className="text-[11px] text-stone italic">
        ← tool result {isError && <span className="text-terra">· error</span>} (empty)
      </div>
    )
  }

  if (isAnswered) {
    // Strip the "User selected:" prefix and render the Q/A pairs directly.
    const body = trimmed.replace(/^User selected:\s*/, '').trim()
    return (
      <div className="rounded-[8px] border border-[#4a8a5e]/30 bg-[#4a8a5e]/5 px-3 py-2 text-[12px]">
        <div className="text-[11px] font-medium uppercase tracking-wider text-[#2f6240]">
          ✓ You answered
        </div>
        <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.5] text-graphite">
          {body}
        </pre>
      </div>
    )
  }

  const preview = trimmed.slice(0, 110).replace(/\s+/g, ' ')
  return (
    <div
      className={`rounded-[8px] border px-3 py-2 text-[12px] ${
        isError ? 'border-terra/40 bg-terra/5' : 'border-parchment bg-snow'
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
        <pre className="mt-2 max-h-[300px] overflow-auto rounded-[6px] bg-vellum p-2 text-[11.5px] leading-[1.5] text-graphite whitespace-pre-wrap break-words">
          {text}
        </pre>
      ) : (
        <div className="mt-1 truncate text-[11.5px] text-graphite">{preview}…</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Compact tool-call summary. One line per call: [verb] [target] [stats] ›
// Click to expand the raw input. Designed to read like a build log, not a
// JSON dump — this is what scrolls past the user during a long agent loop.
// ─────────────────────────────────────────────────────────────────────────

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i === -1 ? p : p.slice(i + 1)
}

function lineCount(s: string | undefined): number {
  if (!s) return 0
  const trimmed = s.replace(/\n+$/, '')
  if (!trimmed) return 0
  return trimmed.split('\n').length
}

interface ToolSummary {
  verb: string
  target: string
  stats?: string
}

/**
 * Maps a tool call into a human-friendly one-liner. Best-effort — falls back
 * to the tool name if the input shape is unexpected.
 */
function summarizeToolCall(name: string, input: unknown): ToolSummary {
  const i = (input ?? {}) as Record<string, unknown>
  const fp = typeof i.file_path === 'string' ? i.file_path : undefined
  const path = typeof i.path === 'string' ? i.path : undefined

  switch (name) {
    case 'Read':
      return { verb: 'Read', target: fp ? basename(fp) : 'file' }
    case 'Write':
      return { verb: 'Wrote', target: fp ? basename(fp) : 'file' }
    case 'Edit':
    case 'NotebookEdit': {
      const added = lineCount(i.new_string as string | undefined)
      const removed = lineCount(i.old_string as string | undefined)
      return {
        verb: 'Edited',
        target: fp ? basename(fp) : 'file',
        stats: `+${added} -${removed}`
      }
    }
    case 'Bash': {
      const desc = typeof i.description === 'string' ? i.description : undefined
      const cmd = typeof i.command === 'string' ? i.command : ''
      const target = desc || (cmd.length > 60 ? `${cmd.slice(0, 57)}…` : cmd) || 'command'
      return { verb: 'Ran', target }
    }
    case 'Glob':
      return { verb: 'Searched', target: typeof i.pattern === 'string' ? i.pattern : 'files' }
    case 'Grep': {
      const q = typeof i.pattern === 'string' ? `"${i.pattern}"` : 'pattern'
      const where = path ? ` in ${basename(path)}` : ''
      return { verb: 'Searched', target: `${q}${where}` }
    }
    case 'WebFetch':
      return { verb: 'Fetched', target: typeof i.url === 'string' ? new URL(i.url).hostname : 'url' }
    case 'WebSearch':
      return { verb: 'Searched web', target: typeof i.query === 'string' ? `"${i.query}"` : '' }
    case 'TodoWrite':
      return { verb: 'Updated', target: 'todo list' }
    case 'Task': {
      const desc = typeof i.description === 'string' ? i.description : 'subtask'
      return { verb: 'Spawned', target: desc }
    }
    case 'AskUserQuestion': {
      // The agent passes a `questions` array; show the first question's text
      // (truncated) as the summary. Falls back to "a question" if shape is off.
      const qs = Array.isArray(i.questions) ? (i.questions as Array<Record<string, unknown>>) : []
      const first = qs[0]?.question
      const text = typeof first === 'string' ? first : 'a question'
      const more = qs.length > 1 ? ` (+${qs.length - 1} more)` : ''
      const trimmed = text.length > 60 ? `${text.slice(0, 57)}…` : text
      return { verb: 'Asked', target: `"${trimmed}"${more}` }
    }
    default:
      return { verb: 'Ran', target: name }
  }
}

function ToolUseBlock({ name, input }: { name: string; input: unknown }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { verb, target, stats } = summarizeToolCall(name, input)
  return (
    <div className="rounded-[6px] border border-parchment bg-snow">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-graphite hover:text-ink"
      >
        <span className="text-graphite">{verb}</span>
        <span className="font-mono text-ink">{target}</span>
        {stats && (
          <span className="font-mono text-stone">
            {stats.split(' ').map((part, i) => {
              const tone = part.startsWith('+')
                ? 'text-[#4a8a5e]'
                : part.startsWith('-')
                  ? 'text-terra'
                  : 'text-stone'
              return (
                <span key={i} className={tone}>
                  {i > 0 ? ' ' : ''}
                  {part}
                </span>
              )
            })}
          </span>
        )}
        <span className={`ml-auto text-stone transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="mx-2 mb-2">
          <ToolDetail name={name} input={input} />
        </div>
      )}
    </div>
  )
}

/**
 * Per-tool expanded detail view. Edit/Write get a real diff or content
 * preview; everything else falls back to pretty-printed JSON.
 */
function ToolDetail({ name, input }: { name: string; input: unknown }): React.JSX.Element {
  const i = (input ?? {}) as Record<string, unknown>

  if (name === 'Edit' || name === 'NotebookEdit') {
    const oldStr = typeof i.old_string === 'string' ? i.old_string : ''
    const newStr = typeof i.new_string === 'string' ? i.new_string : ''
    return <DiffView oldStr={oldStr} newStr={newStr} />
  }

  if (name === 'Write') {
    const content = typeof i.content === 'string' ? i.content : ''
    return (
      <pre className="max-h-[300px] overflow-auto rounded-[6px] border border-[#4a8a5e]/25 bg-[#4a8a5e]/5 p-2 text-[11px] leading-[1.5] text-graphite whitespace-pre-wrap break-words">
        {content || '(empty)'}
      </pre>
    )
  }

  if (name === 'Bash') {
    const cmd = typeof i.command === 'string' ? i.command : ''
    return (
      <pre className="max-h-[200px] overflow-auto rounded-[6px] bg-vellum p-2 text-[11px] leading-[1.5] text-ink whitespace-pre-wrap break-words">
        $ {cmd}
      </pre>
    )
  }

  // Fallback: raw JSON.
  let json = ''
  try {
    json = JSON.stringify(input, null, 2)
  } catch {
    json = '(unserializable)'
  }
  return (
    <pre className="max-h-[260px] overflow-auto rounded-[6px] bg-vellum p-2 text-[11px] leading-[1.5] text-graphite whitespace-pre-wrap break-words">
      {json}
    </pre>
  )
}

/**
 * Minimal LCS-based unified diff for two strings. Renders removed lines on
 * red, added lines on green, context lines in graphite. Good enough for the
 * small edits the agent typically makes — for large multi-hunk diffs we'd
 * pull in a real diff library, but that's overkill today.
 */
function DiffView({ oldStr, newStr }: { oldStr: string; newStr: string }): React.JSX.Element {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const ops = lcsDiff(oldLines, newLines)
  return (
    <div className="max-h-[360px] overflow-auto rounded-[6px] border border-parchment bg-snow font-mono text-[11px] leading-[1.5]">
      {ops.map((op, i) => {
        if (op.kind === 'eq') {
          return (
            <div key={i} className="flex">
              <span className="w-5 select-none px-1 text-right text-stone">·</span>
              <span className="flex-1 whitespace-pre-wrap break-words px-2 text-graphite">{op.text || ' '}</span>
            </div>
          )
        }
        if (op.kind === 'add') {
          return (
            <div key={i} className="flex bg-[#4a8a5e]/10">
              <span className="w-5 select-none px-1 text-right text-[#4a8a5e]">+</span>
              <span className="flex-1 whitespace-pre-wrap break-words px-2 text-[#2f6240]">{op.text || ' '}</span>
            </div>
          )
        }
        return (
          <div key={i} className="flex bg-terra/10">
            <span className="w-5 select-none px-1 text-right text-terra">−</span>
            <span className="flex-1 whitespace-pre-wrap break-words px-2 text-terra">{op.text || ' '}</span>
          </div>
        )
      })}
    </div>
  )
}

type DiffOp = { kind: 'eq' | 'add' | 'del'; text: string }

/** Standard LCS table, then walk back to produce a unified diff. O(n·m) memory. */
function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length
  const m = b.length
  // Use a flat array for the LCS lengths table.
  const dp = new Int32Array((n + 1) * (m + 1))
  const w = m + 1
  for (let x = n - 1; x >= 0; x--) {
    for (let y = m - 1; y >= 0; y--) {
      if (a[x] === b[y]) dp[x * w + y] = dp[(x + 1) * w + (y + 1)] + 1
      else dp[x * w + y] = Math.max(dp[(x + 1) * w + y], dp[x * w + (y + 1)])
    }
  }
  const ops: DiffOp[] = []
  let x = 0
  let y = 0
  while (x < n && y < m) {
    if (a[x] === b[y]) {
      ops.push({ kind: 'eq', text: a[x] })
      x++
      y++
    } else if (dp[(x + 1) * w + y] >= dp[x * w + (y + 1)]) {
      ops.push({ kind: 'del', text: a[x] })
      x++
    } else {
      ops.push({ kind: 'add', text: b[y] })
      y++
    }
  }
  while (x < n) {
    ops.push({ kind: 'del', text: a[x] })
    x++
  }
  while (y < m) {
    ops.push({ kind: 'add', text: b[y] })
    y++
  }
  return ops
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
  onDecision?: (
    requestId: string,
    allow: boolean,
    opts?: { allowPattern?: string }
  ) => void
}): React.JSX.Element {
  const [showPatternMenu, setShowPatternMenu] = useState(false)
  const inputJson = JSON.stringify(block.input, null, 2)
  const decided = !!block.decision
  const screening = block.screening
  const styles = screening ? verdictStyle(screening.verdict) : null
  const suggested = block.suggestedPattern

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
          {block.decision!.allowPattern && (
            <span className="font-mono text-graphite">{block.decision!.allowPattern} · </span>
          )}
          {new Date(block.decision!.at).toLocaleTimeString()}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
            Approve once
          </button>
          {suggested && (
            <div className="relative">
              <button
                onClick={() => setShowPatternMenu((v) => !v)}
                className="flex items-center gap-1.5 rounded-[9.6px] border border-onyx/15 bg-vellum px-3 py-1.5 text-[13px] text-ink hover:border-onyx/30"
                title="Auto-approve similar calls for the rest of this session"
              >
                Allow for session
                <span className="text-stone">▾</span>
              </button>
              {showPatternMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 w-[280px] rounded-[8px] border border-onyx/15 bg-snow p-2 shadow-lg">
                  <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-stone">
                    Pattern to allow
                  </div>
                  <button
                    onClick={() => {
                      setShowPatternMenu(false)
                      onDecision?.(block.requestId, true, { allowPattern: suggested })
                    }}
                    className="block w-full rounded-[6px] px-2 py-1.5 text-left text-[12px] hover:bg-vellum"
                  >
                    <div className="font-mono text-ink">{suggested}</div>
                    <div className="mt-0.5 text-[10.5px] text-dusty">Suggested — generalizes this call</div>
                  </button>
                  <button
                    onClick={() => {
                      setShowPatternMenu(false)
                      onDecision?.(block.requestId, true, { allowPattern: block.toolName })
                    }}
                    className="mt-0.5 block w-full rounded-[6px] px-2 py-1.5 text-left text-[12px] hover:bg-vellum"
                  >
                    <div className="font-mono text-ink">{block.toolName}</div>
                    <div className="mt-0.5 text-[10.5px] text-dusty">All {block.toolName} calls</div>
                  </button>
                  <div className="mt-1 border-t border-parchment px-2 pt-1.5 text-[10.5px] text-dusty">
                    Cleared when you start a new session.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

