import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type Disposer = () => void

export type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; text: string }

export interface Bubble {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
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

const api = {
  gatewayInfo: (): Promise<{ gateway: string; configured: boolean; model: string }> =>
    ipcRenderer.invoke('gateway:info'),

  query: (prompt: string, runId: string, conversationId: string): Promise<void> =>
    ipcRenderer.invoke('agent:query', prompt, runId, conversationId),

  cancel: (runId: string): Promise<void> => ipcRenderer.invoke('agent:cancel', runId),

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
      read: (name: string): Promise<Skill | null> => ipcRenderer.invoke('settings:skills:read', name),
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
      ipcRenderer.invoke('conversations:rename', id, title)
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
