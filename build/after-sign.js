// macOS 14+ refuses to load Frameworks whose code signature has a different
// TeamID from the parent app. With ad-hoc signing (we have no Apple Developer
// ID yet), electron-builder signs the outer .app but the bundled
// Electron Framework retains its own ad-hoc signature, so dyld bails with:
//   "Library not loaded: @rpath/Electron Framework.framework/Electron Framework"
//   "(non-platform) have different Team IDs"
//
// Fix: after electron-builder's sign pass, run `codesign --force --deep --sign -`
// once over the entire .app so every nested binary shares one ad-hoc identity.
// This hook fires before .dmg/.zip targets are built, so the packaged artifacts
// pick up the consistent signature.
//
// When we have a real Apple Developer ID (Phase 2 of RELEASE.md), electron-builder
// signs each component with the same identity natively and this hook is a no-op
// but harmless — `codesign --force` on already-consistent signatures just rewrites
// them with the same identity.

const { execFileSync } = require('child_process')

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  console.log(`[after-sign] re-signing ${appPath} deeply with ad-hoc identity`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  console.log('[after-sign] done')
}
