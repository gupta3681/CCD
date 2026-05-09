import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { config as loadDotenv } from 'dotenv'
import { query } from '@anthropic-ai/claude-agent-sdk'
import icon from '../../resources/icon.png?asset'

loadDotenv()

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#faf9f5',
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

function gatewayInfo(): { gateway: string; configured: boolean } {
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? ''
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  if (baseUrl.includes('portkey')) return { gateway: 'Portkey', configured: hasKey }
  if (baseUrl) return { gateway: baseUrl, configured: hasKey }
  return { gateway: 'Anthropic (direct)', configured: hasKey }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ccd.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('gateway:info', () => gatewayInfo())

  ipcMain.handle('agent:query', async (event, prompt: string, runId: string) => {
    const sender = event.sender
    const send = (channel: string, payload: unknown): void => {
      if (!sender.isDestroyed()) sender.send(channel, { runId, payload })
    }

    try {
      const result = query({
        prompt,
        options: {
          // Force the SDK to use plain API key auth via env (Portkey-friendly).
          // The user is expected to set ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY
          // (or ANTHROPIC_AUTH_TOKEN) in their .env to point at Portkey.
          permissionMode: 'bypassPermissions'
        }
      })

      for await (const message of result) {
        send('agent:message', message)
      }
      send('agent:done', null)
    } catch (err) {
      const error = err instanceof Error ? { message: err.message, stack: err.stack } : { message: String(err) }
      send('agent:error', error)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
