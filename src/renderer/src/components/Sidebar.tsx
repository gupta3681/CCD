import { useEffect, useState } from 'react'
import type { ConversationSummary } from '../../../preload'

interface Props {
  collapsed: boolean
  onToggleCollapsed: () => void
  activeConversationId: string
  conversations: ConversationSummary[]
  onNewSession: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onOpenSettings: () => void
  settingsActive: boolean
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const m = Math.floor(diffMs / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export function Sidebar(props: Props): React.JSX.Element {
  const {
    collapsed,
    onToggleCollapsed,
    activeConversationId,
    conversations,
    onNewSession,
    onSelect,
    onDelete,
    onOpenSettings,
    settingsActive
  } = props

  const [hoveredId, setHoveredId] = useState<string | null>(null)

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 flex-col items-center gap-2 border-r border-parchment bg-vellum py-3 [-webkit-app-region:drag]">
        <button
          onClick={onToggleCollapsed}
          title="Expand sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-[9.6px] text-graphite hover:bg-parchment/50 [-webkit-app-region:no-drag]"
        >
          <PanelIcon />
        </button>
        <button
          onClick={onNewSession}
          title="New session"
          className="flex h-9 w-9 items-center justify-center rounded-[9.6px] text-graphite hover:bg-parchment/50 [-webkit-app-region:no-drag]"
        >
          <PlusIcon />
        </button>
        <div className="flex-1" />
        <button
          onClick={onOpenSettings}
          title="Settings"
          className={`flex h-9 w-9 items-center justify-center rounded-[9.6px] [-webkit-app-region:no-drag] ${
            settingsActive ? 'bg-parchment/60 text-ink' : 'text-graphite hover:bg-parchment/50'
          }`}
        >
          <GearIcon />
        </button>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-parchment bg-vellum">
      <div className="flex items-center justify-between px-3 py-3 [-webkit-app-region:drag]">
        <div className="font-serif text-[15px] font-[400] text-ink [-webkit-app-region:no-drag]">
          Portico
        </div>
        <button
          onClick={onToggleCollapsed}
          title="Collapse sidebar"
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-graphite hover:bg-parchment/50 [-webkit-app-region:no-drag]"
        >
          <PanelIcon />
        </button>
      </div>

      <button
        onClick={onNewSession}
        className="mx-3 flex items-center gap-2 rounded-[9.6px] border border-onyx/15 bg-snow px-3 py-2 text-left text-[13px] text-ink hover:border-onyx/30"
      >
        <PlusIcon />
        New session
      </button>

      <div className="mt-5 px-3 text-[10px] font-medium uppercase tracking-wider text-stone">
        Recents
      </div>

      <div className="mt-1 flex-1 overflow-y-auto px-1.5">
        {conversations.length === 0 && (
          <div className="px-3 py-3 text-[12px] text-stone">No sessions yet.</div>
        )}
        {conversations.map((c) => {
          const isActive = c.id === activeConversationId
          const isHovered = hoveredId === c.id
          return (
            <div
              key={c.id}
              onMouseEnter={() => setHoveredId(c.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`group relative flex items-center rounded-[8px] ${
                isActive ? 'bg-parchment/60' : 'hover:bg-parchment/30'
              }`}
            >
              <button
                onClick={() => onSelect(c.id)}
                className="flex-1 truncate px-3 py-2 text-left text-[13px] text-ink"
                title={c.title}
              >
                <div className="truncate">{c.title}</div>
                <div className="text-[10px] text-stone">{relativeTime(c.updatedAt)}</div>
              </button>
              {isHovered && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(c.id)
                  }}
                  className="mr-2 flex h-6 w-6 items-center justify-center rounded text-stone hover:bg-vellum hover:text-terra"
                  title="Delete session"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={onOpenSettings}
        className={`mx-3 mb-3 mt-2 flex items-center gap-2 rounded-[9.6px] border border-onyx/15 px-3 py-2 text-left text-[13px] text-ink ${
          settingsActive ? 'bg-parchment/60' : 'bg-snow hover:border-onyx/30'
        }`}
      >
        <GearIcon /> Settings
      </button>
    </aside>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PanelIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="3" x2="6" y2="13" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function GearIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function TrashIcon(): React.JSX.Element {
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

// Hook used by App to persist + read collapsed state
export function useCollapsedSidebar(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('portico.sidebarCollapsed') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('portico.sidebarCollapsed', collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [collapsed])
  return [collapsed, () => setCollapsed((v) => !v)]
}
