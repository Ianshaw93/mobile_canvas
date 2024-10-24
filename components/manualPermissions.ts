import { Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

export async function requestStoragePermissions() {
  if (Capacitor.getPlatform() === 'android') {
    try {
      // Attempt to write a temporary file to see if we have write access
      await Filesystem.writeFile({
        path: 'temp.txt',
        data: 'testing',
        // @ts-ignore
        directory: 'DOCUMENTS',
      });
      console.log("Storage permissions already granted.");
    } catch (error) {
      console.log("Storage permissions not granted. Please enable them in app settings.");
    }
  }
}

// requestStoragePermissions();
