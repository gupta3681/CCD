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
  SettingsPaths
} from '../shared/types'

// Re-export shared types so the renderer can keep importing from '../../preload'.
export type {
  AppSettings,
  Block,
  Bubble,
  Conversation,
  ConversationSummary,
  PermissionMode,
  PermissionRequest,
  PermissionScreeningStart,
  Screening,
  Skill,
  SkillSummary,
  SettingsPaths,
  Verdict
} from '../shared/types'

type Disposer = () => void

const api = {
  gatewayInfo: (): Promise<{ gateway: string; configured: boolean; model: string }> =>
    ipcRenderer.invoke('gateway:info'),

  query: (prompt: string, runId: string, conversationId: string): Promise<void> =>
    ipcRenderer.invoke('agent:query', prompt, runId, conversationId),

  cancel: (runId: string): Promise<void> => ipcRenderer.invoke('agent:cancel', runId),

  respondPermission: (
    requestId: string,
    decision: { allow: boolean; reason?: string }
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
      ipcRenderer.invoke('conversations:setTrustProject', id, trust)
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
