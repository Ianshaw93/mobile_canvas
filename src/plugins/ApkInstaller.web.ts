import { WebPlugin } from '@capacitor/core';
import type { ApkInstallerPlugin } from './ApkInstaller';

/**
 * There is no APK to install in a browser. Report "cannot install" so the
 * update UI falls back to opening the release download link.
 */
export class ApkInstallerWeb extends WebPlugin implements ApkInstallerPlugin {
  async canInstall(): Promise<{ canInstall: boolean; needsPermission: boolean }> {
    return { canInstall: false, needsPermission: false };
  }

  async openInstallPermissionSettings(): Promise<void> {
    throw new Error('ApkInstaller is not available on web');
  }

  async install(): Promise<void> {
    throw new Error('ApkInstaller is not available on web');
  }
}
