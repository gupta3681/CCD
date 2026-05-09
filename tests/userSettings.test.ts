import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isSafeName, parseFrontmatter } from '../src/main/userSettings'

// Note: userSettings.ts captures HOME at module-load time. We override HOME
// before importing so the SKILLS_DIR points into the test home dir.
beforeEach(() => {
  process.env.HOME = globalThis.__PORTICO_TEST_HOME__
})

describe('isSafeName', () => {
  it('accepts ordinary names', () => {
    expect(isSafeName('my-skill')).toBe(true)
    expect(isSafeName('skill.v2')).toBe(true)
    expect(isSafeName('Skill_99')).toBe(true)
    expect(isSafeName('a')).toBe(true)
  })

  it('rejects path traversal', () => {
    expect(isSafeName('..')).toBe(false) // dotfile guard catches this
    expect(isSafeName('.')).toBe(false)
    expect(isSafeName('../etc')).toBe(false) // slash fails the regex
    expect(isSafeName('foo/bar')).toBe(false)
    expect(isSafeName('foo\\bar')).toBe(false)
  })

  it('rejects dotfiles', () => {
    expect(isSafeName('.hidden')).toBe(false)
    expect(isSafeName('.env')).toBe(false)
  })

  it('rejects names with shell-meaningful chars', () => {
    expect(isSafeName('foo;rm')).toBe(false)
    expect(isSafeName('foo bar')).toBe(false)
    expect(isSafeName('foo$bar')).toBe(false)
    expect(isSafeName('foo|bar')).toBe(false)
  })

  it('rejects empty names', () => {
    expect(isSafeName('')).toBe(false)
  })
})

describe('parseFrontmatter', () => {
  it('extracts simple key: value pairs', () => {
    const md = `---
name: test
description: A short skill
---

Body here.`
    expect(parseFrontmatter(md)).toEqual({
      name: 'test',
      description: 'A short skill'
    })
  })

  it('returns {} when no frontmatter exists', () => {
    expect(parseFrontmatter('# Just a heading')).toEqual({})
  })

  it('strips matching outer single or double quotes', () => {
    const md = `---
name: "quoted"
desc: 'single'
---`
    expect(parseFrontmatter(md)).toEqual({ name: 'quoted', desc: 'single' })
  })

  it('keeps colons inside the value (after the first one)', () => {
    const md = `---
description: This skill: handles X
---`
    expect(parseFrontmatter(md).description).toBe('This skill: handles X')
  })

  it('skips malformed lines without keys', () => {
    const md = `---
: orphan
ok: yes
---`
    expect(parseFrontmatter(md)).toEqual({ ok: 'yes' })
  })

  it('does not crash on empty frontmatter', () => {
    const md = `---
---`
    expect(parseFrontmatter(md)).toEqual({})
  })
})

describe('skill CRUD round-trip', () => {
  it('list returns [] when skills dir does not exist', async () => {
    const us = await import('../src/main/userSettings')
    expect(us.listSkills()).toEqual([])
  })

  it('create + read + write + list + delete round-trip', async () => {
    const us = await import('../src/main/userSettings')
    us.createSkill('demo')
    expect(us.listSkills().map((s) => s.name)).toContain('demo')
    const skill = us.readSkill('demo')!
    expect(skill.name).toBe('demo')
    expect(skill.content).toContain('---')
    us.writeSkill('demo', `---\nname: demo\ndescription: Updated\n---\n\nNew body`)
    expect(us.readSkill('demo')!.description).toBe('Updated')
    us.deleteSkill('demo')
    expect(us.readSkill('demo')).toBeNull()
  })

  it('createSkill rejects unsafe names', async () => {
    const us = await import('../src/main/userSettings')
    expect(() => us.createSkill('..')).toThrow()
    expect(() => us.createSkill('foo/bar')).toThrow()
    expect(() => us.createSkill('.hidden')).toThrow()
  })

  it('createSkill refuses to overwrite an existing skill', async () => {
    const us = await import('../src/main/userSettings')
    us.createSkill('once')
    expect(() => us.createSkill('once')).toThrow(/already exists/)
  })

  it('writeSkill rejects unsafe names', async () => {
    const us = await import('../src/main/userSettings')
    expect(() => us.writeSkill('..', 'content')).toThrow()
  })

  it('deleteSkill on a missing skill is a no-op (does not throw)', async () => {
    const us = await import('../src/main/userSettings')
    expect(() => us.deleteSkill('does-not-exist')).not.toThrow()
  })

  it('listSkills tolerates broken SKILL.md frontmatter', async () => {
    const us = await import('../src/main/userSettings')
    const skillsDir = us.paths().skillsDir
    mkdirSync(join(skillsDir, 'broken'), { recursive: true })
    writeFileSync(join(skillsDir, 'broken', 'SKILL.md'), 'no frontmatter here')
    const list = us.listSkills()
    const broken = list.find((s) => s.name === 'broken')
    expect(broken).toBeDefined()
    expect(broken!.description).toBe('') // missing frontmatter → empty description, not a crash
  })

  it('listSkills skips dotfile directories', async () => {
    const us = await import('../src/main/userSettings')
    const skillsDir = us.paths().skillsDir
    mkdirSync(join(skillsDir, '.git'), { recursive: true })
    writeFileSync(join(skillsDir, '.git', 'SKILL.md'), '---\nname: x\n---')
    expect(us.listSkills().find((s) => s.name === '.git')).toBeUndefined()
  })
})

