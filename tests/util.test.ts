import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { atomicWrite, porticoDir } from '../src/main/util'

describe('porticoDir', () => {
  it('returns userData/portico and creates the directory', () => {
    const d = porticoDir()
    expect(d).toBe(join(globalThis.__PORTICO_TEST_USER_DATA__, 'portico'))
    expect(existsSync(d)).toBe(true)
    expect(statSync(d).isDirectory()).toBe(true)
  })

  it('is idempotent — calling again does not throw', () => {
    porticoDir()
    expect(() => porticoDir()).not.toThrow()
  })
})

describe('atomicWrite', () => {
  it('writes content to the target file', () => {
    const f = join(porticoDir(), 'test.txt')
    atomicWrite(f, 'hello')
    expect(readFileSync(f, 'utf-8')).toBe('hello')
  })

  it('creates parent directories that do not yet exist', () => {
    const f = join(porticoDir(), 'nested', 'deeply', 'file.txt')
    atomicWrite(f, 'ok')
    expect(readFileSync(f, 'utf-8')).toBe('ok')
  })

  it('overwrites the target file with new content', () => {
    const f = join(porticoDir(), 'overwrite.txt')
    atomicWrite(f, 'first')
    atomicWrite(f, 'second')
    expect(readFileSync(f, 'utf-8')).toBe('second')
  })

  it('does not leave a tmp file behind on success', () => {
    const f = join(porticoDir(), 'cleanup.txt')
    atomicWrite(f, 'done')
    expect(existsSync(`${f}.tmp`)).toBe(false)
  })
})
