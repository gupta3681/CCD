import { Pet } from './Pet'
import { SendArrowIcon, StopGlyphIcon } from './Icons'

/**
 * The bottom message-composer: textarea + circular send/stop button + the
 * floating Pet mascot. Self-contained — App.tsx hands it the input, busy
 * state, and the handlers; everything else (focus styling, hint text,
 * keyboard shortcuts, pet positioning) lives here.
 */
interface Props {
  value: string
  onChange: (next: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  inputRef
}: Props): React.JSX.Element {
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="bg-vellum px-6 pb-4 pt-3">
      <div className="relative mx-auto max-w-[760px]">
        {/* Mascot — sits on top of the composer's right edge, peeks above. */}
        <div className="pointer-events-none absolute -top-7 right-4 z-10">
          <div className="pointer-events-auto">
            <Pet busy={busy} />
          </div>
        </div>

        {/* Composer — single rounded container, send button inside on the
            right. Border lifts on focus-within for a subtle "this is active"
            cue. */}
        <div className="group flex items-end gap-2 rounded-[20px] border border-onyx/12 bg-snow px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors focus-within:border-onyx/30 focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
          <textarea
            ref={inputRef}
            className="max-h-[200px] min-h-[28px] flex-1 resize-none border-0 bg-transparent py-1.5 text-[15px] leading-[1.5] text-ink outline-none placeholder:text-stone disabled:opacity-50"
            placeholder="Ask anything…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={busy}
          />
          {busy ? (
            <button
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-onyx/20 bg-snow text-ink hover:bg-vellum"
            >
              <StopGlyphIcon />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!value.trim()}
              title="Send (Enter)"
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-snow transition-opacity hover:opacity-90 disabled:opacity-25"
            >
              <SendArrowIcon />
            </button>
          )}
        </div>

        <div className="mt-1.5 px-2 text-[10.5px] text-stone">
          Enter to send · Shift+Enter for newline
        </div>
      </div>
    </div>
  )
}
