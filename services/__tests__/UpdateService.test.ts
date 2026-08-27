/**
 * Tests for the I/O contracts in UpdateService.
 *
 * The Capacitor modules are mocked — these pin down contracts, not the I/O:
 *
 * - `@capacitor/filesystem` 6.x on Android IGNORES `downloadFile`'s
 *   `recursive` option, so the `updates/` cache subdirectory must be created
 *   explicitly before the download starts.
 * - An APK already fully on disk (user cancelled the system installer, or came
 *   back from the permission settings round-trip) must be reused, not
 *   re-downloaded — it is ~15 MB over a weak site connection.
 * - The cached release list must carry a staleness bound: a release deleted
 *   from GitHub (the natural bad-release remediation) must stop being offered
 *   once the cache is old, and a fresh cache must be served without burning an
 *   anonymous GitHub API request (60/hour/IP, shared behind site NAT).
 * - Permission failures are routed by Capacitor's structured error CODE, never
 *   by message text, so rewording the native message cannot break the flow.
 */
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { ApkInstaller } from '@/src/plugins/ApkInstaller';
import {
  RELEASE_CACHE_FRESH_MS,
  RELEASE_CACHE_MAX_AGE_MS,
  UpdatePermissionRequired,
  downloadRelease,
  getReleases,
  installRelease,
} from '../UpdateService';
import { AppRelease } from '@/utils/appVersion';

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));
jest.mock('@capacitor/app', () => ({ App: { getInfo: jest.fn() } }));
jest.mock('@capacitor/browser', () => ({ Browser: { open: jest.fn() } }));
jest.mock('@capacitor/preferences', () => {
  const store = new Map<string, string>();
  return {
    Preferences: {
      get: jest.fn(async ({ key }: { key: string }) => ({
        value: store.has(key) ? (store.get(key) as string) : null,
      })),
      set: jest.fn(async ({ key, value }: { key: string; value: string }) => {
        store.set(key, value);
      }),
      __store: store,
    },
  };
});
jest.mock('@/src/plugins/ApkInstaller', () => ({
  ApkInstaller: {
    canInstall: jest.fn(),
    install: jest.fn(),
    openInstallPermissionSettings: jest.fn(),
  },
}));
jest.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    mkdir: jest.fn(async () => {}),
    readdir: jest.fn(),
    stat: jest.fn(),
    deleteFile: jest.fn(async () => {}),
    downloadFile: jest.fn(),
    addListener: jest.fn(),
  },
}));

const mocked = Filesystem as jest.Mocked<typeof Filesystem>;
const mockedInstaller = ApkInstaller as jest.Mocked<typeof ApkInstaller>;
const prefStore = (Preferences as unknown as { __store: Map<string, string> }).__store;

const CACHED_RELEASES_KEY = 'update_cached_releases';

const release: AppRelease = {
  tag: 'v20',
  versionCode: 20,
  title: 'v20',
  notes: '',
  publishedAt: null,
  apkUrl: 'https://github.com/Ianshaw93/fd-mobile-releases/releases/download/v20/app-release.apk',
  apkSize: 14893624,
};

/** Minimal GitHub API payload that normalizes to one installable release. */
const githubPayload = [
  {
    tag_name: 'v21',
    name: 'v21',
    body: 'Release v21',
    draft: false,
    prerelease: false,
    published_at: '2026-08-25T10:00:00Z',
    assets: [
      {
        name: 'app-release.apk',
        browser_download_url:
          'https://github.com/Ianshaw93/fd-mobile-releases/releases/download/v21/app-release.apk',
        size: 15000000,
      },
    ],
  },
];

const fetchMock = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

function fetchResolvesGithub() {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => githubPayload,
  });
}

function fetchFails() {
  fetchMock.mockRejectedValue(new Error('Network request failed'));
}

