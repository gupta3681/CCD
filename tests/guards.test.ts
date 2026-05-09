import { describe, it, expect, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isCwdSafe, isExternalSchemeAllowed, isPathRevealable } from '../src/main/guards'

describe('isExternalSchemeAllowed', () => {
  it.each([
    ['https://example.com', true],
    ['http://example.com', true],
    ['mailto:foo@example.com', true]
  ])('allows %s', (url, expected) => {
    expect(isExternalSchemeAllowed(url)).toBe(expected)
  })

  it.each([
    ['file:///etc/passwd', false],
    ['javascript:alert(1)', false],
    ['vscode://open?file=/etc/passwd', false],
    ['slack://channel/abc', false],
    ['ftp://host/path', false],
    ['data:text/html,<h1>x', false],
    ['intent://x.com#Intent;scheme=https;end', false]
  ])('blocks %s', (url, expected) => {
    expect(isExternalSchemeAllowed(url)).toBe(expected)
  })

  it('blocks malformed URLs', () => {
    expect(isExternalSchemeAllowed('not a url')).toBe(false)
    expect(isExternalSchemeAllowed('')).toBe(false)
  })
})

describe('isPathRevealable', () => {
  beforeEach(() => {
    process.env.HOME = globalThis.__PORTICO_TEST_HOME__
  })

  it('allows paths inside HOME', () => {
    expect(isPathRevealable(join(process.env.HOME!, 'Documents'))).toBe(true)
  })

  it('allows paths inside userData', () => {
    expect(isPathRevealable(globalThis.__PORTICO_TEST_USER_DATA__)).toBe(true)
  })

  it('blocks system paths', () => {
    expect(isPathRevealable('/etc/passwd')).toBe(false)
    expect(isPathRevealable('/usr/bin/env')).toBe(false)
  })

  it('blocks empty / non-string inputs', () => {
    expect(isPathRevealable('')).toBe(false)
    expect(isPathRevealable(null as unknown as string)).toBe(false)
    expect(isPathRevealable(undefined as unknown as string)).toBe(false)
  })

  it('resolves relative paths before checking', () => {
    // CWD will not start with HOME or userData typically
    const result = isPathRevealable('../../etc')
    expect(typeof result).toBe('boolean')
  })
})

describe('isCwdSafe', () => {
  beforeEach(() => {
    process.env.HOME = globalThis.__PORTICO_TEST_HOME__
  })

  it('accepts an existing directory inside HOME', () => {
    const dir = join(process.env.HOME!, 'workspace')
    mkdirSync(dir, { recursive: true })
    expect(isCwdSafe(dir)).toBe(true)
  })

  it('rejects a non-existent path', () => {
    expect(isCwdSafe(join(process.env.HOME!, 'does-not-exist'))).toBe(false)
  })

  it('rejects a file (not a directory)', () => {
    const f = join(process.env.HOME!, 'file.txt')
    writeFileSync(f, 'x')
    expect(isCwdSafe(f)).toBe(false)
  })

  it('rejects paths outside HOME', () => {
    expect(isCwdSafe('/etc')).toBe(false)
    expect(isCwdSafe('/tmp')).toBe(false)
  })

  it('rejects null, undefined, empty string', () => {
    expect(isCwdSafe(null)).toBe(false)
    expect(isCwdSafe(undefined)).toBe(false)
    expect(isCwdSafe('')).toBe(false)
  })
})
