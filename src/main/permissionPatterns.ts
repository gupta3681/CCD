/**
 * Per-session tool permission patterns.
 *
 * Pattern syntax (mirrors Claude Code):
 *   ToolName              — matches any call to that tool
 *   ToolName(glob)        — matches calls whose extracted target satisfies the glob
 *
 * Where "extracted target" is per-tool:
 *   - Bash       → the command string
 *   - Read/Write/Edit/NotebookEdit → file_path
 *   - Glob/Grep  → pattern
 *   - WebFetch   → url
 *   - WebSearch  → query
 *   - everything else → bare tool name only (no glob form)
 *
 * Glob syntax: `*` matches any chars except `/`, `**` matches across slashes.
 * Other regex specials are escaped.
 */

const PATTERN_RE = /^([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?$/

export interface ParsedPattern {
  tool: string
  glob: string | null
}

export function parse(pattern: string): ParsedPattern | null {
  const m = pattern.trim().match(PATTERN_RE)
  if (!m) return null
  return { tool: m[1], glob: m[2] ?? null }
}

/**
 * Pick the per-tool target string. Returns null when this tool doesn't have
 * a glob target — for those tools, only the bare `ToolName` form matches.
 */
export function targetFor(toolName: string, input: unknown): string | null {
  const i = (input ?? {}) as Record<string, unknown>
  switch (toolName) {
    case 'Bash':
      return typeof i.command === 'string' ? i.command : null
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return typeof i.file_path === 'string' ? i.file_path : null
    case 'Glob':
    case 'Grep':
      return typeof i.pattern === 'string' ? i.pattern : null
    case 'WebFetch':
      return typeof i.url === 'string' ? i.url : null
    case 'WebSearch':
      return typeof i.query === 'string' ? i.query : null
    default:
      return null
  }
}

function globToRegex(glob: string): RegExp {
  // Tokenize so `**` is not treated as two `*` in sequence.
  let re = '^'
  let i = 0
  while (i < glob.length) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i += 2
      } else {
        re += '[^/]*'
        i += 1
      }
    } else if (/[.+?^${}()|[\]\\]/.test(c)) {
      re += `\\${c}`
      i += 1
    } else {
      re += c
      i += 1
    }
  }
  re += '$'
  return new RegExp(re)
}

export function matches(pattern: string, toolName: string, input: unknown): boolean {
  const parsed = parse(pattern)
  if (!parsed) return false
  if (parsed.tool !== toolName) return false
  if (parsed.glob === null) return true // bare ToolName matches all calls
  const target = targetFor(toolName, input)
  if (target === null) return false
  return globToRegex(parsed.glob).test(target)
}

export function matchesAny(patterns: readonly string[], toolName: string, input: unknown): boolean {
  for (const p of patterns) if (matches(p, toolName, input)) return true
  return false
}

/**
 * Best-effort suggestion when the user clicks "Allow for this session". We
 * generalize one step beyond the literal call:
 *   Bash(`python script.py --foo`) → `Bash(python *)`   (first command word)
 *   Read(`/a/b/c.ts`)              → `Read(/a/b/*)`     (parent dir + *)
 *   Glob(`**` + `/*.ts`)           → `Glob(**` + `/*.ts)` (literal — already a glob)
 *   anything else                  → `ToolName`         (bare)
 *
 * The user sees the suggestion before approving, so a wrong guess is recoverable.
 */
export function suggestPattern(toolName: string, input: unknown): string {
  const target = targetFor(toolName, input)
  if (target === null) return toolName

  if (toolName === 'Bash') {
    const first = target.trim().split(/\s+/)[0]
    if (first) return `${toolName}(${first} *)`
    return toolName
  }

  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit' || toolName === 'NotebookEdit') {
    const slash = target.lastIndexOf('/')
    if (slash > 0) return `${toolName}(${target.slice(0, slash)}/*)`
    return `${toolName}(${target})`
  }

  if (toolName === 'Glob' || toolName === 'Grep' || toolName === 'WebFetch' || toolName === 'WebSearch') {
    return `${toolName}(${target})`
  }

  return toolName
}