function seedCache(ageMs: number, releases: AppRelease[] = [release]) {
  prefStore.set(
    CACHED_RELEASES_KEY,
    JSON.stringify({ savedAt: Date.now() - ageMs, releases })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  prefStore.clear();
  // First run: the updates/ directory doesn't exist yet, nothing on disk.
  mocked.readdir.mockRejectedValue(new Error('Directory does not exist'));
  mocked.stat.mockRejectedValue(new Error('File does not exist'));
  mocked.downloadFile.mockResolvedValue({ path: '/cache/updates/site-right-v20.apk' });
});

describe('downloadRelease', () => {
  it('creates the cache subdirectory before downloading', async () => {
    await downloadRelease(release);

    expect(mocked.mkdir).toHaveBeenCalledWith({
      path: 'updates',
      directory: Directory.Cache,
      recursive: true,
    });
    expect(mocked.mkdir.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.downloadFile.mock.invocationCallOrder[0]
    );
  });

  it('still downloads when the directory already exists', async () => {
    mocked.mkdir.mockRejectedValue(new Error('Current directory does already exist.'));

    const path = await downloadRelease(release);

    expect(path).toBe('/cache/updates/site-right-v20.apk');
    expect(mocked.downloadFile).toHaveBeenCalledTimes(1);
  });

  it('surfaces a download that finishes without a file path', async () => {
    mocked.downloadFile.mockResolvedValue({ path: undefined } as never);

    await expect(downloadRelease(release)).rejects.toThrow(
      'Download finished but no file path was returned'
    );
  });

  it('reuses a fully-downloaded APK instead of re-fetching it', async () => {
    // The user cancelled the system installer, or went to grant the install
    // permission and came back: the APK is deliberately kept on disk, and
    // retrying must not pull 15 MB again.
    mocked.stat.mockResolvedValue({
      size: release.apkSize as number,
      uri: 'file:///cache/updates/site-right-v20.apk',
    } as never);

    const path = await downloadRelease(release);

    expect(path).toBe('file:///cache/updates/site-right-v20.apk');
    expect(mocked.downloadFile).not.toHaveBeenCalled();
  });

  it('re-downloads when the on-disk file is a different size (partial download)', async () => {
    mocked.stat.mockResolvedValue({
      size: 4096,
      uri: 'file:///cache/updates/site-right-v20.apk',
    } as never);

    const path = await downloadRelease(release);

    expect(path).toBe('/cache/updates/site-right-v20.apk');
    expect(mocked.downloadFile).toHaveBeenCalledTimes(1);
  });

  it('re-downloads when the release does not declare an APK size to verify against', async () => {
    mocked.stat.mockResolvedValue({
      size: 4096,
      uri: 'file:///cache/updates/site-right-v20.apk',
    } as never);

    const path = await downloadRelease({ ...release, apkSize: null });

    expect(path).toBe('/cache/updates/site-right-v20.apk');
    expect(mocked.downloadFile).toHaveBeenCalledTimes(1);
  });
});

