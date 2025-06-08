import { Camera } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

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

export type PermissionStatus = {
  camera: boolean;
  storage: boolean;
  network: boolean;
  isChecking: boolean;
  error: string | null;
};

export type PermissionCallback = (status: PermissionStatus) => void;

let permissionCallbacks: PermissionCallback[] = [];
let currentStatus: PermissionStatus = {
  camera: false,
  storage: false,
  network: false,
  isChecking: false,
  error: null
};

export const addPermissionCallback = (callback: PermissionCallback) => {
  permissionCallbacks.push(callback);
  // Immediately notify the new callback of current status
  callback(currentStatus);
};

export const removePermissionCallback = (callback: PermissionCallback) => {
  permissionCallbacks = permissionCallbacks.filter(cb => cb !== callback);
};

const notifyPermissionCallbacks = (status: PermissionStatus) => {
  currentStatus = status;
  permissionCallbacks.forEach(callback => callback(status));
};

export const checkNetworkStatus = async (): Promise<boolean> => {
  const platform = Capacitor.getPlatform();
  console.log('[Permissions] Checking network status on platform:', platform);
  
  try {
    const status = await Network.getStatus();
    console.log('[Permissions] Network status:', status);
    return status.connected;
  } catch (error) {
    console.error('[Permissions] Error checking network status:', error);
    return false;
  }
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

export const checkAllPermissions = async (): Promise<PermissionStatus> => {
  if (typeof window === 'undefined') return currentStatus;

  try {
    notifyPermissionCallbacks({
      ...currentStatus,
      isChecking: true,
      error: null
    });

    // Check camera permission
    const cameraPermission = await Camera.checkPermissions();
    const hasCameraPermission = cameraPermission.camera === 'granted';

    // Check storage permission
    const hasStoragePermission = await checkFileSystemPermissions();

    // Check network status
    const hasNetwork = await checkNetworkStatus();

    const newStatus: PermissionStatus = {
      camera: hasCameraPermission,
      storage: hasStoragePermission,
      network: hasNetwork,
      isChecking: false,
      error: null
    };

    notifyPermissionCallbacks(newStatus);
    return newStatus;
  } catch (error: any) {
    const errorStatus: PermissionStatus = {
      ...currentStatus,
      isChecking: false,
      error: `Failed to check permissions: ${error?.message || 'Unknown error'}`
    };
    notifyPermissionCallbacks(errorStatus);
    return errorStatus;
  }
};

export const requestAllPermissions = async (): Promise<PermissionStatus> => {
  const platform = Capacitor.getPlatform();
  console.log('[Permissions] Starting permission requests on platform:', platform);
  
  try {
    notifyPermissionCallbacks({
      ...currentStatus,
      isChecking: true,
      error: null
    });

    // Request camera permissions first
    console.log('[Permissions] Requesting camera permissions...');
    const camera = await requestCameraPermissions();
    console.log('[Permissions] Camera permission result:', camera);
    
    // Then check filesystem permissions
    console.log('[Permissions] Checking filesystem permissions...');
    const storage = await checkFileSystemPermissions();
    console.log('[Permissions] Filesystem permission result:', storage);

    // Check network status
    const network = await checkNetworkStatus();
    console.log('[Permissions] Network status:', network);
    
    const newStatus: PermissionStatus = {
      camera,
      storage,
      network,
      isChecking: false,
      error: null
    };

    notifyPermissionCallbacks(newStatus);
    return newStatus;
  } catch (error: any) {
    const errorStatus: PermissionStatus = {
      ...currentStatus,
      isChecking: false,
      error: `Failed to request permissions: ${error?.message || 'Unknown error'}`
    };
    notifyPermissionCallbacks(errorStatus);
    return errorStatus;
  }
};

// Initialize network status listener
Network.addListener('networkStatusChange', async (status) => {
  const newStatus: PermissionStatus = {
    ...currentStatus,
    network: status.connected
  };
  notifyPermissionCallbacks(newStatus);
});
