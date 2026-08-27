import { registerPlugin } from '@capacitor/core';

/**
 * Hands a downloaded APK to the Android package installer.
 *
 * Site Right is sideloaded, so there is no Play Store update path. The web
 * layer downloads the APK from GitHub Releases into the app cache, then calls
 * `install()` to fire an ACTION_VIEW intent at it via the existing
 * FileProvider. Android takes it from there.
 */
export interface ApkInstallerPlugin {
  /**
   * Whether the OS will currently let this app launch a package install.
   * On Android 8+ the user must grant "Install unknown apps" per-app first.
   */
  canInstall(): Promise<{ canInstall: boolean; needsPermission: boolean }>;

  /** Opens the system "Install unknown apps" screen for this app. */
  openInstallPermissionSettings(): Promise<void>;

  /** @param path absolute path or file:// URI of the downloaded APK. */
  install(options: { path: string }): Promise<void>;
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller', {
  web: () => import('./ApkInstaller.web').then((m) => new m.ApkInstallerWeb()),
});

export { ApkInstaller };
