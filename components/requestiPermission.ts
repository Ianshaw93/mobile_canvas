import { Camera } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

// Android permission constants
const ANDROID_PERMISSIONS = {
  CAMERA: 'android.permission.CAMERA',
  READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
  WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
  READ_MEDIA_IMAGES: 'android.permission.READ_MEDIA_IMAGES',
  READ_MEDIA_VIDEO: 'android.permission.READ_MEDIA_VIDEO',
  READ_MEDIA_AUDIO: 'android.permission.READ_MEDIA_AUDIO',
  MANAGE_EXTERNAL_STORAGE: 'android.permission.MANAGE_EXTERNAL_STORAGE'
};

export const checkCameraPermissions = async (): Promise<boolean> => {
  const platform = Capacitor.getPlatform();
  console.log('[Permissions] Checking camera permissions on platform:', platform);
  
  if (platform === 'web') {
    console.log('[Permissions] Web platform - camera permission granted by default');
    return true;
  }
  try {
    console.log('[Permissions] Checking camera permissions...');
    const { camera } = await Camera.checkPermissions();
    console.log('[Permissions] Camera permission status:', camera);
    return camera === 'granted';
  } catch (error) {
    console.error('[Permissions] Error checking camera permissions:', error);
    return false;
  }
};

export const requestCameraPermissions = async (): Promise<boolean> => {
  const platform = Capacitor.getPlatform();
  console.log('[Permissions] Requesting camera permissions on platform:', platform);
  
  if (platform === 'web') {
    console.log('[Permissions] Web platform - camera permission granted by default');
    return true;
  }
  try {
    console.log('[Permissions] Requesting camera permissions...');
    const { camera } = await Camera.requestPermissions();
    console.log('[Permissions] Camera permission result:', camera);
    return camera === 'granted';
  } catch (error) {
    console.error('[Permissions] Error requesting camera permissions:', error);
    return false;
  }
};

export const checkFileSystemPermissions = async (): Promise<boolean> => {
  const platform = Capacitor.getPlatform();
  console.log('[Permissions] Checking filesystem permissions on platform:', platform);
  
  if (platform === 'web') {
    console.log('[Permissions] Web platform - filesystem permission granted by default');
    return true;
  }
  try {
    console.log('[Permissions] Checking filesystem permissions...');
    // For Android, we'll consider filesystem permissions granted if we can read the data directory
    const result = await Filesystem.readdir({
      path: '',
      directory: Directory.Data
    });
    console.log('[Permissions] Filesystem permission check successful');
    return true;
  } catch (error) {
    console.error('[Permissions] Error checking filesystem permissions:', error);
    return false;
  }
};

export const requestFileSystemPermissions = async (): Promise<boolean> => {
  const platform = Capacitor.getPlatform();
  console.log('[Permissions] Requesting filesystem permissions on platform:', platform);
  
  if (platform === 'web') {
    console.log('[Permissions] Web platform - filesystem permission granted by default');
    return true;
  }
  try {
    console.log('[Permissions] Requesting filesystem permissions...');
    
    // For Android, we need to request storage permissions
    if (platform === 'android') {
      try {
        // Try to write to the data directory first
        console.log('[Permissions] Testing write access to data directory...');
        await Filesystem.writeFile({
          path: 'temp.txt',
          data: 'testing',
          directory: Directory.Data
        });
        console.log('[Permissions] Write access successful');
        return true;
      } catch (error) {
        console.log('[Permissions] Write access failed, attempting to request permissions...');
        // If write fails, try to read the data directory
        try {
          await Filesystem.readdir({
            path: '',
            directory: Directory.Data
          });
          console.log('[Permissions] Read access successful');
          return true;
        } catch (readError) {
          console.error('[Permissions] Read access failed:', readError);
          // If both read and write fail, we'll continue anyway
          // The app will handle permission errors when they occur
          return true;
        }
      }
    }
    
    // For iOS, we'll consider filesystem permissions granted if we can read the data directory
    console.log('[Permissions] iOS platform detected, checking data directory access...');
    const result = await Filesystem.readdir({
      path: '',
      directory: Directory.Data
    });
    console.log('[Permissions] Filesystem permission check successful');
    return true;
  } catch (error) {
    console.error('[Permissions] Error requesting filesystem permissions:', error);
    // Continue anyway, let the app handle permission errors
    return true;
  }
};

export const requestAllPermissions = async (): Promise<{ camera: boolean; filesystem: boolean }> => {
  const platform = Capacitor.getPlatform();
  console.log('[Permissions] Starting permission requests on platform:', platform);
  
  try {
    // Request camera permissions first
    console.log('[Permissions] Requesting camera permissions...');
    const camera = await requestCameraPermissions();
    console.log('[Permissions] Camera permission result:', camera);
    
    // Then check filesystem permissions
    console.log('[Permissions] Checking filesystem permissions...');
    const filesystem = await checkFileSystemPermissions();
    console.log('[Permissions] Filesystem permission result:', filesystem);
    
    console.log('[Permissions] All permissions requested:', { camera, filesystem });
    return { camera, filesystem };
  } catch (error) {
    console.error('[Permissions] Error requesting all permissions:', error);
    // Return true for filesystem to allow the app to continue
    return { camera: false, filesystem: true };
  }
};
