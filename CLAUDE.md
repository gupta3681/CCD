# CLAUDE.md — Portico

This file is read at the start of every Claude session in this repo. Keep it tight; if you grow it past a screenful, move detail into a sibling doc and link from here.

## What this is

**Portico** is a desktop GUI for the Claude Agent SDK that ships through Portkey at the org. Mac + Windows. Single-developer V1. Repo dir is `CCD` (legacy from "Claude Code Desktop"); the user-visible product name is **Portico**.

> **Branding rule (do not break):** Anthropic's Agent SDK terms forbid the names "Claude Code" and "Claude Code Agent" for downstream products. Use **"Portico — Powered by Claude"** in any user-visible string (window title, README, marketing). Internal slugs like `CCD`, `com.portico.app`, package name `portico` are fine.

Product context lives at `~/.gstack/projects/CCD/aryan-main-design-*.md`. Read it before making product-shape decisions.

## Architecture (electron-vite, three processes)

```
src/
├── main/                    # Node — Electron main process
│   ├── index.ts             # window, IPC handlers, query() invocation
│   └── conversations.ts     # JSON persistence at <userData>/portico/
├── preload/
│   └── index.ts             # contextBridge — typed `window.api` surface
└── renderer/                # browser — React + Tailwind v4
    └── src/
        ├── App.tsx          # top-level state + IPC plumbing
        ├── components/
        │   ├── Sidebar.tsx
        │   └── BubbleView.tsx
        └── assets/main.css  # Vellum tokens (see ReferenceDesign.md)
```

**Trust boundary**: the Agent SDK runs **only in the main process**. The renderer never touches API keys or the SDK directly — it goes through IPC handlers that the preload exposes as `window.api.*`. Don't add `nodeIntegration` to the renderer.

**Bubble shape** (the persistence + render unit): `{ id, role, blocks[] }` where each block is `text | thinking | tool_use | tool_result`. Old `{ text }` records migrate transparently in `conversations.ts:migrate`.

**Streaming**: `query()` is called with `includePartialMessages: true`. The SDK emits `stream_event` messages with `content_block_start / _delta / _stop`. Renderer applies them by `event.index` into the assistant bubble's `blocks` array. Full assistant messages also arrive at the end — **ignore them** (they duplicate the streamed content).

## Tool policy (V1)

**Currently: full toolset, all auto-approved.** Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Task, NotebookEdit, TodoWrite, AskUserQuestion — every tool the SDK ships, auto-approved via `permissionMode: 'bypassPermissions'`.

This is "single-trusted-user" mode. The agent can modify files in cwd and run shell commands. **Don't ship this configuration to anyone you wouldn't hand a bash prompt to.** Before shipping more broadly:

- **Quickest restriction**: add `disallowedTools: ['Bash', 'Write', 'Edit', 'NotebookEdit', 'KillShell']` to the `query()` options.
- **Right answer**: drop `bypassPermissions`, wire a `canUseTool` callback that surfaces an approve/deny prompt in the renderer.

`allowedTools` alone is **not** a deny list — under `bypassPermissions`, anything not in `disallowedTools` still runs.

## Env vars (`.env`, gitignored)

| Var | Effect |
|---|---|
| `ANTHROPIC_BASE_URL` | Gateway URL. Empty = direct Anthropic. `https://api.portkey.ai/v1` for Portkey. |
| `ANTHROPIC_API_KEY` | Key (Portkey virtual key or `sk-ant-…`). |
| `PORTICO_MODEL` | Default `claude-sonnet-4-6`. Also `claude-opus-4-7`, `claude-haiku-4-5`. |
| `PORTICO_SYSTEM_PROMPT` | Full override of the system prompt (string). |
| `PORTICO_PLAIN_SYSTEM_PROMPT=1` | Drop the heavy `claude_code` preset; use only the Portico append (faster, less agentic). |
| `PORTICO_USE_CLAUDE_CODE_PRESET=1` | (legacy alias) |

## Build / dev

```bash
npm run dev          # HMR. Main process changes need a full restart.
npm run typecheck    # Run before every commit.
npm run build        # Produces out/{main,preload,renderer}.
npm run build:mac    # Signed .dmg (notarization off until cert procured).
npm run build:win    # NSIS installer.
```

