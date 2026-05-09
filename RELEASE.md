# Releasing Portico

Three phases, in the order we'll evolve through them. **You are at Phase 1.**

---

## Phase 1 — Manual release (today, no certs needed)

For internal testing with 1-10 trusted people. Unsigned build; testers
right-click → Open the first time on Mac, click "More info → Run anyway"
on Windows.

```bash
# 1. Make sure tests + types pass
npm run typecheck
npm test

# 2. Bump the version in package.json (manually edit, or:)
npm version 0.1.0 --no-git-tag-version

# 3. Update CHANGELOG.md if needed (one section per release)

# 4. Commit + tag
git add -A
git commit -m "Release v0.1.0"
git tag v0.1.0

# 5. Build for your platform (Mac arm64 here; for Intel use --x64)
npm run build:mac
# or:  npm run build:win

# 6. Output is in dist/
ls dist/*.dmg     # → portico-0.1.0.dmg

# 7. Distribute
# - Drop in a shared folder
# - Or attach to a Slack message
# - Tell testers: right-click → Open the first time
```

### What testers see (Mac, unsigned)

> "Portico" can't be opened because Apple cannot check it for malicious
> software.

**Workaround:** right-click the app → Open → Open in the dialog. **Mac
remembers afterward.** First-launch only.

### What testers see (Windows, unsigned)

> Microsoft Defender SmartScreen prevented an unrecognized app from
> starting.

**Workaround:** "More info" → "Run anyway." Once per machine.

### Limitations

- **No auto-updates.** When v0.2 ships, you DM the new build.
- **No telemetry / crash reports.** If a tester hits an error, you only
  hear about it if they tell you.

---

## Phase 2 — Signed releases (when you have certs)

You need:
- **Apple Developer ID** ($99/year individual; expense it).
- **Windows code-signing cert** — either an Authenticode cert ($200+/year)
  OR your IT's internal cert (free if Intune is set up with one).

### One-time setup

1. Get the Apple Developer ID.
2. In your Apple ID account settings, generate an
   **app-specific password** for `electron-builder`.
3. Find your **Team ID** (10-char string) at
   https://developer.apple.com/account → Membership.
4. Export the certs to a `.p12` and put them somewhere safe.

### Building signed locally

```bash
# Mac
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCD1234EF
export CSC_LINK=/path/to/your-cert.p12
export CSC_KEY_PASSWORD=your-cert-password
npm run build:mac
# electron-builder signs + notarizes automatically.

# Windows
export CSC_LINK=/path/to/win-cert.p12
export CSC_KEY_PASSWORD=your-win-cert-password
npm run build:win
```

### Updates to `electron-builder.yml`

When you have certs, change:

```yaml
mac:
  notarize: true   # was: false
publish:
  provider: github
  owner: <your-github-username>
  repo: CCD
```

Then `electron-builder` can upload artifacts to a GitHub Release with
`--publish always`.

### What testers see (signed)

`.dmg` opens cleanly. Windows installer runs without SmartScreen friction
(EV cert) or after some installs build reputation (standard cert).

---

## Phase 3 — CI + auto-updates (when you have signing + want it hands-off)

Filed in [BACKLOG.md](BACKLOG.md) as a future item. Sketch:

- Add `electron-updater` dependency.
- ~20 lines in `src/main/index.ts`:
  ```ts
  import { autoUpdater } from 'electron-updater'
  app.whenReady().then(() => autoUpdater.checkForUpdatesAndNotify())
  ```
- GitHub Actions workflow on tag push:
  - Mac runner builds + signs + notarizes.
  - Windows runner builds + signs.
  - Both upload to the GitHub Release.
- Users' apps check for updates on launch and prompt to install.

**Mac auto-updates require code signing.** Squirrel.Mac (the underlying
updater) refuses unsigned packages. So Phase 3 strictly comes after
Phase 2.

---

## Versioning

- Pre-1.0: bump minor for features (0.1.0 → 0.2.0), patch for fixes
  (0.1.0 → 0.1.1).
- 1.0 ships when: signed, auto-updating, deployed to ≥3 internal users
  for ≥4 weeks without a critical bug.

## Quick checklist for any release

- [ ] `npm run typecheck` green
- [ ] `npm test` green
- [ ] `package.json` version bumped
- [ ] `CHANGELOG.md` updated
- [ ] Tag (`git tag v0.X.Y`)
- [ ] Build (`npm run build:mac` / `:win`)
- [ ] Smoke test: open the built `.dmg`/`.exe`, send a message, check streaming + Stop + Settings + persona wizard
- [ ] Distribute (Phase 1: manual / Phase 2: GitHub Release / Phase 3: auto)
