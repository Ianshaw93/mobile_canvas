import React from 'react';
import { useReleaseInstaller } from '@/hooks/useReleaseInstaller';
import { AppRelease, formatBytes } from '@/utils/appVersion';

interface InstallerStatusProps {
  installer: ReturnType<typeof useReleaseInstaller>;
  /** The release this status belongs to — drives retry and browser fallback. */
  release: AppRelease;
  /** Called after Close resets the installer (e.g. dismiss the prompt). */
  onClose?: () => void;
}

/**
 * The one rendering of the install hook's stages, shared by the launch prompt
 * and the Updates screen so the two can never diverge (they already had —
 * their error fallbacks behaved differently before this component existed).
 *
 * Renders nothing while the installer is idle. The browser fallback is always
 * the hook's own `fallbackToBrowser`, which resets the hook state and opens
 * this release's direct APK download.
 */
const InstallerStatus = ({ installer, release, onClose }: InstallerStatusProps) => {
  if (installer.stage === 'idle' || installer.activeTag !== release.tag) return null;

  const handleClose = () => {
    installer.reset();
    onClose?.();
  };

  return (
    <div className="mt-3">
      {installer.stage === 'downloading' && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${installer.progress?.percent ?? 0}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Downloading{' '}
            {installer.progress
              ? `${formatBytes(installer.progress.bytes)} of ${formatBytes(
                  installer.progress.contentLength
                )}`
              : formatBytes(release.apkSize)}
          </div>
        </div>
      )}

      {installer.stage === 'installing' && (
        <div className="text-sm text-gray-600">Opening the installer…</div>
      )}

      {installer.stage === 'done' && (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900">
          The Android installer has been opened. If you cancelled it, tap Install again — the
          download is kept, so it won&apos;t re-download.
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleClose}
              className="flex-1 rounded border border-green-300 bg-white px-3 py-2 text-green-900"
            >
              Close
            </button>
            <button
              onClick={() => installer.start(release)}
              className="flex-1 rounded bg-green-700 px-3 py-2 text-white"
            >
              Install again
            </button>
          </div>
        </div>
      )}

      {installer.stage === 'permission' && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Android needs permission to install apps from Site Right. Turn on &quot;Allow from this
          source&quot;, then come back and try again — the download is kept.
          <button
            onClick={installer.grantPermission}
            className="mt-2 block w-full rounded bg-amber-600 px-3 py-2 text-white"
          >
            Open permission settings
          </button>
        </div>
      )}

      {installer.stage === 'error' && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {installer.error}
          <button
            onClick={() => installer.fallbackToBrowser(release)}
            className="mt-2 block w-full rounded bg-red-600 px-3 py-2 text-white"
          >
            Download in browser instead
          </button>
        </div>
      )}
    </div>
  );
};

export default InstallerStatus;
