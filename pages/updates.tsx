import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  CurrentVersion,
  RELEASES_PAGE,
  getCurrentVersion,
  getReleases,
  openInBrowser,
} from '@/services/UpdateService';
import { useReleaseInstaller } from '@/hooks/useReleaseInstaller';
import {
  AppRelease,
  ReleaseStatus,
  classifyRelease,
  formatBytes,
  isDowngrade,
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

/**
 * The Updates screen: every release the fleet can install, newest first.
 *
 * This is the answer to "I tapped Later and now I want it" — and to "can I go
 * back to the previous version". Downgrades are offered, but only behind an
 * explicit warning: Android cannot install a lower versionCode over a higher
 * one, so going back means uninstalling first, and uninstalling destroys the
 * local SQLite database along with every site visit that hasn't been pushed.
 */
export default function UpdatesPage() {
  const router = useRouter();
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [current, setCurrent] = useState<CurrentVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [confirmingTag, setConfirmingTag] = useState<string | null>(null);
  const installer = useReleaseInstaller();

  const load = useCallback(async () => {
    setLoading(true);
    const [version, result] = await Promise.all([getCurrentVersion(), getReleases()]);
    setCurrent(version);
    setReleases(result.releases);
    setFromCache(result.fromCache);
    setCheckError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const currentCode = current?.code ?? null;

  const handleInstall = (release: AppRelease) => {
    if (isDowngrade(release.versionCode, currentCode) && confirmingTag !== release.tag) {
      setConfirmingTag(release.tag);
      return;
    }
    setConfirmingTag(null);
    installer.start(release);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => router.push('/')} className="text-blue-600">
            ← Back
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Updates</h1>
          <button onClick={load} disabled={loading} className="text-blue-600 disabled:opacity-40">
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

        {checkError && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {fromCache
              ? 'Showing the last known version list — could not reach GitHub just now.'
              : `Could not check for updates: ${checkError}`}
          </div>
        )}

        {installer.stage === 'permission' && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Android needs permission to install apps from Site Right. Turn on &quot;Allow from
            this source&quot;, then tap Install again.
            <button
              onClick={installer.grantPermission}
              className="mt-2 w-full rounded bg-amber-600 px-3 py-2 text-white"
            >
              Open permission settings
            </button>
          </div>
        )}

        {installer.stage === 'error' && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {installer.error}
            <button
              onClick={() => openInBrowser(RELEASES_PAGE)}
              className="mt-2 w-full rounded bg-red-600 px-3 py-2 text-white"
            >
              Open releases in browser
            </button>
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
            const downgrade = isDowngrade(release.versionCode, currentCode);
            const active = installer.activeTag === release.tag;
            const busy = active && (installer.stage === 'downloading' || installer.stage === 'installing');

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

                {busy && (
                  <div className="mt-2">
                    <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${installer.progress?.percent ?? 0}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {installer.stage === 'installing'
                        ? 'Opening the installer…'
                        : `Downloading ${formatBytes(installer.progress?.bytes ?? 0)}`}
                    </div>
                  </div>
                )}

                {confirmingTag === release.tag && (
                  <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
                    <div className="font-semibold">
                      Going back to {release.tag} means uninstalling Site Right first.
                    </div>
                    Android will not install an older version over a newer one. Uninstalling
                    deletes everything stored on this phone — every project, pin and photo that
                    hasn&apos;t been pushed to the server. Sync first, and only do this if
                    someone has told you to.
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setConfirmingTag(null)}
                        className="flex-1 rounded border border-gray-300 bg-white px-2 py-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleInstall(release)}
                        className="flex-1 rounded bg-red-600 px-2 py-1 text-white"
                      >
                        Download anyway
                      </button>
                    </div>
                  </div>
                )}

                {status !== 'current' && confirmingTag !== release.tag && (
                  <button
                    onClick={() => handleInstall(release)}
                    disabled={busy}
                    className={`mt-3 w-full rounded px-3 py-2 text-white disabled:opacity-50 ${
                      downgrade ? 'bg-gray-600' : 'bg-blue-600'
                    }`}
                  >
                    {busy ? 'Working…' : downgrade ? 'Go back to this version' : 'Install'}
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
