import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'mobile_canvas',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    url: "http://192.168.0.14:3000",
    cleartext: true
    
  }
};

export default config;
