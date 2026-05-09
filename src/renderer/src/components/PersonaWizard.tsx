import { useState } from 'react'
import type { Persona } from '../../../preload'

interface Props {
  onDone: () => void
}

interface PersonaCard {
  key: Persona
  label: string
  blurb: string
}

const PERSONAS: PersonaCard[] = [
  {
    key: 'developer',
    label: 'Simple developer',
    blurb: 'Direct, technical, fluent in code. Skip the preamble.'
  },
  {
    key: 'pm',
    label: 'Project manager',
    blurb: 'Plain language, fewer surprises. Surface trade-offs.'
  },
  {
    key: 'director',
    label: 'Director and above',
    blurb: 'Bottom line first. Frame in terms of risk, time, and cost.'
  }
]

export function PersonaWizard({ onDone }: Props): React.JSX.Element {
  const [persona, setPersona] = useState<Persona>('developer')
  const [name, setName] = useState('')
  const [workingOn, setWorkingOn] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function getStarted(): Promise<void> {
    setSubmitting(true)
    try {
      await window.api.settings.profile.seed({ persona, name: name.trim(), workingOn: workingOn.trim() })
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  async function skip(): Promise<void> {
    setSubmitting(true)
    try {
      await window.api.settings.profile.skip()
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-8 rounded-[12px] border border-onyx/15 bg-snow p-6">
      <h1 className="font-serif text-[28px] font-[330] leading-tight text-ink">One last thing — who are you?</h1>
      <p className="mt-2 text-[14px] text-graphite">
        Pick a persona. We'll seed Portico's tone to match. You can change anything later in Settings → Memory and Soul.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {PERSONAS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPersona(p.key)}
            className={`flex w-full items-start gap-3 rounded-[9.6px] border px-4 py-3 text-left transition-colors ${
              persona === p.key
                ? 'border-onyx/40 bg-vellum/40'
                : 'border-parchment hover:border-onyx/20'
            }`}
          >
            <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-onyx/40">
              {persona === p.key && <div className="h-2 w-2 rounded-full bg-ink" />}
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-medium text-ink">{p.label}</div>
              <div className="mt-0.5 text-[12px] text-graphite">{p.blurb}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <Field label="Your name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Aryan"
            className="w-full rounded-[9.6px] border border-onyx/15 bg-snow px-3 py-2 text-[14px] text-ink outline-none focus:border-onyx/30"
          />
        </Field>
        <Field label="What you're working on">
          <input
            type="text"
            value={workingOn}
            onChange={(e) => setWorkingOn(e.target.value)}
            placeholder="Portico — internal Claude Code-style desktop app"
            className="w-full rounded-[9.6px] border border-onyx/15 bg-snow px-3 py-2 text-[14px] text-ink outline-none focus:border-onyx/30"
          />
        </Field>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          onClick={skip}
          disabled={submitting}
          className="rounded-[9.6px] border border-onyx/15 px-3 py-1.5 text-[13px] text-ink hover:bg-vellum disabled:opacity-40"
        >
          Skip
        </button>
        <button
          onClick={getStarted}
          disabled={submitting}
          className="rounded-[9.6px] bg-ink px-4 py-2 text-[13px] font-medium text-snow hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? 'Setting up…' : 'Get started'}
        </button>
      </div>

      <p className="mt-4 text-[11px] text-dusty">
        Writes to <code className="font-mono">~/.claude/CLAUDE.md</code> (about you) and{' '}
        <code className="font-mono">~/.claude/soul.md</code> (how the agent responds). Both editable later.
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium text-ink">{label}</label>
      {children}
    </div>
  )
}
