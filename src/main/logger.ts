// Lightweight logger for the main process.
//
// - In-memory ring buffer (last N entries) so the UI gets instant access
//   without hitting disk.
// - File rotation: one file per day under <userData>/portico/logs/, oldest
//   files past N kept-days are pruned on app start.
// - On every push, broadcast to all live BrowserWindows so an open Logs tab
//   in the renderer streams entries live.
//
// Privacy: this is a local-only debug tool. We log message metadata + tool
// inputs (the user's own data on their own machine) but NEVER the API key.

import { app, BrowserWindow } from 'electron'
import { appendFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { porticoDir } from './util'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: number
  level: LogLevel
  source: string
  message: string
  meta?: Record<string, unknown>
}

const RING_SIZE = 500
const KEEP_DAYS = 7

const ring: LogEntry[] = []
let logsDirInit = false

function logsDir(): string {
  const d = join(porticoDir(), 'logs')
  if (!logsDirInit) {
    require('fs').mkdirSync(d, { recursive: true })
    pruneOldLogs(d)
    logsDirInit = true
  }
  return d
}

function pruneOldLogs(dir: string): void {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000
  try {
    for (const f of readdirSync(dir)) {
      if (!f.startsWith('portico-') || !f.endsWith('.log')) continue
      const path = join(dir, f)
      const stat = require('fs').statSync(path)
      if (stat.mtimeMs < cutoff) unlinkSync(path)
    }
  } catch {
    // ignore
  }
}

export function currentLogFile(): string {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return join(logsDir(), `portico-${today}.log`)
}

function broadcast(entry: LogEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('logs:appended', entry)
  }
}

function push(level: LogLevel, source: string, message: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = { ts: Date.now(), level, source, message, meta }
  ring.push(entry)
  if (ring.length > RING_SIZE) ring.shift()

  // File line: ISO ts, level, source, message, optional JSON meta.
  const line =
    `${new Date(entry.ts).toISOString()} [${level.toUpperCase()}] ${source}: ${message}` +
    (meta ? ` ${JSON.stringify(meta)}` : '') +
    '\n'
  try {
    appendFileSync(currentLogFile(), line, 'utf-8')
  } catch {
    // disk full / permission denied — silently drop
  }

  broadcast(entry)
}

export const log = {
  debug: (source: string, message: string, meta?: Record<string, unknown>): void =>
    push('debug', source, message, meta),
  info: (source: string, message: string, meta?: Record<string, unknown>): void =>
    push('info', source, message, meta),
  warn: (source: string, message: string, meta?: Record<string, unknown>): void =>
    push('warn', source, message, meta),
  error: (source: string, message: string, meta?: Record<string, unknown>): void =>
    push('error', source, message, meta)
}

export function recent(limit = RING_SIZE): LogEntry[] {
  return ring.slice(-limit)
}

export function clearRing(): void {
  ring.length = 0
}

export function paths(): { dir: string; currentFile: string } {
  return { dir: logsDir(), currentFile: currentLogFile() }
}

/** Capture diagnostic boot info — versions, platform, working paths. */
export function logBootInfo(): void {
  log.info('boot', 'Portico starting', {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    userData: app.getPath('userData')
  })
}
