# Manual Tests: In-App Updates

Covers the launch update prompt and the Updates screen (`/updates`).

Logic is unit-tested in `utils/__tests__/appVersion.test.ts` (`npx jest appVersion`).
Everything below needs a physical Android device — the install path cannot be
exercised off-phone.

## Prerequisites

- A device running **v20 or later**. v19 and earlier have no updater; the first
  updater-capable build has to be sideloaded by hand one last time.
- At least one release newer than the installed build published to
  `Ianshaw93/fd-mobile-releases` (tag `vN` where N is the APK's `versionCode`).
- Signed with the same keystore as v17+ (`android/SIGNING.md`) — a mismatched
  signature makes Android reject the update with no useful message.

## Launch prompt

- [ ] Open the app on a build older than the latest release → "Update available"
      modal appears over the home screen, naming the new tag and the installed one
- [ ] Tap **Later** → modal closes, app usable
- [ ] Force-close and reopen → prompt does **not** reappear for that same version
- [ ] Publish a newer release, reopen → prompt appears again for the new tag
- [ ] Open the app when already on the latest release → no prompt
- [ ] Tap **Update** → progress bar advances, then the Android installer opens
- [ ] Complete the install → app relaunches on the new version; the Updates screen
      shows the new tag as "Installed"
- [ ] Tap **See all versions** → navigates to `/updates`, prompt closes
- [ ] Later/Update are briefly disabled (~0.4 s) when the prompt appears — a tap
      already in flight can't land on Later and silence the release
- [ ] Open a PDF picker dialog before the prompt appears (slow connection helps)
      → the prompt stays **underneath** the dialog; it's usable after closing it

## Updates screen

- [ ] "Updates" link on the home screen opens `/updates`
- [ ] Installed version card shows the running versionName
- [ ] Releases listed newest first, with date and download size
- [ ] The running version is badged **Installed** and has no Install button
- [ ] Newer releases are badged **Newer** with a blue **Install** button
- [ ] Older releases are badged **Older** with a grey **Go back to this version** button
- [ ] **Refresh** re-fetches and updates the list
- [ ] **Back** returns to the home screen

## Install permission (Android 8+)

- [ ] With "Install unknown apps" **off** for Site Right, tap Update → amber panel
      explains the permission is needed
- [ ] Tap **Open permission settings** → Android's "Install unknown apps" screen
      for Site Right opens
- [ ] Grant it, return to the app, tap Update again → installer opens

## Downgrade guard

Android refuses to install a lower `versionCode` over a higher one
(`INSTALL_FAILED_VERSION_DOWNGRADE`). Going back requires uninstalling first, and
uninstalling wipes app-private storage — the whole SQLite database, every project,
pin and photo not yet pushed.

- [ ] Tap **Go back to this version** on an older release → red warning appears
      naming the tag and stating that uninstalling deletes unsynced local data
- [ ] Tap **Cancel** → warning closes, nothing downloads
- [ ] Tap **Download anyway** → APK downloads and the installer opens
- [ ] Without uninstalling first, the installer fails → confirm the failure is
      Android's own, and that app data is still intact afterwards
- [ ] Push a project to the server, uninstall, install the older APK, pull →
      project comes back (this is the documented safe route)

## Offline / failure handling

- [ ] Aeroplane mode, cold start → no prompt, no error, app opens normally
- [ ] Aeroplane mode, open `/updates` → amber "showing the last known version list"
      banner, previously-fetched releases still listed
- [ ] Aeroplane mode with no prior fetch → "No releases found" with a link out
- [ ] Kill the connection mid-download → red error panel with
      **Download in browser instead**, which opens the release in the browser
- [ ] Cancel a download by backgrounding the app → reopening leaves the app usable

## Cache hygiene

- [ ] After two updates, only one `.apk` remains in the app cache under `updates/`
      (~15 MB each; stale ones are deleted before each download)

## Notes

- The releases repo is **public**, so the GitHub API is called anonymously — no
  token ships in the APK. Unauthenticated API limit is 60 requests/hour per IP;
  the launch check is throttled to once every 6 hours per device.
- Release tags must stay `vN` matching `versionCode`, or releases are skipped
  rather than shown as uninstallable rows.
- v16 and v17 are the same binary (identical SHA-256), so v17 reports itself as
  versionCode 16. Harmless — neither is the latest.
