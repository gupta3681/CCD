import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { isCwdSafe, isExternalSchemeAllowed, isPathRevealable } from './guards'
import { config as loadDotenv } from 'dotenv'
import { query } from '@anthropic-ai/claude-agent-sdk'
import icon from '../../resources/icon.png?asset'
import * as conversations from './conversations'
import * as userSettings from './userSettings'
import * as appSettings from './appSettings'
import * as permissionPatterns from './permissionPatterns'
import { screenTool, type Screening } from './screenTool'
import { log, logBootInfo, recent as recentLogs, clearRing, paths as logPaths } from './logger'

loadDotenv()

// runId -> { controller, conversationId, sender, cancelHandled } so cancel can
// mark the right conversation as interrupted AND send unstick events directly
// to the renderer without waiting for the SDK to actually exit (it sometimes
// doesn't honor abort if it's blocked inside a tool call).
interface ActiveRun {
  controller: AbortController
  conversationId: string
  sender: Electron.WebContents
  cancelHandled: boolean
}
const activeRuns = new Map<string, ActiveRun>()

// Pending permission prompts. Resolves when the renderer responds.
interface PermissionDecision {
  allow: boolean
  reason?: string
  /** When set, the renderer chose "Allow for session" — persist this pattern. */
  allowPattern?: string
  /** When the prompt was an AskUserQuestion modal, these are the user's selections. */
  userAnswers?: import('./../shared/types').UserQuestionAnswer[]
}
interface PendingPermission {
  resolve: (decision: PermissionDecision) => void
}
const pendingPermissions = new Map<string, PendingPermission>()

/**
 * Wait for either a renderer response (via pendingPermissions) or an abort.
 * Removes the abort listener after either path resolves so long-lived turns
 * with many tool calls don't leak listeners on the AbortSignal. Also
 * single-resolves: a late-firing abort after a normal resolve is a no-op.
 */
function awaitPermissionOrAbort(
  requestId: string,
  signal: AbortSignal
): Promise<PermissionDecision> {
  return new Promise<PermissionDecision>((resolve) => {
    let done = false
    const onAbort = (): void => {
      if (done) return
      done = true
      pendingPermissions.delete(requestId)
      resolve({ allow: false, reason: 'aborted' })
    }
    pendingPermissions.set(requestId, {
      resolve: (decision) => {
        if (done) return
        done = true
        signal.removeEventListener('abort', onAbort)
        resolve(decision)
      }
    })
    signal.addEventListener('abort', onAbort)
  })
}

/**
 * Best-effort parse of the AskUserQuestion tool input into our typed shape.
 * The SDK's tool input mostly matches our types; we just normalize defaults
 * (multiSelect=false when missing, options always an array).
 */
function parseAskUserQuestionInput(
  input: unknown
): import('./../shared/types').UserQuestion[] {
  const i = (input ?? {}) as Record<string, unknown>
  const raw = Array.isArray(i.questions) ? (i.questions as unknown[]) : []
  return raw
    .map((q) => {
      const obj = (q ?? {}) as Record<string, unknown>
      const opts = Array.isArray(obj.options) ? (obj.options as unknown[]) : []
      return {
        question: typeof obj.question === 'string' ? obj.question : '',
        header: typeof obj.header === 'string' ? obj.header : undefined,
        multiSelect: !!obj.multiSelect,
        options: opts.map((o) => {
          const oo = (o ?? {}) as Record<string, unknown>
          return {
            label: typeof oo.label === 'string' ? oo.label : '',
            description: typeof oo.description === 'string' ? oo.description : undefined,
            preview: typeof oo.preview === 'string' ? oo.preview : undefined
          }
        })
      }
    })
    .filter((q) => q.question && q.options.length > 0)
}

/**
 * Format the user's selections as a plain-text "tool result" the agent can
 * read. We return this via canUseTool's deny-with-message channel — the SDK
 * surfaces it to the model as the AskUserQuestion result.
 */
