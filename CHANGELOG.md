# Changelog

All notable changes to Portico are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); version numbers follow semver
once we hit 1.0.

## [0.2.1] — 2026-05-10

### UX

- **Spinner now shows what the agent is actually doing** —
  "Thinking…", "Running WebSearch…", "Writing answer…" — derived from the
  most recent stream event. Sticks during quiet stretches (e.g. while a
  tool runs offline for 20+ seconds with no events flowing) so the screen
  no longer looks frozen. The corporate-verb rotator is preserved as a
  secondary delight: `Running WebSearch… · synergizing`.

## [0.2.0] — 2026-05-10 · "Day 2"

### New

- **Per-conversation model picker** in the header. Click the model badge to
  switch Sonnet / Opus / Haiku mid-chat; the next turn uses the new model
  with the existing conversation history intact. Global default in
  Settings → Gateway. `KNOWN_MODELS` in `shared/types.ts` is the single
  source of truth.
- **AskUserQuestion modal** — when the agent calls the SDK's
  `AskUserQuestion` tool, a centered modal opens with single/multi-select
  option cards (with optional markdown previews) instead of the generic
  permission UI. Esc / click-outside dismisses, ⌘↵ submits.
- **Per-session permission allowlist** ("Allow for this session"). Approving
  a tool call now offers a dropdown to auto-approve similar calls
  (`Bash(python *)` or bare `Bash`) for the rest of the conversation.
  Allowed patterns surface in the right sidebar; revoke any with one click.
- **Compact tool-call rows** with per-tool verbs and diffs:
  `Edited barcelona.txt +12 -3 ›` expands to a real LCS-based unified diff
  with red/green line highlighting. `Wrote` shows new content, `Ran` shows
  the command with a `$` prompt.
- **Composer redesign** — single rounded pill, circular send/stop button
  inside on the right, growing textarea up to 200px. Extracted to its own
  component.
- **Pet mascot** — small azure pixel-art companion perched on the composer.
  Idle bob + blink, thinking pose when busy, brief smile when a turn
  completes. Click to pet.
- **Turn-grouped chat view** — once an answer arrives, the intermediate
  work (thinking, tool calls, permission prompts, tool results) collapses
  behind a small "▸ Show working · N steps" disclosure. Question → answer
  by default; click to peek under the hood.
- **Editorial bubble layout** — user messages render as soft-azure cards
  sized to content; assistant responses flow directly on the page (no outer
  bubble), like reading a document.
- **Greeting with name + time of day** — "Good evening, Aryan." pulled from
  the `Name:` field in `~/.claude/CLAUDE.md`.
- **Spinner verb rotator** — corporate-speak phrases ("Synergizing…",
  "Boiling the ocean…", "Opening the kimono…") cycle every 2.5s while the
  agent works.

### Bug fixes

- Renderer subscribed IPC listeners after the tour-init early return —
  agent responses never rendered. Subscriptions now always run on mount.
- Streaming: backfill canonical `tool_use.input` from the end-of-turn
  assistant message. Previously we ignored `input_json_delta`, leaving
  "Edited file +0 -0" forever.
- AbortSignal listener leak in `canUseTool` — extracted
  `awaitPermissionOrAbort()` helper that single-resolves AND removes the
  abort listener on natural resolve.
- Init message: log a warn when `system:init` lacks `session_id` (silent
  multi-turn-only mode would otherwise have no breadcrumb).
- `UserQuestionModal`: key by requestId so a new request always remounts
  cleanly.
- `gatewayInfo` IPC deduped — one mount-time fetch instead of two.

### Refactor (no behavior change)

- `conversations.ts`: extracted `updateConversation(id, patch)` helper.
  Every metadata setter is a one-liner. The "stub if missing, never bump
  lastMessageAt" invariant lives in one place.
- `shared/types.ts`: added `lookupModel(id)` helper; replaced 4 callsites
  of `KNOWN_MODELS.find()`.
- Context window is now per-model (`contextWindowFor(modelId)`); header
  meter scales when 1M-context models land.

### Docs

- New **`docs/flows.html`** — animated walkthroughs of the four mediation
  surfaces (permission, prompt assembly, answer streaming, hook surfaces)
  with a step-through play control.
- New **`docs/code-map.html`** — file-by-file walk + searchable
  "Where do I change X?" lookup. Ship-and-demo reference.
- **CLAUDE.md reframed** — "Portico is a desktop harness for the Claude
  Agent SDK." Added the four mediation surfaces table to the
  How-to-add-things section. Architecture / flows / code-map cross-linked
  in the header.
- **BACKLOG.md** — six new design entries (model picker [shipped],
  @filename, image paste, slash launcher, plan mode, heartbeat) plus the
  Buddy entry retained.

## [0.1.0] — first internal release

### Core

- Electron + React + Claude Agent SDK + Tailwind v4 (Vellum design tokens).
- Token streaming, including thinking blocks (auto-collapse once the final
  text arrives), tool-use cards, and inline tool results.
- Multi-turn memory via SDK session resume; each assistant turn is its own
  bubble keyed by SDK `message.id`.
- Stop button mid-stream — partial bubble shows a "Stopped by you" badge,
  next message tells the model it was interrupted.

### UI

- Collapsible left sidebar with new-session button, sorted recents
  (by `lastMessageAt`, not metadata bumps), hover-to-delete.
- Right sidebar: working-folder picker with per-conversation `cwd`, plus a
  "Trust this folder's `.claude/`" opt-in for project-level skills/CLAUDE.md.
- Settings (Gateway / Permissions / Memory / Soul / Skills tabs).
- First-run persona wizard (Developer / PM / Director) seeds
  `~/.claude/CLAUDE.md` and `~/.claude/soul.md`.
- Inline context-window meter next to the model in the header.
- macOS traffic-light spacing, app-region drag handles.

### Permissions + safety

- Settings → Permissions: auto / ask modes, optional Haiku auto-screening
  (Safe / Caution / Dangerous verdicts ~300ms).
- First-run default: ask + auto-screen.
- Inline approve/deny prompts persist into conversation history with the
  decision timestamp.
- `disallowedTools` enforcement; full toolset behind permission gate.
- Renderer never sees the saved API key as plaintext after first save
  (`gatewayKeySet: boolean` only). Key encrypted via Electron `safeStorage`.
- URL allowlist (https/http/mailto only) on `shell.openExternal`.
- Path validation guards (`isCwdSafe`, `isPathRevealable`).
- Conversation file corruption is backed up to `.corrupt-<ts>` before reset.

### Persistence

- `<userData>/portico/conversations.json` — bubbles, titles, sidebar metadata.
- `<userData>/portico/settings.json` — gateway config (encrypted) + permission
  preferences.
- SDK's session JSONL kept on (required for `resume`).
- Atomic writes via `tmp` rename across the board.

### Tests

- 114 unit tests (Vitest) covering main-process modules: util, guards,
  conversations, appSettings, userSettings (including soul + persona seed),
  screenTool.

### Docs

- [CLAUDE.md](CLAUDE.md) — project memory + how-to-extend recipes.
- [docs/architecture.html](docs/architecture.html) — animated architecture
  walkthrough.
- [BACKLOG.md](BACKLOG.md) — decided-but-deferred items.

### Known limitations (filed in BACKLOG)

- No code signing yet — Mac users see Gatekeeper warning, Windows users see
  SmartScreen. Both one-click-past on first launch.
- No auto-updates yet (requires signing on macOS).
- No CI yet.
- SDK persistence runs in parallel with ours (the duplicate-store backlog item).
- Node not bundled — MCP servers requiring `npx` need a system Node install.
