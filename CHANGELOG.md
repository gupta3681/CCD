# Changelog

All notable changes to Portico are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); version numbers follow semver
once we hit 1.0.

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
