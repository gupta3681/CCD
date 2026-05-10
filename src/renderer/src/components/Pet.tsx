import { useEffect, useState } from 'react'

/**
 * A small pixel-style mascot that lives near the composer. Hand-drawn SVG
 * (no Lottie/Rive dep), reacts to `busy` state, and idles with a subtle
 * bob + occasional blink. Click to "pet" it (small wiggle animation).
 *
 * Style notes: kept to ~36px so it doesn't dominate the composer. Uses the
 * Vellum `terra` color so it sits inside the design system. Pixel-perfect
 * via `image-rendering: pixelated` plus integer-coord rectangles.
 */
interface Props {
  busy: boolean
}

type Mood = 'idle' | 'thinking' | 'happy'

export function Pet({ busy }: Props): React.JSX.Element {
  const [mood, setMood] = useState<Mood>('idle')
  const [blinking, setBlinking] = useState(false)
  const [petted, setPetted] = useState(false)

  // Bind mood to busy state. When busy starts, switch to thinking. When it
  // ends, brief happy reaction then back to idle.
  useEffect(() => {
    if (busy) {
      setMood('thinking')
    } else if (mood === 'thinking') {
      setMood('happy')
      const t = setTimeout(() => setMood('idle'), 1200)
      return () => clearTimeout(t)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])

  // Random blink every 3-7 seconds.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function scheduleBlink(): void {
      const delay = 3000 + Math.random() * 4000
      timer = setTimeout(() => {
        setBlinking(true)
        setTimeout(() => setBlinking(false), 140)
        scheduleBlink()
      }, delay)
    }
    scheduleBlink()
    return () => clearTimeout(timer)
  }, [])

  function pet(): void {
    setPetted(true)
    setTimeout(() => setPetted(false), 600)
  }

  const animationCls = busy
    ? 'animate-[pet-think_1.2s_ease-in-out_infinite]'
    : 'animate-[pet-bob_3s_ease-in-out_infinite]'
  const wiggleCls = petted ? 'animate-[pet-wiggle_0.5s_ease-in-out]' : ''

  return (
    <button
      onClick={pet}
      title={
        mood === 'thinking' ? 'Working on it…' : mood === 'happy' ? 'Done!' : 'Click to say hi'
      }
      aria-label="Mascot"
      className={`relative inline-block h-9 w-9 select-none ${animationCls} ${wiggleCls}`}
      style={{ imageRendering: 'pixelated' as React.CSSProperties['imageRendering'] }}
    >
      <svg viewBox="0 0 16 16" className="h-full w-full" shapeRendering="crispEdges">
        {/* Body — a soft bean of pixel cells in terracotta */}
        <BodyPixels mood={mood} />
        {/* Eyes — pair of dark cells, blink by collapsing height */}
        <Eye x={5} y={6} blinking={blinking} mood={mood} />
        <Eye x={9} y={6} blinking={blinking} mood={mood} />
        {/* Mouth — only visible when happy or idle */}
        {mood !== 'thinking' && <Mouth mood={mood} />}
        {/* Thinking dot — small bouncing pixel above the head when busy */}
        {mood === 'thinking' && <ThinkingDot />}
      </svg>

      {/* Keyframes — colocated so the component is self-contained. Tailwind
          v4 picks up the `animate-[name_dur_easing_iter]` arbitrary value. */}
      <style>{`
        @keyframes pet-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes pet-think {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-1px) rotate(2deg); }
        }
        @keyframes pet-wiggle {
          0%, 100% { transform: rotate(0); }
          25% { transform: rotate(-12deg); }
          75% { transform: rotate(12deg); }
        }
        @keyframes pet-thinkdot {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-1px); opacity: 1; }
        }
      `}</style>
    </button>
  )
}

// Vellum palette family — azure shifted darker so the pet has more presence
// against the cream background. Body is azure × graphite (the same blend we
// were using as the rim before); rim and thinking deepen further; the
// original azure becomes the highlight wedge.
const PET_BODY = '#8aa3b4' // azure deepened toward graphite
const PET_RIM = '#5e7a8c' // darker rim for grounded weight
const PET_HIGHLIGHT = '#ccdbe8' // --color-azure (now serves as the soft highlight)
const PET_THINKING = '#7892a3' // body shifted slightly cooler/darker
const PET_EYE = '#141413' // --color-ink

function BodyPixels({ mood }: { mood: Mood }): React.JSX.Element {
  // Compact dome silhouette. Drawn as nested rects approximating a smooth
  // curve — sleeker than the chunky bean it replaces. Bottom is wider than
  // top so it reads as "settled," top tapers for a clean head.
  const body = mood === 'thinking' ? PET_THINKING : PET_BODY
  const rim = PET_RIM
  const hi = PET_HIGHLIGHT
  return (
    <g>
      {/* head row */}
      <rect x={5} y={4} width={6} height={1} fill={body} />
      {/* upper body */}
      <rect x={4} y={5} width={8} height={1} fill={body} />
      <rect x={3} y={6} width={10} height={3} fill={body} />
      {/* lower body — slightly wider gives the "settled" feel */}
      <rect x={3} y={9} width={10} height={2} fill={body} />
      {/* bottom rim — darker tone for depth */}
      <rect x={4} y={11} width={8} height={1} fill={rim} />
      {/* glossy highlight — thin diagonal on the upper-left */}
      <rect x={4} y={5} width={2} height={1} fill={hi} opacity={0.7} />
      <rect x={3} y={6} width={1} height={2} fill={hi} opacity={0.6} />
    </g>
  )
}

function Eye({
  x,
  y,
  blinking,
  mood
}: {
  x: number
  y: number
  blinking: boolean
  mood: Mood
}): React.JSX.Element {
  // Larger, rounder eyes than the chunky version — gives the face more
  // presence on a smaller body. Blink collapses height; thinking narrows.
  const h = blinking ? 0.3 : mood === 'thinking' ? 0.9 : 1.4
  const yOffset = blinking ? y + 0.7 : mood === 'thinking' ? y + 0.4 : y
  return <rect x={x} y={yOffset} width={1.5} height={h} fill={PET_EYE} rx={0.5} />
}

function Mouth({ mood }: { mood: Mood }): React.JSX.Element {
  if (mood === 'happy') {
    // Single subtle upturned line — sleeker than the multi-pixel grin.
    return <rect x={6.5} y={9.2} width={3} height={0.7} fill={PET_EYE} rx={0.4} />
  }
  // Idle — no mouth. Eyes alone read as friendly, less cartoonish.
  return <></>
}

function ThinkingDot(): React.JSX.Element {
  return (
    <g style={{ animation: 'pet-thinkdot 0.8s ease-in-out infinite', transformOrigin: '8px 2px' }}>
      <rect x={7} y={1.2} width={1.6} height={1.2} fill={PET_RIM} rx={0.4} />
    </g>
  )
}
