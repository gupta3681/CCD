import { describe, it, expect } from 'vitest'

describe('permissionPatterns', () => {
  describe('parse', () => {
    it('parses bare tool names', async () => {
      const { parse } = await import('../src/main/permissionPatterns')
      expect(parse('Bash')).toEqual({ tool: 'Bash', glob: null })
      expect(parse('Read')).toEqual({ tool: 'Read', glob: null })
    })

    it('parses tool with glob', async () => {
      const { parse } = await import('../src/main/permissionPatterns')
      expect(parse('Bash(python *)')).toEqual({ tool: 'Bash', glob: 'python *' })
      expect(parse('Read(/foo/*)')).toEqual({ tool: 'Read', glob: '/foo/*' })
    })

    it('rejects malformed patterns', async () => {
      const { parse } = await import('../src/main/permissionPatterns')
      expect(parse('')).toBeNull()
      expect(parse('Bash(unclosed')).toBeNull()
      expect(parse('123Bad')).toBeNull()
    })
  })

  describe('matches', () => {
    it('bare tool name matches any call to that tool', async () => {
      const { matches } = await import('../src/main/permissionPatterns')
      expect(matches('Bash', 'Bash', { command: 'ls -la' })).toBe(true)
      expect(matches('Bash', 'Read', { file_path: '/x' })).toBe(false)
    })

    it('Bash glob matches commands by prefix', async () => {
      const { matches } = await import('../src/main/permissionPatterns')
      expect(matches('Bash(python *)', 'Bash', { command: 'python script.py' })).toBe(true)
      expect(matches('Bash(python *)', 'Bash', { command: 'python -c "x"' })).toBe(true)
      expect(matches('Bash(python *)', 'Bash', { command: 'pytest' })).toBe(false)
    })

    it('Read glob matches file paths', async () => {
      const { matches } = await import('../src/main/permissionPatterns')
      expect(matches('Read(/Users/aryan/foo/*)', 'Read', { file_path: '/Users/aryan/foo/bar.ts' })).toBe(true)
      expect(matches('Read(/Users/aryan/foo/*)', 'Read', { file_path: '/Users/aryan/baz/bar.ts' })).toBe(false)
    })

    it('** crosses directory boundaries', async () => {
      const { matches } = await import('../src/main/permissionPatterns')
      expect(matches('Read(/foo/**)', 'Read', { file_path: '/foo/a/b/c.ts' })).toBe(true)
      expect(matches('Read(/foo/*)', 'Read', { file_path: '/foo/a/b/c.ts' })).toBe(false)
    })

    it('returns false when input is missing the expected field', async () => {
      const { matches } = await import('../src/main/permissionPatterns')
      expect(matches('Bash(python *)', 'Bash', {})).toBe(false)
      expect(matches('Read(/foo/*)', 'Read', {})).toBe(false)
    })

    it('mismatched tool always fails', async () => {
      const { matches } = await import('../src/main/permissionPatterns')
      expect(matches('Bash(python *)', 'Read', { command: 'python script.py' })).toBe(false)
    })
  })

  describe('matchesAny', () => {
    it('returns true if any pattern matches', async () => {
      const { matchesAny } = await import('../src/main/permissionPatterns')
      expect(matchesAny(['Read', 'Bash(python *)'], 'Bash', { command: 'python x' })).toBe(true)
      expect(matchesAny(['Read', 'Bash(python *)'], 'Bash', { command: 'rm -rf' })).toBe(false)
    })

    it('empty list never matches', async () => {
      const { matchesAny } = await import('../src/main/permissionPatterns')
      expect(matchesAny([], 'Bash', { command: 'ls' })).toBe(false)
    })
  })

  describe('suggestPattern', () => {
    it('Bash suggests first-word + wildcard', async () => {
      const { suggestPattern } = await import('../src/main/permissionPatterns')
      expect(suggestPattern('Bash', { command: 'python script.py --foo' })).toBe('Bash(python *)')
      expect(suggestPattern('Bash', { command: 'npm install' })).toBe('Bash(npm *)')
    })

    it('Read/Write/Edit suggests parent directory', async () => {
      const { suggestPattern } = await import('../src/main/permissionPatterns')
      expect(suggestPattern('Read', { file_path: '/Users/aryan/foo/bar.ts' })).toBe('Read(/Users/aryan/foo/*)')
      expect(suggestPattern('Edit', { file_path: '/x/y/z.ts' })).toBe('Edit(/x/y/*)')
    })

    it('Glob/Grep/WebFetch suggests literal target', async () => {
      const { suggestPattern } = await import('../src/main/permissionPatterns')
      expect(suggestPattern('Glob', { pattern: '**/*.ts' })).toBe('Glob(**/*.ts)')
      expect(suggestPattern('WebFetch', { url: 'https://x.com' })).toBe('WebFetch(https://x.com)')
    })

    it('falls back to bare tool name when no extractable target', async () => {
      const { suggestPattern } = await import('../src/main/permissionPatterns')
      expect(suggestPattern('TodoWrite', {})).toBe('TodoWrite')
      expect(suggestPattern('Bash', {})).toBe('Bash')
    })
  })

  describe('round-trip', () => {
    it('suggested patterns match the calls that produced them', async () => {
      const { suggestPattern, matches } = await import('../src/main/permissionPatterns')
      const cases: Array<[string, Record<string, unknown>]> = [
        ['Bash', { command: 'python script.py' }],
        ['Read', { file_path: '/Users/aryan/foo/bar.ts' }],
        ['Edit', { file_path: '/Users/aryan/foo/bar.ts' }],
        ['Glob', { pattern: '**/*.ts' }],
        ['WebFetch', { url: 'https://x.com' }]
      ]
      for (const [tool, input] of cases) {
        const p = suggestPattern(tool, input)
        expect(matches(p, tool, input)).toBe(true)
      }
    })
  })
})
