# AGENTS.md — Portico

This file is read at the start of every Codex session in this repo. Keep it tight; if you grow it past a screenful, move detail into a sibling doc and link from here.

**Companion docs (HTML, open in browser):**
- [docs/architecture.html](docs/architecture.html) — *how it works*: line-by-line tour, three processes, animated diagrams.
- [docs/flows.html](docs/flows.html) — *what happens when*: permission decision, prompt assembly, answer streaming, hook surfaces.
- [docs/code-map.html](docs/code-map.html) — *where everything lives*: file-by-file walk + searchable "where do I change X?" lookup.

## What this is

**Portico is a desktop harness for the Codex Agent SDK.** A "harness" wraps a raw capability (the agent) with controlled mediation between human and agent. Portico's job — the entire job — is to mediate four things:

1. **What the agent sees** → system prompt assembly, soul.md, AGENTS.md, settingSources, cwd
2. **What the agent can do** → tool allowlist, per-session permission patterns, autoScreen, plan mode (future), trust toggle
3. **When it can act** → user-triggered today; heartbeat / routines (future)
4. **How the human stays in the loop** → bubbles, diff view, permission modals, AskUserQuestion modal, stop button, model picker

Ships through Portkey at the org. Mac + Windows. Single-developer V1. Repo dir is `CCD` (legacy from "Codex Desktop"); the user-visible product name is **Portico**.

**Why the framing matters:** every feature on the roadmap is a harness feature. We are NOT building "AI chat features" — we're widening the contract between the human and the agent. This decides what to prioritize: a feature that strengthens mediation (heartbeat, plan mode, hooks, @filename, scoped permissions) is core; a feature that's just modality or polish (image paste, slash launcher, mascot) is nice-to-have. Ship the trustworthy harness first.

Competitors are other harnesses (Codex Desktop, Cursor, Cowork, Cline, Aider, Continue). NOT Codex.ai (chatbot UI) and NOT the Agent SDK itself (the engine). Differentiation is "non-engineers at orgs routed through their gateway, with a clean trust model and fewer terminal-shaped affordances."

> **Branding rule (do not break):** Anthropic's Agent SDK terms forbid the names "Codex" and "Codex Agent" for downstream products. Use **"Portico — Powered by Codex"** in any user-visible string (window title, README, marketing). Internal slugs like `CCD`, `com.portico.app`, package name `portico` are fine.

Product context: `~/.gstack/projects/CCD/aryan-main-design-*.md`. Backlog of decided-but-deferred work: [BACKLOG.md](BACKLOG.md).

## Architecture (electron-vite, three processes)

```
src/
├── shared/types.ts           # types used across main, preload, renderer
├── main/                     # Node — Electron main process
│   ├── index.ts              # window, IPC handlers, query() invocation
│   ├── conversations.ts      # JSON persistence at <userData>/portico/conversations.json
│   ├── appSettings.ts        # settings.json, API key encrypted via safeStorage
│   ├── userSettings.ts       # reads/writes ~/.Codex/AGENTS.md and ~/.Codex/skills/<name>/SKILL.md
│   ├── screenTool.ts         # Haiku call that classifies tool calls (SAFE/CAUTION/DANGEROUS)
│   ├── guards.ts             # isCwdSafe / isPathRevealable / isExternalSchemeAllowed
│   └── util.ts               # porticoDir + atomicWrite helpers
├── preload/index.ts          # contextBridge — typed `window.api` surface
└── renderer/                 # browser — React + Tailwind v4
    └── src/
        ├── App.tsx           # top-level state + IPC plumbing
        ├── components/
        │   ├── Sidebar.tsx           # left rail: New session, Recents, Settings
        │   ├── RightSidebar.tsx      # right rail: working folder + trust toggle
        │   ├── BubbleView.tsx        # chat bubbles, thinking, tool_use, permission prompts
        │   ├── Settings.tsx          # Gateway / Permissions / Memory / Skills tabs
        │   └── Icons.tsx             # shared inline SVG icons
        └── assets/main.css           # Vellum tokens (see ReferenceDesign.md)
tests/                        # Vitest, mocked electron, per-test scratch dirs
```

