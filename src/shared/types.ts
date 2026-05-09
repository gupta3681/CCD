// Shared types used across main, preload, and renderer.
// Keep this file dependency-free — no electron, no node imports.

export type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; text: string }
  | {
      type: 'permission_request'
      requestId: string
      toolName: string
      input: Record<string, unknown>
      screening: Screening | null
      decision: { allow: boolean; at: number } | null
    }

export interface Bubble {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'permission'
  blocks?: Block[]
  text?: string
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
  updatedAt: number
  sessionId: string | null
  bubbles: Bubble[]
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
}

export type PermissionMode = 'auto' | 'ask'

export interface AppSettings {
  permissionMode: PermissionMode
  autoScreen: boolean
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
}

export interface PermissionScreeningStart {
  requestId: string
  toolName: string
}
