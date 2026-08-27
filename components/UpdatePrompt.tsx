import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CurrentVersion, checkForUpdateOnLaunch, dismissUpdate } from '@/services/UpdateService';
import { useReleaseInstaller } from '@/hooks/useReleaseInstaller';
import InstallerStatus from '@/components/InstallerStatus';
import { AppRelease } from '@/utils/appVersion';

/**
 * Launch-time "there's a newer version" prompt.
 *
 * Tapping Later silences this exact version for good — engineers get one
 * prompt per release, not one per launch. Anything they skipped stays
 * reachable on the Updates screen.
 */
const UpdatePrompt = () => {
  const router = useRouter();
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [current, setCurrent] = useState<CurrentVersion | null>(null);
  const [armed, setArmed] = useState(false);
  const installer = useReleaseInstaller();

  useEffect(() => {
    if (!release) return;
    // The prompt appears asynchronously, up to 12s after the home screen
    // mounts. A tap already in flight toward whatever was underneath must not
    // land on "Later" — that silences this release permanently.
    const timer = setTimeout(() => setArmed(true), 400);
    return () => clearTimeout(timer);
  }, [release]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await checkForUpdateOnLaunch();
      if (cancelled || !found) return;
      setRelease(found.release);
      setCurrent(found.current);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!release) return null;

  const handleLater = async () => {
    await dismissUpdate(release.tag);
    setRelease(null);
  };

  const busy = installer.stage === 'downloading' || installer.stage === 'installing';
  const locked = busy || !armed;

  return (
    // z-40, below PdfPicker's z-50 modals: if one is open when the async check
    // resolves, this prompt waits underneath instead of hijacking the tap.
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="text-lg font-semibold text-gray-900">Update available</div>
        <p className="mt-1 text-sm text-gray-600">
          Site Right <span className="font-medium">{release.tag}</span> is ready to install.
          {current?.name ? ` You're on ${current.name}.` : ''}
        </p>

        {release.notes && (
          <p className="mt-3 max-h-24 overflow-y-auto whitespace-pre-line rounded bg-gray-50 p-2 text-xs text-gray-600">
            {release.notes}
          </p>
        )}

        <InstallerStatus
          installer={installer}
          release={release}
          // Closing after the installer has opened is not "Later": it must not
          // silence this release's prompt for good.
          onClose={() => setRelease(null)}
        />

        {/* The done panel carries its own Close / Install again actions. */}
        {installer.stage !== 'done' && (
          <div className="mt-5 flex gap-2">
            <button
              onClick={handleLater}
              disabled={locked}
              className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-700 disabled:opacity-50"
            >
              Later
            </button>
            <button
              onClick={() => installer.start(release)}
              disabled={locked}
              className="flex-1 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Update'}
            </button>
          </div>
        )}

        <button
          onClick={() => {
            setRelease(null);
            router.push('/updates');
          }}
          className="mt-3 w-full text-center text-xs text-blue-600 underline"
        >
          See all versions
        </button>
      </div>
    </div>
  );
};

export default UpdatePrompt;
