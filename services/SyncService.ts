/**
 * SyncService - Handles synchronization between mobile app and backend server.
 * 
 * Features:
 * - Device identity management (generates and persists device ID)
 * - Push project data to server with attribution
 * - Pull project data from server
 * - Merge pulled data into local database
 * - Handle multi-device collaboration
 */

import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { database, DBProject, DBPlan, DBPoint, DBImage } from './database';
import { v4 as uuidv4 } from 'uuid';
import { FileUploadService, UploadResult } from './FileUploadService';

// =============================================================================
// Configuration
// =============================================================================

// Toggle between localhost (for dev) and production server
const USE_LOCALHOST = false; // Set to true for local testing
const API_BASE_URL = USE_LOCALHOST 
  ? 'http://192.168.0.14:8080'
  : 'https://web-production-44b8.up.railway.app';

// Storage keys
const DEVICE_ID_KEY = 'sync_device_id';
const DEVICE_NAME_KEY = 'sync_device_name';
const USER_ID_KEY = 'sync_user_id';
const USER_NAME_KEY = 'sync_user_name';
const LAST_SYNC_KEY = 'sync_last_timestamp';

// =============================================================================
// Types
// =============================================================================

export interface DeviceInfo {
  device_id: string;
  device_name: string;
  user_id?: string;
  user_name?: string;
}

export interface SyncPushRequest {
  device: DeviceInfo;
  projects?: ServerProject[];
  plans?: ServerPlan[];
  pins?: ServerPin[];
  pin_comments?: ServerPinComment[];
  attachments?: ServerAttachment[];
}

