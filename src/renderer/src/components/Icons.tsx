// Single source of truth for inline SVG icons used across the renderer.
// All icons inherit currentColor so callers control the color via Tailwind classes.

export function PlusIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function PanelIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="3" x2="6" y2="13" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

// Sliders icon — three horizontal "preference" rows with draggable knobs.
// Reads as "settings / controls" and fits the editorial Vellum aesthetic
// better than a literal cog.
export function GearIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="10.5" cy="4" r="1.6" fill="currentColor" stroke="var(--color-vellum, #faf9f5)" strokeWidth="1.2" />
      <circle cx="5.5" cy="8" r="1.6" fill="currentColor" stroke="var(--color-vellum, #faf9f5)" strokeWidth="1.2" />
      <circle cx="11" cy="12" r="1.6" fill="currentColor" stroke="var(--color-vellum, #faf9f5)" strokeWidth="1.2" />
    </svg>
  )
}

export function TrashIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 4h10M6 4V2.5h4V4M5 4l.6 9h4.8L11 4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SparkIcon(): React.JSX.Element {
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

export function ArrowIcon(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10m-4-4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// Up-arrow inside the send button. Universal "send a message" glyph.
export function SendArrowIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Solid square inside the stop button. Reads as "stop generating".
export function StopGlyphIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <rect x="1" y="1" width="8" height="8" rx="1.5" />
    </svg>
  )
}
