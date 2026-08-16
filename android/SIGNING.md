# APK Signing — where everything lives

**Never commit a keystore to this repo.** This file is the map, not the key.

## The release keystore

- **Local (Ian's main machine):** `C:\Users\IanShaw\keystores\mobile_canvas\mobile_canvas_key.jks`
  (plus `mobile_canvas_key.jks.b64`, the base64 copy used for the GitHub secret, and
  `old-laptop-debug.keystore`, an unrelated debug key kept only for reference).
- **GitHub Actions:** stored as repo secrets on `Ianshaw93/mobile_canvas` —
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`. Passwords are in the secrets, not in this repo.
- Format PKCS12, key alias `key0`. Certificate: `CN=Ian Shaw`, created 2024-09-11,
  SHA-256 `e3a27f97ffdfab4d8ff5d58fdf48bc8d2a4b874166d9d1354737e559908e1e24`.

Every released APK (v16, v17, v18) is signed with this exact certificate. An APK
signed with any other key will NOT install as an update on the team's phones —
they'd have to uninstall first. So: never regenerate the keystore casually; verify a
candidate keystore's cert fingerprint against the value above before using it.

## How releases are built

No local Android tooling is needed. GitHub Actions does everything:
`.github/workflows/build-apk.yml`, dispatched on the **`cloud`** branch
(the copy of the workflow on `main` exists only so GitHub registers the button).

1. Bump `versionCode` / `versionName` in `android/app/build.gradle` (versionCode
   must increase; v18 = 18).
2. Actions → "Build APK" → branch `cloud`. Optional `release_tag` input (e.g. `v19`)
   publishes the signed APK to `Ianshaw93/fd-mobile-releases` — requires the
   `RELEASE_REPO_TOKEN` secret (PAT with release write on fd-mobile-releases); until
   that's set, download the `site-right-apk` artifact and `gh release create` manually.
3. Before distributing, verify the built APK's signing cert SHA-256 matches the
   fingerprint above (any APK inspection tool; the cert is `META-INF/KEY0.RSA`).