describe('installRelease', () => {
  const apkPath = '/cache/updates/site-right-v20.apk';

  it('asks for the permission when the OS reports it is missing', async () => {
    mockedInstaller.canInstall.mockResolvedValue({ canInstall: false, needsPermission: true });

    await expect(installRelease(apkPath)).rejects.toBeInstanceOf(UpdatePermissionRequired);
    expect(mockedInstaller.install).not.toHaveBeenCalled();
  });

  it('reports plain unavailability when no permission would help (web stub)', async () => {
    // The web stub answers { canInstall: false, needsPermission: false }.
    // Rendering the permission panel here is a dead end — its button throws.
    mockedInstaller.canInstall.mockResolvedValue({ canInstall: false, needsPermission: false });

    const failure = installRelease(apkPath);
    await expect(failure).rejects.toThrow();
    await expect(failure).rejects.not.toBeInstanceOf(UpdatePermissionRequired);
    expect(mockedInstaller.install).not.toHaveBeenCalled();
  });

  it('routes permission rejections by structured error code, whatever the message says', async () => {
    mockedInstaller.canInstall.mockResolvedValue({ canInstall: true, needsPermission: false });
    mockedInstaller.install.mockRejectedValue(
      Object.assign(new Error('Reworded human-friendly permission explanation'), {
        code: 'PERMISSION_REQUIRED',
      })
    );

    await expect(installRelease(apkPath)).rejects.toBeInstanceOf(UpdatePermissionRequired);
  });

  it('does not mistake an ordinary failure for a permission problem on message text', async () => {
    mockedInstaller.canInstall.mockResolvedValue({ canInstall: true, needsPermission: false });
    mockedInstaller.install.mockRejectedValue(
      new Error('Could not open the installer: PERMISSION_REQUIRED mentioned in passing')
    );

    const failure = installRelease(apkPath);
    await expect(failure).rejects.toThrow('Could not open the installer');
    await expect(failure).rejects.not.toBeInstanceOf(UpdatePermissionRequired);
  });
});

describe('getReleases cache semantics', () => {
  it('serves a fresh cache without touching the GitHub API', async () => {
    // The launch prompt has just fetched; navigating to the Updates screen
    // seconds later must not burn a second anonymous API request.
    seedCache(RELEASE_CACHE_FRESH_MS / 2);

    const result = await getReleases();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.releases.map((r) => r.tag)).toEqual(['v20']);
    expect(result.fromCache).toBe(true);
    expect(result.cachedAt).not.toBeNull();
    expect(result.error).toBeNull();
  });

  it('force bypasses a fresh cache (the Refresh action)', async () => {
    seedCache(RELEASE_CACHE_FRESH_MS / 2);
    fetchResolvesGithub();

    const result = await getReleases({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.releases.map((r) => r.tag)).toEqual(['v21']);
    expect(result.fromCache).toBe(false);
  });

  it('fetches once the cache has left the fresh window', async () => {
    seedCache(RELEASE_CACHE_FRESH_MS + 1000);
    fetchResolvesGithub();

    const result = await getReleases();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.releases.map((r) => r.tag)).toEqual(['v21']);
    expect(result.fromCache).toBe(false);
  });

  it('stores the fetch timestamp alongside the release list', async () => {
    fetchResolvesGithub();
    const before = Date.now();

    await getReleases();

    const stored = JSON.parse(prefStore.get(CACHED_RELEASES_KEY) as string);
    expect(Array.isArray(stored.releases)).toBe(true);
    expect(stored.savedAt).toBeGreaterThanOrEqual(before);
  });

  it('falls back to a within-bounds cache when the fetch fails, exposing its age', async () => {
    seedCache(RELEASE_CACHE_MAX_AGE_MS / 2);
    fetchFails();

    const result = await getReleases();

    expect(result.releases.map((r) => r.tag)).toEqual(['v20']);
    expect(result.fromCache).toBe(true);
    expect(result.cachedAt).not.toBeNull();
    expect(result.error).toBe('Network request failed');
  });

  it('refuses to serve a cache older than the staleness bound', async () => {
    // A release deleted from GitHub is the bad-release remediation; a cache
    // this old must stop offering it rather than presenting a dead URL.
    seedCache(RELEASE_CACHE_MAX_AGE_MS + 60_000);
    fetchFails();

    const result = await getReleases();

    expect(result.releases).toEqual([]);
    expect(result.fromCache).toBe(false);
    expect(result.error).toBe('Network request failed');
  });

  it('treats the legacy bare-array cache format as absent', async () => {
    // Pre-TTL builds stored a bare array with no timestamp — its age cannot
    // be bounded, so it must not be served.
    prefStore.set(CACHED_RELEASES_KEY, JSON.stringify([release]));
    fetchFails();

    const result = await getReleases();

    expect(result.releases).toEqual([]);
    expect(result.fromCache).toBe(false);
  });
});
