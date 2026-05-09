import { useEffect, useState } from 'react'
import type { ConversationSummary } from '../../../preload'
import { GearIcon, PanelIcon, PlusIcon, TrashIcon } from './Icons'

// macOS draws traffic-light buttons on top of the window content with
// titleBarStyle: 'hiddenInset'. Reserve a strip at the top of the sidebar so
// they don't overlap the wordmark / icons.
const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')

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
  // Refs for the tour to anchor coachmarks against.
  newSessionRef?: React.RefObject<HTMLButtonElement | null>
  settingsBtnRef?: React.RefObject<HTMLButtonElement | null>
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
    settingsActive,
    newSessionRef,
    settingsBtnRef
  } = props

  const [hoveredId, setHoveredId] = useState<string | null>(null)

  if (collapsed) {
    return (
      <aside
        className={`flex h-full w-12 flex-col items-center gap-2 border-r border-parchment bg-vellum pb-3 [-webkit-app-region:drag] ${
          IS_MAC ? 'pt-10' : 'pt-3'
        }`}
      >
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
      <div
        className={`flex items-center justify-between px-3 pb-3 [-webkit-app-region:drag] ${
          IS_MAC ? 'pt-10' : 'pt-3'
        }`}
      >
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
        ref={newSessionRef}
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
        ref={settingsBtnRef}
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
