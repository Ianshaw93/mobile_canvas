/**
 * FileUploadService - Handles uploading local files to MinIO via presigned URLs.
 * 
 * Flow:
 * 1. Read local file from Capacitor Filesystem
 * 2. Request presigned upload URL from backend
 * 3. Upload file directly to MinIO using presigned URL
 * 4. Confirm upload with backend to save metadata
 * 
 * This service is used during sync to upload PDFs and images to the server.
 */

import { Filesystem, Directory } from '@capacitor/filesystem';

// =============================================================================
// Types
// =============================================================================

export interface PresignedUrlRequest {
  filename: string;
  content_type: string;
  project_id?: string;
  pin_id?: string;
}

export interface PresignedUrlResponse {
  file_key: string;
  upload_url: string;
  filename: string;
  expires_in_seconds: number;
}

export interface ConfirmUploadRequest {
  file_key: string;
  filename: string;
  content_type: string;
  pin_id?: string;
  project_id?: string;
  site_visit_number?: number;
  comment?: string;
  device_id?: string;
  device_name?: string;
}

export interface ConfirmUploadResponse {
  status: string;
  attachment_id?: string;
  file_key: string;
  download_url?: string;
}

export interface UploadResult {
  success: boolean;
  serverUrl?: string;
  attachmentId?: string;
  error?: string;
}

export interface LocalFileUploadOptions {
  localPath: string;
  filename: string;
  contentType: string;
  projectId?: string;
  pinId?: string;
  siteVisitNumber?: number;
  comment?: string;
}

export interface PlanPdfUploadOptions {
  localPath: string;
  filename: string;
  projectId: string;
  planId: string;
  siteVisitNumber?: number;
}

export interface AttachmentImageUploadOptions {
  localPath: string;
  filename: string;
  projectId: string;
  pinId: string;
  siteVisitNumber?: number;
  comment?: string;
}

// =============================================================================
// FileUploadService
// =============================================================================

export class FileUploadService {
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Get a presigned URL for uploading a file to MinIO.
   */
  async getPresignedUploadUrl(request: PresignedUrlRequest): Promise<PresignedUrlResponse> {
    const response = await fetch(`${this.apiBaseUrl}/api/mobile/files/presign-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to get presigned URL: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Upload file data to a presigned URL.
   */
  async uploadFileToPresignedUrl(
    presignedUrl: string,
    fileData: string | Blob,
    contentType: string
  ): Promise<void> {
    // Convert base64 to Blob if needed
    let body: Blob;
    if (typeof fileData === 'string') {
      // Assume base64 encoded data
      const byteCharacters = atob(fileData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      body = new Blob([byteArray], { type: contentType });
    } else {
      body = fileData;
    }

    const response = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Confirm upload with backend to save metadata.
   */
  async confirmUpload(request: ConfirmUploadRequest): Promise<ConfirmUploadResponse> {
    const response = await fetch(`${this.apiBaseUrl}/api/mobile/files/confirm-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to confirm upload: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Upload a local file to the server.
   * Handles the complete flow: read local file -> get presigned URL -> upload -> confirm.
   */
  async uploadLocalFile(options: LocalFileUploadOptions): Promise<UploadResult> {
    try {
      // Step 1: Read local file
      console.log(`[FileUploadService] Reading local file: ${options.localPath}`);
      const fileResult = await Filesystem.readFile({
        path: options.localPath,
        directory: Directory.Data,
      });
      
      // Handle both string and Blob responses
      const fileData = typeof fileResult.data === 'string' 
        ? fileResult.data 
        : await this.blobToBase64(fileResult.data as Blob);

      // Step 2: Get presigned URL
      console.log(`[FileUploadService] Getting presigned URL for: ${options.filename}`);
      const presignedResponse = await this.getPresignedUploadUrl({
        filename: options.filename,
        content_type: options.contentType,
        project_id: options.projectId,
        pin_id: options.pinId,
      });

      // Step 3: Upload to MinIO
      console.log(`[FileUploadService] Uploading to MinIO: ${presignedResponse.file_key}`);
      await this.uploadFileToPresignedUrl(
        presignedResponse.upload_url,
        fileData,
        options.contentType
      );

      // Step 4: Confirm upload
      console.log(`[FileUploadService] Confirming upload: ${presignedResponse.file_key}`);
      const confirmResponse = await this.confirmUpload({
        file_key: presignedResponse.file_key,
        filename: options.filename,
        content_type: options.contentType,
        pin_id: options.pinId,
        project_id: options.projectId,
        site_visit_number: options.siteVisitNumber,
        comment: options.comment,
      });

      console.log(`[FileUploadService] Upload complete: ${presignedResponse.file_key}`);
      return {
        success: true,
        serverUrl: presignedResponse.file_key,
        attachmentId: confirmResponse.attachment_id,
      };
    } catch (error) {
      console.error('[FileUploadService] Upload failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Upload a plan PDF to the server.
   */
  async uploadPlanPdf(options: PlanPdfUploadOptions): Promise<UploadResult> {
    return this.uploadLocalFile({
      localPath: options.localPath,
      filename: options.filename,
      contentType: 'application/pdf',
      projectId: options.projectId,
      siteVisitNumber: options.siteVisitNumber,
    });
  }

  /**
   * Upload an attachment image to the server.
   */
  async uploadAttachmentImage(options: AttachmentImageUploadOptions): Promise<UploadResult> {
    // Determine content type from filename
    const ext = options.filename.toLowerCase().split('.').pop();
    let contentType = 'image/jpeg';
    if (ext === 'png') contentType = 'image/png';
    else if (ext === 'gif') contentType = 'image/gif';
    else if (ext === 'webp') contentType = 'image/webp';

    return this.uploadLocalFile({
      localPath: options.localPath,
      filename: options.filename,
      contentType,
      projectId: options.projectId,
      pinId: options.pinId,
      siteVisitNumber: options.siteVisitNumber,
      comment: options.comment,
    });
  }

  /**
   * Helper to convert Blob to base64.
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove data URL prefix if present
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// =============================================================================
// Default Instance
// =============================================================================

// Toggle between localhost (for dev) and production server
const USE_LOCALHOST = false;
const API_BASE_URL = USE_LOCALHOST 
  ? 'http://192.168.0.14:8080'
  : 'https://web-production-44b8.up.railway.app';

export const fileUploadService = new FileUploadService(API_BASE_URL);