function formatUserAnswers(
  questions: import('./../shared/types').UserQuestion[],
  answers: import('./../shared/types').UserQuestionAnswer[]
): string {
  const lines: string[] = ['User selected:']
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const a = answers.find((x) => x.questionIndex === i)
    const selected = a?.selectedLabels ?? []
    lines.push('')
    lines.push(`Q: ${q.question}`)
    if (selected.length === 0) lines.push(`A: (no selection)`)
    else if (q.multiSelect) lines.push(`A: ${selected.join(', ')}`)
    else lines.push(`A: ${selected[0]}`)
  }
  return lines.join('\n')
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'

/**
 * The Claude Code CLI binary the Agent SDK spawns ships in a per-platform
 * package: @anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude.
 *
 * In dev (npm run dev), require.resolve from inside the SDK gives a real
 * filesystem path — fine. In a packaged Electron app, the SDK lives inside
 * app.asar, so require.resolve returns a path like
 *   .../Resources/app.asar/node_modules/.../claude
 * Electron's asar layer transparently redirects READS to app.asar.unpacked,
 * but child_process.spawn() goes through libc which doesn't understand asar
 * — it tries to traverse `app.asar` as a directory and fails with ENOTDIR.
 *
 * Fix: in packaged builds, compute the unpacked path explicitly and pass it
 * via the SDK's `pathToClaudeCodeExecutable` option.
 */
function claudeCodeExecPath(): string | undefined {
  if (!app.isPackaged) return undefined // dev: SDK resolves normally
  const platformPkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
  return join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    platformPkg,
    'claude'
  )
}

// Default: extend the Claude Code agent preset with a Portico identity line.
// The preset is required for full agent behavior (tool guidance, etc.) so we
// keep it on by default. Override with a plain string via PORTICO_SYSTEM_PROMPT,
// or disable the preset entirely with PORTICO_PLAIN_SYSTEM_PROMPT=1.
const PORTICO_APPEND =
  'You are Portico, a desktop assistant for an internal team, routed through the ' +
  "organization's LLM gateway. Format answers with Markdown (headings, lists, code " +
  'fences, tables) when it helps readability. Be concise. Prefer answering ' +
  'immediately over asking clarifying questions when the request is unambiguous.'

const PROFILE_FILES_CODA = `

## Files you can update
- ~/.claude/CLAUDE.md captures what you know about the user (already loaded into your context). When the user shares new info — new role, project, name correction, preference — use the Edit tool to update it.
- ~/.claude/soul.md captures how the user wants you to respond (already loaded below if it exists). When the user asks you to behave differently from now on, use the Edit tool to update it.
- Both files persist across sessions. Don't ask permission to edit them when the user has clearly stated a new fact or preference; the user expects you to keep your context current.`

/**
 * Resolve the model to use for a given conversation, in precedence order:
 *   1. Per-conversation override (set by the inline header picker)
 *   2. Global default in AppSettings (set by Settings → Gateway)
 *   3. PORTICO_MODEL env var (legacy escape hatch)
 *   4. DEFAULT_MODEL (Sonnet 4.6, hard fallback)
 *
 * Pass `undefined` for conversationId to skip step 1 (used by gatewayInfo for
 * the global header badge).
 */
function modelFor(conversationId?: string): string {
  if (conversationId) {
    const convModel = conversations.getModel(conversationId)
    if (convModel) return convModel
  }
  const settingsDefault = appSettings.get().defaultModel?.trim()
  if (settingsDefault) return settingsDefault
  return process.env.PORTICO_MODEL?.trim() || DEFAULT_MODEL
}

function buildAppend(): string {
  let append = PORTICO_APPEND
  const soul = userSettings.readSoul()
  if (soul.exists && soul.content.trim().length > 0) {
    append += `\n\n## How to respond (from ~/.claude/soul.md)\n\n${soul.content.trim()}`
  }
  append += PROFILE_FILES_CODA
  return append
}

function systemPromptFor():
  | string
  | { type: 'preset'; preset: 'claude_code'; append?: string }
  | undefined {
  const override = process.env.PORTICO_SYSTEM_PROMPT?.trim()
  if (override) return override
  const append = buildAppend()
  if (process.env.PORTICO_PLAIN_SYSTEM_PROMPT === '1') return append
  return { type: 'preset', preset: 'claude_code', append }
}