**Trust boundary**: the Agent SDK runs **only in the main process**. The renderer never touches API keys or the SDK directly — it goes through IPC handlers that the preload exposes as `window.api.*`. Don't add `nodeIntegration` to the renderer.

**Bubble shape** (the persistence + render unit): `{ id, role, blocks[], interrupted? }` where each block is `text | thinking | tool_use | tool_result | permission_request`. `role` is `user | assistant | system | tool | permission`. Old `{ text }` records migrate transparently in `conversations.ts:migrate`.

**Streaming**: `query()` is called with `includePartialMessages: true`. The SDK emits `stream_event` messages with `content_block_start / _delta / _stop`. Renderer applies them by `event.index` into the assistant bubble's `blocks` array. Each assistant turn is a separate bubble keyed by SDK `message.id` (don't pile multiple turns into one bubble — that's the bug the message_id key fixed).

## Tool policy + permission UI

**Default: full toolset, "Ask" mode.** Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Task, NotebookEdit, TodoWrite, AskUserQuestion. Each tool call pauses for user approval via the SDK's `canUseTool` callback.

Settings → Permissions exposes:
- **Auto-approve everything** → `permissionMode: 'bypassPermissions'`. For trusted, prompt-driven use only.
- **Ask before each tool call** → `permissionMode: 'default'` + `canUseTool` callback that surfaces an inline "permission" bubble.
- **Auto-screen with Haiku** (sub-toggle) → before showing the prompt, run `screenTool()` to classify the call as Safe / Caution / Dangerous (~300ms). Verdict is shown next to the Approve/Deny buttons.

`allowedTools` is auto-approve, NOT a deny list. To restrict, use `disallowedTools` (and remove `bypassPermissions`).

## Working directory + settingSources

Each conversation has an optional `cwd` (the user picks a folder via the right rail). The agent's Read / Write / Bash run there.

