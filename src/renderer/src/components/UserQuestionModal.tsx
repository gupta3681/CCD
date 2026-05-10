import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { UserQuestion, UserQuestionAnswer } from '../../../shared/types'

interface Props {
  questions: UserQuestion[]
  /** Submit selections — caller is responsible for sending to main. */
  onSubmit: (answers: UserQuestionAnswer[]) => void
  /** Dismiss without answering. Caller should report this as a denial to main. */
  onDismiss: () => void
}

/**
 * Modal that surfaces the AskUserQuestion tool. Renders one card per question
 * with single-select radios or multi-select checkboxes. Submit is disabled
 * until every question has at least one selection.
 *
 * The modal is anchored center-screen with a dark backdrop. Esc dismisses;
 * Enter submits when valid. Click on the backdrop also dismisses.
 */
export function UserQuestionModal({ questions, onSubmit, onDismiss }: Props): React.JSX.Element {
  // selections[i] = set of selected option labels for questions[i].
  const [selections, setSelections] = useState<Set<string>[]>(() =>
    questions.map(() => new Set<string>())
  )

  const allAnswered = useMemo(
    () => selections.every((set) => set.size > 0),
    [selections]
  )

  function toggle(qIdx: number, label: string): void {
    setSelections((prev) => {
      const next = prev.map((s) => new Set(s))
      const set = next[qIdx]
      const q = questions[qIdx]
      if (q.multiSelect) {
        if (set.has(label)) set.delete(label)
        else set.add(label)
      } else {
        // single-select: replace
        set.clear()
        set.add(label)
      }
      return next
    })
  }

  function submit(): void {
    if (!allAnswered) return
    const answers: UserQuestionAnswer[] = selections.map((set, i) => ({
      questionIndex: i,
      selectedLabels: Array.from(set)
    }))
    onSubmit(answers)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAnswered, selections])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/45"
        onClick={onDismiss}
      />

      <div className="relative max-h-[85vh] w-[640px] max-w-[92vw] overflow-y-auto rounded-[12px] border border-onyx/15 bg-snow shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-parchment bg-snow px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="rounded-[6px] bg-vellum px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-graphite">
              Claude is asking
            </span>
            {questions.length > 1 && (
              <span className="text-[11px] text-stone">
                {questions.length} questions
              </span>
            )}
          </div>
          <button
            onClick={onDismiss}
            className="rounded-[6px] px-2 py-0.5 text-[18px] leading-none text-stone hover:text-ink"
            title="Dismiss (Esc)"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          {questions.map((q, i) => (
            <QuestionCard
              key={i}
              question={q}
              selected={selections[i]}
              onToggle={(label) => toggle(i, label)}
            />
          ))}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-parchment bg-snow px-5 py-3">
          <span className="text-[11px] text-stone">
            {allAnswered
              ? '⌘↵ to submit'
              : `${selections.filter((s) => s.size > 0).length} of ${questions.length} answered`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onDismiss}
              className="rounded-[9.6px] border border-onyx/15 px-3 py-1.5 text-[13px] text-ink hover:bg-vellum"
            >
              Skip
            </button>
            <button
              onClick={submit}
              disabled={!allAnswered}
              className="rounded-[9.6px] bg-ink px-4 py-1.5 text-[13px] font-medium text-snow hover:opacity-90 disabled:opacity-30"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function QuestionCard({
  question,
  selected,
  onToggle
}: {
  question: UserQuestion
  selected: Set<string>
  onToggle: (label: string) => void
}): React.JSX.Element {
  return (
    <div>
      {question.header && (
        <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-stone">
          {question.header}
        </div>
      )}
      <div className="mb-2 font-serif text-[18px] font-[400] leading-tight text-ink">
        {question.question}
      </div>
      {question.multiSelect && (
        <div className="mb-2 text-[11px] text-dusty">Pick one or more</div>
      )}

      <div className="flex flex-col gap-1.5">
        {question.options.map((opt) => {
          const isSelected = selected.has(opt.label)
          return (
            <button
              key={opt.label}
              onClick={() => onToggle(opt.label)}
              className={`flex items-start gap-3 rounded-[9.6px] border px-3 py-2.5 text-left transition-colors ${
                isSelected
                  ? 'border-ink bg-vellum/60'
                  : 'border-onyx/15 bg-snow hover:border-onyx/30'
              }`}
            >
              <span
                className={`mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center ${
                  question.multiSelect ? 'rounded-[3px]' : 'rounded-full'
                } border ${isSelected ? 'border-ink bg-ink' : 'border-onyx/30 bg-snow'}`}
              >
                {isSelected && (
                  <span className="text-[10px] leading-none text-snow">
                    {question.multiSelect ? '✓' : '●'}
                  </span>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-ink">{opt.label}</div>
                {opt.description && (
                  <div className="mt-0.5 text-[12px] text-graphite">{opt.description}</div>
                )}
                {opt.preview && (
                  <div className="prose-portico mt-2 rounded-[6px] border border-parchment bg-vellum/50 px-2 py-1.5 text-[11.5px] leading-[1.45] text-graphite">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{opt.preview}</ReactMarkdown>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
