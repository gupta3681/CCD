# Backlog

Things we've decided are worth doing but aren't doing now. Add entries with date + a one-line "why later." When you pull one in, delete the entry (git history keeps it).

---

## Refactor: prompt assembler + turn hooks

**Filed:** 2026-05-09

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
  agent/
    promptAssembler.ts      # buildSystemPrompt, buildUserPrompt, buildOptions
    hooks.ts                # registry + dispatch + types
    turnContext.ts          # TurnContext type + builder
    runner.ts               # the actual query() loop, ~50 lines
  index.ts                  # IPC plumbing only — delegates to agent/runner
```

**Migration plan:**
1. Extract `promptAssembler.ts` first — no behavior change, just move the system-prompt builder. Add unit tests for each branch (preset / plain / override / interrupt-prepend).
2. Add `hooks.ts` with registration API + empty hook points. Wire dispatch into the existing `agent:query` handler at the four points above; existing inline logic becomes the first registered hook for each point. Behavior identical, code unchanged in net effect.
3. Replace the inline session-allowlist check with a registered `preToolUse` hook. Replace the inline interrupt-prepend with a `preTurn` hook. Replace the inline conversations.save / refreshList with a `postTurn` hook chain.
4. Move the runner loop into `runner.ts`. `index.ts` shrinks to pure IPC dispatch.

**What you'd feel:**
- `agent:query` IPC handler drops from ~150 lines to ~25.
- New tests: `promptAssembler.test.ts` (pure, fast), `hooks.test.ts` (registry semantics, error isolation, ordering).
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
