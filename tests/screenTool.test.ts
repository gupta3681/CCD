import { describe, it, expect } from 'vitest'
import { parseVerdict } from '../src/main/screenTool'

describe('parseVerdict', () => {
  it('parses well-formed JSON', () => {
    const got = parseVerdict('{"summary": "Reads a file", "verdict": "SAFE", "reason": "Read tool, no writes"}')
    expect(got).not.toBeNull()
    expect(got!.summary).toBe('Reads a file')
    expect(got!.verdict).toBe('SAFE')
    expect(got!.reason).toBe('Read tool, no writes')
  })

  it('extracts JSON from markdown fences', () => {
    const wrapped = '```json\n{"summary":"x","verdict":"DANGEROUS","reason":"rm -rf"}\n```'
    expect(parseVerdict(wrapped)?.verdict).toBe('DANGEROUS')
  })

  it('upcases the verdict', () => {
    expect(parseVerdict('{"summary":"x","verdict":"safe","reason":"x"}')?.verdict).toBe('SAFE')
  })

  it('returns null for unrecognized verdict values', () => {
    expect(parseVerdict('{"summary":"x","verdict":"MEDIUM","reason":"x"}')).toBeNull()
  })

  it('returns null when no JSON object is present', () => {
    expect(parseVerdict('I am not JSON')).toBeNull()
  })

  it('returns null when JSON is malformed', () => {
    expect(parseVerdict('{not json}')).toBeNull()
  })

  it('truncates very long summary / reason fields to bounded lengths', () => {
    const longSummary = 'x'.repeat(500)
    const longReason = 'y'.repeat(900)
    const got = parseVerdict(
      `{"summary":"${longSummary}","verdict":"SAFE","reason":"${longReason}"}`
    )
    expect(got!.summary.length).toBeLessThanOrEqual(240)
    expect(got!.reason.length).toBeLessThanOrEqual(400)
  })

  it('treats missing summary/reason as empty strings', () => {
    const got = parseVerdict('{"verdict":"CAUTION"}')
    expect(got!.summary).toBe('')
    expect(got!.reason).toBe('')
  })

  it('accepts the three valid verdicts', () => {
    expect(parseVerdict('{"verdict":"SAFE"}')?.verdict).toBe('SAFE')
    expect(parseVerdict('{"verdict":"CAUTION"}')?.verdict).toBe('CAUTION')
    expect(parseVerdict('{"verdict":"DANGEROUS"}')?.verdict).toBe('DANGEROUS')
  })
})
