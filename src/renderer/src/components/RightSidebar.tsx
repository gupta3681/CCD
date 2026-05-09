import { useEffect, useState } from 'react'
import { PanelIcon } from './Icons'

interface Props {
  collapsed: boolean
  onToggleCollapsed: () => void
  cwd: string | null
  trustProject: boolean
  onChangeCwd: () => void
  onClearCwd: () => void
  onRevealCwd: () => void
  onToggleTrustProject: (next: boolean) => void
}

function shortenPath(p: string, maxLen = 40): string {
  if (p.length <= maxLen) return p
  const parts = p.split('/').filter(Boolean)
  if (parts.length <= 2) return p
  return `…/${parts.slice(-2).join('/')}`
}

export function RightSidebar(props: Props): React.JSX.Element {
  const {
    collapsed,
    onToggleCollapsed,
    cwd,
    trustProject,
    onChangeCwd,
    onClearCwd,
    onRevealCwd,
    onToggleTrustProject
  } = props

  if (collapsed) {
    return (
      <aside className="flex h-full w-10 flex-col items-center gap-2 border-l border-parchment bg-vellum py-3">
        <button
          onClick={onToggleCollapsed}
          title="Show panel"
          className="flex h-9 w-9 items-center justify-center rounded-[9.6px] text-graphite hover:bg-parchment/50"
        >
          <PanelIcon />
        </button>
        <button
          onClick={onChangeCwd}
          title={cwd ?? 'Choose working folder'}
          className={`flex h-9 w-9 items-center justify-center rounded-[9.6px] ${
            cwd ? 'text-ink' : 'text-graphite'
          } hover:bg-parchment/50`}
        >
          <FolderIcon />
        </button>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-72 flex-col border-l border-parchment bg-vellum">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-stone">Session</span>
        <button
          onClick={onToggleCollapsed}
          title="Hide panel"
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-graphite hover:bg-parchment/50"
        >
          <PanelIcon />
        </button>
      </div>

      <div className="px-3">
        <Card title="Working folder">
          {cwd ? (
            <>
              <div className="mb-2 break-all rounded-[6px] bg-snow px-2 py-2 font-mono text-[11.5px] text-ink" title={cwd}>
                {shortenPath(cwd, 64)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <SmallBtn onClick={onChangeCwd}>Change</SmallBtn>
                <SmallBtn onClick={onRevealCwd}>Reveal</SmallBtn>
                <SmallBtn onClick={onClearCwd}>Clear</SmallBtn>
              </div>
              <p className="mt-2 text-[11px] text-dusty">
                Read / Write / Bash run in this folder.
              </p>

              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-[6px] border border-parchment bg-vellum px-2 py-2 text-[11.5px] text-graphite">
                <input
                  type="checkbox"
                  checked={trustProject}
                  onChange={(e) => onToggleTrustProject(e.target.checked)}
                  className="mt-0.5 accent-ink"
                />
                <span>
                  <strong className="text-ink">Trust this folder's <code className="font-mono">.claude/</code></strong>
                  <span className="block mt-0.5 text-dusty">
                    Loads CLAUDE.md and skills from here. Off by default — only enable for folders you trust, since project-level skills can inject instructions into the agent.
                  </span>
                </span>
              </label>
            </>
          ) : (
            <>
              <p className="text-[12px] text-graphite">
                Pick a folder so the agent can read, write, and run commands there.
              </p>
              <button
                onClick={onChangeCwd}
                className="mt-3 w-full rounded-[9.6px] border border-onyx/15 bg-snow px-3 py-2 text-[13px] text-ink hover:border-onyx/30"
              >
                Choose folder…
              </button>
            </>
          )}
        </Card>
      </div>
    </aside>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-[9.6px] border border-parchment bg-snow">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-medium text-ink"
      >
        <span>{title}</span>
        <span className="text-stone">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="border-t border-parchment px-3 py-3">{children}</div>}
    </div>
  )
}

function SmallBtn(props: { onClick: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <button
      onClick={props.onClick}
      className="rounded-[6px] border border-onyx/15 bg-vellum px-2 py-1 text-[11px] text-ink hover:bg-snow"
    >
      {props.children}
    </button>
  )
}

function FolderIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 4.5a1 1 0 011-1h3.5l1.2 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4.5z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  )
}

export function useCollapsedRightSidebar(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('portico.rightSidebarCollapsed') !== '0'
    } catch {
      return true
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('portico.rightSidebarCollapsed', collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [collapsed])
  return [collapsed, () => setCollapsed((v) => !v)]
}
