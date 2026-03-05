# App Preparation for APK Build

This skill prepares the app for APK build in Android Studio.

## Steps

1. **Update capacitor.config.ts for production**
   - Comment out the dev/hotreload server config (the one with `url: "http://192.168.0.14:3000"`)
   - Ensure the prod server config is uncommented:
     ```typescript
     "server": {
       "androidScheme": "http",
       "allowNavigation": ["*"],
       iosScheme: 'myapp',
       "cleartext": true
     },
     ```

2. **Run Capacitor sync**
   - Execute: `npx cap sync`

3. **Run static build**
   - Execute: `npm run static`
   - Fix any errors (warnings are acceptable)

## Expected Final State of capacitor.config.ts

```typescript
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

};

export default config;
```

## Instructions

When the user invokes `/appPrep`:

1. Read `capacitor.config.ts` to check current state
2. If the dev server config (with URL) is uncommented, comment it out
3. If the prod server config is commented out, uncomment it
4. Save the file
5. Run `npx cap sync` and report results
6. Run `npm run static` and report results
7. If there are errors (not warnings), attempt to fix them
8. Report completion status

Note: Do NOT touch capacitor.config.ts for any other reason besides this workflow.
