import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'mobile_canvas',
  webDir: 'out',
  // server: {
  //   androidScheme: 'https',
  //   url: "http://10.153.102.219:3000",
  //   cleartext: true
    
  // }
  "server": {
    "androidScheme": "http",
    "allowNavigation": ["*"],
    "cleartext": true
  },
  "android": {
    "allowMixedContent": true
  },
  "ios": {
    "contentInset": "always"
  }
};

export default config;
