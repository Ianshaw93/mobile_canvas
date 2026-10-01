# Native recovery tests

`live-recovery.js` drives the normal Push button in a debug Android WebView on
`emulator-5554`. It supports an isolated server/storage fixture for CI and an
explicitly enabled production canary. Install the candidate debug APK first;
the runner tests that installed runtime using native SQLite, files and Preferences.

The Android E2E release gate runs the isolated mode after the normal native tests:

```powershell
$env:E2E_RECOVERY_OFFLINE='1'
$env:E2E_OUT='e2e-out/recovery'
node tests/e2e/live-recovery.js
```

This mode intercepts every app API/storage request and never calls production.
It verifies missing links, lost acknowledgements, process restart, original
bytes, actual PUT counts, repeat Push, comment identity and portrait page width.
Run it only on a disposable emulator test installation.

The only permitted server write target is TEST SYNC
`3b95bd12-9e13-4187-8c13-a0ca86d7455c`. Native SQLite fixture setup is restricted
to the emulator. Never use this fixture runner on a phone or a populated personal
app installation. The production original is read only and compared before/after.

The test creates one labelled synthetic floor, pin and comment. Three synthetic
photos exercise a missing link and a saved link whose acknowledgement is lost.
Recovery is driven through normal Push after killing and restarting the app.
Checks include persisted native checkpoints, file hashes, comment identity,
repeat Push and exact preservation of existing test floors/pins/attachments.

For a fresh emulator test app database, with its debug APK already installed:

```powershell
$env:PATH="$env:LOCALAPPDATA/Android/Sdk/platform-tools;$env:PATH"
$env:ANDROID_SERIAL='emulator-5554'
$env:E2E_RECOVERY_OFFLINE=''
$env:LIVE_RECOVERY_CANARY='3b95bd12-9e13-4187-8c13-a0ca86d7455c'
node tests/e2e/live-recovery.js
```

The main test measures actual PUT requests and portrait width. An optional
additional phase adds a fourth synthetic photo and measures actual PUT requests:
one initial upload, zero PUTs during repair after native restart, and zero PUTs
on repeated Push. It also checks portrait page width.

```powershell
$env:LIVE_RECOVERY_BYTES_ONLY='1'
node tests/e2e/live-recovery.js
```

The saved manifest allows interrupted attempts to reuse the same canary IDs.
A completed canary is retained on TEST SYNC as evidence; it is not automatically
deleted or reset. To repeat the full initial fault scenario, use a fresh emulator
fixture database and a fresh `E2E_OUT` directory. Keep previous output directories
for evidence. Do not rerun the initial fault scenario against completed IDs.

Snapshots, screenshots and request summaries are written under the ignored
`prototypes/upload-recovery/data/local-live-recovery` directory by default.
`results.json`, `byte-results.json` and `summary.json` record the October 1 run.
Signed storage URLs are not written to request logs.

Production mode is an opt-in local test; CI uses the isolated fixture. Both inject faults at
the WebView request boundary; it does not establish behavior during OS radio
loss, screen locking or native background scheduling.
