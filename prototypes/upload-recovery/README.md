# Photo recovery behavioral prototype

## Live database test (October 1)

The current preview uses `server.py --live-test`. It reads the real `TEST SYNC 181 IMAGES - 0706 - Millstone Court PAS9980` project, ID `3b95bd12-9e13-4187-8c13-a0ca86d7455c`. Its current baseline is 190 photos, ten plans and 139 pins. Two additional sample-photo copies are queued locally and clearly labelled TEST ONLY. They are transport tests, not recovered survey evidence. No existing photos are removed to create this gap.

The user performs uploads with Retry this photo or Retry remaining photos in the mobile app. Each push contains one attachment, empty project/plan/pin/comment lists, and an existing test pin ID. Files use the test project's storage prefix. Stable attachment IDs and persisted file checkpoints support retry after a lost upload or link response. The original Millstone project is never a permitted write target. Automatic live retries, arbitrary photo additions, reset and deletion are disabled. Full-project Push/Pull stays disabled.

Start with `./prototypes/upload-recovery/start-mobile.ps1 -LiveTest` (add `-Build` after changes). The launcher reuses an existing server; stop the existing port 3112 server before switching between local and live modes. Browser assets stay local, while the Python service makes the allowlisted remote API requests. `data/live-test-before.json` and `data/live-original-before.json` record the live baselines; `data/live-test-last-push.json` records the last attachment payload after a user initiates a push. These files are ignored by Git.

Fault tests: `../../../MobileAppBackend/.venv/Scripts/python.exe -m unittest test_live_recovery -v` from this directory. These use a fake storage/API and never send remote writes. Actual live PUT and attachment insertion are left for the user to exercise. Native background scheduling and automatic renewal of expired upload URLs remain unimplemented.

## Actual mobile app in the browser

Run `./prototypes/upload-recovery/start-mobile.ps1` from `mobile_canvas` (add `-Build` after source changes). Open http://127.0.0.1:3113. This runs the real mobile app and imports the ten actual PDFs, 139 pins and 190 photos into its browser SQLite/IndexedDB on this separate origin. Open the photo-status button in the normal sync area. Recovery lives inside the mobile app as a native React/Tailwind panel, not an iframe.

The opt-in `NEXT_PUBLIC_UPLOAD_RECOVERY_PROTOTYPE=1` build uses `.next-recovery`, leaving the existing `.next` build alone. Its API base points to loopback; full-project push/pull is disabled; CSP blocks non-local browser requests. Normal builds do not load the fixture or render the panel. All recovery writes remain in the isolated local queue. Native scheduling is still a separate device implementation step.

The remaining sections describe the initial standalone behavioral harness on port 3112, which also supplies the local data service for the mobile build.

Run from `mobile_canvas`:

```powershell
../MobileAppBackend/.venv/Scripts/python.exe prototypes/upload-recovery/server.py
```

Open http://127.0.0.1:3112. The server binds only to loopback.

This exercises individual photo tracking, multi-photo pins, repair without retransmission, repeat-safe local linking, persistent SQLite checkpoints, selected-photo upload, offline/automatic retry and lost acknowledgements. It uses actual Millstone project metadata and photos captured on September 30, 2026. It replays the difference between the 181-photo and 190-photo snapshots: nine unfinished photos on eight pins, across five plans. These expected images are reconstructed from the later snapshot for testing; historical completeness was not recorded by the old app. Pin 2F/36 remains a check-needed case, not a proven missing image.

Only `data/prototype.sqlite` and `data/media` are changed. These are ignored by Git. No production database credentials or connection exist in the running server, and its browser CSP permits only same-origin requests. Source snapshots are read, never modified. Existing metadata is not resent when recovering images.

Optional one-time media import: `../MobileAppBackend/.venv/Scripts/python.exe prototypes/upload-recovery/import_media.py`. This separate script performs only GET requests to download the nine additional saved-snapshot images. It never sends POST, PUT, PATCH or DELETE. Run before starting the server on first use.

Try:

1. See confirmed and pending images together on a multi-photo pin.
2. Select “Lose upload response once” on a queued image and retry. Retry again: the stored photo is checked, and bytes sent stay unchanged.
3. Select “Lose save response once”, retry twice and inspect saved state: same image ID, one link.
4. Turn connection off and enable automatic retry. Turn it back on and watch remaining items finish.
5. Reload or restart the server: checkpoints remain.
6. Open Pins with no photos, choose a photo for 2F pin 36, preview it, queue it and retry.
7. Replay original gap to reset this local copy only.

This is a functional web prototype, not the production sync engine. Browser/OS native background transfers are not implemented here; the local server's worker models a durable queue independently of the browser. Transfer and linking stages are simulated against local files and SQLite. The next implementation step is to connect the validated state model to compatible backend endpoints and native workers, with per-file acknowledgements, real storage verification, version/deletion checks and device validation.

Decision to validate: Does per-image status plus targeted recovery let users understand and finish incomplete uploads while keeping their existing projects intact?