describe('CLAUDE.md read/write', () => {
  it('readClaudeMd returns exists=false when no file', async () => {
    const us = await import('../src/main/userSettings')
    const r = us.readClaudeMd()
    expect(r.exists).toBe(false)
    expect(r.content).toBe('')
  })

  it('writeClaudeMd then readClaudeMd round-trips', async () => {
    const us = await import('../src/main/userSettings')
    us.writeClaudeMd('# Memory\n\nHello')
    const r = us.readClaudeMd()
    expect(r.exists).toBe(true)
    expect(r.content).toBe('# Memory\n\nHello')
    expect(existsSync(r.path)).toBe(true)
  })

  it('writeClaudeMd is atomic (no .tmp leftover)', async () => {
    const us = await import('../src/main/userSettings')
    us.writeClaudeMd('content')
    expect(existsSync(`${us.paths().claudeMd}.tmp`)).toBe(false)
  })
})

describe('soul.md read/write', () => {
  it('readSoul returns exists=false when no file', async () => {
    const us = await import('../src/main/userSettings')
    const r = us.readSoul()
    expect(r.exists).toBe(false)
    expect(r.content).toBe('')
  })

  it('writeSoul then readSoul round-trips', async () => {
    const us = await import('../src/main/userSettings')
    us.writeSoul('# Soul\n\nBe terse.')
    const r = us.readSoul()
    expect(r.exists).toBe(true)
    expect(r.content).toBe('# Soul\n\nBe terse.')
  })

  it('soul.md path is alongside CLAUDE.md', async () => {
    const us = await import('../src/main/userSettings')
    const p = us.paths()
    expect(p.soulMd.endsWith('/soul.md')).toBe(true)
    expect(p.soulMd.startsWith(p.claudeDir)).toBe(true)
  })
})

describe('first-run profile seeding', () => {
  it('isFirstRun is true when soul.md does not exist', async () => {
    const us = await import('../src/main/userSettings')
    expect(us.isFirstRun()).toBe(true)
  })

  it('isFirstRun is false after seedProfile', async () => {
    const us = await import('../src/main/userSettings')
    us.seedProfile({ persona: 'developer', name: 'Aryan', workingOn: 'Portico' })
    expect(us.isFirstRun()).toBe(false)
  })

  it('isFirstRun is false after skipProfileSetup (writes empty soul.md)', async () => {
    const us = await import('../src/main/userSettings')
    us.skipProfileSetup()
    expect(us.isFirstRun()).toBe(false)
    expect(us.readSoul().content).toBe('')
  })

  it('seedProfile writes both CLAUDE.md and soul.md', async () => {
    const us = await import('../src/main/userSettings')
    us.seedProfile({ persona: 'pm', name: 'Binil', workingOn: 'Roadmap planning' })
    expect(us.readClaudeMd().content).toContain('## About me')
    expect(us.readClaudeMd().content).toContain('Binil')
    expect(us.readClaudeMd().content).toContain('project manager')
    expect(us.readClaudeMd().content).toContain('Roadmap planning')
    expect(us.readSoul().content).toContain('Plain language')
  })

  it('seedProfile appends to (does not overwrite) existing CLAUDE.md', async () => {
    const us = await import('../src/main/userSettings')
    us.writeClaudeMd('# My existing memory\n\nLots of important stuff here.')
    us.seedProfile({ persona: 'developer', name: 'Aryan', workingOn: 'X' })
    const c = us.readClaudeMd().content
    expect(c).toContain('My existing memory')
    expect(c).toContain('Lots of important stuff')
    expect(c).toContain('## About me')
    expect(c).toContain('Aryan')
  })

  it('each persona seeds a distinct soul.md template', async () => {
    const us = await import('../src/main/userSettings')
    us.seedProfile({ persona: 'developer', name: 'X', workingOn: 'Y' })
    const dev = us.readSoul().content
    us.seedProfile({ persona: 'director', name: 'X', workingOn: 'Y' })
    const dir = us.readSoul().content
    expect(dev).not.toBe(dir)
    expect(dev).toContain('Skip preamble')
    expect(dir).toContain('bottom line')
  })
})
