// Shared types used across main, preload, and renderer.
// Keep this file dependency-free — no electron, no node imports.

export type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; text: string; isError?: boolean }
  | {
      type: 'permission_request'
      requestId: string
      toolName: string
      input: Record<string, unknown>
      screening: Screening | null
      /** Pattern the user'd allow if they pick "Allow for session" — derived in main. */
      suggestedPattern?: string
      decision: { allow: boolean; at: number; allowPattern?: string } | null
    }

export interface Bubble {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'permission'
  blocks?: Block[]
  text?: string
  /** True if the user pressed Stop while this bubble was being streamed. */
  interrupted?: boolean
}

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: number
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  /**
   * Bumped on any record change (bubbles, sessionId, cwd, rename, trust). Use
   * for "was this record touched recently?" — internal bookkeeping, not for
   * sidebar order.
   */
  updatedAt: number
  /**
   * Bumped only when bubbles change (i.e. a real message was exchanged).
   * Drives sidebar sort order so renaming or changing the working folder
   * doesn't shuffle old conversations to the top.
   */
  lastMessageAt?: number
  sessionId: string | null
  bubbles: Bubble[]
  cwd?: string | null
  /**
   * When true, the agent loads CLAUDE.md and skills from the working folder's
   * .claude/ directory in addition to the user's global ~/.claude/. Off by
   * default — opting in trusts that folder's instructions, which can be a
   * prompt-injection vector if the folder is from an untrusted source.
   */
  trustProject?: boolean
  /**
   * Set when the user pressed Stop mid-response. The next user message will
   * have a short system note prepended so the model knows it was interrupted,
   * then this flag is cleared.
   */
  lastInterrupted?: boolean
  /**
   * Tool-call patterns the user has chosen to auto-approve for THIS session.
   * Cleared when the user starts a new session. See `permissionPatterns.ts`
   * for syntax (`Bash(python *)`, `Read(/foo/*)`, bare `Edit`, etc.).
   */
  sessionAllowedPatterns?: string[]
  /**
   * Per-conversation model override. Takes precedence over the global default
   * in AppSettings.defaultModel and the PORTICO_MODEL env var. Empty/missing
   * = inherit from those.
   */
  model?: string
}

export interface SkillSummary {
  name: string
  path: string
  description: string
}

export interface Skill extends SkillSummary {
  content: string
}

export interface SettingsPaths {
  home: string
  claudeDir: string
  skillsDir: string
  claudeMd: string
  soulMd: string
}

/**
 * The three persona presets the first-run wizard offers. Persona is NOT a
 * stored field — picking one is a one-time seeding choice that writes
 * default content into ~/.claude/CLAUDE.md (about-me section) and
 * ~/.claude/soul.md (response style template). The user (or the agent)
 * edits both files freely thereafter.
 */
export type Persona = 'developer' | 'pm' | 'director'

export type PermissionMode = 'auto' | 'ask'

export interface AppSettings {
  permissionMode: PermissionMode
  autoScreen: boolean
  // Gateway configured in-app (overrides .env). Empty = inherit from .env.
  gatewayBaseUrl?: string
  // Default model for new conversations. Per-conversation override lives on
  // Conversation.model and takes precedence. Empty = inherit from .env / hard default.
  defaultModel?: string
  // Note: the API key never crosses the IPC boundary as plaintext after the
  // first time the user types it. The renderer sees only `gatewayKeySet: boolean`.
}

/**
 * The models Portico knows about. The list is centralized so the picker UI,
 * the Settings default dropdown, and the gateway info badge all share the
 * same source of truth. Order matters — first entry is the hard fallback.
 */
export interface ModelOption {
  id: string
  label: string
  /** Relative cost hint shown in the picker. */
  tier: 'cheap' | 'standard' | 'premium'
  hint: string
  /**
   * Context window size in tokens. Drives the header context meter so it
   * scales when we add a 1M-context model (or enable the Sonnet 4.6 beta).
   * Unknown models fall back to DEFAULT_CONTEXT_WINDOW.
   */
  contextWindow: number
}

/** Hard fallback when the resolved model isn't in KNOWN_MODELS. */
export const DEFAULT_CONTEXT_WINDOW = 200_000

export const KNOWN_MODELS: ReadonlyArray<ModelOption> = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    tier: 'standard',
    hint: 'Balanced — best for most work.',
    contextWindow: 200_000 // 1M available via context-1m beta header; we don't enable it today
  },
  {
    id: 'claude-opus-4-7',
    label: 'Opus 4.7',
    tier: 'premium',
    hint: 'Strongest reasoning — pricier, slower. Use for hard refactors.',
    contextWindow: 200_000
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    tier: 'cheap',
    hint: 'Fast and cheap — good for quick lookups, summaries, simple edits.',
    contextWindow: 200_000
  }
]

/**
 * Look up a model option by id. Returns null when the id isn't in our
 * KNOWN_MODELS array — callers decide what to do (show the raw id as label,
 * fall back to a default, etc.).
 */
export function lookupModel(modelId: string | null | undefined): ModelOption | null {
  if (!modelId) return null
  return KNOWN_MODELS.find((m) => m.id === modelId) ?? null
}

/** Look up the context window for a model id, falling back to the default. */
export function contextWindowFor(modelId: string | null | undefined): number {
  return lookupModel(modelId)?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
}

export interface GatewayInfo {
  gateway: string
  configured: boolean
  model: string
}

export type Verdict = 'SAFE' | 'CAUTION' | 'DANGEROUS'

export interface Screening {
  summary: string
  verdict: Verdict
  reason: string
  ms: number
}

export interface PermissionRequest {
  requestId: string
  toolName: string
  input: Record<string, unknown>
  screening: Screening | null
  /** Suggested pattern if the user clicks "Allow for this session". */
  suggestedPattern?: string
}

/**
 * Structured payload for the AskUserQuestion tool. The agent calls this tool
 * when it wants the user to choose between concrete options. Instead of
 * routing through the generic permission UI (which would show raw JSON), we
 * intercept it in canUseTool and surface a dedicated modal.
 */
export interface UserQuestionOption {
  label: string
  description?: string
  /** Optional preview content (markdown). Rendered in a small box under the label. */
  preview?: string
}

export interface UserQuestion {
  question: string
  /** Short header rendered above the question (e.g. "Choose framework"). */
  header?: string
  multiSelect: boolean
  options: UserQuestionOption[]
}

export interface UserQuestionRequest {
  requestId: string
  questions: UserQuestion[]
}

export interface UserQuestionAnswer {
  /** Index into the request's `questions` array. */
  questionIndex: number
  /** Selected option labels. Always at least 1 item; multiSelect can have many. */
  selectedLabels: string[]
}

export interface PermissionScreeningStart {
  requestId: string
  toolName: string
}
