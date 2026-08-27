/**
 * In-app updates for Site Right.
 *
 * The app is sideloaded from GitHub Releases on `Ianshaw93/fd-mobile-releases`
 * (a public repo, so the API needs no token and no secret ships in the APK),
 * not distributed through Play. This service checks that repo for a newer
 * release, downloads the APK into the app cache, and hands it to the Android
 * package installer via the ApkInstaller plugin.
 *
 * All version comparison lives in `utils/appVersion.ts` and is unit-tested;
 * this file is the I/O around it.
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { ApkInstaller } from '@/src/plugins/ApkInstaller';
import {
  AppRelease,
  GithubRelease,
  normalizeReleases,
  parseVersionCode,
  shouldPromptForUpdate,
} from '@/utils/appVersion';

const RELEASES_API =
  'https://api.github.com/repos/Ianshaw93/fd-mobile-releases/releases?per_page=30';
const RELEASES_PAGE = 'https://github.com/Ianshaw93/fd-mobile-releases/releases';

const DISMISSED_TAG_KEY = 'update_dismissed_tag';
const LAST_CHECK_KEY = 'update_last_check_at';
const CACHED_RELEASES_KEY = 'update_cached_releases';

/** Don't hit the API on every single launch — engineers open this app a lot. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT_MS = 12000;
const APK_CACHE_DIR = 'updates';

/**
 * A cache this fresh is served without hitting GitHub at all. The API is
 * called anonymously (60 requests/hour/IP, shared behind site NAT), and the
 * common prompt → Updates-screen hop otherwise refetches the identical
 * payload seconds after the launch check cached it.
 */
export const RELEASE_CACHE_FRESH_MS = 5 * 60 * 1000; // 5 minutes

/**
 * The offline fallback's staleness bound. Deleting a release from GitHub is
 * the bad-release remediation; a cache older than this must stop offering it
 * rather than presenting a dead download URL forever.
 */
export const RELEASE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CurrentVersion {
  /** versionName, e.g. "v19". Display only. */
  name: string;
  /** versionCode, e.g. 19. This is what Android compares. */
  code: number | null;
}

export interface DownloadProgress {
  bytes: number;
  contentLength: number;
  percent: number | null;
}

export class UpdatePermissionRequired extends Error {
  constructor() {
    super('PERMISSION_REQUIRED');
    this.name = 'UpdatePermissionRequired';
    // Compiling `extends Error` to ES5 breaks the prototype chain, which
    // silently turns every `instanceof UpdatePermissionRequired` check false.
    Object.setPrototypeOf(this, UpdatePermissionRequired.prototype);
  }
}

/** Current build, straight from the platform. Never guessed. */
export async function getCurrentVersion(): Promise<CurrentVersion> {
  if (!Capacitor.isNativePlatform()) {
    return { name: 'web', code: null };
  }
  try {
    const info = await App.getInfo();
    return { name: info.version || 'unknown', code: parseVersionCode(info.build) };
  } catch (error) {
    console.warn('[UpdateService] Could not read app info', error);
    return { name: 'unknown', code: null };
  }
}

