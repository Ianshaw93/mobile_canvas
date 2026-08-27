package com.example.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Launches the Android package installer for an APK the web layer has already
 * downloaded into the app cache.
 *
 * Site Right is distributed as a sideloaded APK from GitHub Releases, not
 * through Play, so there is no managed update channel. The web layer fetches
 * the APK with Filesystem.downloadFile, then calls install() with the
 * resulting path.
 *
 * Requires REQUEST_INSTALL_PACKAGES in the manifest, and — on Android 8+ —
 * the per-app "Install unknown apps" grant, which only the user can give.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static final String TAG = "ApkInstaller";
    private static final String APK_MIME = "application/vnd.android.package-archive";

    /**
     * Structured reject code for a missing "Install unknown apps" grant. The
     * TypeScript side routes on this code (CapacitorException.code), never on
     * the human-readable message, so the message is free to be reworded.
     */
    private static final String CODE_PERMISSION_REQUIRED = "PERMISSION_REQUIRED";

    private boolean hasInstallPermission() {
        // Below Oreo the manifest permission is enough; there is no per-app toggle.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = hasInstallPermission();
        JSObject result = new JSObject();
        result.put("canInstall", allowed);
        result.put("needsPermission", !allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
            } else {
                intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to open install-permission settings", e);
            call.reject("Could not open the install permission screen: " + e.getMessage());
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("path is required");
            return;
        }

        try {
            File apk = resolveFile(path);
            if (!apk.exists()) {
                call.reject("Downloaded APK not found at " + apk.getAbsolutePath());
                return;
            }

            if (!hasInstallPermission()) {
                call.reject("Android has not granted Site Right permission to install apps.",
                        CODE_PERMISSION_REQUIRED);
                return;
            }

            // The FileProvider authority and its cache-path entry already exist
            // for camera/share; reuse them rather than declaring a second one.
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apk);

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, APK_MIME);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            Log.d(TAG, "Install intent launched for " + apk.getName());
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch installer", e);
            call.reject("Could not open the installer: " + e.getMessage());
        }
    }

    /** Filesystem.downloadFile may hand back a bare path or a file:// URI. */
    private File resolveFile(String path) {
        if (path.startsWith("file://")) {
            Uri uri = Uri.parse(path);
            String resolved = uri.getPath();
            if (resolved != null) return new File(resolved);
        }
        return new File(path);
    }
}
