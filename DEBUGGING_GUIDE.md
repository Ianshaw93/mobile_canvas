# Debugging Guide for ContentUriReader Plugin

## Running ADB Logcat

### Prerequisites
1. **Install Android SDK Platform Tools** (includes ADB):
   - Download from: https://developer.android.com/studio/releases/platform-tools
   - Or if you have Android Studio installed, ADB is already included
   - Add to your system PATH if not already there

2. **Enable USB Debugging on your Android device**:
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times to enable Developer Options
   - Go back to Settings → Developer Options
   - Enable "USB Debugging"

3. **Connect your device**:
   - Connect via USB cable
   - Or enable Wireless Debugging (Android 11+) and connect wirelessly

### Running Logcat Commands

#### Windows (Command Prompt or PowerShell)
```bash
# Navigate to where ADB is installed (if not in PATH)
# Usually: C:\Users\YourName\AppData\Local\Android\Sdk\platform-tools

# Or if ADB is in your PATH, just run:
adb logcat | findstr ContentUriReader
```

#### Mac/Linux (Terminal)
```bash
adb logcat | grep ContentUriReader
```

### Useful Logcat Commands

1. **Filter for ContentUriReader plugin only**:
   ```bash
   adb logcat | grep ContentUriReader
   ```

2. **Filter for IMPORT DEBUG messages**:
   ```bash
   adb logcat | grep "IMPORT DEBUG"
   ```

3. **Clear logcat and start fresh**:
   ```bash
   adb logcat -c
   adb logcat | grep ContentUriReader
   ```

4. **Save logs to a file**:
   ```bash
   adb logcat | grep ContentUriReader > import_debug.log
   ```

5. **View all logs (no filter)**:
   ```bash
   adb logcat
   ```

### Checking if ADB is Working

1. **Check if device is connected**:
   ```bash
   adb devices
   ```
   Should show your device listed

2. **If device not showing**:
   - Make sure USB debugging is enabled
   - Try different USB cable
   - On device, accept the "Allow USB debugging?" prompt
   - Try `adb kill-server` then `adb start-server`

### What to Look For in Logs

When testing the 45MB import, look for:

1. **Plugin initialization**:
   ```
   ContentUriReader: Starting to read file: content://...
   ```

2. **Chunk reading progress**:
   ```
   ContentUriReader: Read chunk: offset=... size=... total=...
   ```

3. **Memory/error messages**:
   ```
   ContentUriReader: ERROR or Exception messages
   ```

4. **JavaScript console logs** (if using Chrome DevTools):
   - Open Chrome and go to `chrome://inspect`
   - Find your app and click "inspect"
   - Check Console tab for `[IMPORT DEBUG]` messages

### Alternative: Using Android Studio

1. Open Android Studio
2. Connect your device
3. Go to **View → Tool Windows → Logcat**
4. Filter by tag: `ContentUriReader` or `IMPORT DEBUG`

### Alternative: Using Chrome DevTools (for JavaScript logs)

1. Connect your device
2. Open Chrome browser
3. Go to `chrome://inspect`
4. Find your app under "Remote Target"
5. Click "inspect"
6. Go to Console tab
7. Look for `[IMPORT DEBUG]` messages

## Troubleshooting

### ADB not found
- Make sure Android SDK Platform Tools is installed
- Add platform-tools to your system PATH
- Or use full path: `C:\Users\YourName\AppData\Local\Android\Sdk\platform-tools\adb.exe`

### No devices found
- Check USB cable connection
- Enable USB debugging on device
- Accept USB debugging prompt on device
- Try `adb kill-server && adb start-server`

### Logs too verbose
- Use filters: `adb logcat | grep ContentUriReader`
- Or filter by log level: `adb logcat *:E` (errors only)
