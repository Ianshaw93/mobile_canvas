# Android emulator e2e

`tests/e2e/android.js` runs the real APK on an Android emulator and drives it
over Chrome DevTools on the WebView. It exists because the browser e2e
(`tests/e2e/replace-pdf.js`) only ever takes the `Capacitor.getPlatform() === 'web'`
branches - jeep-sqlite, IndexedDB, localStorage - so native SQLite migrations,
`@capacitor/filesystem` storage and `Preferences` are untested until someone
sideloads a phone.

## Where it runs

- **GitHub Actions**: `.github/workflows/android-e2e.yml` (Actions → "Android E2E"
  → Run workflow). Also runs on PRs that touch app code, and is called by
  "Build APK" as a gate whenever a `release_tag` is given (`skip_e2e` bypasses
  it). Screenshots and a logcat dump are uploaded as the `android-e2e` artifact.
- **Locally**, if a machine ever has the SDK: boot an AVD or plug in a device
  with USB debugging, build `cd android && ./gradlew assembleDebug`, then
  `npm run test:e2e:android`. Needs `adb` on PATH; Playwright is used only as a
  CDP client, no browser download.

## What it checks

1. Debug APK installs; `Capacitor.getPlatform()` is `android`; the native
   `CapacitorSQLite` plugin is registered.
2. Create a project, import a generated A4 PDF through the app's own upload
   input, name the plan, and see the thumbnail render from native storage.
3. Double-click three pins onto the plan canvas.
4. `am force-stop` the app, relaunch, reconnect: project, pins (same positions)
   and thumbnail all come back - i.e. native SQLite + Filesystem persistence.
5. No unexpected WebView console errors.

## Why a debug APK

Capacitor turns WebView remote debugging on only for debuggable builds
(`CapConfig` reads `FLAG_DEBUGGABLE`). The release APK is built and signed
separately by "Build APK"; the e2e runs against a debug build of the same
commit.

## Emulator details

API 34 `google_apis` x86_64 (WebView Chrome/113), `pixel_c` tablet profile. The
script asks for landscape but the headless emulator has stayed portrait
(900x1200 CSS px); pins are placed inside whatever part of the canvas is on
screen, so either orientation works. The AVD is cached between runs; the
first passing run took 7.5 min end to end (debug build 2 min, AVD 1.5 min,
test 2 min).

## What it has already caught

Both were invisible on web and on a phone (React recovers; nothing is logged
where anyone looks):

- `pages/_app.tsx` rendered `<jeep-sqlite>` whenever the platform was `web` -
  true at static-export time, false in the Android client - so every native
  launch hydrated against mismatched HTML (React #418/#423). Now mount-gated.
- After a WebView reload the native SQLite plugin still held the connection
  while the JS map was empty, so `createConnection` threw "already exists"
  and the store never initialised. `database.ts` now calls
  `checkConnectionsConsistency()` first.

## Not covered (still on the manual checklists)

Camera capture, the native file picker for project import, Share/export
intents, Dropbox sync, and the updater's install step - see `MANUAL_TESTS_*.md`.
Next candidates for this harness: an APK upgrade run (`adb install` an old
release from `apks/old`, seed data, `adb install -r` the new build, assert the
migration) and the multi-visit flows in `PinPopup`, which are native-only.
