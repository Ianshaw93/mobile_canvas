package com.example.app;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register local ContentUriReader plugin BEFORE super.onCreate()
        // This is required for Capacitor 6 to properly discover the plugin
        Log.d(TAG, "Registering ContentUriReaderPlugin...");
        try {
            registerPlugin(ContentUriReaderPlugin.class);
            Log.d(TAG, "ContentUriReaderPlugin registered successfully");
        } catch (Exception e) {
            Log.e(TAG, "Failed to register ContentUriReaderPlugin", e);
        }
        try {
            registerPlugin(ApkInstallerPlugin.class);
            Log.d(TAG, "ApkInstallerPlugin registered successfully");
        } catch (Exception e) {
            Log.e(TAG, "Failed to register ApkInstallerPlugin", e);
        }
        super.onCreate(savedInstanceState);
        Log.d(TAG, "MainActivity.onCreate completed");
    }
}
