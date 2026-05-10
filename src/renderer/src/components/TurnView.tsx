import { useState } from 'react'
import { BubbleView } from './BubbleView'
import type { Bubble } from '../../../preload'

/**
 * A "turn" = one user message + everything the agent did to answer it
 * (thinking blocks, tool calls, permission prompts, tool results) +
 * the final assistant answer.
 *
 * Once the turn finishes (busy: false AND a final-answer text bubble exists),
 * the intermediate work collapses behind a "Show working (N steps)" disclosure
 * so the user sees just question → answer by default. Click to expand.
 *
 * While the turn is in progress, everything renders open so the user can
 * watch the agent work in real time.
 */
export interface Turn {
  id: string
  user: Bubble | null
  intermediate: Bubble[]
  finalAnswer: Bubble | null
  inProgress: boolean
}

/**
 * Groups a flat list of bubbles into turns. A user bubble starts a new turn;
 * every subsequent non-user bubble belongs to it. Within a turn, the LAST
 * assistant bubble with a non-empty text block is the "final answer";
 * everything else is intermediate work.
 */
export function groupTurns(bubbles: Bubble[], busy: boolean): Turn[] {
  const turns: Turn[] = []
  let current: Turn | null = null

  for (const b of bubbles) {
    if (b.role === 'user') {
      if (current) turns.push(current)
      current = { id: b.id, user: b, intermediate: [], finalAnswer: null, inProgress: false }
      continue
    }
    if (!current) {
      // Pre-user bubble (rare — system error, orphaned tool result). Headless turn.
      current = { id: b.id, user: null, intermediate: [], finalAnswer: null, inProgress: false }
    }
    const hasText =
      b.role === 'assistant' &&
      (b.blocks ?? []).some((blk) => blk.type === 'text' && blk.text.trim().length > 0)
    if (hasText) {
      // Promote previous final to intermediate; this is the new final.
      if (current.finalAnswer) current.intermediate.push(current.finalAnswer)
      current.finalAnswer = b
    } else {
      current.intermediate.push(b)
    }
  }
  if (current) turns.push(current)

  // Mark the last turn in-progress when the renderer is still busy.
  if (turns.length > 0) turns[turns.length - 1].inProgress = busy

  return turns
}

interface Props {
  turn: Turn
  onPermissionDecision?: (
    requestId: string,
    allow: boolean,
    opts?: { allowPattern?: string }
  ) => void
}

export function TurnView({ turn, onPermissionDecision }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  // Show all intermediate work when:
  //   - turn is still streaming (user wants to watch progress), OR
  //   - no final answer exists (the turn ended without a text response — e.g.
  //     denial, error, interrupted), OR
  //   - user clicked the disclosure to expand.
  const showIntermediate = turn.inProgress || !turn.finalAnswer || expanded

  // Show the disclosure chip only when there's something to collapse (turn
  // done, has a final answer, has intermediate work).
  const showDisclosure =
    !turn.inProgress && turn.finalAnswer != null && turn.intermediate.length > 0

  return (
    <>
      {turn.user && <BubbleView bubble={turn.user} onPermissionDecision={onPermissionDecision} />}

      {showDisclosure && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="self-start flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11px] text-stone hover:bg-parchment/40 hover:text-ink"
          title={expanded ? 'Hide working' : 'Show working'}
        >
          <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
          {expanded ? 'Hide' : 'Show'} working
          <span className="text-stone/70">
            · {turn.intermediate.length} step{turn.intermediate.length === 1 ? '' : 's'}
          </span>
        </button>
      )}

      {showIntermediate &&
        turn.intermediate.map((b) => (
          <BubbleView key={b.id} bubble={b} onPermissionDecision={onPermissionDecision} />
        ))}

      {turn.finalAnswer && (
        <BubbleView bubble={turn.finalAnswer} onPermissionDecision={onPermissionDecision} />
      )}
    </>
  )
}
