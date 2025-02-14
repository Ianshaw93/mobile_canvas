import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'mobile_canvas',
  webDir: 'out',
  // server: {
  //   androidScheme: 'http',
  //   iosScheme: 'myapp',
  //   url: "http://192.168.0.14:3000",
  //   allowNavigation: ["*"],
  //   cleartext: true
  // },
    "server": {
    "androidScheme": "http",
    "allowNavigation": ["*"],
  iosScheme: 'myapp',
    "cleartext": true
  },
  plugins: {
    Permissions: {
      requestedPermissions: [
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_AUDIO",
        "android.permission.INTERNET",
        "android.permission.CAMERA"
      ]
    }
  }
};

export default config;
