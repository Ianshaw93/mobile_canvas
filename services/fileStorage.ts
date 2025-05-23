import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

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
      // Create necessary directories
      await this.createDirectory(this.IMAGE_DIR);
      await this.createDirectory(this.PDF_DIR);
      await this.createDirectory(this.THUMBNAIL_DIR);
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
    await Filesystem.writeFile({
      directory: Directory.Data,
      path,
      data: base64Data
    });
    return path;
  }

  async saveThumbnail(base64Data: string, fileName: string): Promise<string> {
    const path = `${this.THUMBNAIL_DIR}/${fileName}`;
    await Filesystem.writeFile({
      directory: Directory.Data,
      path,
      data: base64Data
    });
    return path;
  }

  async savePDF(base64Data: string, fileName: string): Promise<string> {
    const path = `${this.PDF_DIR}/${fileName}`;
    await Filesystem.writeFile({
      directory: Directory.Data,
      path,
      data: base64Data
    });
    return path;
  }

  async readFile(path: string): Promise<string> {
    const result = await Filesystem.readFile({
      directory: Directory.Data,
      path
    });
    // @ts-ignore
    return result.data;
  }

  async deleteFile(path: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        directory: Directory.Data,
        path
      });
    } catch (error) {
      console.error(`Error deleting file ${path}:`, error);
    }
  }

  async cleanupUnusedFiles(usedPaths: Set<string>): Promise<void> {
    try {
      // Clean up images
      await this.cleanupDirectory(this.IMAGE_DIR, usedPaths);
      // Clean up thumbnails
      await this.cleanupDirectory(this.THUMBNAIL_DIR, usedPaths);
      // Clean up PDFs
      await this.cleanupDirectory(this.PDF_DIR, usedPaths);
    } catch (error) {
      console.error('Error cleaning up files:', error);
    }
  }

  private async cleanupDirectory(dirName: string, usedPaths: Set<string>): Promise<void> {
    try {
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
    } catch (error) {
      console.error(`Error cleaning up directory ${dirName}:`, error);
    }
  }
}

export const fileStorageService = FileStorageService.getInstance(); 