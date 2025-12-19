package com.example.app;

import android.content.ContentResolver;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.InputStream;

@CapacitorPlugin(name = "ContentUriReader")
public class ContentUriReaderPlugin extends Plugin {

    private static final String TAG = "ContentUriReader";
    private static final int DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB

    // Constructor to verify plugin instantiation
    public ContentUriReaderPlugin() {
        super();
        Log.d(TAG, "ContentUriReaderPlugin instance created!");
    }

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "ContentUriReaderPlugin.load() called - plugin is being loaded by Capacitor");
    }

    @PluginMethod
    public void readInChunks(PluginCall call) {
        Log.d(TAG, "readInChunks called with URI: " + call.getString("uri"));
        String uriString = call.getString("uri");
        Integer chunkSizeParam = call.getInt("chunkSize", DEFAULT_CHUNK_SIZE);
        int chunkSize = chunkSizeParam != null ? chunkSizeParam : DEFAULT_CHUNK_SIZE;

        if (uriString == null || uriString.isEmpty()) {
            call.reject("URI is required");
            return;
        }

        // Run on background thread to avoid blocking UI
        // Note: PluginCall resolve/reject must be called on main thread
        new Thread(() -> {
            readFileInChunks(call, uriString, chunkSize);
        }).start();
    }

    private void readFileInChunks(PluginCall call, String uriString, int chunkSize) {
        Uri uri = Uri.parse(uriString);
        ContentResolver contentResolver = getContext().getContentResolver();

        InputStream inputStream = null;
        try {
            inputStream = contentResolver.openInputStream(uri);
            if (inputStream == null) {
                final String errorMsg = "Unable to open InputStream for URI: " + uriString;
                getBridge().executeOnMainThread(() -> call.reject(errorMsg));
                return;
            }

            // Try to get file size if available
            long totalSize = -1;
            try {
                // Some content providers support querying file size
                android.database.Cursor cursor = contentResolver.query(
                    uri,
                    new String[]{android.provider.OpenableColumns.SIZE},
                    null,
                    null,
                    null
                );
                if (cursor != null && cursor.moveToFirst()) {
                    int sizeIndex = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE);
                    if (sizeIndex >= 0) {
                        totalSize = cursor.getLong(sizeIndex);
                    }
                    cursor.close();
                }
            } catch (Exception e) {
                Log.d(TAG, "Could not determine file size: " + e.getMessage());
            }

            byte[] buffer = new byte[chunkSize];
            int bytesRead;
            long totalRead = 0;
            boolean isFirstChunk = true;

            Log.d(TAG, "Starting to read file: " + uriString + ", chunkSize: " + chunkSize + ", totalSize: " + totalSize);

            while ((bytesRead = inputStream.read(buffer)) != -1) {
                // Create a properly sized array for this chunk
                byte[] chunk = new byte[bytesRead];
                System.arraycopy(buffer, 0, chunk, 0, bytesRead);

                // Encode chunk to base64
                String base64Chunk = Base64.encodeToString(chunk, Base64.NO_WRAP);

                // Create chunk event
                JSObject chunkEvent = new JSObject();
                chunkEvent.put("data", base64Chunk);
                chunkEvent.put("offset", totalRead);
                chunkEvent.put("size", bytesRead);
                chunkEvent.put("totalRead", totalRead + bytesRead);
                chunkEvent.put("totalSize", totalSize);
                chunkEvent.put("isLast", false);

                // Notify listeners
                notifyListeners("chunk", chunkEvent);

                totalRead += bytesRead;
                isFirstChunk = false;

                Log.d(TAG, "Read chunk: offset=" + (totalRead - bytesRead) + ", size=" + bytesRead + ", total=" + totalRead);
            }

            // Send final chunk event with isLast=true
            JSObject finalChunk = new JSObject();
            finalChunk.put("data", "");
            finalChunk.put("offset", totalRead);
            finalChunk.put("size", 0);
            finalChunk.put("totalRead", totalRead);
            finalChunk.put("totalSize", totalSize >= 0 ? totalSize : totalRead);
            finalChunk.put("isLast", true);
            notifyListeners("chunk", finalChunk);

            Log.d(TAG, "Finished reading file, total bytes: " + totalRead);

            // Resolve the call
            JSObject result = new JSObject();
            result.put("totalBytes", totalRead);
            call.resolve(result);

        } catch (SecurityException e) {
            Log.e(TAG, "Security exception reading file", e);
            final String errorMsg = "Permission denied: " + e.getMessage();
            getBridge().executeOnMainThread(() -> call.reject(errorMsg, e));
        } catch (IOException e) {
            Log.e(TAG, "IO exception reading file", e);
            final String errorMsg = "Error reading file: " + e.getMessage();
            getBridge().executeOnMainThread(() -> call.reject(errorMsg, e));
        } catch (Exception e) {
            Log.e(TAG, "Unexpected error reading file", e);
            final String errorMsg = "Unexpected error: " + e.getMessage();
            getBridge().executeOnMainThread(() -> call.reject(errorMsg, e));
        } finally {
            if (inputStream != null) {
                try {
                    inputStream.close();
                } catch (IOException e) {
                    Log.e(TAG, "Error closing input stream", e);
                }
            }
        }
    }
}
