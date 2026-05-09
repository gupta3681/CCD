# Claude Code Desktop (CCD)

Portkey-compliant GUI for the Claude Agent SDK. Mac + Windows desktop app. Single-developer V1.

See `ReferenceDesign.md` for the visual style system (Anthropic "Vellum") and the office-hours design doc at `~/.gstack/projects/CCD/aryan-main-design-*.md` for product context.

## V1 scope

- Electron shell + React renderer.
- Claude Agent SDK runs in the main process.
- Portkey is configured via env vars (`ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY`).
- One chat surface. No pre-baked workflows yet — those land in v1.5 (timesheet first, per the design doc).

## Setup

```bash
cp .env.example .env
# Edit .env with your Portkey gateway URL and virtual key
npm install
npm run dev
```

The header in the app shows which gateway the SDK is pointed at and whether a key is configured.

## Build

```bash
npm run build:mac     # signed .dmg (notarization off until cert procured)
npm run build:win     # .exe installer
```

Code signing is required before internal distribution — see "Distribution Plan" in the design doc.

## Layout

```
src/
  main/index.ts       # Electron main + IPC handlers + Agent SDK calls
  preload/index.ts    # contextBridge: window.api.{query, onMessage, …}
  renderer/src/
    App.tsx           # Chat UI
    main.tsx          # React mount
    assets/main.css   # Tailwind v4 + Vellum theme tokens
```
