import { homedir } from 'os'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { join, basename } from 'path'
import type { Persona, Skill, SkillSummary, SettingsPaths } from '../shared/types'
import { atomicWrite } from './util'

export type { Persona, Skill, SkillSummary, SettingsPaths } from '../shared/types'

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')
const SKILLS_DIR = join(CLAUDE_DIR, 'skills')
const CLAUDE_MD = join(CLAUDE_DIR, 'CLAUDE.md')
// soul.md sits alongside CLAUDE.md so it's easy to back up via dotfiles, but
// no other tool (Claude Code TUI, Cowork) reads it — it's Portico-specific.
const SOUL_MD = join(CLAUDE_DIR, 'soul.md')

// ── CLAUDE.md ──────────────────────────────────────────────────────────

export function readClaudeMd(): { exists: boolean; path: string; content: string } {
  if (!existsSync(CLAUDE_MD)) return { exists: false, path: CLAUDE_MD, content: '' }
  return { exists: true, path: CLAUDE_MD, content: readFileSync(CLAUDE_MD, 'utf-8') }
}

export function writeClaudeMd(content: string): { path: string } {
  atomicWrite(CLAUDE_MD, content)
  return { path: CLAUDE_MD }
}

// ── soul.md ────────────────────────────────────────────────────────────

export function readSoul(): { exists: boolean; path: string; content: string } {
  if (!existsSync(SOUL_MD)) return { exists: false, path: SOUL_MD, content: '' }
  return { exists: true, path: SOUL_MD, content: readFileSync(SOUL_MD, 'utf-8') }
}

export function writeSoul(content: string): { path: string } {
  atomicWrite(SOUL_MD, content)
  return { path: SOUL_MD }
}

// ── First-run profile seeding ──────────────────────────────────────────

const SOUL_TEMPLATES: Record<Persona, string> = {
  developer: `# How to respond

- Skip preamble. Get to the point.
- Use code blocks freely; assume I read code.
- When I'm wrong, say so directly with the fix.
- Default to terse markdown, not prose.
`,
  pm: `# How to respond

- Plain language. Avoid jargon unless I use it first.
- Confirm before destructive actions (file deletes, force-pushes, etc.).
- When you give options, format as a table or numbered list.
- Surface trade-offs, not just a recommendation.
`,
  director: `# How to respond

- Lead with the bottom line. Detail on demand.
- Frame in terms of risk, time, and cost.
- One-paragraph answers when possible. Tables when comparing.
- If I ask "should we do X," give an opinion, not just options.
`
}

const PERSONA_LABELS: Record<Persona, string> = {
  developer: 'simple developer',
  pm: 'project manager',
  director: 'director and above'
}

/**
 * Wizard flow: writes initial content into CLAUDE.md (appended, never
 * overwriting) and seeds soul.md with the persona template (always
 * overwrites soul.md — its existence is our "wizard already ran" marker,
 * so writing here is the marker-setting action).
 */
export function seedProfile(input: {
  persona: Persona
  name: string
  workingOn: string
}): { claudeMdPath: string; soulMdPath: string } {
  const { persona, name, workingOn } = input

  const aboutSection =
    `\n## About me\n\n` +
    `- Name: ${name.trim() || '(unspecified)'}\n` +
    `- Role: ${PERSONA_LABELS[persona]}\n` +
    `- Working on: ${workingOn.trim() || '(unspecified)'}\n`

  // Append (don't overwrite) — the user may have existing CLAUDE.md content
  // from gstack or other sources we mustn't trample.
  const existing = readClaudeMd()
  const newContent = existing.exists ? `${existing.content.trimEnd()}\n${aboutSection}` : aboutSection.trimStart()
  atomicWrite(CLAUDE_MD, newContent)

  // soul.md is Portico-owned, always overwrite with the persona template.
  atomicWrite(SOUL_MD, SOUL_TEMPLATES[persona])

  return { claudeMdPath: CLAUDE_MD, soulMdPath: SOUL_MD }
}

/**
 * The wizard fires only when soul.md doesn't exist. "Skip" still writes an
 * empty soul.md so the wizard doesn't reappear next launch.
 */
export function skipProfileSetup(): void {
  atomicWrite(SOUL_MD, '')
}

export function isFirstRun(): boolean {
  return !existsSync(SOUL_MD)
}

/**
 * Best-effort read of the user's display name from CLAUDE.md. We seeded it
 * via `seedProfile()` as a `- Name: <value>` line under `## About me`. If the
 * user later edited the file (or never ran the wizard), we fall back to null.
 */
export function readProfileName(): string | null {
  const cm = readClaudeMd()
  if (!cm.exists) return null
  // CLAUDE.md may have multiple `## About me` blocks (e.g. from gstack +
  // multiple wizard runs). Scan ALL `- Name: …` lines and pick the last
  // non-empty, non-(unspecified) one — that's the most recent declaration.
  const re = /^[-*]\s*\*{0,2}Name\*{0,2}\s*:\s*(.+?)\s*$/gim
  let last: string | null = null
  for (const m of cm.content.matchAll(re)) {
    const value = m[1].trim()
    if (!value || value === '(unspecified)') continue
    last = value
  }
  if (!last) return null
  // First word only — "Aryan Gupta" should still render "Aryan".
  return last.split(/\s+/)[0]
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
  return {
    home: HOME,
    claudeDir: CLAUDE_DIR,
    skillsDir: SKILLS_DIR,
    claudeMd: CLAUDE_MD,
    soulMd: SOUL_MD
  }
}
