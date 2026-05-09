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
