import { useCallback, useRef, useState } from 'react';
import {
  DownloadProgress,
  UpdatePermissionRequired,
  downloadRelease,
  installRelease,
  openInBrowser,
  openInstallPermissionSettings,
} from '@/services/UpdateService';
import { AppRelease } from '@/utils/appVersion';

export type InstallStage = 'idle' | 'downloading' | 'installing' | 'permission' | 'error' | 'done';

export interface ReleaseInstallerState {
  stage: InstallStage;
  /** Tag currently being worked on, so a list can show progress on one row. */
  activeTag: string | null;
  progress: DownloadProgress | null;
  error: string | null;
}

const INITIAL: ReleaseInstallerState = {
  stage: 'idle',
  activeTag: null,
  progress: null,
  error: null,
};

/**
 * Download-then-install for a GitHub release APK, shared by the launch prompt
 * and the Updates screen so both behave identically.
 */
export function useReleaseInstaller() {
  const [state, setState] = useState<ReleaseInstallerState>(INITIAL);
  const busyRef = useRef(false);

  const reset = useCallback(() => {
    busyRef.current = false;
    setState(INITIAL);
  }, []);

  const start = useCallback(async (release: AppRelease) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setState({ stage: 'downloading', activeTag: release.tag, progress: null, error: null });

    try {
      const path = await downloadRelease(release, (progress) => {
        setState((prev) =>
          prev.activeTag === release.tag && prev.stage === 'downloading'
            ? { ...prev, progress }
            : prev
        );
      });

      setState((prev) => ({ ...prev, stage: 'installing' }));
      await installRelease(path);
      // The system installer takes over from here; the app is backgrounded.
      setState((prev) => ({ ...prev, stage: 'done' }));
    } catch (error) {
      if (error instanceof UpdatePermissionRequired) {
        setState({
          stage: 'permission',
          activeTag: release.tag,
          progress: null,
          error: null,
        });
      } else {
        setState({
          stage: 'error',
          activeTag: release.tag,
          progress: null,
          error: error instanceof Error ? error.message : 'Update failed',
        });
      }
    } finally {
      busyRef.current = false;
    }
  }, []);

  const grantPermission = useCallback(async () => {
    try {
      await openInstallPermissionSettings();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        stage: 'error',
        error: error instanceof Error ? error.message : 'Could not open settings',
      }));
    }
  }, []);

  const fallbackToBrowser = useCallback(async (release?: AppRelease) => {
    try {
      await openInBrowser(release?.apkUrl);
      busyRef.current = false;
      setState(INITIAL);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        stage: 'error',
        error: error instanceof Error ? error.message : 'Could not open the browser',
      }));
    }
  }, []);

  return { ...state, start, reset, grantPermission, fallbackToBrowser };
}
