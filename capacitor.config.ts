import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'mobile_canvas',
  webDir: 'out',
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Authentication',
        biometricSubTitle: 'Authenticate to open database'
      }
    }
  },
  server: {
    androidScheme: 'http',
    iosScheme: 'myapp',
    url: "http://192.168.0.14:3000",
    allowNavigation: ["*"],
    cleartext: true
  },
  // "server": {
  //   "androidScheme": "http",
  //   "allowNavigation": ["*"],
  // iosScheme: 'myapp',
  //   "cleartext": true
  // },

};

export default config;
