import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Capacitor } from '@capacitor/core';
import {
  CurrentVersion,
  RELEASES_PAGE,
  getCurrentVersion,
  getReleases,
  openInBrowser,
} from '@/services/UpdateService';
import { useReleaseInstaller } from '@/hooks/useReleaseInstaller';
import InstallerStatus from '@/components/InstallerStatus';
import {
  AppRelease,
  ReleaseStatus,
  classifyRelease,
  formatBytes,
  resolveInstallRoute,
} from '@/utils/appVersion';

const STATUS_LABEL: Record<ReleaseStatus, string> = {
  current: 'Installed',
  newer: 'Newer',
  older: 'Older',
  unknown: '',
};

const STATUS_STYLE: Record<ReleaseStatus, string> = {
  current: 'bg-green-100 text-green-800',
  newer: 'bg-blue-100 text-blue-800',
  older: 'bg-gray-100 text-gray-600',
  unknown: 'hidden',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function formatCachedAt(cachedAt: number | null): string {
  if (!cachedAt) return '';
  const date = new Date(cachedAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

/**
 * The Updates screen: every release the fleet can install, newest first.
 *
 * This is the answer to "I tapped Later and now I want it" — and to "can I go
 * back to the previous version". What each row offers comes from one shared
 * decision (`resolveInstallRoute`): nothing on web (there is no installer to
 * hand an APK to), the in-app installer for upgrades, and — behind an explicit
 * warning — a *browser* download for downgrades. Android cannot install a
 * lower versionCode over a higher one, so going back means uninstalling first;
 * uninstalling destroys app-private storage (the local SQLite database and the
 * update cache with it), which is exactly why the downgrade APK must land in
 * public Downloads via the browser rather than in the app cache.
 */
export default function UpdatesPage() {
  const router = useRouter();
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [current, setCurrent] = useState<CurrentVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [confirmingTag, setConfirmingTag] = useState<string | null>(null);
  // null until mounted: neither install buttons nor the web notice render in
  // the static export or before the platform is known.
  const [isNative, setIsNative] = useState<boolean | null>(null);
  const installer = useReleaseInstaller();

  const load = useCallback(async (options: { force?: boolean } = {}) => {
    setLoading(true);
    const [version, result] = await Promise.all([getCurrentVersion(), getReleases(options)]);
    setCurrent(version);
    setReleases(result.releases);
    setFromCache(result.fromCache);
    setCachedAt(result.cachedAt);
    setCheckError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
    // Arriving from the launch prompt reuses the list it just fetched;
    // the Refresh button below is the deliberate bypass.
    load();
  }, [load]);

  const currentCode = current?.code ?? null;

  const handleAction = (release: AppRelease) => {
    const route = resolveInstallRoute({ release, currentCode, isNative: isNative === true });
    if (route === 'in-app') {
      setConfirmingTag(null);
      installer.start(release);
    } else if (route === 'browser' && confirmingTag !== release.tag) {
      // Downgrades need the warning first; confirmDowngrade does the download.
      setConfirmingTag(release.tag);
    }
  };

  const confirmDowngrade = (release: AppRelease) => {
    setConfirmingTag(null);
    // Browser download on purpose: it lands in public Downloads, so it is
    // still there after the uninstall Android requires for a downgrade. No
    // in-app install intent is fired — Android would refuse it anyway.
    openInBrowser(release.apkUrl);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => router.push('/')} className="text-blue-600">
            ← Back
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Updates</h1>
          <button
            onClick={() => load({ force: true })}
            disabled={loading}
            className="text-blue-600 disabled:opacity-40"
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>

        <div className="mb-4 rounded-lg border bg-white p-3">
          <div className="text-sm text-gray-500">Installed version</div>
          <div className="text-xl font-semibold text-gray-900">{current?.name ?? '…'}</div>
          {currentCode === null && (
            <div className="mt-1 text-xs text-gray-500">
              Version info is only available in the installed app, not in a browser.
            </div>
          )}
        </div>

        {isNative === false && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Installing is only possible from the app on an Android device. In a browser this list
            is read-only — download APKs from the{' '}
            <button
              onClick={() => openInBrowser(RELEASES_PAGE)}
              className="underline"
            >
              GitHub releases page
            </button>
            .
          </div>
        )}

        {checkError && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {fromCache
              ? `Showing the version list fetched ${formatCachedAt(cachedAt)} — could not reach GitHub just now.`
              : `Could not check for updates: ${checkError}`}
          </div>
        )}

        {!checkError && fromCache && cachedAt && (
          <div className="mb-4 text-xs text-gray-500">
            List as of {formatCachedAt(cachedAt)}. Tap Refresh to check again.
          </div>
        )}

        {!loading && releases.length === 0 && (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-600">
            No releases found. Check your connection, or{' '}
            <button onClick={() => openInBrowser(RELEASES_PAGE)} className="text-blue-600 underline">
              open the releases page
            </button>
            .
          </div>
        )}

        <div className="space-y-3">
          {releases.map((release) => {
            const status = classifyRelease(release, currentCode);
            const route = resolveInstallRoute({
              release,
              currentCode,
              isNative: isNative === true,
            });
            const active = installer.activeTag === release.tag;
            const busy =
              active && (installer.stage === 'downloading' || installer.stage === 'installing');

            return (
              <div key={release.tag} className="rounded-lg border bg-white p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900">{release.title}</div>
                  {status !== 'unknown' && (
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  )}
                </div>

                <div className="mt-0.5 text-xs text-gray-500">
                  {formatDate(release.publishedAt)}
                  {release.publishedAt ? ' · ' : ''}
                  {formatBytes(release.apkSize)}
                </div>

                {release.notes && (
                  <p className="mt-2 max-h-20 overflow-y-auto whitespace-pre-line text-xs text-gray-600">
                    {release.notes}
                  </p>
                )}

                <InstallerStatus installer={installer} release={release} />

                {confirmingTag === release.tag && (
                  <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
                    <div className="font-semibold">
                      Going back to {release.tag} means uninstalling Site Right first.
                    </div>
                    Android will not install an older version over a newer one. Uninstalling
                    deletes everything stored on this phone — every project, pin and photo that
                    hasn&apos;t been pushed to the server. Sync first, and only do this if
                    someone has told you to. The APK downloads in your browser to Downloads, so
                    it survives the uninstall — install it from there afterwards.
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setConfirmingTag(null)}
                        className="flex-1 rounded border border-gray-300 bg-white px-2 py-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => confirmDowngrade(release)}
                        className="flex-1 rounded bg-red-600 px-2 py-1 text-white"
                      >
                        Download in browser
                      </button>
                    </div>
                  </div>
                )}

                {route !== 'none' && confirmingTag !== release.tag && (
                  <button
                    onClick={() => handleAction(release)}
                    disabled={busy}
                    className={`mt-3 w-full rounded px-3 py-2 text-white disabled:opacity-50 ${
                      route === 'browser' ? 'bg-gray-600' : 'bg-blue-600'
                    }`}
                  >
                    {busy ? 'Working…' : route === 'browser' ? 'Go back to this version' : 'Install'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => openInBrowser(RELEASES_PAGE)}
          className="mt-6 w-full text-center text-xs text-blue-600 underline"
        >
          View all releases on GitHub
        </button>
      </div>
    </div>
  );
}
