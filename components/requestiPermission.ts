import { Camera, PermissionStatus } from '@capacitor/camera';
import { Filesystem, PermissionStatus as FilesystemPermissionStatus } from '@capacitor/filesystem';

// Track permission states
let cameraPermissionGranted = false;
let filesystemPermissionGranted = false;

const checkCameraPermissions = async (): Promise<boolean> => {
  if (cameraPermissionGranted) return true;
  
  const status = await Camera.checkPermissions();
  cameraPermissionGranted = status.camera === 'granted';
  return cameraPermissionGranted;
};

const requestCameraPermissions = async (): Promise<boolean> => {
  if (cameraPermissionGranted) return true;
  
  try {
    const status = await Camera.requestPermissions();
    cameraPermissionGranted = status.camera === 'granted';
    console.log('Camera permissions:', status.camera);
    return cameraPermissionGranted;
  } catch (error) {
    console.error('Error requesting camera permissions:', error);
    return false;
  }
};

const requestFileSystemPermissions = async (): Promise<boolean> => {
  if (filesystemPermissionGranted) return true;
  
  try {
    const status = await Filesystem.requestPermissions();
    filesystemPermissionGranted = status.publicStorage === 'granted';
    console.log('Filesystem permissions:', status);
    return filesystemPermissionGranted;
  } catch (error) {
    console.error('Error requesting filesystem permissions:', error);
    return false;
  }
};

// New unified permission request function
const requestAllPermissions = async (): Promise<{
  camera: boolean;
  filesystem: boolean;
}> => {
  const [camera, filesystem] = await Promise.all([
    requestCameraPermissions(),
    requestFileSystemPermissions()
  ]);

  return { camera, filesystem };
};

// Optional: Reset permission states (useful for testing or when permissions are revoked)
const resetPermissionStates = () => {
  cameraPermissionGranted = false;
  filesystemPermissionGranted = false;
};

export {
  checkCameraPermissions,
  requestCameraPermissions,
  requestFileSystemPermissions,
  requestAllPermissions,
  resetPermissionStates
};
