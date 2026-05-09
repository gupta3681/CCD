# Portico

> Portkey-compliant desktop GUI for the Claude Agent SDK. **Powered by Claude.** Mac + Windows. Single-developer V1.

The product is named *Portico*. The repo dir name (`CCD`) is internal and unchanged. See `ReferenceDesign.md` for the visual style system (Anthropic "Vellum"); the office-hours design doc lives at `~/.gstack/projects/CCD/aryan-main-design-*.md`.

## V1 scope

- Electron shell + React renderer.
- Claude Agent SDK runs in the main process.
- Portkey configured via env vars (`ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY`).
- One chat surface with multi-turn memory (session resume).
- **Read-only toolset** — Read / Glob / Grep / WebSearch / WebFetch / TodoWrite / AskUserQuestion. No Write, no Edit, no Bash. The permission-prompt UI lands in v1.1 and unlocks the rest.

## Setup

```bash
cp .env.example .env
# Edit .env with your gateway URL + key
npm install
npm run dev
```

The header shows the gateway and a green/red dot for whether a key was found. "New chat" in the header resets the session.

## Build

```bash
npm run build:mac     # signed .dmg (notarization off until cert procured)
npm run build:win     # .exe installer
```

Code signing is required before any internal distribution.

## Layout

```
src/
  main/index.ts       # Electron main + IPC handlers + Agent SDK calls + session map
  preload/index.ts    # contextBridge: window.api.{query, onMessage, resetConversation, …}
  renderer/src/
    App.tsx           # Chat UI
    main.tsx          # React mount
    assets/main.css   # Tailwind v4 + Vellum theme tokens
```