Code signing is the gating item for any internal distribution — start the IT request before you finish the feature, not after.

## How to add things

### A new IPC handler

1. Register in `src/main/index.ts`:
   ```ts
   ipcMain.handle('namespace:action', async (_e, arg1, arg2) => { ... })
   ```
2. Expose in `src/preload/index.ts` under the `api` object with a typed signature.
3. Update the exported types in preload so the renderer gets autocomplete.
4. Use from the renderer as `window.api.namespace.action(arg1, arg2)`.

Naming: `namespace:verb` (e.g. `conversations:list`, `agent:cancel`).

### A new content block type for bubbles

1. Extend the `Block` union in **both** `src/main/conversations.ts` and `src/preload/index.ts`. The shapes must stay identical.
2. Handle the new variant in `BubbleView.tsx`.
3. If it can arrive via streaming, handle the relevant `content_block_*` event in `App.tsx`'s `applyStreamEvent`.
4. If it shows up in old conversations, add a fallback in `conversations.ts:migrate`.

### A pre-baked agent / workflow (e.g., timesheet for v1.5)

Two paths:

- **As a Claude Code skill**: drop a `SKILL.md` (with frontmatter) into `resources/bundled/skills/<name>/`. Update `query({ options })` to set `cwd` to a workspace dir that includes that skill, or pass via `settingSources`.
- **As an in-process tool**: define an SDK MCP server (in TS) that exposes the workflow as a tool. Register it in the `mcpServers` option to `query()`.

Keep workflows small and discoverable. The home-screen empty state is where they get surfaced (currently shows the gateway/model line; add featured-action cards alongside it when the first workflow lands).

### A new env var

1. Read it in `src/main/index.ts` (main is the only process with `process.env` access through dotenv).
2. If the renderer needs to know about it, surface it through `gateway:info` or a new IPC handler. Never expose secrets.
3. Document it in this file's env table and in `.env.example`.

### A new model

Update the table in `.env.example` and the cheatsheet at the bottom of this file. Don't change `DEFAULT_MODEL` unless Sonnet 4.6 is no longer current — that affects every install with no override.

## Persistence

Lives at `app.getPath('userData')/portico/conversations.json` — atomic writes via `tmp` rename. Single JSON object keyed by conversation id. Each record holds `id, title, createdAt, updatedAt, sessionId, bubbles[]`.

When upgrading the schema: add a migration in `conversations.ts:migrate` that runs lazily on read. **Do not** require a migration script to ship.

The SDK's `session_id` is the multi-turn memory key. `setSessionId` upserts (creates a stub record if absent) because `system.init` arrives before the renderer's first debounced bubble save.

## Conventions

- **Commits**: prefer `git add -A && git commit -m` over `git commit -am`. The `-a` flag misses new files and you'll silently ship broken builds.
- **Comments**: only when the *why* isn't obvious. No "this function returns X" — name the function better.
- **Styles**: Vellum tokens only (see `ReferenceDesign.md`). New colors = update `assets/main.css` `@theme` block, then use the token name. No hex literals in components except for one-off green/red status dots.
- **No emoji** in user-visible UI strings unless explicitly approved.

## Things not to do

- Don't put Anthropic keys in the renderer bundle. They'd be readable by anyone with the app.
- Don't pass user input directly into a shell or `Bash` tool call. Tools that touch the filesystem must be either disallowed (current V1) or gated behind a permission UI (v1.1+).
- Don't add new top-level dependencies without checking that they bundle cleanly with electron-builder (`asarUnpack` for native deps).
- Don't rename `CCD` → `Portico` in repo paths or git history. Only the user-visible name matters.
- Don't break the streaming contract: any new `agent:message` payload must be safely ignorable by older renderers.

## Cheatsheet

- Default model: `claude-sonnet-4-6`
- Userdata: `~/Library/Application Support/Portico/portico/` (mac), `%APPDATA%/Portico/portico/` (win)
- Window title: `Portico`
- App ID: `com.portico.app`
- Repo dir: `CCD`
- npm package: `portico`
