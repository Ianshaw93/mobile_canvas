import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

// IndexedDB-based storage for web platform
class WebFileStorage {
  private dbName = 'fileStorage';
  private storeName = 'files';
  private db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(this.storeName);
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async writeFile(path: string, data: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(data, path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async readFile(path: string): Promise<string> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).get(path);
      request.onsuccess = () => {
        if (request.result !== undefined) {
          resolve(request.result);
        } else {
          reject(new Error(`File not found: ${path}`));
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteFile(path: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async listFiles(dirPrefix: string): Promise<string[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).getAllKeys();
      request.onsuccess = () => {
        const keys = (request.result as string[]).filter(k => k.startsWith(dirPrefix + '/'));
        resolve(keys);
      };
      request.onerror = () => reject(request.error);
    });
  }
}

const webStorage = new WebFileStorage();
const isWeb = Capacitor.getPlatform() === 'web';

class FileStorageService {
  private static instance: FileStorageService;
  private readonly IMAGE_DIR = 'images';
  private readonly PDF_DIR = 'pdfs';
  private readonly THUMBNAIL_DIR = 'thumbnails';

  private constructor() {}

  public static getInstance(): FileStorageService {
    if (!FileStorageService.instance) {
      FileStorageService.instance = new FileStorageService();
    }
    return FileStorageService.instance;
  }

  async initialize() {
    try {
      if (!isWeb) {
        // Create necessary directories on native
        await this.createDirectory(this.IMAGE_DIR);
        await this.createDirectory(this.PDF_DIR);
        await this.createDirectory(this.THUMBNAIL_DIR);
      }
      return true;
    } catch (error) {
      console.error('Error initializing file storage:', error);
      return false;
    }
  }

  private async createDirectory(dirName: string) {
    try {
      await Filesystem.mkdir({
        directory: Directory.Data,
        path: dirName,
        recursive: true
      });
    } catch (error) {
      // Directory might already exist, which is fine
      console.log(`Directory ${dirName} might already exist:`, error);
    }
  }

  async saveImage(base64Data: string, fileName: string): Promise<string> {
    const path = `${this.IMAGE_DIR}/${fileName}`;
    if (isWeb) {
      await webStorage.writeFile(path, base64Data);
    } else {
      await Filesystem.writeFile({
        directory: Directory.Data,
        path,
        data: base64Data
      });
    }
    return path;
  }

  async saveThumbnail(base64Data: string, fileName: string): Promise<string> {
    const path = `${this.THUMBNAIL_DIR}/${fileName}`;
    if (isWeb) {
      await webStorage.writeFile(path, base64Data);
    } else {
      await Filesystem.writeFile({
        directory: Directory.Data,
        path,
        data: base64Data
      });
    }
    return path;
  }

  async savePDF(base64Data: string, fileName: string): Promise<string> {
    const path = `${this.PDF_DIR}/${fileName}`;
    if (isWeb) {
      await webStorage.writeFile(path, base64Data);
    } else {
      await Filesystem.writeFile({
        directory: Directory.Data,
        path,
        data: base64Data
      });
    }
    return path;
  }

  async readFile(path: string): Promise<string> {
    if (isWeb) {
      return webStorage.readFile(path);
    }
    const result = await Filesystem.readFile({
      directory: Directory.Data,
      path
    });
    // @ts-ignore
    return result.data;
  }

  async deleteFile(path: string): Promise<void> {
    try {
      if (isWeb) {
        await webStorage.deleteFile(path);
      } else {
        await Filesystem.deleteFile({
          directory: Directory.Data,
          path
        });
      }
    } catch (error) {
      console.error(`Error deleting file ${path}:`, error);
    }
  }

  async cleanupUnusedFiles(usedPaths: Set<string>): Promise<void> {
    try {
      await this.cleanupDirectory(this.IMAGE_DIR, usedPaths);
      await this.cleanupDirectory(this.THUMBNAIL_DIR, usedPaths);
      await this.cleanupDirectory(this.PDF_DIR, usedPaths);
    } catch (error) {
      console.error('Error cleaning up files:', error);
    }
  }

  private async cleanupDirectory(dirName: string, usedPaths: Set<string>): Promise<void> {
    try {
      if (isWeb) {
        const keys = await webStorage.listFiles(dirName);
        for (const key of keys) {
          if (!usedPaths.has(key)) {
            await webStorage.deleteFile(key);
          }
        }
      } else {
        const result = await Filesystem.readdir({
          directory: Directory.Data,
          path: dirName
        });
        for (const file of result.files) {
          const fullPath = `${dirName}/${file.name}`;
          if (!usedPaths.has(fullPath)) {
            await this.deleteFile(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error cleaning up directory ${dirName}:`, error);
    }
  }
}

export const fileStorageService = FileStorageService.getInstance();
