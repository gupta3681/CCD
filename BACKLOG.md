# Backlog

Things we've decided are worth doing but aren't doing now. Add entries with date + a one-line "why later." When you pull one in, delete the entry (git history keeps it).

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
