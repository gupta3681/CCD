import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * First-run guided tour. Shows a series of popovers anchored to real UI
 * elements (sidebar, header, input box, etc.) with a "spotlight" cutout
 * over each. Persists completion to localStorage so it doesn't re-fire,
 * and exposes a manual re-trigger from Settings → Advanced.
 */

const TOUR_DONE_KEY = 'portico.tourCompleted'

export function tourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === '1'
  } catch {
    return true // if storage is unreachable, don't pester the user
  }
}

export function markTourCompleted(): void {
  try {
    localStorage.setItem(TOUR_DONE_KEY, '1')
  } catch {
    // ignore
  }
}

export function clearTourCompleted(): void {
  try {
    localStorage.removeItem(TOUR_DONE_KEY)
  } catch {
    // ignore
  }
}

export interface TourAnchors {
  gateway: HTMLElement | null
  newSession: HTMLElement | null
  rightSidebar: HTMLElement | null
  settings: HTMLElement | null
  input: HTMLElement | null
}

interface Step {
  title: string
  body: string
  anchorKey: keyof TourAnchors | null // null = centered modal
  side?: 'top' | 'bottom' | 'left' | 'right'
}

const STEPS: Step[] = [
  {
    anchorKey: null,
    title: 'Welcome to Portico',
    body:
      "Quick 30-second tour so you don't have to hunt for things. Skip anytime — you can re-run from Settings → Advanced."
  },
  {
    anchorKey: 'gateway',
    title: 'Your gateway, up top',
    body:
      'The dot tells you whether an API key is configured. Click to open Settings → Gateway to paste your Portkey or Anthropic key.',
    side: 'bottom'
  },
  {
    anchorKey: 'newSession',
    title: 'Start a new chat',
    body: 'Click here anytime to start fresh. Your old sessions stay in Recents below.',
    side: 'right'
  },
  {
    anchorKey: 'rightSidebar',
    title: 'Working folder lives here',
    body:
      'Pick a folder so the agent can read and write files in it. Each conversation has its own folder. Trust toggle lets that folder load its own CLAUDE.md and skills.',
    side: 'left'
  },
  {
    anchorKey: 'settings',
    title: 'Settings is your control panel',
    body:
      'Six tabs: Gateway, Permissions, Memory (CLAUDE.md), Soul (soul.md), Skills, and Advanced (live logs + re-run this tour).',
    side: 'right'
  },
  {
    anchorKey: 'input',
    title: 'Type and send',
    body:
      'Enter sends, Shift+Enter for a new line. Hit Stop mid-stream if the agent goes off the rails — your next message tells it you interrupted.',
    side: 'top'
  }
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function computePopoverPosition(
  anchor: Rect,
  side: Step['side']
): { top: number; left: number; transform: string } {
  const margin = 12
  switch (side) {
    case 'top':
      return {
        top: anchor.top - margin,
        left: anchor.left + anchor.width / 2,
        transform: 'translate(-50%, -100%)'
      }
    case 'left':
      return {
        top: anchor.top + anchor.height / 2,
        left: anchor.left - margin,
        transform: 'translate(-100%, -50%)'
      }
    case 'right':
      return {
        top: anchor.top + anchor.height / 2,
        left: anchor.left + anchor.width + margin,
        transform: 'translate(0, -50%)'
      }
    case 'bottom':
    default:
      return {
        top: anchor.top + anchor.height + margin,
        left: anchor.left + anchor.width / 2,
        transform: 'translate(-50%, 0)'
      }
  }
}

export function Tour({
  anchors,
  onClose
}: {
  anchors: TourAnchors
  onClose: () => void
}): React.JSX.Element | null {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverAdjust, setPopoverAdjust] = useState({ dx: 0, dy: 0 })

  const current = STEPS[step]
  const anchorEl = current.anchorKey ? anchors[current.anchorKey] : null

  useLayoutEffect(() => {
    if (!anchorEl) {
      setRect(null)
      return
    }
    const update = (): void => {
      const r = anchorEl.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [anchorEl])

  // Measure the popover after it lays out, then nudge it if it overflows the
  // viewport. Re-measures on every step so each placement is corrected.
  useLayoutEffect(() => {
    setPopoverAdjust({ dx: 0, dy: 0 })
    const el = popoverRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 12
    let dx = 0
    let dy = 0
    if (r.right > window.innerWidth - margin) dx = window.innerWidth - margin - r.right
    if (r.left < margin) dx = margin - r.left
    if (r.bottom > window.innerHeight - margin) dy = window.innerHeight - margin - r.bottom
    if (r.top < margin) dy = margin - r.top
    if (dx !== 0 || dy !== 0) setPopoverAdjust({ dx, dy })
  }, [step, rect])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function finish(): void {
    markTourCompleted()
    onClose()
  }

  function next(): void {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
    else finish()
  }

  function back(): void {
    if (step > 0) setStep((s) => s - 1)
  }

  // Spotlight cutout — four dark panels around the anchor leaving the anchor visible.
  const SPOT_PADDING = 6
  const cutout = rect
    ? {
        top: Math.max(0, rect.top - SPOT_PADDING),
        left: Math.max(0, rect.left - SPOT_PADDING),
        width: rect.width + SPOT_PADDING * 2,
        height: rect.height + SPOT_PADDING * 2
      }
    : null

  // Popover position — centered if no anchor, else next to anchor.
  const popoverStyle: React.CSSProperties = cutout
    ? computePopoverPosition(cutout, current.side)
    : {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ pointerEvents: 'none' }}
      aria-modal="true"
      role="dialog"
    >
      {/* Dim layer with cutout */}
      {cutout ? (
        <>
          {/* top */}
          <div
            className="absolute bg-ink/45 transition-all duration-200"
            style={{
              top: 0,
              left: 0,
              right: 0,
              height: cutout.top,
              pointerEvents: 'auto'
            }}
            onClick={finish}
          />
          {/* bottom */}
          <div
            className="absolute bg-ink/45 transition-all duration-200"
            style={{
              top: cutout.top + cutout.height,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'auto'
            }}
            onClick={finish}
          />
          {/* left */}
          <div
            className="absolute bg-ink/45 transition-all duration-200"
            style={{
              top: cutout.top,
              left: 0,
              width: cutout.left,
              height: cutout.height,
              pointerEvents: 'auto'
            }}
            onClick={finish}
          />
          {/* right */}
          <div
            className="absolute bg-ink/45 transition-all duration-200"
            style={{
              top: cutout.top,
              left: cutout.left + cutout.width,
              right: 0,
              height: cutout.height,
              pointerEvents: 'auto'
            }}
            onClick={finish}
          />
          {/* highlight ring around anchor */}
          <div
            className="absolute rounded-[10px] ring-2 ring-terra ring-offset-2 ring-offset-vellum/40 transition-all duration-200"
            style={{
              top: cutout.top,
              left: cutout.left,
              width: cutout.width,
              height: cutout.height
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0 bg-ink/45"
          style={{ pointerEvents: 'auto' }}
          onClick={finish}
        />
      )}

      {/* Popover */}
      <div
        ref={popoverRef}
        className="absolute max-w-[340px] rounded-[12px] border border-onyx/15 bg-snow p-4 shadow-xl"
        style={{
          ...popoverStyle,
          transform: `${popoverStyle.transform} translate(${popoverAdjust.dx}px, ${popoverAdjust.dy}px)`,
          pointerEvents: 'auto'
        }}
      >
        <div className="font-serif text-[18px] font-[400] leading-tight text-ink">{current.title}</div>
        <div className="mt-2 text-[13px] leading-[1.5] text-graphite">{current.body}</div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-stone">
            Step {step + 1} of {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={finish}
              className="rounded-[6px] px-2 py-1 text-[11px] text-dusty hover:text-ink"
            >
              Skip
            </button>
            <button
              onClick={back}
              disabled={step === 0}
              className="rounded-[6px] border border-onyx/15 px-3 py-1 text-[12px] text-ink hover:bg-vellum disabled:opacity-30"
            >
              Back
            </button>
            <button
              onClick={next}
              className="rounded-[6px] bg-ink px-3 py-1.5 text-[12px] font-medium text-snow hover:opacity-90"
            >
              {step === STEPS.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
