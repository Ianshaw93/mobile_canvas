import { Camera, PermissionStatus } from '@capacitor/camera';

const checkCameraPermissions = async () => {
  const status: PermissionStatus = await Camera.checkPermissions();
  console.log('Camera permission status:', status.camera); // Outputs: 'granted', 'denied', or 'prompt'
};

const requestCameraPermissions = async () => {
  const status: PermissionStatus = await Camera.requestPermissions();
  console.log('Requested camera permissions:', status.camera); // Outputs: 'granted', 'denied', or 'prompt'
};