Loaded `.Codex/` sources are controlled per-conversation:
- Always loads `'user'` (`~/.Codex/`) — the user's global skills + AGENTS.md.
- Loads `'project'` (the cwd's `.Codex/`) **only if** the conversation's `trustProject` flag is true. Toggled by the "Trust this folder's `.Codex/`" checkbox in the right sidebar. Auto-resets when cwd changes.

This is the prompt-injection defense: opening an untrusted repo can't auto-load that repo's skills or `AGENTS.md` into the agent.

## Stop / interruption

- Send button swaps to a Stop button while busy. Click → main aborts the SDK's AbortController.
- Main fires `agent:cancelled` (in addition to `agent:done`). Renderer marks the in-flight bubble `interrupted: true` → BubbleView shows a terra "✕ Stopped by you" footer.
- The conversation is also flagged `lastInterrupted: true`. The next `agent:query` prepends a short system note to the prompt so the model knows it was cut off, then clears the flag.

## Env vars (`.env`, gitignored — but in-app Settings → Gateway overrides)

| Var | Effect |
|---|---|
| `ANTHROPIC_BASE_URL` | Gateway URL. Empty = direct Anthropic. `https://api.portkey.ai/v1` for Portkey. |
| `ANTHROPIC_API_KEY` | Key (Portkey virtual key or `sk-ant-…`). |
| `PORTICO_MODEL` | Default `Codex-sonnet-4-6`. Also `Codex-opus-4-7`, `Codex-haiku-4-5`. |
| `PORTICO_SYSTEM_PROMPT` | Full override of the system prompt (string). |
| `PORTICO_PLAIN_SYSTEM_PROMPT=1` | Drop the heavy `Codex` preset; use only the Portico append (faster, less agentic). |

App settings (Settings → Gateway) override `.env` on save via `appSettings.applyToEnv()`. Key is encrypted via OS keychain (Electron `safeStorage`) when available; plaintext fallback on Linux without a keyring (warned in UI).

## Persistence — two stores in parallel

| Path | Owner | Purpose |
|---|---|---|
| `<userData>/portico/conversations.json` | us | sidebar metadata (title, cwd, trustProject, decisions, bubble blocks) |
| `<userData>/portico/settings.json` | us | gateway config (encrypted key), permission mode, autoScreen toggle |
| `~/.Codex/projects/<cwd-hash>/<session-id>.jsonl` | SDK | required for `resume: sessionId` to work — multi-turn memory |

Why both? The SDK's JSONL doesn't have our titles, decisions, trust flag, or display-shape blocks. Setting `persistSession: false` would break `resume`. The duplicate is the price of multi-turn memory + a fast UI. There's a backlog item to switch to "JSONL is canonical, our store is a thin sidecar" — see [BACKLOG.md](BACKLOG.md).

Sort order: sidebar lists by `lastMessageAt` (bumped only on bubble writes), not `updatedAt` (bumped by any metadata change). Renaming or changing cwd does NOT shuffle the sidebar.

## Build / dev / test

```bash
npm run dev          # HMR. Main process changes need a full restart.
npm run typecheck    # Run before every commit.
npm test             # Vitest (105+ tests across main + guards + screening).
npm run test:watch   # Watch mode.
npm run build        # Produces out/{main,preload,renderer}.
npm run build:mac    # Signed .dmg (notarization off until cert procured).
npm run build:win    # NSIS installer.
```

Code signing is the gating item for any internal distribution — start the IT request before you finish the feature, not after. (Intune-managed Mac still needs Apple Developer ID + notarization; Windows can use an internal CA.)

## How to add things

### A new IPC handler
1. Register in `src/main/index.ts`: `ipcMain.handle('namespace:action', async (_e, ...) => {...})`.
2. Expose in `src/preload/index.ts` under `api` with a typed signature.
3. If the data crosses the boundary, define the type in `src/shared/types.ts`. Both sides import from there.
4. Use from renderer as `window.api.namespace.action(...)`.

Naming: `namespace:verb` (e.g. `conversations:list`, `agent:cancel`).

### A new content block type for bubbles
1. Extend the `Block` union in `src/shared/types.ts` (single source of truth).
2. Handle in `BubbleView.tsx`.
3. If it streams, handle the `content_block_*` event in `App.tsx`'s `applyStreamEvent`.
4. If it shows up in old conversations, add a fallback in `conversations.ts:migrate`.

### A new Settings tab
1. Add the tab key to the `Tab` union in `Settings.tsx`.
2. Add a `<TabBtn>` to the nav and a render branch to the body.
3. Write a `function NewTab(): JSX.Element` component in the same file.
4. If it persists state, add to `appSettings.ts` (whitelist the new key in `WRITABLE`).

### A pre-baked agent / workflow (e.g., timesheet for v1.5)
- **As a Codex skill**: drop a `SKILL.md` (with frontmatter) into `resources/bundled/skills/<name>/`. To load it, set `cwd` to a workspace dir that includes it OR pass via `settingSources` / `skills`.
- **As an in-process tool**: define an SDK MCP server in TS, register in `mcpServers` option to `query()`.

### A new env var
1. Read in `src/main/index.ts` (main is the only process with `process.env` access).
2. If the renderer needs to know, surface via `gateway:info` or a new IPC handler. Never expose secrets.
3. Document in this file's env table AND `.env.example`.

### A new model
Add a `ModelOption` to `KNOWN_MODELS` in `src/shared/types.ts` (single source of truth — picker UI, default dropdown, gateway badge, context meter all read from here). Update the table in `.env.example` if it's a new alias. Don't change `DEFAULT_MODEL` in `main/index.ts` unless Sonnet 4.6 is no longer current — that affects every install with no override.

### A new harness mediation point (the right way to think about features)
Almost every Portico feature lives at one of four mediation surfaces. Pick the right one and the implementation almost writes itself:

| Surface | What it controls | Today's code paths | Examples of features that live here |
|---|---|---|---|
| **What the agent sees** | systemPrompt, settingSources, cwd, prepended user-prompt notes | `systemPromptFor()`, `buildAppend()`, the `effectivePrompt` assembly | @filename mention, soul.md, project trust, "interrupted" note |
| **What the agent can do** | tool allowlist, canUseTool, mcpServers, permissionMode | `canUseTool` callback, `permissionPatterns.ts`, `screenTool.ts` | per-session allowlist, plan mode, autoScreen, AskUserQuestion modal |
| **When it acts** | who triggers a turn (user vs. timer vs. external event) | `agent:query` IPC handler is the only trigger today | heartbeat, routines, /loop, phone-remote (BACKLOG) |
| **How the human stays in the loop** | bubbles, modals, badges, observable state | `BubbleView.tsx`, `PermissionPrompt`, `UserQuestionModal`, header badges, logs | diff view, context meter, model picker, stop button, OS notifications |

Before adding anything, ask: "Which surface? Does it strengthen mediation or is it just polish?" Mediation features take priority over polish for the post-v1 queue.

See [docs/flows.html](docs/flows.html) for animated walkthroughs of each surface and where future hooks would slot in.

### A new test
Tests live in `tests/`. Pattern: dynamic `await import(...)` inside each `it()` to avoid module-scope state leaking between tests. The setup at `tests/setup.ts` mocks `electron` and gives each test a fresh `userData` + `HOME` temp dir.

## Conventions

- **Commits**: prefer `git add -A && git commit -m` over `git commit -am`. The `-a` flag misses new files and you'll silently ship broken builds.
- **Comments**: only when the *why* isn't obvious. No "this function returns X" — name the function better.
- **Styles**: Vellum tokens only (see `ReferenceDesign.md`). New colors → update `assets/main.css` `@theme` block, then use the token name. No hex literals in components except for one-off green/red status dots.
- **No emoji** in user-visible UI strings unless explicitly approved.
- **Validate every IPC handler input.** The renderer is the attack surface. Use `guards.ts` for path checks; whitelist writable keys in `appSettings.set`.

## Things not to do

- Don't put Anthropic keys in the renderer bundle. They'd be readable by anyone with the app.
- Don't `nodeIntegration: true` on the renderer. Renderer renders attacker-controlled markdown — sandbox stays on.
- Don't pass arbitrary URLs to `shell.openExternal`. Use `isExternalSchemeAllowed` (https/http/mailto only).
- Don't pass user input directly into a shell or `Bash` tool call without going through the permission flow.
- Don't add new top-level dependencies without checking they bundle cleanly with electron-builder (`asarUnpack` for native deps).
- Don't rename `CCD` → `Portico` in repo paths or git history. Only the user-visible name matters.
- Don't break the streaming contract: any new `agent:message` payload must be safely ignorable by older renderers.
- Don't set `persistSession: false`. Breaks SDK `resume`. We've been there.
- Don't make `setSessionId` / `setCwd` / etc. bump `lastMessageAt`. Only `save()` does. Keeps the sidebar sane.

## Cheatsheet

- Default model: `Codex-sonnet-4-6` (override `PORTICO_MODEL`)
- First-run permission default: `ask` + `autoScreen: true`
- Userdata: `~/Library/Application Support/Portico/portico/` (mac), `%APPDATA%/Portico/portico/` (win)
- SDK session JSONL: `~/.Codex/projects/<sanitized-cwd>/<session-id>.jsonl`
- Window title: `Portico` · App ID: `com.portico.app` · Repo dir: `CCD` · npm package: `portico`
