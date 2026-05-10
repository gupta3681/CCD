import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  Bubble,
  Conversation,
  ConversationSummary,
  PermissionRequest,
  PermissionScreeningStart,
  Skill,
  SkillSummary,
  SettingsPaths,
  UserQuestionAnswer,
  UserQuestionRequest
} from '../shared/types'

// Re-export shared types so the renderer can keep importing from '../../preload'.
// Type-only re-exports are erased at build; do NOT add runtime value exports
// here — the renderer would try to bundle the entire preload module
// (including contextBridge calls) and crash at load.
export type {
  AppSettings,
  Block,
  Bubble,
  Conversation,
  ConversationSummary,
  ModelOption,
  Persona,
  PermissionMode,
  PermissionRequest,
  PermissionScreeningStart,
  Screening,
  Skill,
  SkillSummary,
  SettingsPaths,
  UserQuestion,
  UserQuestionAnswer,
  UserQuestionOption,
  UserQuestionRequest,
  Verdict
} from '../shared/types'

type Disposer = () => void

const api = {
  gatewayInfo: (
    conversationId?: string
  ): Promise<{ gateway: string; configured: boolean; model: string; modelIsOverride: boolean }> =>
    ipcRenderer.invoke('gateway:info', conversationId),

  query: (prompt: string, runId: string, conversationId: string): Promise<void> =>
    ipcRenderer.invoke('agent:query', prompt, runId, conversationId),

  cancel: (runId: string): Promise<void> => ipcRenderer.invoke('agent:cancel', runId),

  respondPermission: (
    requestId: string,
    decision: {
      allow: boolean
      reason?: string
      allowPattern?: string
      userAnswers?: UserQuestionAnswer[]
    }
  ): Promise<void> => ipcRenderer.invoke('permission:respond', requestId, decision),

  appSettings: {
    get: (): Promise<AppSettings & { gatewayKeySet: boolean; keyStorage: 'encrypted' | 'plaintext' | 'none' }> =>
      ipcRenderer.invoke('appSettings:get'),
    set: (
      patch: Partial<AppSettings> & { gatewayApiKey?: string | null }
    ): Promise<AppSettings & { gatewayKeySet: boolean; keyStorage: 'encrypted' | 'plaintext' | 'none' }> =>
      ipcRenderer.invoke('appSettings:set', patch)
  },


  onPermissionRequest: (cb: (req: PermissionRequest) => void): Disposer => {
    const handler = (_e: unknown, payload: { runId: string; payload: PermissionRequest }): void =>
      cb(payload.payload)
    ipcRenderer.on('permission:request', handler)
    return () => ipcRenderer.off('permission:request', handler)
  },

  onPermissionScreening: (cb: (s: PermissionScreeningStart) => void): Disposer => {
    const handler = (
      _e: unknown,
      payload: { runId: string; payload: PermissionScreeningStart }
    ): void => cb(payload.payload)
    ipcRenderer.on('permission:screening', handler)
    return () => ipcRenderer.off('permission:screening', handler)
  },

  onAskUserQuestion: (cb: (req: UserQuestionRequest) => void): Disposer => {
    const handler = (
      _e: unknown,
      payload: { runId: string; payload: UserQuestionRequest }
    ): void => cb(payload.payload)
    ipcRenderer.on('agent:askUserQuestion', handler)
    return () => ipcRenderer.off('agent:askUserQuestion', handler)
  },

  logs: {
    recent: (limit?: number): Promise<
      Array<{ ts: number; level: 'debug' | 'info' | 'warn' | 'error'; source: string; message: string; meta?: Record<string, unknown> }>
    > => ipcRenderer.invoke('logs:recent', limit),
    clear: (): Promise<void> => ipcRenderer.invoke('logs:clear'),
    paths: (): Promise<{ dir: string; currentFile: string }> => ipcRenderer.invoke('logs:paths'),
    onAppended: (
      cb: (entry: {
        ts: number
        level: 'debug' | 'info' | 'warn' | 'error'
        source: string
        message: string
        meta?: Record<string, unknown>
      }) => void
    ): Disposer => {
      const handler = (
        _e: unknown,
        entry: {
          ts: number
          level: 'debug' | 'info' | 'warn' | 'error'
          source: string
          message: string
          meta?: Record<string, unknown>
        }
      ): void => cb(entry)
      ipcRenderer.on('logs:appended', handler)
      return () => ipcRenderer.off('logs:appended', handler)
    }
  },

  settings: {
    paths: (): Promise<SettingsPaths> => ipcRenderer.invoke('settings:paths'),
    claudeMd: {
      read: (): Promise<{ exists: boolean; path: string; content: string }> =>
        ipcRenderer.invoke('settings:claudeMd:read'),
      write: (content: string): Promise<{ path: string }> =>
        ipcRenderer.invoke('settings:claudeMd:write', content)
    },
    skills: {
      list: (): Promise<SkillSummary[]> => ipcRenderer.invoke('settings:skills:list'),
      read: (name: string): Promise<Skill | null> =>
        ipcRenderer.invoke('settings:skills:read', name),
      write: (name: string, content: string): Promise<{ path: string }> =>
        ipcRenderer.invoke('settings:skills:write', name, content),
      create: (name: string): Promise<{ path: string }> =>
        ipcRenderer.invoke('settings:skills:create', name),
      delete: (name: string): Promise<void> => ipcRenderer.invoke('settings:skills:delete', name)
    },
    soul: {
      read: (): Promise<{ exists: boolean; path: string; content: string }> =>
        ipcRenderer.invoke('settings:soul:read'),
      write: (content: string): Promise<{ path: string }> =>
        ipcRenderer.invoke('settings:soul:write', content)
    },
    profile: {
      isFirstRun: (): Promise<boolean> => ipcRenderer.invoke('settings:profile:isFirstRun'),
      name: (): Promise<string | null> => ipcRenderer.invoke('settings:profile:name'),
      seed: (input: {
        persona: 'developer' | 'pm' | 'director'
        name: string
        workingOn: string
      }): Promise<{ claudeMdPath: string; soulMdPath: string }> =>
        ipcRenderer.invoke('settings:profile:seed', input),
      skip: (): Promise<void> => ipcRenderer.invoke('settings:profile:skip')
    }
  },

  conversations: {
    list: (): Promise<ConversationSummary[]> => ipcRenderer.invoke('conversations:list'),
    get: (id: string): Promise<Conversation | null> => ipcRenderer.invoke('conversations:get', id),
    save: (id: string, bubbles: Bubble[]): Promise<ConversationSummary> =>
      ipcRenderer.invoke('conversations:save', id, bubbles),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('conversations:delete', id),
    rename: (id: string, title: string): Promise<void> =>
      ipcRenderer.invoke('conversations:rename', id, title),
    setCwd: (id: string, cwd: string | null): Promise<void> =>
      ipcRenderer.invoke('conversations:setCwd', id, cwd),
    setTrustProject: (id: string, trust: boolean): Promise<void> =>
      ipcRenderer.invoke('conversations:setTrustProject', id, trust),
    setModel: (id: string, model: string | null): Promise<void> =>
      ipcRenderer.invoke('conversations:setModel', id, model),
    getSessionPermissions: (id: string): Promise<string[]> =>
      ipcRenderer.invoke('conversations:getSessionPermissions', id),
    revokeSessionPermission: (id: string, pattern: string): Promise<string[]> =>
      ipcRenderer.invoke('conversations:revokeSessionPermission', id, pattern),
    clearSessionPermissions: (id: string): Promise<void> =>
      ipcRenderer.invoke('conversations:clearSessionPermissions', id)
  },

  dialog: {
    pickFolder: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:pickFolder', defaultPath)
  },

  shell: {
    revealPath: (p: string): Promise<void> => ipcRenderer.invoke('shell:revealPath', p)
  },

  onMessage: (cb: (runId: string, message: unknown) => void): Disposer => {
    const handler = (_e: unknown, payload: { runId: string; payload: unknown }): void =>
      cb(payload.runId, payload.payload)
    ipcRenderer.on('agent:message', handler)
    return () => ipcRenderer.off('agent:message', handler)
  },

  onDone: (cb: (runId: string) => void): Disposer => {
    const handler = (_e: unknown, payload: { runId: string }): void => cb(payload.runId)
    ipcRenderer.on('agent:done', handler)
    return () => ipcRenderer.off('agent:done', handler)
  },

  onCancelled: (cb: (runId: string) => void): Disposer => {
    const handler = (_e: unknown, payload: { runId: string }): void => cb(payload.runId)
    ipcRenderer.on('agent:cancelled', handler)
    return () => ipcRenderer.off('agent:cancelled', handler)
  },

  onError: (cb: (runId: string, error: { message: string }) => void): Disposer => {
    const handler = (
      _e: unknown,
      payload: { runId: string; payload: { message: string } }
    ): void => cb(payload.runId, payload.payload)
    ipcRenderer.on('agent:error', handler)
    return () => ipcRenderer.off('agent:error', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

export type Api = typeof api
