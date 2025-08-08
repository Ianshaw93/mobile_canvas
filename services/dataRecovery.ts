import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { database } from './database';
import type { DBImage } from './database';

/**
 * Data Recovery Service for corrupted image URLs
 * 
 * This service helps recover images where the URL field in the SQL database
 * has been corrupted (set to empty string) due to the addCommentToImage bug.
 */

interface RecoveryResult {
  totalImages: number;
  corruptedImages: number;
  recoveredImages: number;
  failedRecoveries: number;
  errors: string[];
}

interface OrphanedFile {
  filename: string;
  path: string;
}

class DataRecoveryService {
  private static instance: DataRecoveryService;
  
  private constructor() {}
  
  static getInstance(): DataRecoveryService {
    if (!DataRecoveryService.instance) {
      DataRecoveryService.instance = new DataRecoveryService();
    }
    return DataRecoveryService.instance;
  }

  /**
   * Main recovery function - attempts to restore all corrupted image URLs
   */
  async recoverCorruptedImageUrls(): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      totalImages: 0,
      corruptedImages: 0,
      recoveredImages: 0,
      failedRecoveries: 0,
      errors: []
    };

    try {
      if (!Capacitor.isNativePlatform()) {
        throw new Error('Recovery only available on native platforms');
      }

      console.log('🔄 Starting image URL recovery process...');

      // Step 1: Get all images from database
      const allImages = await this.getAllImagesFromDatabase();
      result.totalImages = allImages.length;
      console.log(`📊 Found ${allImages.length} images in database`);

      // Step 2: Identify corrupted images (empty or invalid URLs)
      const corruptedImages = allImages.filter(img => 
        !img.url || 
        img.url.trim() === '' || 
        (!img.url.startsWith('data:image/') && !img.url.startsWith('data:application/'))
      );
      result.corruptedImages = corruptedImages.length;
      console.log(`❌ Found ${corruptedImages.length} corrupted image URLs`);

      if (corruptedImages.length === 0) {
        console.log('✅ No corrupted images found - recovery not needed');
        return result;
      }

      // Step 3: Get all available image files from filesystem
      const availableFiles = await this.getAvailableImageFiles();
      console.log(`📁 Found ${availableFiles.length} image files on filesystem`);

      // Step 4: Attempt recovery for each corrupted image
      for (const corruptedImage of corruptedImages) {
        try {
          const recovered = await this.recoverSingleImage(corruptedImage, availableFiles);
          if (recovered) {
            result.recoveredImages++;
            console.log(`✅ Recovered image: ${corruptedImage.id}`);
          } else {
            result.failedRecoveries++;
            console.log(`❌ Failed to recover image: ${corruptedImage.id}`);
          }
        } catch (error) {
          result.failedRecoveries++;
          const errorMsg = `Error recovering image ${corruptedImage.id}: ${error}`;
          result.errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      console.log('🎉 Recovery process completed:', result);
      return result;

    } catch (error) {
      const errorMsg = `Fatal error during recovery: ${error}`;
      result.errors.push(errorMsg);
      console.error(errorMsg);
      throw error;
    }
  }

  /**
   * Get all images from the database
   */
  private async getAllImagesFromDatabase(): Promise<DBImage[]> {
    try {
      // We need to query all images since there's no "getAllImages" method
      // We'll get all projects, then all plans, then all points, then all images
      const projects = await database.getAllProjects();
      const allImages: DBImage[] = [];

      for (const project of projects) {
        const plans = await database.getPlansByProject(project.id);
        for (const plan of plans) {
          const points = await database.getPointsByPlan(plan.id);
          for (const point of points) {
            const images = await database.getImagesByPoint(point.id);
            allImages.push(...images);
          }
        }
      }

      return allImages;
    } catch (error) {
      console.error('Error getting all images from database:', error);
      throw error;
    }
  }

  /**
   * Get all available image files from filesystem
   */
  private async getAvailableImageFiles(): Promise<OrphanedFile[]> {
    try {
      const result = await Filesystem.readdir({
        path: '',
        directory: Directory.Data
      });

      // Filter for image files (should be timestamp.jpeg format)
      const imageFiles = result.files
        .filter(file => 
          file.name.endsWith('.jpeg') || 
          file.name.endsWith('.jpg') ||
          file.name.endsWith('.png')
        )
        .map(file => ({
          filename: file.name,
          path: file.name
        }));

      return imageFiles;
    } catch (error) {
      console.error('Error reading filesystem:', error);
      throw error;
    }
  }

  /**
   * Attempt to recover a single corrupted image
   */
  private async recoverSingleImage(
    corruptedImage: DBImage, 
    availableFiles: OrphanedFile[]
  ): Promise<boolean> {
    try {
      // Method 1: Direct filename match
      // The image.id should contain the filename
      const matchingFile = availableFiles.find(file => 
        file.filename === corruptedImage.id ||
        file.filename === `${corruptedImage.id}.jpeg` ||
        file.filename === `${corruptedImage.id}.jpg`
      );

      if (matchingFile) {
        console.log(`🔍 Found matching file for ${corruptedImage.id}: ${matchingFile.filename}`);
        const recoveredUrl = await this.reconstructImageUrl(matchingFile.path);
        
        if (recoveredUrl) {
          await this.updateImageUrl(corruptedImage.id, recoveredUrl);
          return true;
        }
      }

      // Method 2: Timestamp-based matching (if ID is corrupted)
      // Try to find files that might belong to this image based on creation time
      console.log(`🔍 Attempting timestamp-based recovery for ${corruptedImage.id}`);
      
      // Extract potential timestamp from various sources
      const potentialTimestamps = this.extractPotentialTimestamps(corruptedImage);
      
      for (const timestamp of potentialTimestamps) {
        const timestampFile = availableFiles.find(file => 
          file.filename.includes(timestamp.toString()) ||
          file.filename.startsWith(timestamp.toString())
        );
        
        if (timestampFile) {
          console.log(`🔍 Found timestamp match: ${timestampFile.filename}`);
          const recoveredUrl = await this.reconstructImageUrl(timestampFile.path);
          
          if (recoveredUrl) {
            await this.updateImageUrl(corruptedImage.id, recoveredUrl);
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error(`Error recovering image ${corruptedImage.id}:`, error);
      return false;
    }
  }

  /**
   * Reconstruct base64 data URL from filesystem
   */
  private async reconstructImageUrl(filePath: string): Promise<string | null> {
    try {
      const fileData = await Filesystem.readFile({
        path: filePath,
        directory: Directory.Data
      });

      // Create proper data URL
      const dataUrl = `data:image/jpeg;base64,${fileData.data}`;
      
      // Validate that it's a proper image
      if (fileData.data && fileData.data.length > 0) {
        return dataUrl;
      }

      return null;
    } catch (error) {
      console.error(`Error reconstructing URL for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Update image URL in database
   */
  private async updateImageUrl(imageId: string, newUrl: string): Promise<void> {
    try {
      // Get the existing image data first
      const existingImage = await this.getImageById(imageId);
      if (!existingImage) {
        throw new Error(`Image ${imageId} not found in database`);
      }

      // Update with proper data
      await database.updateImage({
        ...existingImage,
        url: newUrl,
        updated_at: new Date().toISOString()
      });

      console.log(`✅ Updated URL for image ${imageId}`);
    } catch (error) {
      console.error(`Error updating image URL for ${imageId}:`, error);
      throw error;
    }
  }

  /**
   * Get image by ID (helper method since it doesn't exist in database service)
   */
  private async getImageById(imageId: string): Promise<DBImage | null> {
    try {
      // We need to search through all images to find the one with matching ID
      const allImages = await this.getAllImagesFromDatabase();
      return allImages.find(img => img.id === imageId) || null;
    } catch (error) {
      console.error(`Error getting image by ID ${imageId}:`, error);
      return null;
    }
  }

  /**
   * Extract potential timestamps from image record
   */
  private extractPotentialTimestamps(image: DBImage): number[] {
    const timestamps: number[] = [];

    // Try to extract timestamp from ID if it looks like a timestamp
    if (image.id && /^\d+$/.test(image.id)) {
      timestamps.push(parseInt(image.id));
    }

    // Try to extract from created_at
    if (image.created_at) {
      const createdTimestamp = new Date(image.created_at).getTime();
      timestamps.push(createdTimestamp);
    }

    // Try to extract from updated_at
    if (image.updated_at) {
      const updatedTimestamp = new Date(image.updated_at).getTime();
      timestamps.push(updatedTimestamp);
    }

    return timestamps;
  }

  /**
   * Dry run - analyze corruption without making changes
   */
  async analyzeCorruption(): Promise<{
    totalImages: number;
    corruptedImages: DBImage[];
    availableFiles: OrphanedFile[];
    potentialMatches: Array<{ image: DBImage; matchingFiles: OrphanedFile[] }>;
  }> {
    const allImages = await this.getAllImagesFromDatabase();
    const corruptedImages = allImages.filter(img => 
      !img.url || 
      img.url.trim() === '' || 
      (!img.url.startsWith('data:image/') && !img.url.startsWith('data:application/'))
    );
    const availableFiles = await this.getAvailableImageFiles();

    const potentialMatches = corruptedImages.map(image => {
      const matchingFiles = availableFiles.filter(file => 
        file.filename === image.id ||
        file.filename === `${image.id}.jpeg` ||
        file.filename === `${image.id}.jpg`
      );
      return { image, matchingFiles };
    });

    return {
      totalImages: allImages.length,
      corruptedImages,
      availableFiles,
      potentialMatches
    };
  }
}

export const dataRecoveryService = DataRecoveryService.getInstance();