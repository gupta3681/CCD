import { useEffect, useRef, useState } from 'react'
import type { AppSettings, Skill, SkillSummary, SettingsPaths } from '../../../preload'

type Tab = 'gateway' | 'permissions' | 'memory' | 'soul' | 'skills' | 'advanced'

export function Settings({
  onClose,
  onRerunPersonaWizard,
  onRerunTour
}: {
  onClose: () => void
  onRerunPersonaWizard: () => void
  onRerunTour: () => void
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('gateway')
  const [paths, setPaths] = useState<SettingsPaths | null>(null)

  useEffect(() => {
    window.api.settings.paths().then(setPaths)
  }, [])

  return (
    <div className="flex flex-1 min-w-0 flex-col bg-vellum">
      <header className="flex items-center justify-between border-b border-parchment px-6 py-3 [-webkit-app-region:drag]">
        <div className="flex items-baseline gap-3 [-webkit-app-region:no-drag]">
          <span className="font-serif text-[18px] font-[330] text-ink">Settings</span>
          {paths && <span className="text-[11px] text-dusty">{paths.claudeDir}</span>}
        </div>
        <button
          onClick={onClose}
          className="rounded-[9.6px] border border-onyx/15 px-3 py-1 text-[12px] text-ink hover:bg-snow [-webkit-app-region:no-drag]"
        >
          Close
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-parchment py-4">
          <TabBtn active={tab === 'gateway'} onClick={() => setTab('gateway')} label="Gateway" hint="Portkey · API key" />
          <TabBtn active={tab === 'permissions'} onClick={() => setTab('permissions')} label="Permissions" hint="Tool approvals" />
          <TabBtn active={tab === 'memory'} onClick={() => setTab('memory')} label="Memory" hint="CLAUDE.md — about you" />
          <TabBtn active={tab === 'soul'} onClick={() => setTab('soul')} label="Soul" hint="soul.md — how to respond" />
          <TabBtn active={tab === 'skills'} onClick={() => setTab('skills')} label="Skills" hint="~/.claude/skills" />
          <TabBtn active={tab === 'advanced'} onClick={() => setTab('advanced')} label="Advanced" hint="Logs · diagnostics" />
        </nav>

        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
          {tab === 'gateway' && <GatewayTab />}
          {tab === 'permissions' && <PermissionsTab />}
          {tab === 'memory' && <MemoryTab />}
          {tab === 'soul' && <SoulTab onRerunPersonaWizard={onRerunPersonaWizard} />}
          {tab === 'skills' && <SkillsTab />}
          {tab === 'advanced' && <AdvancedTab onRerunTour={onRerunTour} />}
        </div>
      </div>
    </div>
  )
}

function TabBtn(props: {
  active: boolean
  onClick: () => void
  label: string
  hint: string
}): React.JSX.Element {
  return (
    <button
      onClick={props.onClick}
      className={`mx-2 flex flex-col items-start rounded-[8px] px-3 py-2 text-left ${
        props.active ? 'bg-parchment/60' : 'hover:bg-parchment/30'
      }`}
    >
      <span className="text-[13px] text-ink">{props.label}</span>
      <span className="text-[10px] text-stone">{props.hint}</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Gateway tab — base URL + API key (encrypted via OS keychain when available)
// ─────────────────────────────────────────────────────────────────────────

function GatewayTab(): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [keySet, setKeySet] = useState(false)
  const [keyStorage, setKeyStorage] = useState<'encrypted' | 'plaintext' | 'none'>('none')
  const [showKey, setShowKey] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    window.api.appSettings.get().then((s) => {
      setBaseUrl(s.gatewayBaseUrl ?? '')
      setKeySet(s.gatewayKeySet)
      setKeyStorage(s.keyStorage)
      setLoaded(true)
    })
  }, [])

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const patch: Parameters<typeof window.api.appSettings.set>[0] = {
        gatewayBaseUrl: baseUrl.trim()
      }
      if (apiKey.length > 0) patch.gatewayApiKey = apiKey
      const next = await window.api.appSettings.set(patch)
      setKeySet(next.gatewayKeySet)
      setKeyStorage(next.keyStorage)
      setApiKey('')
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  async function clearKey(): Promise<void> {
    if (!confirm('Clear the saved API key?')) return
    const next = await window.api.appSettings.set({ gatewayApiKey: null })
    setKeySet(next.gatewayKeySet)
    setKeyStorage(next.keyStorage)
  }

  if (!loaded) {
    return <div className="px-6 py-6 text-[12px] text-stone">Loading…</div>
  }

  return (
    <div className="overflow-y-auto px-6 py-6">
      <div className="max-w-[640px]">
        <h2 className="font-serif text-[24px] font-[400] text-ink">Gateway</h2>
        <p className="mt-1 text-[13px] text-dusty">
          The endpoint and key Portico uses to talk to Claude. These override the values in{' '}
          <code className="rounded bg-vellum/60 px-1">.env</code>.
        </p>

        <Field label="Base URL" hint="Portkey: https://api.portkey.ai/v1   ·   Direct Anthropic: leave blank">
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.portkey.ai/v1"
            className="w-full rounded-[9.6px] border border-onyx/15 bg-snow px-3 py-2 text-[14px] text-ink outline-none focus:border-onyx/30"
          />
        </Field>

        <Field
          label="API key"
          hint={
            keySet
              ? 'A key is currently saved. Type a new one to replace it; leave blank to keep.'
              : 'Your Portkey virtual key, or sk-ant-… for direct Anthropic.'
          }
        >
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keySet ? '•••••••••••••••• (saved)' : 'Paste your key'}
              className="flex-1 rounded-[9.6px] border border-onyx/15 bg-snow px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-onyx/30"
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="rounded-[9.6px] border border-onyx/15 bg-snow px-3 text-[12px] text-ink hover:border-onyx/30"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          {keySet && (
            <button
              onClick={clearKey}
              className="mt-2 text-[11px] text-terra hover:underline"
            >
              Clear saved key
            </button>
          )}
        </Field>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-[9.6px] bg-ink px-4 py-2 text-[13px] font-medium text-snow hover:opacity-90 disabled:opacity-30"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {savedAt && <span className="text-[11px] text-stone">Saved {new Date(savedAt).toLocaleTimeString()}</span>}
        </div>

        {keyStorage === 'plaintext' ? (
          <div className="mt-6 rounded-[9.6px] border border-terra/40 bg-terra/5 px-4 py-3 text-[12px] text-ink">
            <strong className="font-medium text-terra">Heads up:</strong> your saved key is in
            plaintext. Your OS keychain isn't reachable from Electron right now (common on
            Linux without a keyring service). The file lives in your Portico user-data folder.
          </div>
        ) : (
          <p className="mt-6 text-[11px] text-dusty">
            {keyStorage === 'encrypted'
              ? 'Saved key is encrypted via your OS keychain.'
              : 'Keys are encrypted via your OS keychain when available; plaintext fallback only on systems without a keyring.'}
          </p>
        )}
      </div>
    </div>
  )
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mt-5">
      <label className="mb-1.5 block text-[12px] font-medium text-ink">{props.label}</label>
      {props.children}
      {props.hint && <p className="mt-1 text-[11px] text-dusty">{props.hint}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Permissions tab — controls tool approval mode + auto-screening
// ─────────────────────────────────────────────────────────────────────────

function PermissionsTab(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    window.api.appSettings.get().then(setSettings)
  }, [])

  async function update(patch: Partial<AppSettings>): Promise<void> {
    const next = await window.api.appSettings.set(patch)
    setSettings(next)
  }

  if (!settings) {
    return <div className="px-6 py-6 text-[12px] text-stone">Loading…</div>
  }

  return (
    <div className="overflow-y-auto px-6 py-6">
      <div className="max-w-[640px]">
        <h2 className="font-serif text-[24px] font-[400] text-ink">Tool permissions</h2>
        <p className="mt-1 text-[13px] text-dusty">
          Decide whether the agent can run tools (Read, Write, Bash, etc.) without asking.
        </p>

        <div className="mt-6 space-y-2">
          <RadioRow
            checked={settings.permissionMode === 'auto'}
            onChange={() => update({ permissionMode: 'auto' })}
            label="Auto-approve everything"
            hint="Agent runs every tool call immediately. Fast, but the agent can write files and run shell commands without confirmation. Use for trusted prompts only."
          />
          <RadioRow
            checked={settings.permissionMode === 'ask'}
            onChange={() => update({ permissionMode: 'ask' })}
            label="Ask before each tool call"
            hint="Every tool call pauses the agent and waits for your Approve / Deny. Safer; slower."
          />
        </div>

        <div
          className={`mt-6 rounded-[9.6px] border p-4 transition-opacity ${
            settings.permissionMode === 'ask'
              ? 'border-onyx/15 bg-snow opacity-100'
              : 'border-parchment bg-vellum/40 opacity-60'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[13px] font-medium text-ink">Auto-screen with Haiku</div>
              <div className="mt-1 text-[12px] text-graphite">
                Before each prompt, run a quick Haiku call (~300ms) that summarizes what the tool will do
                and rates it Safe / Caution / Dangerous. Only relevant when "Ask" mode is on.
              </div>
            </div>
            <Toggle
              disabled={settings.permissionMode !== 'ask'}
              checked={settings.autoScreen}
              onChange={(v) => update({ autoScreen: v })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function RadioRow(props: {
  checked: boolean
  onChange: () => void
  label: string
  hint: string
}): React.JSX.Element {
  return (
    <button
      onClick={props.onChange}
      className={`flex w-full items-start gap-3 rounded-[9.6px] border px-4 py-3 text-left transition-colors ${
        props.checked ? 'border-onyx/40 bg-snow' : 'border-parchment bg-vellum/40 hover:border-onyx/20'
      }`}
    >
      <div className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-onyx/40">
        {props.checked && <div className="h-2 w-2 rounded-full bg-ink" />}
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-medium text-ink">{props.label}</div>
        <div className="mt-0.5 text-[12px] text-graphite">{props.hint}</div>
      </div>
    </button>
  )
}

function Toggle(props: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={() => !props.disabled && props.onChange(!props.checked)}
      disabled={props.disabled}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
        props.checked ? 'bg-ink' : 'bg-parchment'
      } ${props.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <div
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-snow transition-transform ${
          props.checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Memory tab — edits ~/.claude/CLAUDE.md
// ─────────────────────────────────────────────────────────────────────────

function MemoryTab(): React.JSX.Element {
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [path, setPath] = useState('')
  const [exists, setExists] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.settings.claudeMd.read().then((r) => {
      setContent(r.content)
      setOriginal(r.content)
      setPath(r.path)
      setExists(r.exists)
    })
  }, [])

  const dirty = content !== original

  async function save(): Promise<void> {
    setSaving(true)
    try {
      await window.api.settings.claudeMd.write(content)
      setOriginal(content)
      setExists(true)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-parchment px-6 py-3">
        <div>
          <div className="text-[13px] text-ink">Global memory</div>
          <div className="text-[11px] text-dusty">
            {path}
            {!exists && ' · not created yet'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !dirty && (
            <span className="text-[11px] text-stone">
              Saved {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-[9.6px] bg-ink px-4 py-1.5 text-[13px] font-medium text-snow hover:opacity-90 disabled:opacity-30"
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        className="flex-1 resize-none bg-snow px-6 py-4 font-mono text-[13px] leading-[1.6] text-ink outline-none"
        placeholder="Write instructions here. Claude reads this at the start of every session."
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Soul tab — edits ~/.claude/soul.md (Portico-only; how the agent responds)
// ─────────────────────────────────────────────────────────────────────────

function SoulTab({
  onRerunPersonaWizard
}: {
  onRerunPersonaWizard: () => void
}): React.JSX.Element {
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [path, setPath] = useState('')
  const [exists, setExists] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.settings.soul.read().then((r) => {
      setContent(r.content)
      setOriginal(r.content)
      setPath(r.path)
      setExists(r.exists)
    })
  }, [])

  const dirty = content !== original

  async function save(): Promise<void> {
    setSaving(true)
    try {
      await window.api.settings.soul.write(content)
      setOriginal(content)
      setExists(true)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-parchment px-6 py-3">
        <div>
          <div className="text-[13px] text-ink">Agent soul · how Claude responds</div>
          <div className="text-[11px] text-dusty">
            {path}
            {!exists && ' · not created yet'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !dirty && (
            <span className="text-[11px] text-stone">Saved {new Date(savedAt).toLocaleTimeString()}</span>
          )}
          <button
            onClick={onRerunPersonaWizard}
            className="rounded-[9.6px] border border-onyx/15 px-3 py-1.5 text-[12px] text-ink hover:bg-snow"
            title="Re-pick a persona — overwrites soul.md and appends a new About me block to CLAUDE.md"
          >
            Re-run persona setup
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-[9.6px] bg-ink px-4 py-1.5 text-[13px] font-medium text-snow hover:opacity-90 disabled:opacity-30"
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        className="flex-1 resize-none bg-snow px-6 py-4 font-mono text-[13px] leading-[1.6] text-ink outline-none"
        placeholder="How should Claude respond? Tone, structure, push-back posture. The agent reads this every session and can edit it when you ask it to behave differently."
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Skills tab — list/edit/create/delete in ~/.claude/skills/
// ─────────────────────────────────────────────────────────────────────────

function SkillsTab(): React.JSX.Element {
  const [list, setList] = useState<SkillSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [skill, setSkill] = useState<Skill | null>(null)
  const [content, setContent] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  async function refresh(): Promise<void> {
    const items = await window.api.settings.skills.list()
    setList(items)
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (!selected) {
      setSkill(null)
      setContent('')
      return
    }
    window.api.settings.skills.read(selected).then((s) => {
      setSkill(s)
      setContent(s?.content ?? '')
    })
  }, [selected])

  const dirty = skill !== null && content !== skill.content

  async function save(): Promise<void> {
    if (!selected) return
    setSaving(true)
    try {
      await window.api.settings.skills.write(selected, content)
      setSkill((s) => (s ? { ...s, content } : s))
      setSavedAt(Date.now())
      refresh()
    } finally {
      setSaving(false)
    }
  }

  async function create(): Promise<void> {
    const name = newName.trim()
    if (!name) return
    try {
      await window.api.settings.skills.create(name)
      setNewName('')
      setCreating(false)
      await refresh()
      setSelected(name)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  async function deleteSelected(): Promise<void> {
    if (!selected) return
    if (!confirm(`Delete skill "${selected}"? This removes the directory and cannot be undone.`)) {
      return
    }
    await window.api.settings.skills.delete(selected)
    setSelected(null)
    refresh()
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-64 shrink-0 flex-col border-r border-parchment">
        <div className="flex items-center justify-between border-b border-parchment px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-stone">
            Skills ({list.length})
          </span>
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded-[6px] border border-onyx/15 px-2 py-0.5 text-[11px] text-ink hover:bg-snow"
            title="New skill"
          >
            + New
          </button>
        </div>
        {creating && (
          <div className="border-b border-parchment p-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="skill-name"
              className="w-full rounded-[6px] border border-onyx/15 bg-snow px-2 py-1 text-[12px] text-ink outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') create()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewName('')
                }
              }}
              autoFocus
            />
            <div className="mt-1 flex gap-1">
              <button
                onClick={create}
                className="flex-1 rounded-[6px] bg-ink px-2 py-1 text-[11px] text-snow hover:opacity-90"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setCreating(false)
                  setNewName('')
                }}
                className="rounded-[6px] border border-onyx/15 px-2 py-1 text-[11px] text-ink hover:bg-snow"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto py-1">
          {list.length === 0 && (
            <div className="px-3 py-3 text-[12px] text-stone">
              No skills found. Skills live as <code className="text-graphite">~/.claude/skills/&lt;name&gt;/SKILL.md</code>.
            </div>
          )}
          {list.map((s) => (
            <button
              key={s.name}
              onClick={() => setSelected(s.name)}
              className={`block w-full px-3 py-2 text-left ${
                selected === s.name ? 'bg-parchment/60' : 'hover:bg-parchment/30'
              }`}
            >
              <div className="truncate text-[13px] text-ink">{s.name}</div>
              <div className="truncate text-[11px] text-dusty">{s.description || '—'}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-[13px] text-stone">
            Select a skill to edit, or create a new one.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-parchment px-6 py-3">
              <div>
                <div className="text-[13px] text-ink">{selected}</div>
                <div className="text-[11px] text-dusty">{skill?.path}</div>
              </div>
              <div className="flex items-center gap-3">
                {savedAt && !dirty && (
                  <span className="text-[11px] text-stone">
                    Saved {new Date(savedAt).toLocaleTimeString()}
                  </span>
                )}
                <button
                  onClick={deleteSelected}
                  className="rounded-[9.6px] border border-terra/40 px-3 py-1.5 text-[12px] text-terra hover:bg-terra/5"
                >
                  Delete
                </button>
                <button
                  onClick={save}
                  disabled={!dirty || saving}
                  className="rounded-[9.6px] bg-ink px-4 py-1.5 text-[13px] font-medium text-snow hover:opacity-90 disabled:opacity-30"
                >
                  {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                </button>
              </div>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="flex-1 resize-none bg-snow px-6 py-4 font-mono text-[13px] leading-[1.6] text-ink outline-none"
            />
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Advanced tab — diagnostics + log viewer
// ─────────────────────────────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
interface LogEntry {
  ts: number
  level: LogLevel
  source: string
  message: string
  meta?: Record<string, unknown>
}

function AdvancedTab({ onRerunTour }: { onRerunTour: () => void }): React.JSX.Element {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [paths, setPaths] = useState<{ dir: string; currentFile: string } | null>(null)
  const [autoscroll, setAutoscroll] = useState(true)
  const [filter, setFilter] = useState<LogLevel | 'all'>('all')

  useEffect(() => {
    window.api.logs.recent().then(setEntries)
    window.api.logs.paths().then(setPaths)
    const off = window.api.logs.onAppended((e) => {
      setEntries((prev) => {
        const next = [...prev, e]
        return next.length > 500 ? next.slice(-500) : next
      })
    })
    return off
  }, [])

  const visible = filter === 'all' ? entries : entries.filter((e) => e.level === filter)

  function copyAll(): void {
    const text = entries
      .map((e) => {
        const t = new Date(e.ts).toISOString()
        const meta = e.meta ? ` ${JSON.stringify(e.meta)}` : ''
        return `${t} [${e.level.toUpperCase()}] ${e.source}: ${e.message}${meta}`
      })
      .join('\n')
    navigator.clipboard.writeText(text)
  }

  async function clear(): Promise<void> {
    await window.api.logs.clear()
    setEntries([])
  }

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-parchment px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[13px] text-ink">Diagnostics</div>
          {paths && (
            <div className="truncate text-[11px] text-dusty">
              Log file: <code className="font-mono">{paths.currentFile}</code>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRerunTour}
            className="rounded-[6px] border border-onyx/15 bg-snow px-2 py-1 text-[11px] text-ink hover:border-onyx/30"
            title="Replay the first-run guided tour"
          >
            Re-run tour
          </button>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as LogLevel | 'all')}
            className="rounded-[6px] border border-onyx/15 bg-snow px-2 py-1 text-[11px] text-ink"
          >
            <option value="all">All levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <label className="flex items-center gap-1 text-[11px] text-graphite">
            <input
              type="checkbox"
              checked={autoscroll}
              onChange={(e) => setAutoscroll(e.target.checked)}
              className="accent-ink"
            />
            Autoscroll
          </label>
          <button
            onClick={() => paths && window.api.shell.revealPath(paths.currentFile)}
            disabled={!paths}
            className="rounded-[6px] border border-onyx/15 bg-snow px-2 py-1 text-[11px] text-ink hover:border-onyx/30 disabled:opacity-40"
          >
            Reveal
          </button>
          <button
            onClick={copyAll}
            className="rounded-[6px] border border-onyx/15 bg-snow px-2 py-1 text-[11px] text-ink hover:border-onyx/30"
          >
            Copy all
          </button>
          <button
            onClick={clear}
            className="rounded-[6px] border border-onyx/15 bg-snow px-2 py-1 text-[11px] text-ink hover:border-onyx/30"
          >
            Clear
          </button>
        </div>
      </div>
      <LogList entries={visible} autoscroll={autoscroll} />
    </div>
  )
}

function LogList({ entries, autoscroll }: { entries: LogEntry[]; autoscroll: boolean }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (autoscroll && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [entries, autoscroll])

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-stone">
        No log entries yet.
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto overflow-x-hidden bg-snow font-mono text-[12px] leading-[1.5]"
    >
      {entries.map((e, i) => (
        <LogRow key={i} entry={e} />
      ))}
    </div>
  )
}

function LogRow({ entry }: { entry: LogEntry }): React.JSX.Element {
  const tone =
    entry.level === 'error'
      ? 'text-terra'
      : entry.level === 'warn'
        ? 'text-[#7a5d2e]'
        : entry.level === 'debug'
          ? 'text-stone'
          : 'text-graphite'
  const time = new Date(entry.ts).toLocaleTimeString('en-US', { hour12: false })
  const meta = entry.meta ? ' ' + JSON.stringify(entry.meta) : ''
  // Whole row tooltip = the full plain-text line, since we truncate visually.
  const fullLine = `${time} ${entry.level.toUpperCase()} ${entry.source}: ${entry.message}${meta}`
  return (
    <div
      className="truncate border-b border-parchment/40 px-6 py-1.5"
      title={fullLine}
    >
      <span className="text-stone">{time}</span>{' '}
      <span className={`uppercase ${tone}`}>{entry.level.padEnd(5)}</span>{' '}
      <span className="text-dusty">{entry.source.padEnd(12)}</span>{' '}
      <span className="text-ink">{entry.message}</span>
      {entry.meta && <span className="text-stone">{meta}</span>}
    </div>
  )
}
