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

const api = {
  gatewayInfo: (): Promise<{ gateway: string; configured: boolean; model: string }> =>
    ipcRenderer.invoke('gateway:info'),

  query: (prompt: string, runId: string, conversationId: string): Promise<void> =>
    ipcRenderer.invoke('agent:query', prompt, runId, conversationId),

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
