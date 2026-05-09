import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { config as loadDotenv } from 'dotenv'
import { query } from '@anthropic-ai/claude-agent-sdk'
import icon from '../../resources/icon.png?asset'
import * as conversations from './conversations'

loadDotenv()

// V1 toolset: read-only. Agent can answer questions and search the web,
// but cannot write, edit, or run shell commands. Write/Bash come back when
// we ship the permission-prompt UI in v1.1.
const READ_ONLY_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'TodoWrite',
  'AskUserQuestion'
]

const DEFAULT_MODEL = 'claude-sonnet-4-6'

// Default: extend the Claude Code agent preset with a Portico identity line.
// The preset is required for full agent behavior (tool guidance, etc.) so we
// keep it on by default. Override with a plain string via PORTICO_SYSTEM_PROMPT,
// or disable the preset entirely with PORTICO_PLAIN_SYSTEM_PROMPT=1.
const PORTICO_APPEND =
  'You are Portico, a desktop assistant for an internal team, routed through the ' +
  "organization's LLM gateway. Format answers with Markdown (headings, lists, code " +
  'fences, tables) when it helps readability. Be concise. Prefer answering ' +
  'immediately over asking clarifying questions when the request is unambiguous.'

function modelFor(): string {
  return process.env.PORTICO_MODEL?.trim() || DEFAULT_MODEL
}

function systemPromptFor():
  | string
  | { type: 'preset'; preset: 'claude_code'; append?: string }
  | undefined {
  const override = process.env.PORTICO_SYSTEM_PROMPT?.trim()
  if (override) return override
  if (process.env.PORTICO_PLAIN_SYSTEM_PROMPT === '1') return PORTICO_APPEND
  return { type: 'preset', preset: 'claude_code', append: PORTICO_APPEND }
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#faf9f5',
    title: 'Portico',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function gatewayInfo(): { gateway: string; configured: boolean; model: string } {
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? ''
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  const model = modelFor()
  if (baseUrl.includes('portkey')) return { gateway: 'Portkey', configured: hasKey, model }
  if (baseUrl) return { gateway: baseUrl, configured: hasKey, model }
  return { gateway: 'Anthropic (direct)', configured: hasKey, model }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.portico.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('gateway:info', () => gatewayInfo())

  // ── Conversations ─────────────────────────────────────────────────────
  ipcMain.handle('conversations:list', () => conversations.list())
  ipcMain.handle('conversations:get', (_e, id: string) => conversations.get(id))
  ipcMain.handle('conversations:save', (_e, id: string, bubbles: conversations.Bubble[]) =>
    conversations.save(id, bubbles)
  )
  ipcMain.handle('conversations:delete', (_e, id: string) => conversations.remove(id))
  ipcMain.handle('conversations:rename', (_e, id: string, title: string) =>
    conversations.rename(id, title)
  )

  // ── Agent query ───────────────────────────────────────────────────────
  ipcMain.handle(
    'agent:query',
    async (event, prompt: string, runId: string, conversationId: string) => {
      const sender = event.sender
      const send = (channel: string, payload: unknown): void => {
        if (!sender.isDestroyed()) sender.send(channel, { runId, payload })
      }

      const resumeId = conversations.getSessionId(conversationId)

      try {
        const result = query({
          prompt,
          options: {
            model: modelFor(),
            systemPrompt: systemPromptFor(),
            allowedTools: READ_ONLY_TOOLS,
            permissionMode: 'bypassPermissions',
            ...(resumeId ? { resume: resumeId } : {})
          }
        })

        for await (const message of result) {
          if (
            !resumeId &&
            (message as { type?: string }).type === 'system' &&
            (message as { subtype?: string }).subtype === 'init'
          ) {
            const sid = (message as { session_id?: string }).session_id
            if (sid) conversations.setSessionId(conversationId, sid)
          }
          send('agent:message', message)
        }
        send('agent:done', null)
      } catch (err) {
        const error =
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { message: String(err) }
        send('agent:error', error)
      }
    }
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