export interface ServerProject {
  id: string;
  name: string;
  thumbnail_url?: string;
  client_name?: string;
  engineer_name?: string;
  site_visit_number: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface ServerPlan {
  id: string;
  project_id: string;
  name: string;
  pdf_url?: string;
  thumbnail_url?: string;
  display_order: number;
  site_visit_number: number;
  width?: number;
  height?: number;
  display_scale?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface ServerPin {
  id: string;
  plan_id: string;
  x: number;
  y: number;
  status: string;
  site_visit_number: number;
  attributes?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface ServerPinComment {
  id: string;
  pin_id: string;
  comment: string;
  created_by_device_id?: string;
  created_by_device_name?: string;
  created_by_user_id?: string;
  created_by_user_name?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface ServerAttachment {
  id: string;
  pin_id?: string;
  url: string;
  type: string;
  site_visit_number: number;
  comment?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface SyncPushResponse {
  status: string;
  server_timestamp: string;
  results: {
    projects: { created: number; updated: number };
    plans: { created: number; updated: number };
    pins: { created: number; updated: number; conflicts: number };
    pin_comments: { created: number; updated: number };
    attachments: { created: number; updated: number };
  };
  device_registered: string;
  conflicts?: Array<{
    type: string;
    entity_type: string;
    entity_id: string;
    deleted_by?: string;
    contested_by?: string;
    message: string;
  }>;
}

export interface SyncPullResponse {
  projects: ServerProject[];
  plans: ServerPlan[];
  pins: ServerPin[];
  pin_comments: ServerPinComment[];
  attachments: ServerAttachment[];
  server_timestamp: string;
}

export interface ServerFullProject {
  id: string;
  name: string;
  thumbnail_url?: string;
  client_name?: string;
  engineer_name?: string;
  site_visit_number: number;
  created_by_device_id?: string;
  created_by_device_name?: string;
  created_by_user_name?: string;
  created_at: string;
  updated_at: string;
  plans: Array<{
    id: string;
    name: string;
    pdf_url?: string;
    thumbnail_url?: string;
    display_order: number;
    site_visit_number: number;
    width?: number;
    height?: number;
    display_scale?: number;
    created_by_device_name?: string;
    created_at: string;
    updated_at: string;
    pins: Array<{
      id: string;
      x: number;
      y: number;
      status: string;
      site_visit_number: number;
      attributes?: Record<string, any>;
      created_by_device_name?: string;
      created_by_user_name?: string;
      created_at: string;
      updated_at: string;
      deleted_at?: string;
      deleted_by_device_name?: string;
      deletion_contested: boolean;
      contested_by_device_name?: string;
      comments: Array<{
        id: string;
        comment: string;
        created_by_device_name?: string;
        created_by_user_name?: string;
        created_at: string;
      }>;
      attachments: Array<{
        id: string;
        url: string;
        type: string;
        site_visit_number: number;
        comment?: string;
        created_by_device_name?: string;
        created_at: string;
      }>;
    }>;
  }>;
}

// =============================================================================
// SyncService Class
// =============================================================================

class SyncService {
  private static instance: SyncService;
  private deviceInfo: DeviceInfo | null = null;

  private constructor() {}

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  // ===========================================================================
  // Device Identity Management
  // ===========================================================================

  /**
   * Initialize device identity. Call this on app startup.
   * Generates a new device ID if one doesn't exist.
   */
  async initializeDevice(): Promise<DeviceInfo> {
    if (this.deviceInfo) {
      return this.deviceInfo;
    }

    // Try to load existing device info
    const deviceId = await this.getStoredValue(DEVICE_ID_KEY);
    const deviceName = await this.getStoredValue(DEVICE_NAME_KEY);
    const userId = await this.getStoredValue(USER_ID_KEY);
    const userName = await this.getStoredValue(USER_NAME_KEY);

    if (deviceId) {
      this.deviceInfo = {
        device_id: deviceId,
        device_name: deviceName || 'Unknown Device',
        user_id: userId || undefined,
        user_name: userName || undefined,
      };
    } else {
      // Generate new device ID
      const newDeviceId = uuidv4();
      await this.setStoredValue(DEVICE_ID_KEY, newDeviceId);
      await this.setStoredValue(DEVICE_NAME_KEY, 'My Device');

      this.deviceInfo = {
        device_id: newDeviceId,
        device_name: 'My Device',
      };
    }

    console.log('[SyncService] Device initialized:', this.deviceInfo);
    return this.deviceInfo;
  }

  /**
   * Update device name (user-friendly name like "John's iPad")
   */
  async setDeviceName(name: string): Promise<void> {
    await this.setStoredValue(DEVICE_NAME_KEY, name);
    if (this.deviceInfo) {
      this.deviceInfo.device_name = name;
    }
  }

  /**
   * Get current device info (must call initializeDevice first)
   */
  getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo;
  }

  /**
   * Set user info (call after login)
   */
  async setUserInfo(userId: string, userName: string): Promise<void> {
    await this.setStoredValue(USER_ID_KEY, userId);
    await this.setStoredValue(USER_NAME_KEY, userName);
    if (this.deviceInfo) {
      this.deviceInfo.user_id = userId;
      this.deviceInfo.user_name = userName;
    }
  }

  /**
   * Clear user info (call on logout)
   */
  async clearUserInfo(): Promise<void> {
    await Preferences.remove({ key: USER_ID_KEY });
    await Preferences.remove({ key: USER_NAME_KEY });
    if (this.deviceInfo) {
      this.deviceInfo.user_id = undefined;
      this.deviceInfo.user_name = undefined;
    }
  }

  // ===========================================================================
  // Network Status
  // ===========================================================================

  /**
   * Check if device is online
   */
  async isOnline(): Promise<boolean> {
    const status = await Network.getStatus();
    return status.connected;
  }

  // ===========================================================================
  // Push Operations
  // ===========================================================================

  /**
   * Push a single project and all its data to the server.
   * Converts local DB format to server format.
   * 
   * @param projectId - The ID of the project to push
   * @param onProgress - Optional callback for progress updates (message, percent 0-100)
   */
  async pushProject(
    projectId: string,
    onProgress?: (message: string, percent: number) => void
  ): Promise<SyncPushResponse> {
    const device = await this.initializeDevice();

    // Check network
    if (!(await this.isOnline())) {
      throw new Error('No network connection. Please try again when online.');
    }

    onProgress?.('Preparing to sync...', 0);
    console.log(`[SyncService] Pushing project ${projectId}...`);

    // Load project data from local database
    onProgress?.('Loading project data...', 2);
    const dbProject = await database.getProject(projectId);
    if (!dbProject) {
      throw new Error(`Project ${projectId} not found`);
    }

    const dbPlans = await database.getPlansByProject(projectId);
    
    // ==========================================================================
    // Step 1: Upload files to MinIO before syncing metadata
    // ==========================================================================
    const fileUploadService = new FileUploadService(API_BASE_URL);
    
    // Track uploaded PDF URLs for each plan
    const planPdfUrls: Map<string, string> = new Map();
    
    // Upload plan PDFs (5% - 30%)
    const pdfProgressStart = 5;
    const pdfProgressEnd = 30;
    const plansWithUrl = dbPlans.filter(p => p.url).length;
    console.log(`[SyncService] Found ${dbPlans.length} plans, ${plansWithUrl} have PDF URLs`);
    onProgress?.(`Uploading ${plansWithUrl} plan PDFs...`, pdfProgressStart);
    
    for (let i = 0; i < dbPlans.length; i++) {
      const plan = dbPlans[i];
      const pdfProgress = pdfProgressStart + ((i / Math.max(dbPlans.length, 1)) * (pdfProgressEnd - pdfProgressStart));
      
      // Debug: Log plan URL status
      const urlPreview = plan.url ? plan.url.substring(0, 50) + '...' : 'EMPTY/NULL';
      console.log(`[SyncService] Plan "${plan.name}" url: ${urlPreview}`);
      
      if (plan.url) {
        try {
          onProgress?.(`Uploading PDF: ${plan.name}...`, pdfProgress);
          console.log(`[SyncService] Uploading PDF for plan: ${plan.name}`);
          const result = await fileUploadService.uploadPlanPdf({
            localPath: plan.url,
            filename: `${plan.name}.pdf`,
            projectId: projectId,
            planId: plan.id,
            siteVisitNumber: plan.site_visit_number ?? 1,
          });
          
          if (result.success && result.serverUrl) {
            planPdfUrls.set(plan.id, result.serverUrl);
            console.log(`[SyncService] PDF uploaded: ${plan.name} -> ${result.serverUrl}`);
          } else {
            console.warn(`[SyncService] Failed to upload PDF for plan ${plan.name}: ${result.error}`);
          }
        } catch (error) {
          console.error(`[SyncService] Error uploading PDF for plan ${plan.name}:`, error);
          // Continue with other uploads even if one fails
        }
      }
    }
    
    // ==========================================================================
    // Step 2: Collect pins, comments, and upload attachment images (30% - 80%)
    // ==========================================================================
    onProgress?.('Processing pins and images...', 30);
    
    const allPins: ServerPin[] = [];
    const allComments: ServerPinComment[] = [];
    const allAttachments: ServerAttachment[] = [];
    
    // First pass: count total images to upload for progress calculation
    let totalImages = 0;
    let processedImages = 0;
    for (const plan of dbPlans) {
      const points = await database.getPointsByPlan(plan.id);
      for (const point of points) {
        const images = await database.getImagesByPoint(point.id);
        totalImages += images.filter(img => img.url).length;
      }
    }
    
    const imageProgressStart = 35;
    const imageProgressEnd = 80;
    
    for (const plan of dbPlans) {
      const points = await database.getPointsByPlan(plan.id);
      
      for (const point of points) {
        // Convert point to server pin format
        allPins.push({
          id: point.id,
          plan_id: point.plan_id,
          x: point.x,
          y: point.y,
          status: point.status,
          site_visit_number: point.site_visit_number ?? 1,
          attributes: point.comment ? { legacy_comment: point.comment } : undefined,
          created_at: point.created_at,
          updated_at: point.updated_at,
        });

        // Convert legacy comment to pin_comment
        // Use a UUID for the comment ID instead of concatenating (to stay under 36 char limit)
        if (point.comment) {
          allComments.push({
            id: uuidv4(),
            pin_id: point.id,
            comment: point.comment,
            created_at: point.created_at,
            updated_at: point.updated_at,
          });
        }
        
        // Upload images for this point
        const images = await database.getImagesByPoint(point.id);
        for (const image of images) {
          if (image.url) {
            try {
              const imageProgress = imageProgressStart + ((processedImages / Math.max(totalImages, 1)) * (imageProgressEnd - imageProgressStart));
              onProgress?.(`Uploading image ${processedImages + 1}/${totalImages}...`, imageProgress);
              
              console.log(`[SyncService] Uploading image for pin: ${point.id}`);
              const result = await fileUploadService.uploadAttachmentImage({
                localPath: image.url,
                filename: `${image.id}.jpg`,
                projectId: projectId,
                pinId: point.id,
                siteVisitNumber: image.site_visit_number ?? point.site_visit_number ?? 1,
                comment: image.comment,
              });
              
              processedImages++;
              
              if (result.success && result.serverUrl) {
                allAttachments.push({
                  id: image.id,
                  pin_id: point.id,
                  url: result.serverUrl,
                  type: 'image',
                  site_visit_number: image.site_visit_number ?? point.site_visit_number ?? 1,
                  comment: image.comment,
                  created_at: image.created_at,
                  updated_at: image.updated_at,
                });
                console.log(`[SyncService] Image uploaded: ${image.id} -> ${result.serverUrl}`);
              } else {
                console.warn(`[SyncService] Failed to upload image ${image.id}: ${result.error}`);
              }
            } catch (error) {
              processedImages++;
              console.error(`[SyncService] Error uploading image ${image.id}:`, error);
            }
          }
        }
      }
    }

    // ==========================================================================
    // Step 3: Build push request with uploaded file URLs (80% - 90%)
    // ==========================================================================
    onProgress?.('Building sync request...', 80);
    
    const pushRequest: SyncPushRequest = {
      device,
      projects: [{
        id: dbProject.id,
        name: dbProject.name,
        client_name: dbProject.client_name,
        engineer_name: dbProject.engineer_name,
        site_visit_number: dbProject.site_visit_number ?? 1,
        created_at: dbProject.created_at,
        updated_at: dbProject.updated_at,
      }],
      plans: dbPlans.map(plan => ({
        id: plan.id,
        project_id: plan.project_id,
        name: plan.name,
        // Use uploaded PDF URL if available
        pdf_url: planPdfUrls.get(plan.id),
        thumbnail_url: undefined, // TODO: Upload thumbnails
        display_order: plan.display_order,
        site_visit_number: plan.site_visit_number ?? 1,
        width: plan.width,
        height: plan.height,
        display_scale: plan.display_scale,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
      })),
      pins: allPins,
      pin_comments: allComments.length > 0 ? allComments : undefined,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
    };
    
    console.log(`[SyncService] Push request summary: ${pushRequest.projects?.length || 0} projects, ${pushRequest.plans?.length || 0} plans (${planPdfUrls.size} with PDFs), ${pushRequest.pins?.length || 0} pins, ${pushRequest.attachments?.length || 0} attachments`);

    // Send to server (90% - 100%)
    onProgress?.('Sending to server...', 90);
    
    const endpoint = `${API_BASE_URL}/api/mobile/sync/push`;
    console.log(`[SyncService] Pushing to: ${endpoint}`);
    
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pushRequest),
      });
    } catch (fetchError) {
      console.error('[SyncService] Fetch error:', fetchError);
      throw new Error(`Network error: Could not connect to ${API_BASE_URL}. Check your connection.`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SyncService] Push failed: ${response.status}`, errorText);
      throw new Error(`Push failed: ${response.status} - ${errorText}`);
    }

    const result: SyncPushResponse = await response.json();
    console.log('[SyncService] Push completed:', result);

    // Update last sync timestamp
    await this.setStoredValue(LAST_SYNC_KEY, result.server_timestamp);

    onProgress?.('Sync complete!', 100);
    
    return result;
  }

  // ===========================================================================
  // Pull Operations
  // ===========================================================================

  /**
   * Get list of available projects from server
   */
  async listServerProjects(): Promise<Array<{
    id: string;
    name: string;
    client_name?: string;
    engineer_name?: string;
    site_visit_number: number;
    created_by_device_name?: string;
    created_at: string;
    updated_at: string;
  }>> {
    if (!(await this.isOnline())) {
      throw new Error('No network connection. Please try again when online.');
    }

    const endpoint = `${API_BASE_URL}/api/mobile/sync/projects`;
    console.log(`[SyncService] Listing projects from: ${endpoint}`);
    
    let response: Response;
    try {
      response = await fetch(endpoint);
    } catch (fetchError) {
      console.error('[SyncService] Fetch error:', fetchError);
      throw new Error(`Network error: Could not connect to ${API_BASE_URL}. Check your connection.`);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SyncService] List projects failed: ${response.status}`, errorText);
      throw new Error(`Failed to list projects: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[SyncService] Found ${data.projects?.length || 0} projects`);
    return data.projects || [];
  }

