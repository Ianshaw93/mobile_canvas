/**
 * Tests for in-app update version logic.
 *
 * Contract under test: releases published to `Ianshaw93/fd-mobile-releases`
 * are tagged `vN`, where N is the Android `versionCode` of the APK attached to
 * that release. The running app reports its own versionCode via
 * `App.getInfo().build`. Everything the update UI does — "is there a newer
 * build?", "which of these is the one I'm running?", "should I nag on
 * launch?" — is a comparison between those two numbers.
 *
 * These functions are deliberately pure so they can be tested without a
 * device: the app cannot be fully exercised off-phone (see CLAUDE.md), so the
 * comparison logic is where the confidence has to come from.
 */
import {
  parseVersionTag,
  parseVersionCode,
  findApkAsset,
  normalizeReleases,
  selectLatestRelease,
  classifyRelease,
  shouldPromptForUpdate,
  isDowngrade,
  formatBytes,
  GithubRelease,
} from '../appVersion';

const apk = (name = 'app-release.apk') => ({
  name,
  browser_download_url: `https://github.com/Ianshaw93/fd-mobile-releases/releases/download/x/${name}`,
  size: 14893624,
});

const release = (tag: string, extra: Partial<GithubRelease> = {}): GithubRelease => ({
  tag_name: tag,
  name: tag,
  body: `Release ${tag}`,
  draft: false,
  prerelease: false,
  published_at: '2026-08-20T14:42:11Z',
  assets: [apk()],
  ...extra,
});

describe('parseVersionTag', () => {
  it('reads the versionCode out of a vN tag', () => {
    expect(parseVersionTag('v19')).toBe(19);
    expect(parseVersionTag('v7')).toBe(7);
    expect(parseVersionTag('v120')).toBe(120);
  });

  it('tolerates a missing v prefix and surrounding whitespace', () => {
    expect(parseVersionTag('19')).toBe(19);
    expect(parseVersionTag(' v19 ')).toBe(19);
    expect(parseVersionTag('V19')).toBe(19);
  });

  it('rejects dotted or suffixed tags outright — the tag IS the versionCode', () => {
    // A tag the updater cannot round-trip (install the APK, then have the
    // device report the same number) must be skipped, never approximated:
    // 'v20.1' read as 20 would show v20 devices "Installed" and the release
    // would never be delivered; '19-hotfix' read as 19 is the same trap.
    expect(parseVersionTag('v20.1')).toBeNull();
    expect(parseVersionTag('19-hotfix')).toBeNull();
    expect(parseVersionTag('v19rc1')).toBeNull();
  });

  it('returns null for anything it cannot read as a version', () => {
    expect(parseVersionTag('')).toBeNull();
    expect(parseVersionTag('latest')).toBeNull();
    expect(parseVersionTag('beta')).toBeNull();
    expect(parseVersionTag(undefined as unknown as string)).toBeNull();
  });
});

describe('parseVersionCode', () => {
  it('reads App.getInfo().build, which arrives as a string', () => {
    expect(parseVersionCode('19')).toBe(19);
    expect(parseVersionCode(19 as unknown as string)).toBe(19);
  });

  it('returns null when the platform reports no usable build number', () => {
    expect(parseVersionCode('')).toBeNull();
    expect(parseVersionCode(undefined)).toBeNull();
    expect(parseVersionCode('unknown')).toBeNull();
  });
});

describe('findApkAsset', () => {
  it('prefers the canonical app-release.apk the CI workflow uploads', () => {
    const r = release('v19', { assets: [apk('other.apk'), apk('app-release.apk')] });
    expect(findApkAsset(r)?.name).toBe('app-release.apk');
  });

  it('falls back to any .apk when the name differs', () => {
    const r = release('v19', { assets: [apk('site-right-v19.apk')] });
    expect(findApkAsset(r)?.name).toBe('site-right-v19.apk');
  });

  it('ignores non-apk assets', () => {
    const r = release('v19', { assets: [apk('notes.txt'), apk('mapping.zip')] });
    expect(findApkAsset(r)).toBeNull();
  });

  it('handles a release with no assets at all', () => {
    expect(findApkAsset(release('v19', { assets: [] }))).toBeNull();
    expect(findApkAsset(release('v19', { assets: undefined }))).toBeNull();
  });
});

