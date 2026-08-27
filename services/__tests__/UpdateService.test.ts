/**
 * Tests for the APK download path in UpdateService.
 *
 * The one thing these pin down: `@capacitor/filesystem` 6.x on Android
 * IGNORES `downloadFile`'s `recursive` option, so the `updates/` cache
 * subdirectory must be created explicitly before the download starts or the
 * native write throws FileNotFoundException and every update attempt fails.
 * The Capacitor modules are mocked — this is the contract, not the I/O.
 */
import { Directory, Filesystem } from '@capacitor/filesystem';
import { downloadRelease } from '../UpdateService';
import { AppRelease } from '@/utils/appVersion';

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));
jest.mock('@capacitor/app', () => ({ App: { getInfo: jest.fn() } }));
jest.mock('@capacitor/browser', () => ({ Browser: { open: jest.fn() } }));
jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(async () => ({ value: null })),
    set: jest.fn(async () => {}),
  },
}));
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
    deleteFile: jest.fn(async () => {}),
    downloadFile: jest.fn(),
    addListener: jest.fn(),
  },
}));

const mocked = Filesystem as jest.Mocked<typeof Filesystem>;

const release: AppRelease = {
  tag: 'v20',
  versionCode: 20,
  title: 'v20',
  notes: '',
  publishedAt: null,
  apkUrl: 'https://github.com/Ianshaw93/fd-mobile-releases/releases/download/v20/app-release.apk',
  apkSize: 14893624,
};

describe('downloadRelease', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // First run: the updates/ directory doesn't exist yet.
    mocked.readdir.mockRejectedValue(new Error('Directory does not exist'));
    mocked.downloadFile.mockResolvedValue({ path: '/cache/updates/site-right-v20.apk' });
  });

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
});
