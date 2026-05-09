import { homedir } from 'os'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { join, basename } from 'path'
import type { Skill, SkillSummary, SettingsPaths } from '../shared/types'
import { atomicWrite } from './util'

export type { Skill, SkillSummary, SettingsPaths } from '../shared/types'

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')
const SKILLS_DIR = join(CLAUDE_DIR, 'skills')
const CLAUDE_MD = join(CLAUDE_DIR, 'CLAUDE.md')

// ── CLAUDE.md ──────────────────────────────────────────────────────────

export function readClaudeMd(): { exists: boolean; path: string; content: string } {
  if (!existsSync(CLAUDE_MD)) return { exists: false, path: CLAUDE_MD, content: '' }
  return { exists: true, path: CLAUDE_MD, content: readFileSync(CLAUDE_MD, 'utf-8') }
}

export function writeClaudeMd(content: string): { path: string } {
  atomicWrite(CLAUDE_MD, content)
  return { path: CLAUDE_MD }
}

// ── Skills ─────────────────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/

export function parseFrontmatter(md: string): Record<string, string> {
  const m = md.match(FRONTMATTER_RE)
  if (!m) return {}
  const fm: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const k = line.slice(0, colon).trim()
    const v = line
      .slice(colon + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (k) fm[k] = v
  }
  return fm
}

export function isSafeName(name: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(name) && !name.startsWith('.')
}

function skillFile(name: string): string {
  if (!isSafeName(name)) throw new Error(`unsafe skill name: ${name}`)
  return join(SKILLS_DIR, name, 'SKILL.md')
}

export function listSkills(): SkillSummary[] {
  if (!existsSync(SKILLS_DIR)) return []
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true })
  const out: SkillSummary[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name.startsWith('.')) continue
    const md = join(SKILLS_DIR, e.name, 'SKILL.md')
    if (!existsSync(md)) continue
    let description = ''
    try {
      const content = readFileSync(md, 'utf-8')
      const fm = parseFrontmatter(content)
      description = fm.description ?? ''
    } catch {
      // ignore unreadable skills
    }
    out.push({ name: e.name, path: md, description })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export function readSkill(name: string): Skill | null {
  const file = skillFile(name)
  if (!existsSync(file)) return null
  const content = readFileSync(file, 'utf-8')
  const fm = parseFrontmatter(content)
  return { name, path: file, description: fm.description ?? '', content }
}

export function writeSkill(name: string, content: string): { path: string } {
  const file = skillFile(name)
  atomicWrite(file, content)
  return { path: file }
}

export function createSkill(name: string): { path: string } {
  if (!isSafeName(name)) throw new Error(`unsafe skill name: ${name}`)
  const file = skillFile(name)
  if (existsSync(file)) throw new Error(`skill "${name}" already exists`)
  const stub = `---
name: ${name}
description: A short, specific description of when this skill applies (one sentence).
---

# ${name}

Replace this body with the instructions Claude should follow when this skill triggers.
Keep it tight and concrete.
`
  atomicWrite(file, stub)
  return { path: file }
}

export function deleteSkill(name: string): void {
  if (!isSafeName(name)) throw new Error(`unsafe skill name: ${name}`)
  const dir = join(SKILLS_DIR, name)
  if (!existsSync(dir)) return
  const stat = statSync(dir)
  if (!stat.isDirectory()) return
  // Sanity: only delete dirs that are direct children of SKILLS_DIR.
  if (basename(join(dir, '..')) !== 'skills') {
    throw new Error('refusing to delete non-skills dir')
  }
  rmSync(dir, { recursive: true, force: true })
}

export function paths(): SettingsPaths {
  return { home: HOME, claudeDir: CLAUDE_DIR, skillsDir: SKILLS_DIR, claudeMd: CLAUDE_MD }
}
