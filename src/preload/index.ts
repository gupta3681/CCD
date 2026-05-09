import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type Disposer = () => void

const api = {
  gatewayInfo: (): Promise<{ gateway: string; configured: boolean; model: string }> =>
    ipcRenderer.invoke('gateway:info'),

  query: (prompt: string, runId: string, conversationId: string): Promise<void> =>
    ipcRenderer.invoke('agent:query', prompt, runId, conversationId),

  resetConversation: (conversationId: string): Promise<void> =>
    ipcRenderer.invoke('conversation:reset', conversationId),

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
    const handler = (_e: unknown, payload: { runId: string; payload: { message: string } }): void =>
      cb(payload.runId, payload.payload)
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
