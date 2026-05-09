import Anthropic from '@anthropic-ai/sdk'

export type Verdict = 'SAFE' | 'CAUTION' | 'DANGEROUS'

export interface Screening {
  summary: string
  verdict: Verdict
  reason: string
  ms: number
}

const SYSTEM_PROMPT = `You are a security screener for an autonomous coding agent running on a developer's laptop. The agent is about to call a tool. In one short sentence, say what the tool call will actually do. Then rate the call.

Respond ONLY as compact JSON:
{"summary": "<1 sentence>", "verdict": "SAFE" | "CAUTION" | "DANGEROUS", "reason": "<short why>"}

Verdict guide:
- SAFE: read-only operations (Read, Glob, Grep, WebSearch, WebFetch, Bash with cat/ls/pwd/grep/git status/git diff), file edits/writes inside an obvious project workspace, common dev commands (npm install, git, mkdir).
- CAUTION: writes outside the working directory, network requests with payloads, package installs from unknown sources, deleting non-trivial files, modifying shell config or env, running arbitrary scripts.
- DANGEROUS: rm -rf on user/system paths, sudo, anything touching ~/.ssh / ~/.aws / .env files / keychain / browser cookies, exfiltrating data via curl/wget POST to external hosts, chmod 777 on system paths, dropping databases, force-pushing to main.

Be concise. Do not refuse to rate. Output JSON only, no markdown fence.`

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (client) return client
  client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN
  })
  return client
}

function parseVerdict(raw: string): Screening | null {
  // Tolerate models that wrap JSON in fences despite instructions.
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    const parsed = JSON.parse(jsonMatch[0])
    const verdict = (parsed.verdict ?? '').toString().toUpperCase()
    if (verdict !== 'SAFE' && verdict !== 'CAUTION' && verdict !== 'DANGEROUS') return null
    return {
      summary: String(parsed.summary ?? '').slice(0, 240),
      verdict: verdict as Verdict,
      reason: String(parsed.reason ?? '').slice(0, 400),
      ms: 0 // overwritten by caller
    }
  } catch {
    return null
  }
}

export async function screenTool(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
  signal?: AbortSignal
): Promise<Screening> {
  const start = Date.now()
  const userPrompt = `Working directory: ${cwd}
Tool: ${toolName}
Input:
${JSON.stringify(input, null, 2)}`

  try {
    const resp = await getClient().messages.create(
      {
        model: 'claude-haiku-4-5',
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      },
      { signal }
    )
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const parsed = parseVerdict(text)
    if (parsed) {
      parsed.ms = Date.now() - start
      return parsed
    }
    return {
      summary: 'Could not screen this call.',
      verdict: 'CAUTION',
      reason: 'Screening returned an unparseable response.',
      ms: Date.now() - start
    }
  } catch (err) {
    return {
      summary: 'Screening failed.',
      verdict: 'CAUTION',
      reason: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start
    }
  }
}
