import { useEffect, useRef, useState } from 'react'
import { KNOWN_MODELS, lookupModel, type ModelOption } from '../../../shared/types'

/**
 * Compact model picker. Used in two places:
 *   1. Inline in the header — clicking the model badge swaps the per-conversation
 *      model (variant="header"). Shows just the label + a small chevron.
 *   2. As a full dropdown in Settings → Gateway for the global default
 *      (variant="settings"). Renders a labeled <select>-style box.
 *
 * Closing on outside-click / Escape is handled here so callers don't have to.
 */
type Variant = 'header' | 'settings'

interface Props {
  value: string | null
  onChange: (id: string | null) => void
  /** When true, the menu shows a "Use global default" item that resolves to null. */
  allowClear?: boolean
  globalDefaultLabel?: string
  variant: Variant
  /** Override badge label — used for the header to show "(default)" hint. */
  badgeLabel?: string
}

export function ModelPicker({
  value,
  onChange,
  allowClear,
  globalDefaultLabel,
  variant,
  badgeLabel
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = lookupModel(value)
  const label = badgeLabel ?? selected?.label ?? globalDefaultLabel ?? 'Default'

  if (variant === 'header') {
    return (
      <div ref={rootRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] text-dusty hover:bg-parchment/60 hover:text-ink"
          title="Change model for this conversation"
        >
          <span>{label}</span>
          <span className="text-stone">▾</span>
        </button>
        {open && (
          <Menu
            value={value}
            onPick={(id) => {
              onChange(id)
              setOpen(false)
            }}
            allowClear={allowClear}
            globalDefaultLabel={globalDefaultLabel}
            anchor="header"
          />
        )}
      </div>
    )
  }

  // settings variant — full-width box, slightly larger
  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-[9.6px] border border-onyx/15 bg-snow px-3 py-2 text-left text-[13px] text-ink hover:border-onyx/30"
      >
        <span>{label}</span>
        <span className="text-stone">▾</span>
      </button>
      {open && (
        <Menu
          value={value}
          onPick={(id) => {
            onChange(id)
            setOpen(false)
          }}
          allowClear={allowClear}
          globalDefaultLabel={globalDefaultLabel}
          anchor="settings"
        />
      )}
    </div>
  )
}

function Menu({
  value,
  onPick,
  allowClear,
  globalDefaultLabel,
  anchor
}: {
  value: string | null
  onPick: (id: string | null) => void
  allowClear?: boolean
  globalDefaultLabel?: string
  anchor: 'header' | 'settings'
}): React.JSX.Element {
  // Header anchors right (so it doesn't overflow the right side of the window),
  // Settings anchors left (it's in a wider card).
  const positionCls =
    anchor === 'header'
      ? 'right-0 top-full mt-1 w-[260px]'
      : 'left-0 right-0 top-full mt-1'
  return (
    <div className={`absolute z-30 ${positionCls} rounded-[9.6px] border border-onyx/15 bg-snow p-1 shadow-lg`}>
      {allowClear && (
        <button
          onClick={() => onPick(null)}
          className={`flex w-full items-start gap-2 rounded-[6px] px-2.5 py-2 text-left hover:bg-vellum ${
            value == null ? 'bg-vellum/60' : ''
          }`}
        >
          <span className="mt-0.5 inline-block w-1 self-stretch rounded-full bg-graphite/40" />
          <div>
            <div className="text-[12.5px] font-medium text-ink">
              Use default {globalDefaultLabel ? `· ${globalDefaultLabel}` : ''}
            </div>
            <div className="mt-0.5 text-[11px] text-dusty">
              Inherit the global default set in Settings → Gateway.
            </div>
          </div>
        </button>
      )}
      {KNOWN_MODELS.map((m) => (
        <ModelRow key={m.id} model={m} active={m.id === value} onPick={() => onPick(m.id)} />
      ))}
    </div>
  )
}

function ModelRow({
  model,
  active,
  onPick
}: {
  model: ModelOption
  active: boolean
  onPick: () => void
}): React.JSX.Element {
  const tierBadge =
    model.tier === 'cheap'
      ? { glyph: '$', tone: 'text-[#4a8a5e]' }
      : model.tier === 'premium'
        ? { glyph: '$$$', tone: 'text-terra' }
        : { glyph: '$$', tone: 'text-[#b89456]' }
  return (
    <button
      onClick={onPick}
      className={`flex w-full items-start gap-2 rounded-[6px] px-2.5 py-2 text-left hover:bg-vellum ${
        active ? 'bg-vellum/60' : ''
      }`}
    >
      <span className={`mt-0.5 w-7 text-center font-mono text-[10.5px] ${tierBadge.tone}`}>
        {tierBadge.glyph}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-medium text-ink">{model.label}</span>
          {active && <span className="text-[10px] text-stone">· current</span>}
        </div>
        <div className="mt-0.5 text-[11px] text-dusty">{model.hint}</div>
      </div>
    </button>
  )
}
