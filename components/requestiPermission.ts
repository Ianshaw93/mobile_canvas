import { Camera, PermissionStatus } from '@capacitor/camera';
import { Filesystem, PermissionStatus as FilesystemPermissionStatus } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
// import { Capacitor, Plugins } from '@capacitor/core';

const checkCameraPermissions = async () => {
  const status: PermissionStatus = await Camera.checkPermissions();
  console.log('Camera permission status:', status.camera); // Outputs: 'granted', 'denied', or 'prompt'
};

const requestCameraPermissions = async () => {
  const status: PermissionStatus = await Camera.requestPermissions();
  console.log('Requested camera permissions:', status.camera); // Outputs: 'granted', 'denied', or 'prompt'
};

const requestFileSystemPermissions = async () => {
  const status: FilesystemPermissionStatus = await Filesystem.requestPermissions();
  console.log('Requested camera permissions:', status);
  // const { storage } = await Permissions.query({ name: 'storage' });
  // if (storage.state !== 'granted') {
  //   await Permissions.request('storage');
  // }
};

export { checkCameraPermissions, requestCameraPermissions, requestFileSystemPermissions };
