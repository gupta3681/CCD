# Backlog

Things we've decided are worth doing but aren't doing now. Add entries with date + a one-line "why later." When you pull one in, delete the entry (git history keeps it).

---

## `@filename` to inline file context in prompts

**Filed:** 2026-05-09

**Why now is wrong:** Working today via the agent's Read tool — typing "look at src/main/index.ts" makes the agent call Read, hit the permission prompt, and read it. Adds 3-5s + a permission round-trip per "look at this" prompt. Annoying for power users, but not blocking ship.

**The win:** Type `@src/main/index.ts` in the prompt; it gets expanded to a `<file_path>:\n<contents>` prefix in the user message before send. Skips the tool call entirely. Power-user feature — non-coders won't use it; coders will use it constantly.

**Design:**
- New `src/renderer/src/components/MentionParser.ts`: extracts `@<path>` tokens from prompt text. Path syntax: relative (resolved against cwd) or absolute. Globs not supported in v1.
- On send, pre-process: for each `@path`, attempt to read via a new `mention:resolve` IPC handler that goes through `guards.ts.isCwdSafe`-equivalent validation (must be inside cwd, OR `trustProject` && inside trusted folder, OR inside the user's home if no cwd).
- Failed resolves (not found, denied) drop into a renderer error chip — don't send the prompt, let the user fix the path.
- Successful resolves: build a multi-block user message — one `text` block per file with `--- file: <path> ---\n<contents>` framing, then the user's prompt as the final text block.
- Above the textarea, render small chips: `[× src/main/index.ts (3.2KB)]` per detected mention. Click × to revert to plain text.
- Autocomplete: typing `@` opens a small file-picker popover scoped to cwd. Same fuzzy-search component as the future slash-command launcher (so build that primitive once).

**What you'd feel:**
- "Explain @src/main/index.ts" sends the file inline; agent answers without a Read call.
- Cheaper too — no Read tool means no Haiku screening cost.
- Token cost visible in the context meter as you type — files over 50KB show a yellow warning chip.

**Pre-req to revisit:** none. Self-contained.

---

## Per-conversation model picker

**Filed:** 2026-05-09

**Why now is wrong:** Works today via `PORTICO_MODEL` env var or Settings → Gateway. Just doesn't surface per-conversation. Everyone pays Sonnet 4.6 rates for "what time is it" prompts.

**The win:** Inline model picker beside the Send button. Sonnet for most work, Haiku for "summarize this", Opus for hard refactors. User picks per conversation, persists across reload.

**Design:**
- Add `model?: string` field to `Conversation` in `shared/types.ts`.
- Add `setModel(id, model)` in `conversations.ts` (same upsert pattern as setCwd; bumps `updatedAt` only, NOT `lastMessageAt`).
- `agent:query` honors per-conversation override before falling back to `modelFor()`.
- IPC: `conversations:setModel`.
- UI: small chip-style dropdown left of the Send/Stop button, e.g. `[Sonnet 4.6 ▾]`. Three options: Sonnet 4.6 / Opus 4.7 / Haiku 4.5. Header gateway info still shows the global default; per-conversation override appears as a subtle badge in the header.
- Cost hint in the dropdown menu: small relative-cost indicator next to each model name (`$$$ Opus`, `$$ Sonnet`, `$ Haiku`).

**What you'd feel:**
- Cheap prompts get the cheap model. Bills drop.
- Switching mid-conversation works (next turn uses new model — no SDK trick required, just changes the `model` option).

**Pre-req to revisit:** none.

---

## Image paste / drag-drop in prompts

**Filed:** 2026-05-09

**Why now is wrong:** Big multimodal lift for a feature that primarily helps non-developers (paste a screenshot of an error, ask "what does this mean"). Engineers would also use it but less often. Worth doing — just not blocking initial ship.

**The win:** Paste a screenshot or drag an image into the textarea. Sent as a multimodal user message. Agent can see it. Sonnet 4.6 already supports image input — no model change needed.

**Design:**
- Extend `Bubble.blocks` `Block` union with `{ type: 'image'; mimeType: string; dataB64: string; thumbnailUrl?: string }`.
- Renderer: `onPaste` and `onDrop` handlers on the textarea. Capture `image/*` items, base64-encode, attach as a thumbnail chip above the input (same row as the future @-mention chips).
- Send path: build user message as a multi-block array — `image` blocks first, then `text` block with the prompt. SDK accepts this as the message content.
- `BubbleView` renders user bubbles with image blocks as thumbnails (max 320px wide), click to enlarge in a lightbox modal.
- Persistence: store base64 in conversations.json. Mild bloat — a 1MB screenshot becomes ~1.4MB JSON. v1 acceptable; v2 could move images to a sidecar `images/` dir referenced by hash.
- Token cost: each image is ~1500 tokens at Sonnet pricing. Surface in context meter on send.

**What you'd feel:**
- Cmd-V a screenshot in 1 second instead of saving + Reading + asking.
- "Why is my form broken" + screenshot is suddenly a one-line interaction.
- Conversations.json grows faster — cap at "biggest single image: 5MB" with a friendly error.

**Pre-req to revisit:** none.

---

## Slash commands (`/`) launcher in prompt

**Filed:** 2026-05-09

**Why now is wrong:** Skills already work — they load via `~/.claude/skills/<name>/SKILL.md`, the agent picks them up. They're just hard to discover. v1 ships without and most users won't notice; the small group of skill-aware users will.

**The win:** Type `/` in the textarea → popover opens with a fuzzy-searchable list of:
- Built-in actions (`/clear` clears the conversation, `/cwd` opens folder picker, `/model` opens model picker, `/heartbeat` opens heartbeat config)
- User skills from `~/.claude/skills/<name>/SKILL.md` with their `description` frontmatter
- Bundled skills shipped with Portico (none today, hook for later)

Selection inserts the skill's invocation pattern into the prompt OR runs the action immediately for built-ins.

**Design:**
- New `src/renderer/src/components/SlashLauncher.tsx`: popover anchored above the textarea, fuzzy-search input, keyboard nav (↑↓ to move, ↵ to select, Esc to close).
- Skill list source: `window.api.settings.skills.list()` (already exists, returns name + path + description).
- Built-in commands defined in renderer as a static array — each has `{ name, description, run: () => void }`.
- Trigger: textarea `onKeyDown` — when key is `/` and the cursor is at start-of-line (or after whitespace), open the launcher. Esc closes; selecting closes.
- Same fuzzy-search primitive as `@filename` autocomplete — build the component once, use twice.

**What you'd feel:**
- New users discover skills exist (currently invisible).
- Shorter path to "open settings to clear", "switch folder", etc.
- No agent round-trip for built-in actions.

**Pre-req to revisit:** the @filename feature (or vice-versa) — share the popover/fuzzy-search component, build either first.

---

## Plan mode (read-only safety mode for big refactors)

**Filed:** 2026-05-09

**Why now is wrong:** Useful but not blocking. Ask mode (current default) covers most of the safety case via per-tool approval; users can deny Edit/Write/Bash calls one by one. Plan mode is the convenience version.

**The win:** Third option in the permission picker (next to Ask / Auto): **Plan**. Agent has Read, Glob, Grep, WebFetch, WebSearch, Task — but NOT Edit, Write, NotebookEdit, Bash. Forces the model to map an approach in text rather than start changing things. At the end of plan mode, a single "Execute this plan" button switches to Ask mode and re-sends the plan as the next prompt.

**Design:**
- Extend `PermissionMode` union to `'auto' | 'ask' | 'plan'`.
- `agent:query` for plan mode: `permissionMode: 'default'` + `disallowedTools: ['Edit', 'Write', 'NotebookEdit', 'Bash']`. canUseTool callback unchanged for the read-only tools.
- New "Plan mode" pill in the input bar (or in the gateway header) — toggles per-conversation. State stored in Conversation as `planMode?: boolean`, NOT in appSettings (it's a per-task choice, not a global preference).
- After 1+ assistant turns in plan mode, render a green "Execute plan" button below the last assistant bubble. Click → flip planMode off, send the plan back as the next user prompt with prefix "Execute this plan:".
- Settings → Permissions tab gets a third radio for the global default.

**What you'd feel:**
- Big-refactor safety net. "Refactor my auth" first proposes the plan, you read it, you approve.
- Reduces "agent did 14 edits I didn't want" footguns for non-engineers.

**Pre-req to revisit:** none.

---

## Heartbeat (scheduled, file-driven background checks)

**Filed:** 2026-05-09

**Why now is wrong:** New trust surface (auto-firing turns), needs careful UX (notifications, idle gating, cost transparency), and the value proposition is clearest for users who have a settled workflow — not the first-week new user. Better to ship after v1 is in users' hands and we hear who actually wants this.

**The win:** Lifted from OpenClaw — periodic ticks where the agent reads a `<cwd>/HEARTBEAT.md` checklist, runs the checks, and either acts or replies the literal `HEARTBEAT_OK` string (which suppresses output). Turns Portico from "chatbot you talk to" into "agent that pings you when something's worth knowing." Use cases: unread urgent items, calendar conflicts, finished background jobs, log errors, TODOs you forgot.

**Design:**
- New `src/main/heartbeat.ts` — owns one `setInterval` (60s recheck cadence). Started in `app.whenReady()`, stopped on `window-all-closed`.
- Gate checks per tick: enabled, within active hours, idle threshold elapsed since last user activity, no active run, current conv has cwd + trustProject + non-empty `HEARTBEAT.md`.
- Synthesized prompt prepends `[Heartbeat tick — scheduled background check, NOT a user message. Run through HEARTBEAT.md and act on anything worth surfacing. If nothing's worth surfacing, reply with EXACTLY the string HEARTBEAT_OK and nothing else — your output will be suppressed.]` then the file contents.
- New `Bubble.kind?: 'user' | 'heartbeat'` field. Heartbeat bubbles render with a 🫀 label.
- After streaming completes, if assembled assistant text equals `HEARTBEAT_OK` (trimmed), App.tsx silently removes the bubble and shows a tiny ephemeral footer ("💗 last check at 14:32 · all quiet").
- OS notifications when app is unfocused and a heartbeat surfaces non-OK reply. Click to focus + select conversation.
- New "Heartbeat" tab in Settings: master toggle, interval slider, active hours start/end, idle threshold, "Last tick · Next tick" status, "Open HEARTBEAT.md" button (creates from starter template if missing).
- User-activity tracking: renderer sends `heartbeat:userActivity` IPC (debounced 5s) on textarea keypress, send click, tab focus. Main keeps `lastUserActivityAt`.

**Settings shape:**
```ts
interface HeartbeatSettings {
  enabled: boolean              // default false
  intervalMinutes: number       // default 30
  idleThresholdMinutes: number  // default 5
  activeHours: { start: number; end: number } // 0-23, default 8-22
}
```

**Permission flow during heartbeat:** if a tool needs approval and the app is in background, auto-deny after 30s and log it (option a from spec). v2: OS notification asking the user to come review.

**What you'd feel:**
- ~$0.10–$0.50/day per active conversation (28 ticks/day × Sonnet pricing × tools used). Surface this in Settings copy.
- Off by default; opt-in via Settings AND requires HEARTBEAT.md to be present (double opt-in).
- App must be open for ticks to fire (v1 limitation; v2 = launchd/Scheduler tray-mode auto-launch).

**Pre-req to revisit:** core turn loop has been stable for 2+ weeks (no streaming/permission/cancel regressions); first batch of users (Binil cohort) settled into a workflow and at least one of them asks for "I wish Portico would notice X for me."

---

## Refactor: extract `harness/` (prompt assembler + turn hooks)

**Filed:** 2026-05-09 · **Reframed:** 2026-05-10 (Portico is a harness — see CLAUDE.md)

**Why now is wrong:** The current `agent:query` handler does too much in one place — gateway resolution, settings read, conversation lookup, soul.md read, system-prompt assembly, interrupt-note prepend, settingSources decision, mcpServers wiring, canUseTool callback, AbortController bookkeeping, streaming loop, error/cancel triage. ~150 lines of imperative do-everything. Adding a feature today (pre-turn linter, post-turn observer, optional system-prompt addendum, custom logging hook) means surgery in the middle of that handler. The risk is a regression in the streaming + permission flow, which we just stabilized.

**The win:** Cleanly extract two units:

1. **`promptAssembler.ts`** — pure functions, no side effects, no IPC. Given a `TurnContext` (conversation, user, soul, settings, env), returns the full `query()` options object. Easy to unit test, easy to reason about.

2. **`hooks.ts`** — registry of named hook points the rest of the codebase can subscribe to. Modeled after Claude Code's hook system. Each hook is one-direction (just notification) OR transformative (mutates the turn context). Hook execution is deterministic: registered order, timeout per hook, errors logged but never block the turn.

**Hook points:**
- `preTurn(ctx)` → can transform `ctx.userPrompt`, `ctx.systemAppend`, `ctx.mcpServers`. Use case: prepend "user was interrupted" note (currently inline in `agent:query`); optional pre-call linter on prompt content.
- `postTurn(ctx, result)` → notification only. Use case: Buddy `buddy_observe` call, telemetry, auto-archive after N idle days.
- `preToolUse(ctx, toolName, input)` → can short-circuit (`{ allow: true | false, reason }`) or modify input. Use case: the per-session pattern allowlist check (currently inline); future "block all rm -rf without explicit confirm" rule.
- `postToolUse(ctx, toolName, input, output)` → notification only. Use case: per-tool log collation; future "warn if tool result includes API keys".

**Module layout:**
```
src/main/
  harness/                  # the harness IS the product (see CLAUDE.md framing)
    promptAssembler.ts      # WHAT the agent sees: buildSystemPrompt, buildUserPrompt, buildOptions
    permissionGate.ts       # WHAT the agent can do: canUseTool body, allowlist + screen + prompt
    hooks.ts                # extension seam: registry + dispatch + types
    turnContext.ts          # TurnContext type + builder
    runner.ts               # the actual query() loop, ~50 lines
  index.ts                  # IPC plumbing only — delegates to harness/runner
```

**Migration plan:**
1. Extract `promptAssembler.ts` first — no behavior change, just move the system-prompt builder. Add unit tests for each branch (preset / plain / override / interrupt-prepend).
2. Add `hooks.ts` with registration API + empty hook points. Wire dispatch into the existing `agent:query` handler at the four points above; existing inline logic becomes the first registered hook for each point. Behavior identical, code unchanged in net effect.
3. Replace the inline session-allowlist check with a registered `preToolUse` hook. Replace the inline interrupt-prepend with a `preTurn` hook. Replace the inline conversations.save / refreshList with a `postTurn` hook chain.
4. Move the runner loop into `runner.ts`. `index.ts` shrinks to pure IPC dispatch.

**What you'd feel:**
- `agent:query` IPC handler drops from ~150 lines to ~25 — it just builds a `TurnContext` and hands off to `harness/runner.ts`.
- New tests: `promptAssembler.test.ts` (pure, fast), `hooks.test.ts` (registry semantics, error isolation, ordering), `permissionGate.test.ts` (allowlist short-circuit, AskUserQuestion intercept, screening).
- Naming clicks: every file's purpose is self-explanatory once the directory is `harness/`.
- Adding a new feature like Buddy's auto-observe = one hook registration in `runner.ts` setup, no edits to the turn loop.
- Zero user-visible change.

**Pre-req to revisit:** core turn loop has been stable for 2+ weeks (no regressions on streaming, permissions, cancel), AND we have at least one concrete next feature that would benefit from a hook (Buddy observe, auto-archive, post-turn telemetry — any one of them).

---

## Buddy integration (virtual-pet MCP companion)

**Filed:** 2026-05-09

**Why now is wrong:** Started a partial integration (settings keys, IPC handlers, mcpServers wiring, install module) and rolled it back — touched too many trust-boundary surfaces (settings whitelist, mcpServers config in `agent:query`, a new `child_process.execFile` that pipes a remote shell script) for one sitting. Risk of breaking core chat flow > delight upside. Punting until we want to make a focused investment.

**Source:** https://github.com/fiorastudio/buddy — MIT, MCP server over stdio, local SQLite at `~/.buddy/buddy.db`, no network. 12 tools (`buddy_hatch`, `buddy_observe`, `buddy_pet`, `buddy_share`, etc.).

**The win:** Pet that levels up from the agent's observed work. Reduces the "sterile dev tool" feel that scared non-technical users off the TUI. Local-only, so no Portkey / IT compliance implications. Off by default = zero risk for users who'd find it annoying.

**Design (when we come back):**
- `appSettings.buddyEnabled` + `buddyHatched` flags (whitelist them in `WRITABLE`).
- New `src/main/buddy.ts`: `status()`, `install()`, `mcpServerConfig()`. Install runs `bash -c 'curl -fsSL .../install.sh | bash'` behind a user-confirmation prompt — bundle the script offline if we want to skip the curl.
- `agent:query` adds `mcpServers: { buddy: { type: 'stdio', command: 'node', args: [installedPath] } }` when enabled and the binary exists. Buddy's tools then flow through the existing `canUseTool` permission UI for free.
- Auto-observe: after each `agent:done`, main calls `buddy_observe` with a one-line summary of what the agent did.
- First-run: after persona wizard, "Want a buddy?" screen → install + hatch.
- Hatch overlay: full-screen cinematic — egg wobble → hairline cracks → light burst → reveal. Pure CSS.
- Settings → new "Companion" tab: enable/disable, show pet status from `buddy://status` MCP resource, mute/unmute, forget.
- Optional: render `buddy_share` PNG output as a custom `Block` type per the CLAUDE.md recipe.

**What you'd feel:**
- ~3-4 hours of focused work + meaningful QA pass (the `child_process` install path needs sandbox + error states tested).
- Token cost of `buddy_observe` (~1,350 cached + 150-1,600 per call) shows in the context meter — surface in the toggle copy.
- Buddy writes outside our userData dir (`~/.buddy/buddy.db`); uninstall doesn't auto-clean.

**Pre-req to revisit:** core chat flow rock-solid (no recent regressions), and a focused half-day window where breaking the agent loop is acceptable.

---

## Persistence: drop our `conversations.json` bubbles, parse from SDK JSONL

**Filed:** 2026-05-09

**Why now is wrong:** Works today. Switching is ~300 lines added, ~150 deleted, plus a one-time migration. Not blocking V1 ship.

**The win:** Single source of truth. The SDK already writes every chat event to `~/.claude/projects/<cwd-hash>/<session-id>.jsonl`. Our `conversations.json` duplicates the bubble content in our own display shape. Reading from JSONL eliminates the duplicate write and the drift risk.

**Design:**
- Keep `~/.claude/projects/.../<session>.jsonl` as the source of truth for chat content (SDK already maintains it).
- New `<userData>/portico/sidecar/<session-id>.json` per conversation: `{ title, cwd, trustProject, decisions: { [requestId]: { allow, at } } }` — the three things the SDK can't store.
- New `<userData>/portico/index.json` cache: `[{ id, title, updatedAt }]` for fast sidebar rendering. Rebuilt by walking `~/.claude/projects/` on app start and after each write.
- New `parseJsonlToBubbles(path)` function that reads a session's JSONL and reconstructs our display blocks. Splice in permission bubbles from the sidecar at the right positions (by `tool_use_id`).
- One-time migration on first launch: read existing `conversations.json`, write sidecars + index, delete the old file.

**What you'd feel:**
- First-launch sidebar populate becomes a tree walk (slow if many CLI sessions exist; mitigate with `index.json` cache).
- Switching sessions reads + parses a JSONL instead of slicing in-memory state — milliseconds, not noticeable for normal sizes.
- No more "did our state drift from the SDK's?" worry.

**Pre-req to revisit:** confirm the SDK's JSONL format is stable across versions (currently no commitment).

---

## Bundle Node binary (so MCP servers work without a system Node install)

**Filed:** 2026-05-09

**Why now is wrong:** Adds ~80MB per platform to the package. We don't have an Apple Developer ID yet (signing all the bundled binaries is part of the notarization story), and we don't yet know which MCPs Binil-class users will actually want. Premature without a concrete user need or a code-signing pipeline.

**The win:** Users without Node installed (most non-engineers at the org) can still spawn MCP servers — Playwright, Puppeteer, the Anthropic-blessed ones, anything from `~/.claude/settings.json` `mcpServers`. Today they'd hit "command not found" the moment the agent tried `npx @playwright/mcp`.

**Design:**
- `scripts/download-node.mjs` runs in a `prebuild` step. Fetches the Node LTS tarball/zip from `nodejs.org/dist/` for the current `--platform` + `--arch`, extracts to `build/node/<platform>-<arch>/`, keeps only `bin/{node,npm,npx}` + `lib/node_modules/{npm,npx}`. Pin the version (`v22.x` LTS at filing time).
- `electron-builder.yml` adds `extraResources: [{ from: build/node/${platform}-${arch}, to: node }]`. Each per-platform build only ships its own binary — no cross-platform bloat.
- `src/main/index.ts` at startup prepends the bundled `bin/` to `process.env.PATH`. Anything spawned by the SDK (or its MCP servers) finds our `node` and `npx` first. ~5 lines.
- Sign the bundled binaries during notarization. `electron-builder` does this automatically when `mac.identity` / `CSC_LINK` is configured.

**What you'd feel:**
- Mac arm64 `.dmg` grows from ~150MB to ~220MB. One-time download cost; most users won't notice.
- First `npx @playwright/mcp` call still downloads the Playwright server to `~/.npm/_npx/` cache (couple seconds). Subsequent calls are instant. v1.5: pre-bundle the curated MCPs we ship with so even first-run is offline-fast.
- Updates: when there's a Node CVE, ship a new Portico release with the patched Node. Annoying but tractable.

**Alternative considered:** option 2 from the spike (bundle pre-installed MCP servers, skip `npx`). Better for a curated experience but locks users out of installing their own MCPs. Path: do option 1 first, layer option 2 on top in v1.5 once we know which MCPs to bless.

**Pre-req to revisit:** Apple Developer ID acquired (so we can sign + notarize the bundle including the embedded Node binaries) AND a concrete user request for an MCP that requires `npx`.

---

## Routines (scheduled local prompts)

**Filed:** 2026-05-09

**Why now is wrong:** Not blocking V1. Pairs better with the permission UI being battle-tested first — running prompts unattended needs trust in the screening + approval flow, which is brand new.

**The win:** "Run this prompt every weekday at 9am against this folder." Saved prompt + cron-ish schedule + folder. Each run becomes a normal Conversation in the sidebar so you can scroll back through the history. Natural use cases: daily commit review, weekly retro draft, end-of-day timesheet pre-fill.

**Design:**
- New `<userData>/portico/routines.json` (atomic write, same pattern as conversations/settings). Schema per routine: `{ id, name, description, prompt, cwd, schedule, permissionMode, lastRunAt, lastRunConversationId, enabled }`. Schedule is one of `manual | hourly | { type: 'daily', at: 'HH:MM' } | { type: 'weekdays', at } | { type: 'weekly', day, at }`.
- Scheduler in main: at app start, set timers per enabled routine. When a timer fires, call the existing `agent:query` handler with the routine's saved cwd + prompt + permission mode, generating a fresh conversationId tagged `routine:<id>`.
- New sidebar entry "Routines" → list view + create/edit form (matches Cowork's screenshot the user sent on 2026-05-09). Reuses the existing folder-picker, permission-mode picker, and trustProject toggle.
- Output: each run is a normal Conversation, visible in Recents with a small "↻ daily-code-review" badge. Click to read the result.
- Notifications: optional Electron `Notification` on completion ("Daily review · 3 risky patterns flagged"), click-to-open.
- Login-on-startup: `app.setLoginItemSettings({ openAtLogin: true })` — opt-in via Settings → Routines.

**What you'd feel:**
- Sidebar gains a Routines section (above Recents).
- Settings → Routines tab: "Open Portico when I log in" toggle.
- A new permission-mode default for routines: **strict ask + auto-screen** (since you're not watching). Or "auto-approve only Safe verdicts" using the existing Haiku screener — would need a small `permissionMode: 'autoApproveSafeOnly'` shim that auto-allows when screening returns SAFE and prompts otherwise.

**Honest caveats:**
- "Only runs while computer is awake" — true. macOS sleep kills the timer. For true cron behavior across sleep, need a server-side runner (out of scope until phone-control or v2).
- Timezone handling — store schedule in user-local time, recompute next-run on app start.

**Pre-req to revisit:** Permission UI used by ~5+ real users for ~2 weeks without surprises. Then we know "auto-approve safe verdicts" is trustworthy enough to run unattended.

---

## CI + auto-updates (electron-updater + GitHub Actions)

**Filed:** 2026-05-09

**Why now is wrong:** Mac auto-updates require code signing (Squirrel.Mac refuses unsigned). We don't have an Apple Developer ID yet, so this is gated on Phase 2 of [RELEASE.md](RELEASE.md). Until then, manual builds + manual distribution are fine for ≤10 internal testers.

**The win:** Tag a commit → CI builds + signs + uploads → users' apps notice the update on next launch and prompt to install. Removes the "DM the new .dmg to everyone" step.

**Design:**

1. Add `electron-updater` dep. ~20 lines in `src/main/index.ts`:
   ```ts
   import { autoUpdater } from 'electron-updater'
   autoUpdater.on('update-downloaded', () => {
     // Show a non-modal "Restart to apply update" prompt
   })
   app.whenReady().then(() => autoUpdater.checkForUpdatesAndNotify())
   ```

2. `electron-builder.yml` `publish` block (already commented out, ready to enable):
   ```yaml
   publish:
     provider: github
     owner: <your-github-username>
     repo: CCD
   ```

3. `.github/workflows/release.yml` — fires on `v*` tag push:
   - Mac matrix (arm64 + x64): runs on `macos-latest`, builds + signs + notarizes (env vars from GH secrets), uploads to the Release.
   - Windows: runs on `windows-latest`, builds + signs.
   - Linux: optional.

4. GitHub Secrets needed:
   - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
   - `CSC_LINK` (base64 of the .p12), `CSC_KEY_PASSWORD`
   - For Windows: same shape with the Windows cert.

5. `.github/workflows/ci.yml` — fires on PR: `npm run typecheck && npm test`. No build, no signing — fast feedback only.

**What you'd feel:**
- Tag → 5-10 min later artifacts are live on GitHub Releases.
- Users see a "Portico has an update" notification on next launch. Click → restart → done.
- Optional: separate alpha / beta / stable channels via `electron-updater`'s channel concept.

**Pre-req to revisit:**
1. Apple Developer ID + Authenticode cert (or internal Windows cert) acquired.
2. Phase 2 of [RELEASE.md](RELEASE.md) used at least once manually so we know signing actually works.
3. ≥3 active testers asking "when's the new build?" (the actual demand signal).

---

## Phone remote control (dream)

**Filed:** 2026-05-09

**Status:** Dream — would change the product shape. Real design doc required before any code.

**Why now is very wrong:** Multi-week build. Touches auth, transport, mobile UI, and (if done well) a hosted relay. Gets meaningful only after Routines (which is the forcing function for "the app does work without me watching anyway"). Anthropic may also ship something native that obviates parts of this — worth waiting to see.

**The vision:** Open Portico on your phone. See your conversations. Type a prompt. Watch the agent stream. Approve/deny tool calls from your pocket. Useful when you're away from your laptop but your laptop is running a long task ("how's that refactor going?") or you want to kick off a routine ad-hoc ("run the daily review now").

**Three architectural paths considered:**

- **A. LAN-only** (~1 week). WebSocket server in main; QR-code pairing; phone connects on same WiFi. Cheap, private, useless when off-network.
- **B. LAN + relay tunnel** (~3 weeks, the right answer). LAN first, fall back to a small relay (Cloudflare Worker / Vercel Function) when phone is off-network. End-to-end encrypted with the pairing-derived key — relay sees ciphertext only.
- **C. Move agent to cloud** (~quarter, the wrong answer). Kills Portico's local-files / local-MCP identity. Becomes a thin client over hosted infrastructure. That's what Anthropic's hosted Claude is.

**Recommended path: B.** Phone is a **PWA**, not a native app — single codebase, works on iOS Safari + Android Chrome, installable to home screen, no App Store. Auth via QR-code pairing. Long-lived session credential, revokable from Portico settings. UI is a stripped chat surface + permission prompts.

**Hard constraints:**
- The laptop must be awake. macOS sleep = no agent. Until we have a server-side execution path, "remote control" means "remote control of my laptop."
- Notarization story for the relay component (if self-hosted) — not Mac-related but still a real ops surface.
- Real privacy / threat model — what happens if the pairing token leaks? Relay credential rotation? Audit log of "what did my phone do while I was away?"

**Pre-req to revisit:**
1. Routines is shipped and used.
2. There's at least one concrete user (Binil-class) saying "I want to do X from my phone" with a real X.
3. Anthropic has not shipped a native equivalent in the meantime.

When all three are true, write a design doc before any code.

---
