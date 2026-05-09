import { app } from 'electron'
import { mkdirSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'

/**
 * Portico's writable data dir under Electron's userData. Created on first call.
 */
export function porticoDir(): string {
  const dir = join(app.getPath('userData'), 'portico')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Crash-safe write: writes to <file>.tmp then renames into place. The rename is
 * atomic on every supported FS, so the destination is never partially written.
 */
export function atomicWrite(file: string, content: string): void {
  mkdirSync(join(file, '..'), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, content, 'utf-8')
  renameSync(tmp, file)
}