// Auto-deny all pending permissions, e.g. on window close so the SDK promise
// resolves and any in-flight query exits cleanly instead of leaking.
function denyAllPending(reason: string): void {
  for (const [reqId, p] of pendingPermissions) {
    p.resolve({ allow: false, reason })
    pendingPermissions.delete(reqId)
  }
}


function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#faf9f5',
    title: 'Portico',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Explicit security defaults — Electron defaults are safe today, but a
      // future template change shouldn't silently expose Node to the renderer.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses Node `path` etc. — keep off, but lock the rest down.
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => {
    if (BrowserWindow.getAllWindows().length === 0) denyAllPending('all windows closed')
  })

  // Allowlist external URL schemes. The agent renders attacker-controlled
  // markdown, which can contain links — without this, clicking a link could
  // launch any registered protocol handler (vscode://, slack://, file://).
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isExternalSchemeAllowed(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // Block in-window navigation away from the app shell entirely.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault()
      if (isExternalSchemeAllowed(url)) shell.openExternal(url)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}


function gatewayInfo(conversationId?: string): {
  gateway: string
  configured: boolean
  model: string
  /** True when the model resolved from a per-conversation override, not the default. */
  modelIsOverride: boolean
} {
  // Source of truth: in-app settings + env (settings already pushed into env
  // by appSettings.applyToEnv). Combining both here covers the case where the
  // user has only .env set or only settings.json set.
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? ''
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  const model = modelFor(conversationId)
  const modelIsOverride =
    !!conversationId && !!conversations.getModel(conversationId) && model !== modelFor()
  const gateway = baseUrl.includes('portkey')
    ? 'Portkey'
    : baseUrl
      ? baseUrl
      : 'Anthropic (direct)'
  return { gateway, configured: hasKey, model, modelIsOverride }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.portico.app')
  // App settings override .env. Apply on startup so the SDK + screen client
  // see the user's in-app gateway config from the first request.
  appSettings.applyToEnv()
  logBootInfo()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('gateway:info', (_e, conversationId?: string) => gatewayInfo(conversationId))

  // ── Logs ──────────────────────────────────────────────────────────────
  ipcMain.handle('logs:recent', (_e, limit?: number) => recentLogs(limit))
  ipcMain.handle('logs:clear', () => clearRing())
  ipcMain.handle('logs:paths', () => logPaths())

  ipcMain.handle('agent:cancel', (_e, runId: string) => {
    const ar = activeRuns.get(runId)
    if (!ar) {
      log.warn('agent', 'cancel for unknown runId — already finished?', { runId })
      return
    }
    log.info('agent', 'cancel requested', { runId })
    ar.cancelHandled = true
    ar.controller.abort()
    conversations.setInterrupted(ar.conversationId, true)
    let pendingDenied = 0
    for (const [reqId, p] of pendingPermissions) {
      if (reqId.startsWith(`${runId}:`)) {
        p.resolve({ allow: false, reason: 'cancelled' })
        pendingPermissions.delete(reqId)
        pendingDenied++
      }
    }
    if (pendingDenied > 0) log.info('agent', `cancel denied ${pendingDenied} pending permission(s)`, { runId })
    // Unstick the renderer immediately. The SDK may still be mid-tool-call
    // and not honor abort right away — that's its problem to clean up. The
    // UI doesn't have to wait. The agent:query catch block sees cancelHandled
    // and won't double-send.
    if (!ar.sender.isDestroyed()) {
      ar.sender.send('agent:cancelled', { runId, payload: null })
      ar.sender.send('agent:done', { runId, payload: null })
    }
  })

  ipcMain.handle(
    'permission:respond',
    (_e, requestId: string, decision: PermissionDecision) => {
      const pending = pendingPermissions.get(requestId)
      if (!pending) return
      pending.resolve(decision)
      pendingPermissions.delete(requestId)
    }
  )

  // ── App settings (persisted at <userData>/portico/settings.json) ──────
  ipcMain.handle('appSettings:get', () => appSettings.get())
  ipcMain.handle(
    'appSettings:set',
    (_e, patch: Partial<appSettings.AppSettings> & { gatewayApiKey?: string | null }) =>
      appSettings.set(patch)
  )

  // ── User settings (~/.claude) ─────────────────────────────────────────
  ipcMain.handle('settings:paths', () => userSettings.paths())
  ipcMain.handle('settings:claudeMd:read', () => userSettings.readClaudeMd())
  ipcMain.handle('settings:claudeMd:write', (_e, content: string) =>
    userSettings.writeClaudeMd(content)
  )
  ipcMain.handle('settings:skills:list', () => userSettings.listSkills())
  ipcMain.handle('settings:skills:read', (_e, name: string) => userSettings.readSkill(name))
  ipcMain.handle('settings:skills:write', (_e, name: string, content: string) =>
    userSettings.writeSkill(name, content)
  )
  ipcMain.handle('settings:skills:create', (_e, name: string) => userSettings.createSkill(name))
  ipcMain.handle('settings:skills:delete', (_e, name: string) => userSettings.deleteSkill(name))

  ipcMain.handle('settings:soul:read', () => userSettings.readSoul())
  ipcMain.handle('settings:soul:write', (_e, content: string) => userSettings.writeSoul(content))

  ipcMain.handle('settings:profile:isFirstRun', () => userSettings.isFirstRun())
  ipcMain.handle('settings:profile:name', () => userSettings.readProfileName())
  ipcMain.handle(
    'settings:profile:seed',
    (_e, input: { persona: 'developer' | 'pm' | 'director'; name: string; workingOn: string }) =>
      userSettings.seedProfile(input)
  )
  ipcMain.handle('settings:profile:skip', () => userSettings.skipProfileSetup())

  // ── Conversations ─────────────────────────────────────────────────────
  ipcMain.handle('conversations:list', () => conversations.list())
  ipcMain.handle('conversations:get', (_e, id: string) => conversations.get(id))
  ipcMain.handle('conversations:save', (_e, id: string, bubbles: conversations.Bubble[]) =>
    conversations.save(id, bubbles)
  )
  ipcMain.handle('conversations:delete', (_e, id: string) => conversations.remove(id))
  ipcMain.handle('conversations:rename', (_e, id: string, title: string) =>
    conversations.rename(id, title)
  )
  ipcMain.handle('conversations:setCwd', (_e, id: string, cwd: string | null) => {
    if (cwd !== null && !isCwdSafe(cwd)) {
      throw new Error('Working folder must be an existing directory inside your home folder.')
    }
    conversations.setCwd(id, cwd)
    // Changing the folder always resets the trust flag — the user must
    // re-opt-in for the new folder.
    if (cwd === null || cwd !== conversations.getCwd(id)) {
      conversations.setTrustProject(id, false)
    }
  })

  ipcMain.handle('conversations:setTrustProject', (_e, id: string, trust: boolean) => {
    conversations.setTrustProject(id, !!trust)
  })

  ipcMain.handle('conversations:setModel', (_e, id: string, model: string | null) => {
    conversations.setModel(id, model)
  })

  ipcMain.handle('conversations:getSessionPermissions', (_e, id: string) =>
    conversations.getSessionAllowedPatterns(id)
  )
  ipcMain.handle('conversations:revokeSessionPermission', (_e, id: string, pattern: string) =>
    conversations.removeSessionAllowedPattern(id, pattern)
  )
  ipcMain.handle('conversations:clearSessionPermissions', (_e, id: string) => {
    conversations.clearSessionAllowedPatterns(id)
  })

  // ── Native dialogs / shell ────────────────────────────────────────────
  ipcMain.handle('dialog:pickFolder', async (event, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      ...(defaultPath ? { defaultPath } : {})
    }
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('shell:revealPath', (_e, p: string) => {
    // Only reveal paths under the user's home or the app's userData dir.
    // Prevents a compromised renderer from probing arbitrary filesystem
    // locations via a Finder/Explorer side-channel.
    if (!isPathRevealable(p)) return
    shell.showItemInFolder(p)
  })

  // ── Agent query ───────────────────────────────────────────────────────
  ipcMain.handle(
    'agent:query',
    async (event, prompt: string, runId: string, conversationId: string) => {
      const sender = event.sender
      const send = (channel: string, payload: unknown): void => {
        if (!sender.isDestroyed()) sender.send(channel, { runId, payload })
      }

      const resumeId = conversations.getSessionId(conversationId)
      const storedCwd = conversations.getCwd(conversationId)
      // Re-validate at use time — the renderer is the only writer today, but
      // the conversations.json file could have been edited externally.
      const cwd = storedCwd && isCwdSafe(storedCwd) ? storedCwd : undefined
      const trustProject = !!cwd && conversations.getTrustProject(conversationId)

      const model = modelFor(conversationId)
      log.info('agent', 'query started', {
        runId,
        conversationId,
        model,
        cwd: cwd ?? '(none)',
        trustProject,
        resuming: !!resumeId,
        promptChars: prompt.length
      })

      // If the previous turn was stopped by the user, give the model a tiny
      // heads-up so it doesn't pick up as if nothing happened.
      let effectivePrompt = prompt
      if (conversations.getInterrupted(conversationId)) {
        effectivePrompt =
          '[The user pressed Stop on your previous reply, cutting it off mid-stream. ' +
          'Acknowledge that briefly if relevant, then handle this new message.]\n\n' +
          prompt
        conversations.setInterrupted(conversationId, false)
      }
      // settingSources controls which .claude/ dirs the SDK auto-loads.
      // - 'user' is always safe (the user's own ~/.claude/).
      // - 'project' loads CLAUDE.md + skills from the working folder. Opt-in
      //   per conversation via the right-panel "Trust folder" checkbox so
      //   browsing into an untrusted repo can't inject instructions.
      const settingSources: Array<'user' | 'project' | 'local'> = trustProject
        ? ['user', 'project']
        : ['user']
      const controller = new AbortController()
      activeRuns.set(runId, { controller, conversationId, sender, cancelHandled: false })

      const settings = appSettings.get()
      const askMode = settings.permissionMode === 'ask'

      try {
        const result = query({
          prompt: effectivePrompt,
          options: {
            model,
            systemPrompt: systemPromptFor(),
            includePartialMessages: true,
            abortController: controller,
            pathToClaudeCodeExecutable: claudeCodeExecPath(),
            settingSources,
            // Tell the model that AskUserQuestion option previews will be
            // rendered as markdown (our modal uses ReactMarkdown, not HTML
            // injection). Without this the model defaults to markdown anyway,
            // but being explicit avoids surprises if the SDK default ever flips.
            toolConfig: { askUserQuestion: { previewFormat: 'markdown' } },
            // Keep SDK persistence on. We have our own conversations.json for
            // titles / sidebar listing / decisions / trust flag — but the SDK
            // needs its session JSONL on disk for `resume: sessionId` to work,
            // which is how we get multi-turn memory across messages. Turning
            // this off breaks memory.
            ...(cwd ? { cwd } : {}),
            ...(askMode
              ? {
                  permissionMode: 'default',
                  canUseTool: async (toolName, toolInput, opts) => {
                    // AskUserQuestion is a structured "ask the user to pick"
                    // tool — handle it with a dedicated modal, not the generic
                    // permission UI. The user's selection becomes the tool
                    // result via the SDK's deny-with-message channel.
                    if (toolName === 'AskUserQuestion') {
                      const questions = parseAskUserQuestionInput(toolInput)
                      if (questions.length === 0) {
                        return {
                          behavior: 'deny',
                          message: 'AskUserQuestion called with no parseable questions.'
                        }
                      }
                      const requestId = `${runId}:${crypto.randomUUID()}`
                      send('agent:askUserQuestion', { requestId, questions })
                      const response = await awaitPermissionOrAbort(requestId, opts.signal)
                      if (!response.allow || !response.userAnswers) {
                        return {
                          behavior: 'deny',
                          message: response.reason || 'User dismissed the question.'
                        }
                      }
                      const answerText = formatUserAnswers(questions, response.userAnswers)
                      log.info('agent', 'AskUserQuestion answered', {
                        runId,
                        questionCount: questions.length,
                        answerCount: response.userAnswers.length
                      })
                      // We use deny-with-message because canUseTool has no
                      // first-class "host-handled tool result" path — the
                      // model reads the message as the tool's response.
                      return { behavior: 'deny', message: answerText }
                    }

                    // Per-session allowlist: skip the prompt entirely when a
                    // pattern the user previously approved matches this call.
                    const allowed = conversations.getSessionAllowedPatterns(conversationId)
                    if (permissionPatterns.matchesAny(allowed, toolName, toolInput)) {
                      log.info('agent', 'auto-approved by session allowlist', {
                        runId,
                        toolName
                      })
                      return { behavior: 'allow', updatedInput: toolInput }
                    }
                    const requestId = `${runId}:${crypto.randomUUID()}`
                    let screening: Screening | null = null
                    if (settings.autoScreen) {
                      send('permission:screening', { requestId, toolName })
                      screening = await screenTool(
                        toolName,
                        toolInput,
                        process.cwd(),
                        opts.signal
                      )
                    }
                    const suggestedPattern = permissionPatterns.suggestPattern(toolName, toolInput)
                    send('permission:request', {
                      requestId,
                      toolName,
                      input: toolInput,
                      screening,
                      suggestedPattern
                    })
                    const decision = await awaitPermissionOrAbort(requestId, opts.signal)
                    if (decision.allow) {
                      // If the user chose "Allow for session", persist the
                      // pattern so future matching calls skip the prompt.
                      if (decision.allowPattern) {
                        const next = conversations.addSessionAllowedPattern(
                          conversationId,
                          decision.allowPattern
                        )
                        log.info('agent', 'session allowlist updated', {
                          runId,
                          pattern: decision.allowPattern,
                          total: next.length
                        })
                      }
                      return { behavior: 'allow', updatedInput: toolInput }
                    }
                    return {
                      behavior: 'deny',
                      message: decision.reason || 'Denied by user.'
                    }
                  }
                }
              : { permissionMode: 'bypassPermissions' as const }),
            ...(resumeId ? { resume: resumeId } : {})
          }
        })

        // Counts every SDK protocol message — init, each streaming delta,
        // tool calls, tool results, the final assistant snapshot, the result.
        // For a short reply with includePartialMessages: true this is easily
        // 15–30. It's NOT a count of chat turns or context size.
        let sdkEvents = 0
        for await (const message of result) {
          sdkEvents++
          if (
            !resumeId &&
            (message as { type?: string }).type === 'system' &&
            (message as { subtype?: string }).subtype === 'init'
          ) {
            const sid = (message as { session_id?: string }).session_id
            if (sid) {
              conversations.setSessionId(conversationId, sid)
            } else {
              // Without a session_id we can't resume. Warn loudly so we notice
              // if the SDK ever changes the init shape — silent failure here
              // would degrade to single-turn-only mode without explanation.
              log.warn('agent', 'init message had no session_id — multi-turn resume will not work', {
                runId,
                conversationId
              })
            }
          }
          send('agent:message', message)
        }
        log.info('agent', 'query completed', { runId, sdkEvents })
        send('agent:done', null)
      } catch (err) {
        const ar = activeRuns.get(runId)
        if (ar?.cancelHandled) {
          // The cancel handler already sent agent:cancelled + agent:done.
          // Don't double-fire; just log that the SDK eventually exited.
          log.info('agent', 'SDK exited after cancel', { runId })
        } else if (controller.signal.aborted) {
          log.info('agent', 'query cancelled (SDK self-aborted)', { runId })
          send('agent:cancelled', null)
          send('agent:done', null)
        } else {
          const error =
            err instanceof Error
              ? { message: err.message, stack: err.stack }
              : { message: String(err) }
          log.error('agent', 'query failed', { runId, error: error.message })
          send('agent:error', error)
        }
      } finally {
        activeRuns.delete(runId)
      }
    }
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
