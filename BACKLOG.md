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