  /**
   * Pull a complete project from the server and merge into local database.
   * This is an "on-demand" pull for a specific project.
   */
  async pullProject(projectId: string): Promise<{
    project: ServerFullProject;
    merged: {
      plans: number;
      pins: number;
      comments: number;
    };
  }> {
    const device = await this.initializeDevice();

    if (!(await this.isOnline())) {
      throw new Error('No network connection. Please try again when online.');
    }

    console.log(`[SyncService] Pulling project ${projectId}...`);

    // Fetch full project from server
    const response = await fetch(`${API_BASE_URL}/api/mobile/sync/projects/${projectId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Project not found on server');
      }
      throw new Error(`Failed to pull project: ${response.status}`);
    }

    const serverProject: ServerFullProject = await response.json();
    console.log('[SyncService] Received project:', serverProject.name);

    // Merge into local database
    const mergeResult = await this.mergeProjectToLocal(serverProject);

    // Update last sync timestamp
    await this.setStoredValue(LAST_SYNC_KEY, new Date().toISOString());

    return {
      project: serverProject,
      merged: mergeResult,
    };
  }

  /**
   * Merge server project data into local SQLite database.
   * Uses upsert logic - creates new records or updates existing.
   */
  private async mergeProjectToLocal(serverProject: ServerFullProject): Promise<{
    plans: number;
    pins: number;
    comments: number;
  }> {
    const stats = { plans: 0, pins: 0, comments: 0 };

    // Check if project exists locally
    const existingProject = await database.getProject(serverProject.id);
    const now = new Date().toISOString();

    if (existingProject) {
      // Update existing project
      await database.updateProject(serverProject.id, {
        name: serverProject.name,
        client_name: serverProject.client_name,
        engineer_name: serverProject.engineer_name,
        site_visit_number: serverProject.site_visit_number,
      });
    } else {
      // Create new project
      await database.createProject({
        id: serverProject.id,
        name: serverProject.name,
        client_name: serverProject.client_name,
        engineer_name: serverProject.engineer_name,
        site_visit_number: serverProject.site_visit_number,
        created_at: serverProject.created_at,
        updated_at: now,
      });
    }

    // Process plans
    for (const serverPlan of serverProject.plans) {
      const existingPlan = await database.getPlan(serverPlan.id);

      if (existingPlan) {
        // Update plan metadata (not PDF data)
        await database.updatePlan(serverPlan.id, {
          name: serverPlan.name,
          display_order: serverPlan.display_order,
          site_visit_number: serverPlan.site_visit_number,
        });
      } else {
        // Create plan - note: PDF data needs to be handled separately
        // For now, create with empty URL (user will need to re-add PDF if pulling fresh)
        await database.createPlan({
          id: serverPlan.id,
          project_id: serverProject.id,
          name: serverPlan.name,
          url: serverPlan.pdf_url || '', // Would need to download from MinIO
          thumbnail: serverPlan.thumbnail_url || '',
          width: serverPlan.width || 0,
          height: serverPlan.height || 0,
          display_scale: serverPlan.display_scale || 1,
          display_order: serverPlan.display_order,
          site_visit_number: serverPlan.site_visit_number,
          created_at: serverPlan.created_at,
          updated_at: now,
        });
      }
      stats.plans++;

      // Process pins for this plan
      for (const serverPin of serverPlan.pins) {
        // Skip if deleted and not contested
        if (serverPin.deleted_at && !serverPin.deletion_contested) {
          // Delete locally if exists
          try {
            await database.deletePoint(serverPin.id);
          } catch {}
          continue;
        }

        const existingPoint = await database.getPoint(serverPin.id);

        // Get first comment as legacy comment field
        const firstComment = serverPin.comments?.[0]?.comment;

        if (existingPoint) {
          // Update existing point
          await database.updatePointPartial(serverPin.id, {
            x: serverPin.x,
            y: serverPin.y,
            status: serverPin.status as 'Open' | 'Closed' | 'Note',
            site_visit_number: serverPin.site_visit_number,
            comment: firstComment,
          });
        } else {
          // Create new point
          await database.createPoint({
            id: serverPin.id,
            plan_id: serverPlan.id,
            x: serverPin.x,
            y: serverPin.y,
            status: serverPin.status as 'Open' | 'Closed' | 'Note',
            comment: firstComment,
            site_visit_number: serverPin.site_visit_number,
            created_at: serverPin.created_at,
            updated_at: now,
          });
        }
        stats.pins++;

        // Note: Pin comments are stored in the comments array
        // For now we use the first comment as the legacy comment field
        // TODO: Implement separate comments table in local DB for full multi-comment support
        stats.comments += serverPin.comments?.length || 0;

        // TODO: Handle attachments - download from MinIO
        // For now, attachments need separate handling for file downloads
      }
    }

    console.log('[SyncService] Merge completed:', stats);
    return stats;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  private async getStoredValue(key: string): Promise<string | null> {
    const result = await Preferences.get({ key });
    return result.value;
  }

  private async setStoredValue(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  /**
   * Get last sync timestamp
   */
  async getLastSyncTime(): Promise<string | null> {
    return this.getStoredValue(LAST_SYNC_KEY);
  }
}

// Export singleton instance
export const syncService = SyncService.getInstance();
