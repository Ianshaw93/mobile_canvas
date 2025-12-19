# ContentUriReader Plugin Setup

## Overview
A custom Capacitor plugin that enables chunked reading of large files from `content://` URIs on Android, solving the OOM (Out of Memory) crash issue when importing large zip files.

## Files Created

### TypeScript/JavaScript
- `src/plugins/ContentUriReader.ts` - Main plugin registration and interface
- `src/plugins/definitions.ts` - TypeScript type definitions
- `src/plugins/ContentUriReader.web.ts` - Web platform stub (not implemented)

### Android Native
- `android/app/src/main/java/com/example/app/ContentUriReaderPlugin.java` - Native Android implementation using ContentResolver

### Configuration
- `android/app/src/main/assets/capacitor.plugins.json` - Plugin registration (updated)

## How It Works

1. **Native Side**: Uses Android's `ContentResolver.openInputStream()` to read files in chunks (1MB default)
2. **Chunk Events**: Each chunk is base64-encoded and sent to JavaScript via Capacitor's event system
3. **JavaScript Side**: Accumulates chunks into a `Uint8Array` as they arrive
4. **Progress**: Real-time progress updates based on bytes read

## Setup Instructions

### 1. Sync Capacitor
After adding the plugin files, run:
```bash
npx cap sync android
```

This will:
- Register the plugin in the Android project
- Update native dependencies
- Ensure the plugin is available at runtime

### 2. Build and Test
```bash
# Build the Android app
cd android
./gradlew assembleDebug

# Or open in Android Studio and build from there
```

### 3. Usage
The plugin is already integrated into `components/ImportProjectButton.tsx`. It will:
- Automatically use the plugin for `content://` URIs on Android
- Fall back to `Filesystem.readFile()` if the plugin fails
- Provide real-time progress updates

## Testing

1. **Small File Test** (< 10MB):
   - Should work with both plugin and fallback
   - Verify progress bar updates smoothly

2. **Large File Test** (45MB+):
   - Plugin should stream chunks without crashing
   - Progress should update incrementally
   - App should not close/crash

3. **Error Handling**:
   - Test with invalid URIs
   - Test with files that don't exist
   - Verify fallback mechanism works

## Troubleshooting

### Plugin Not Found
**IMPORTANT**: After running `npx cap sync android`, you MUST manually add the plugin entry back to `android/app/src/main/assets/capacitor.plugins.json`:

```json
{
  "pkg": "ContentUriReader",
  "classpath": "com.example.app.ContentUriReaderPlugin"
}
```

This is because Capacitor doesn't auto-discover local plugins - they need to be manually registered. The entry should be added after the `capacitor-file-chunk` entry.

After adding it:
1. Rebuild the Android app: `cd android && ./gradlew assembleDebug`
2. The plugin should now be available at runtime

### Chunks Not Arriving
- Check Android logcat for errors: `adb logcat | grep ContentUriReader`
- Verify the URI is valid and accessible
- Check that permissions are granted

### Memory Issues Persist
- Verify chunks are being processed incrementally (check logs)
- Ensure chunks are not being accumulated in memory unnecessarily
- Check that `isLast` chunk is being handled correctly

## Future Improvements

- Add iOS implementation (if needed)
- Add support for resumable downloads
- Add cancellation support
- Optimize chunk size based on available memory
