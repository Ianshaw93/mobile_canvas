/**
 * Tests for FileUploadService
 * 
 * Tests the file upload flow:
 * 1. Get presigned URL from backend
 * 2. Upload file to MinIO
 * 3. Confirm upload and get file key
 */

import { FileUploadService, PresignedUrlResponse, UploadResult } from '../FileUploadService';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Filesystem
jest.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    readFile: jest.fn(),
  },
  Directory: {
    Data: 'DATA',
  },
}));

import { Filesystem } from '@capacitor/filesystem';

// Valid base64 encoded test data (just "test" in base64)
const VALID_BASE64 = 'dGVzdA==';

describe('FileUploadService', () => {
  let service: FileUploadService;
  
  beforeEach(() => {
    service = new FileUploadService('https://test-api.com');
    mockFetch.mockReset();
    (Filesystem.readFile as jest.Mock).mockReset();
  });

  describe('getPresignedUploadUrl', () => {
    it('should request presigned URL from backend', async () => {
      const mockResponse: PresignedUrlResponse = {
        file_key: 'projects/proj-123/images/abc.jpg',
        upload_url: 'https://minio.example.com/presigned-url',
        filename: 'photo.jpg',
        expires_in_seconds: 900,
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.getPresignedUploadUrl({
        filename: 'photo.jpg',
        content_type: 'image/jpeg',
        project_id: 'proj-123',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.com/api/mobile/files/presign-upload',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result.file_key).toBe('projects/proj-123/images/abc.jpg');
      expect(result.upload_url).toBe('https://minio.example.com/presigned-url');
    });

    it('should throw error on failed request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(
        service.getPresignedUploadUrl({
          filename: 'photo.jpg',
          content_type: 'image/jpeg',
        })
      ).rejects.toThrow('Failed to get presigned URL');
    });
  });

  describe('uploadFileToPresignedUrl', () => {
    it('should upload file data to presigned URL', async () => {
      const presignedUrl = 'https://minio.example.com/presigned-put-url';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      // Use valid base64 data
      await service.uploadFileToPresignedUrl(presignedUrl, VALID_BASE64, 'image/jpeg');

      expect(mockFetch).toHaveBeenCalledWith(
        presignedUrl,
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
        })
      );
    });

    it('should throw error on failed upload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(
        service.uploadFileToPresignedUrl(
          'https://minio.example.com/url',
          VALID_BASE64,
          'image/jpeg'
        )
      ).rejects.toThrow('Failed to upload file');
    });
  });

  describe('confirmUpload', () => {
    it('should confirm upload with backend', async () => {
      const confirmResponse = {
        status: 'success',
        attachment_id: 'att-123',
        file_key: 'projects/proj-123/images/abc.jpg',
        download_url: 'https://minio.example.com/download-url',
      };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(confirmResponse),
      });

      const result = await service.confirmUpload({
        file_key: 'projects/proj-123/images/abc.jpg',
        filename: 'photo.jpg',
        content_type: 'image/jpeg',
        pin_id: 'pin-123',
        project_id: 'proj-123',
        site_visit_number: 1,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-api.com/api/mobile/files/confirm-upload',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result.status).toBe('success');
    });
  });

  describe('uploadLocalFile', () => {
    it('should upload local file and return server URL', async () => {
      // Mock reading local file - use valid base64
      (Filesystem.readFile as jest.Mock).mockResolvedValueOnce({
        data: VALID_BASE64,
      });

      // Mock presigned URL request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          file_key: 'projects/proj-123/images/abc.jpg',
          upload_url: 'https://minio.example.com/presigned-url',
          filename: 'photo.jpg',
          expires_in_seconds: 900,
        }),
      });

      // Mock upload to MinIO
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      // Mock confirm upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: 'success',
          attachment_id: 'att-123',
          file_key: 'projects/proj-123/images/abc.jpg',
        }),
      });

      const result = await service.uploadLocalFile({
        localPath: 'images/photo.jpg',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        projectId: 'proj-123',
        pinId: 'pin-123',
        siteVisitNumber: 1,
      });

      expect(result.success).toBe(true);
      expect(result.serverUrl).toBe('projects/proj-123/images/abc.jpg');
    });

    it('should return failure on upload error', async () => {
      (Filesystem.readFile as jest.Mock).mockResolvedValueOnce({
        data: VALID_BASE64,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      });

      const result = await service.uploadLocalFile({
        localPath: 'images/photo.jpg',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        projectId: 'proj-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('uploadPlanPdf', () => {
    it('should upload PDF and return server URL', async () => {
      (Filesystem.readFile as jest.Mock).mockResolvedValueOnce({
        data: VALID_BASE64,
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            file_key: 'projects/proj-123/plans/plan-456.pdf',
            upload_url: 'https://minio.example.com/presigned-url',
            filename: 'floor-plan.pdf',
            expires_in_seconds: 900,
          }),
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            status: 'success',
            file_key: 'projects/proj-123/plans/plan-456.pdf',
          }),
        });

      const result = await service.uploadPlanPdf({
        localPath: 'pdfs/floor-plan.pdf',
        filename: 'floor-plan.pdf',
        projectId: 'proj-123',
        planId: 'plan-456',
        siteVisitNumber: 1,
      });

      expect(result.success).toBe(true);
      expect(result.serverUrl).toBe('projects/proj-123/plans/plan-456.pdf');
    });
  });

  describe('uploadAttachmentImage', () => {
    it('should upload image and return server URL', async () => {
      (Filesystem.readFile as jest.Mock).mockResolvedValueOnce({
        data: VALID_BASE64,
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            file_key: 'projects/proj-123/images/att-789.jpg',
            upload_url: 'https://minio.example.com/presigned-url',
            filename: 'photo.jpg',
            expires_in_seconds: 900,
          }),
        })
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            status: 'success',
            attachment_id: 'att-789',
            file_key: 'projects/proj-123/images/att-789.jpg',
          }),
        });

      const result = await service.uploadAttachmentImage({
        localPath: 'images/photo.jpg',
        filename: 'photo.jpg',
        projectId: 'proj-123',
        pinId: 'pin-123',
        siteVisitNumber: 1,
        comment: 'Fire stopping photo',
      });

      expect(result.success).toBe(true);
      expect(result.serverUrl).toBe('projects/proj-123/images/att-789.jpg');
      expect(result.attachmentId).toBe('att-789');
    });
  });
});
