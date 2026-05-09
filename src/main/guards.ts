import { app } from 'electron'
import { homedir } from 'os'
import { resolve as pathResolve } from 'path'
import { existsSync, statSync } from 'fs'

/**
 * Returns true for URL schemes that are safe to hand to shell.openExternal.
 * Anything else (file://, custom protocols, javascript:) is blocked.
 */
export function isExternalSchemeAllowed(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:'
  } catch {
    return false
  }
}

/**
 * Renderer can ask main to reveal a path in Finder/Explorer. Restrict to
 * the user's home or the app's own userData dir so a compromised renderer
 * can't probe the filesystem via Finder side-effects.
 */
export function isPathRevealable(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0) return false
  try {
    const resolved = pathResolve(p)
    const userData = app.getPath('userData')
    return resolved.startsWith(homedir()) || resolved.startsWith(userData)
  } catch {
    return false
  }
}

/**
 * The agent's working directory must exist, be a directory, and live inside
 * the user's home folder. Validated both when the renderer sets it AND when
 * the main process reads it back at query time.
 */
export function isCwdSafe(p: string | null | undefined): p is string {
  if (typeof p !== 'string' || p.length === 0) return false
  try {
    const resolved = pathResolve(p)
    if (!existsSync(resolved)) return false
    if (!statSync(resolved).isDirectory()) return false
    return resolved.startsWith(homedir())
  } catch {
    return false
  }
}
