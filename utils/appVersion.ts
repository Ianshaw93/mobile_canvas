/**
 * Version arithmetic for the in-app updater.
 *
 * Site Right is sideloaded, not on Play, so updates come from GitHub Releases
 * on `Ianshaw93/fd-mobile-releases` (public — no token needed). The release
 * tag `vN` is the Android `versionCode` of the APK attached to it, and the
 * running app reports its own versionCode as `App.getInfo().build`. Every
 * question the update UI asks reduces to comparing those two integers.
 *
 * Kept pure and free of Capacitor imports so it can be unit-tested off-device
 * (see CLAUDE.md — the app itself can't be fully tested without a phone).
 */

export interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

export interface GithubRelease {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  assets?: GithubReleaseAsset[];
}

/** A release we know how to install: parseable tag, with an APK attached. */
export interface AppRelease {
  tag: string;
  versionCode: number;
  title: string;
  notes: string;
  publishedAt: string | null;
  apkUrl: string;
  apkSize: number | null;
}

export type ReleaseStatus = 'current' | 'newer' | 'older' | 'unknown';

/**
 * `v19` -> 19. Returns null for anything that isn't exactly `vN` (or bare `N`).
 *
 * Strict on purpose: the tag IS the versionCode, and a tag we'd have to
 * approximate (`v20.1`, `19-hotfix`) is one the updater can't round-trip —
 * offering it would either misclassify it as already installed or leave
 * devices re-prompting forever. Skipping it is the safe failure.
 */
export function parseVersionTag(tag: string): number | null {
  if (typeof tag !== 'string') return null;
  const match = tag.trim().match(/^v?(\d+)$/i);
  if (!match) return null;
  const code = parseInt(match[1], 10);
  return Number.isFinite(code) ? code : null;
}

/** `App.getInfo().build` is a string on both platforms; web reports nothing useful. */
export function parseVersionCode(build: string | undefined | null): number | null {
  if (build === undefined || build === null) return null;
  const code = parseInt(String(build).trim(), 10);
  return Number.isFinite(code) ? code : null;
}

/**
 * The CI workflow always uploads `app-release.apk`, but v16/v17 were published
 * by hand — fall back to any `.apk` rather than showing the user a release
 * they can't install.
 */
export function findApkAsset(release: GithubRelease): GithubReleaseAsset | null {
  const assets = release?.assets;
  if (!Array.isArray(assets)) return null;
  const apks = assets.filter((a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk'));
  if (apks.length === 0) return null;
  return apks.find((a) => a.name.toLowerCase() === 'app-release.apk') ?? apks[0];
}

/**
 * Turn the GitHub API payload into the installable releases, newest first.
 * Anything we can't offer — draft, prerelease, unversioned tag, no APK — is
 * dropped rather than rendered as a dead button.
 */
export function normalizeReleases(raw: GithubRelease[]): AppRelease[] {
  if (!Array.isArray(raw)) return [];

  const releases: AppRelease[] = [];
  for (const item of raw) {
    if (!item || item.draft || item.prerelease) continue;
    const versionCode = parseVersionTag(item.tag_name);
    if (versionCode === null) continue;
    const asset = findApkAsset(item);
    if (!asset?.browser_download_url) continue;

    releases.push({
      tag: item.tag_name.trim(),
      versionCode,
      title: item.name?.trim() || item.tag_name.trim(),
      notes: item.body?.trim() || '',
      publishedAt: item.published_at ?? null,
      apkUrl: asset.browser_download_url,
      apkSize: typeof asset.size === 'number' ? asset.size : null,
    });
  }

  return releases.sort((a, b) => b.versionCode - a.versionCode);
}

export function selectLatestRelease(releases: AppRelease[]): AppRelease | null {
  if (!Array.isArray(releases) || releases.length === 0) return null;
  return releases.reduce((best, r) => (r.versionCode > best.versionCode ? r : best));
}

export function classifyRelease(release: AppRelease, currentCode: number | null): ReleaseStatus {
  if (currentCode === null) return 'unknown';
  if (release.versionCode === currentCode) return 'current';
  return release.versionCode > currentCode ? 'newer' : 'older';
}

/**
 * True when installing this release would move the device *backwards*.
 *
 * Android refuses it outright (INSTALL_FAILED_VERSION_DOWNGRADE); the only way
 * back is to uninstall first, and uninstalling wipes app-private storage —
 * which is where the SQLite database lives. Every unsynced site visit, pin and
 * photo on that phone goes with it. The UI must say so before offering the
 * download.
 */
export function isDowngrade(releaseCode: number, currentCode: number | null): boolean {
  if (currentCode === null) return false;
  return releaseCode < currentCode;
}

/**
 * What tapping a release row is allowed to do. One function decides, so the
 * launch prompt and the Updates screen cannot diverge.
 *
 * - `in-app`: download to cache and hand to the Android package installer.
 * - `browser`: open the APK URL in the browser instead. Used for downgrades:
 *   Android refuses an in-app downgrade (INSTALL_FAILED_VERSION_DOWNGRADE),
 *   and the only way back — uninstall first — wipes the app-private cache the
 *   in-app download would sit in. A browser download lands in public
 *   Downloads and survives the uninstall.
 * - `none`: no action. The installed version, and everything on web, where
 *   there is no installer to hand an APK to.
 */
export type InstallRoute = 'in-app' | 'browser' | 'none';

export function resolveInstallRoute({
  release,
  currentCode,
  isNative,
}: {
  release: AppRelease;
  currentCode: number | null;
  isNative: boolean;
}): InstallRoute {
  if (!isNative) return 'none';
  const status = classifyRelease(release, currentCode);
  if (status === 'current') return 'none';
  if (isDowngrade(release.versionCode, currentCode)) return 'browser';
  return 'in-app';
}

/** Download sizes for the update UI. ~15 MB APKs over a site connection. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return 'unknown size';
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export interface PromptInput {
  releases: AppRelease[];
  currentCode: number | null;
  /** Tag the user last tapped "Later" on, from Preferences. */
  dismissedTag?: string | null;
}

/**
 * The release to prompt for on launch, or null to stay quiet.
 *
 * Declining is remembered per-tag, so "Later" silences that version for good
 * but a genuinely new release still gets one prompt. Anything else the user
 * wants is on the Updates screen.
 */
export function shouldPromptForUpdate({
  releases,
  currentCode,
  dismissedTag = null,
}: PromptInput): AppRelease | null {
  if (currentCode === null) return null;
  const latest = selectLatestRelease(releases);
  if (!latest) return null;
  if (latest.versionCode <= currentCode) return null;
  if (dismissedTag && latest.tag === dismissedTag) return null;
  return latest;
}