describe('normalizeReleases', () => {
  it('sorts newest first regardless of API order', () => {
    const out = normalizeReleases([release('v17'), release('v19'), release('v18')]);
    expect(out.map((r) => r.versionCode)).toEqual([19, 18, 17]);
  });

  it('drops drafts, prereleases, unparseable tags and apk-less releases', () => {
    const out = normalizeReleases([
      release('v19'),
      release('v18', { draft: true }),
      release('v17', { prerelease: true }),
      release('nightly'),
      release('v16', { assets: [] }),
    ]);
    expect(out.map((r) => r.tag)).toEqual(['v19']);
  });

  it('survives a malformed API response without throwing', () => {
    expect(normalizeReleases(undefined as unknown as GithubRelease[])).toEqual([]);
    expect(normalizeReleases([] as GithubRelease[])).toEqual([]);
    expect(normalizeReleases([{} as GithubRelease])).toEqual([]);
  });

  it('carries through the download url, size and notes the UI needs', () => {
    const [r] = normalizeReleases([release('v19')]);
    expect(r.apkUrl).toContain('app-release.apk');
    expect(r.apkSize).toBe(14893624);
    expect(r.notes).toBe('Release v19');
    expect(r.publishedAt).toBe('2026-08-20T14:42:11Z');
  });
});

describe('classifyRelease', () => {
  const releases = normalizeReleases([release('v19'), release('v18'), release('v20')]);
  const find = (tag: string) => releases.find((r) => r.tag === tag)!;

  it('marks the running build as current', () => {
    expect(classifyRelease(find('v19'), 19)).toBe('current');
  });

  it('marks higher versionCodes as newer and lower as older', () => {
    expect(classifyRelease(find('v20'), 19)).toBe('newer');
    expect(classifyRelease(find('v18'), 19)).toBe('older');
  });

  it('cannot classify when the running build is unknown', () => {
    expect(classifyRelease(find('v19'), null)).toBe('unknown');
  });
});

describe('isDowngrade', () => {
  // Android refuses to install a lower versionCode over a higher one
  // (INSTALL_FAILED_VERSION_DOWNGRADE). The only route back is uninstalling
  // first, which wipes app-private storage — including the SQLite database
  // holding every unsynced site visit. The UI must warn before offering this.
  it('flags installing an older release over a newer one', () => {
    expect(isDowngrade(18, 19)).toBe(true);
  });

  it('does not flag same-version reinstall or an upgrade', () => {
    expect(isDowngrade(19, 19)).toBe(false);
    expect(isDowngrade(20, 19)).toBe(false);
  });

  it('does not flag when the running build is unknown', () => {
    expect(isDowngrade(18, null)).toBe(false);
  });
});

describe('selectLatestRelease', () => {
  it('returns the highest versionCode', () => {
    const releases = normalizeReleases([release('v17'), release('v19'), release('v18')]);
    expect(selectLatestRelease(releases)?.tag).toBe('v19');
  });

  it('returns null for an empty list', () => {
    expect(selectLatestRelease([])).toBeNull();
  });
});

describe('formatBytes', () => {
  it('renders APK-sized downloads in MB', () => {
    expect(formatBytes(14893624)).toBe('14.2 MB');
  });

  it('scales down to bytes and KB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('says so rather than rendering NaN when the size is unknown', () => {
    expect(formatBytes(null)).toBe('unknown size');
    expect(formatBytes(undefined)).toBe('unknown size');
    expect(formatBytes(NaN)).toBe('unknown size');
  });
});

describe('shouldPromptForUpdate', () => {
  const releases = normalizeReleases([release('v18'), release('v19'), release('v20')]);

  it('offers the newest release when the app is behind', () => {
    expect(shouldPromptForUpdate({ releases, currentCode: 19 })?.tag).toBe('v20');
  });

  it('stays silent when the app is already on the newest release', () => {
    expect(shouldPromptForUpdate({ releases, currentCode: 20 })).toBeNull();
  });

  it('stays silent when the app is somehow ahead of the newest release', () => {
    // A local dev build, or a release that was deleted from the repo.
    expect(shouldPromptForUpdate({ releases, currentCode: 21 })).toBeNull();
  });

  it('stays silent once the user has declined that exact version', () => {
    expect(
      shouldPromptForUpdate({ releases, currentCode: 19, dismissedTag: 'v20' })
    ).toBeNull();
  });

  it('prompts again when a newer release lands after a dismissal', () => {
    const withV21 = normalizeReleases([release('v20'), release('v21')]);
    expect(
      shouldPromptForUpdate({ releases: withV21, currentCode: 19, dismissedTag: 'v20' })?.tag
    ).toBe('v21');
  });

  it('stays silent when the running build is unknown, rather than guessing', () => {
    expect(shouldPromptForUpdate({ releases, currentCode: null })).toBeNull();
  });

  it('stays silent when there are no usable releases', () => {
    expect(shouldPromptForUpdate({ releases: [], currentCode: 19 })).toBeNull();
  });
});