async function fetchReleasesFromGithub(): Promise<AppRelease[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub releases API returned ${response.status}`);
    }
    const raw = (await response.json()) as GithubRelease[];
    return normalizeReleases(raw);
  } finally {
    clearTimeout(timer);
  }
}

interface ReleaseCacheEntry {
  savedAt: number;
  releases: AppRelease[];
}

async function readReleaseCache(): Promise<ReleaseCacheEntry | null> {
  try {
    const { value } = await Preferences.get({ key: CACHED_RELEASES_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value);
    // The pre-TTL format was a bare array with no timestamp; its age cannot
    // be bounded, so it is treated as absent rather than served forever.
    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      !Number.isFinite(parsed.savedAt) ||
      !Array.isArray(parsed.releases)
    ) {
      return null;
    }
    return parsed as ReleaseCacheEntry;
  } catch {
    return null;
  }
}

export interface ReleasesResult {
  releases: AppRelease[];
  fromCache: boolean;
  /** When the served list was actually fetched from GitHub, for "as of" UI. */
  cachedAt: number | null;
  error: string | null;
}

/**
 * Fetch the installable releases, newest first.
 *
 * A cache younger than {@link RELEASE_CACHE_FRESH_MS} is served as-is unless
 * `force` is set (the Updates screen's Refresh). On fetch failure the last
 * successful fetch is served — engineers are routinely on site with no
 * signal, and an empty Updates screen looks broken — but only up to
 * {@link RELEASE_CACHE_MAX_AGE_MS}, so a release deleted from GitHub stops
 * being offered.
 */
export async function getReleases(options: { force?: boolean } = {}): Promise<ReleasesResult> {
  const cache = await readReleaseCache();

  if (!options.force && cache && Date.now() - cache.savedAt < RELEASE_CACHE_FRESH_MS) {
    return { releases: cache.releases, fromCache: true, cachedAt: cache.savedAt, error: null };
  }

  try {
    const releases = await fetchReleasesFromGithub();
    const savedAt = Date.now();
    await Preferences.set({
      key: CACHED_RELEASES_KEY,
      value: JSON.stringify({ savedAt, releases }),
    });
    await Preferences.set({ key: LAST_CHECK_KEY, value: String(savedAt) });
    return { releases, fromCache: false, cachedAt: savedAt, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update check failed';
    console.warn('[UpdateService] Release check failed', error);
    if (cache && Date.now() - cache.savedAt <= RELEASE_CACHE_MAX_AGE_MS) {
      return { releases: cache.releases, fromCache: true, cachedAt: cache.savedAt, error: message };
    }
    return { releases: [], fromCache: false, cachedAt: cache?.savedAt ?? null, error: message };
  }
}

async function isCheckDue(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: LAST_CHECK_KEY });
    if (!value) return true;
    const last = parseInt(value, 10);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last > CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

/**
 * The launch-time check. Returns the release to offer, or null to stay quiet.
 *
 * Deliberately silent on failure: a missing network must never block someone
 * getting into the app on site.
 */
export async function checkForUpdateOnLaunch(): Promise<{
  release: AppRelease;
  current: CurrentVersion;
} | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const current = await getCurrentVersion();
    if (current.code === null) return null;
    if (!(await isCheckDue())) return null;

    const { releases } = await getReleases();
    const { value: dismissedTag } = await Preferences.get({ key: DISMISSED_TAG_KEY });

    const release = shouldPromptForUpdate({
      releases,
      currentCode: current.code,
      dismissedTag,
    });
    return release ? { release, current } : null;
  } catch (error) {
    console.warn('[UpdateService] Launch update check failed', error);
    return null;
  }
}

/** Remember that the user tapped "Later" for this version specifically. */
export async function dismissUpdate(tag: string): Promise<void> {
  await Preferences.set({ key: DISMISSED_TAG_KEY, value: tag });
}

/** Wipe stale APKs — each one is ~15 MB and there is no reason to keep them. */
async function clearApkCache(keepFile?: string): Promise<void> {
  try {
    const { files } = await Filesystem.readdir({
      path: APK_CACHE_DIR,
      directory: Directory.Cache,
    });
    for (const file of files) {
      const name = typeof file === 'string' ? file : file.name;
      if (!name.endsWith('.apk') || name === keepFile) continue;
      await Filesystem.deleteFile({
        path: `${APK_CACHE_DIR}/${name}`,
        directory: Directory.Cache,
      });
    }
  } catch {
    // Directory doesn't exist yet on first run — nothing to clean.
  }
}

/**
 * Download a release APK into the app cache.
 *
 * Returns the on-disk path. Progress is reported per chunk so the user can see
 * a 15 MB download moving on a weak site connection.
 */
/**
 * A previous download of this exact release, still fully on disk. Cancelling
 * the system installer (or leaving for the permission settings) deliberately
 * keeps the APK; retrying must reuse it rather than pull ~15 MB again. Only a
 * file whose size matches the release asset exactly counts — anything else is
 * a partial download.
 */
async function findExistingApk(path: string, expectedSize: number | null): Promise<string | null> {
  if (!expectedSize) return null;
  try {
    const stat = await Filesystem.stat({ path, directory: Directory.Cache });
    if (stat.size === expectedSize && stat.uri) return stat.uri;
  } catch {
    // Not downloaded yet.
  }
  return null;
}

export async function downloadRelease(
  release: AppRelease,
  onProgress?: (progress: DownloadProgress) => void
): Promise<string> {
  const fileName = `site-right-${release.tag}.apk`;
  const path = `${APK_CACHE_DIR}/${fileName}`;

  const existing = await findExistingApk(path, release.apkSize);
  if (existing) return existing;

  await clearApkCache(fileName);

  try {
    // Filesystem 6.x on Android ignores downloadFile's `recursive` option, so
    // the subdirectory must exist before the download or the write fails with
    // FileNotFoundException.
    await Filesystem.mkdir({ path: APK_CACHE_DIR, directory: Directory.Cache, recursive: true });
  } catch {
    // Already exists.
  }

  const listener = onProgress
    ? await Filesystem.addListener('progress', (status) => {
        const contentLength = status.contentLength || release.apkSize || 0;
        onProgress({
          bytes: status.bytes,
          contentLength,
          percent: contentLength > 0 ? Math.min(100, (status.bytes / contentLength) * 100) : null,
        });
      })
    : null;

  try {
    const result = await Filesystem.downloadFile({
      url: release.apkUrl,
      path,
      directory: Directory.Cache,
      progress: true,
      recursive: true,
    });
    if (!result.path) {
      throw new Error('Download finished but no file path was returned');
    }
    return result.path;
  } finally {
    await listener?.remove();
  }
}

/**
 * Hand a downloaded APK to the system installer.
 *
 * Throws UpdatePermissionRequired if the user hasn't granted "Install unknown
 * apps" yet — the caller should offer to open that settings screen.
 */
export async function installRelease(path: string): Promise<void> {
  const { canInstall, needsPermission } = await ApkInstaller.canInstall();
  if (!canInstall) {
    // Only offer the permission round-trip when the OS says a grant would
    // actually help. The web stub answers { canInstall: false,
    // needsPermission: false } — a permission panel there is a dead end.
    if (needsPermission) throw new UpdatePermissionRequired();
    throw new Error('Installing updates is not available on this device.');
  }
  try {
    await ApkInstaller.install({ path });
  } catch (error) {
    // Route on Capacitor's structured reject code (PluginCall.reject(message,
    // code) → CapacitorException.code), never on message text — the native
    // message is free to be reworded.
    const code = (error as { code?: string } | null)?.code;
    if (code === 'PERMISSION_REQUIRED') {
      throw new UpdatePermissionRequired();
    }
    throw error;
  }
}

export async function openInstallPermissionSettings(): Promise<void> {
  await ApkInstaller.openInstallPermissionSettings();
}

/**
 * Last resort: hand the download to the browser instead. Android saves the APK
 * and the user installs it from the notification. Slower and easier to lose,
 * but it works when the in-app installer can't run at all.
 */
export async function openInBrowser(url: string = RELEASES_PAGE): Promise<void> {
  await Browser.open({ url });
}

export { RELEASES_PAGE };
