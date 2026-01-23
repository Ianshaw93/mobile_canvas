/**
 * useSync Hook - React hook for sync operations
 * 
 * Provides a simple interface for:
 * - Pushing projects to server
 * - Pulling projects from server
 * - Listing available server projects
 * - Managing device identity
 */

import { useState, useCallback, useEffect } from 'react';
import { syncService, DeviceInfo, SyncPushResponse, ServerFullProject } from '@/services/SyncService';
import useSiteStore from '@/store/useSiteStore';

export interface SyncState {
  isInitialized: boolean;
  isSyncing: boolean;
  isPushing: boolean;
  isPulling: boolean;
  lastSyncTime: string | null;
  error: string | null;
  deviceInfo: DeviceInfo | null;
}

export interface ServerProjectSummary {
  id: string;
  name: string;
  client_name?: string;
  engineer_name?: string;
  site_visit_number: number;
  created_by_device_name?: string;
  created_at: string;
  updated_at: string;
}

export function useSync() {
  const [state, setState] = useState<SyncState>({
    isInitialized: false,
    isSyncing: false,
    isPushing: false,
    isPulling: false,
    lastSyncTime: null,
    error: null,
    deviceInfo: null,
  });

  const loadProjects = useSiteStore(s => s.loadProjects);
  const addToast = useSiteStore(s => s.addToast);

  // Initialize device on mount
  useEffect(() => {
    const init = async () => {
      try {
        const deviceInfo = await syncService.initializeDevice();
        const lastSync = await syncService.getLastSyncTime();
        setState(s => ({
          ...s,
          isInitialized: true,
          deviceInfo,
          lastSyncTime: lastSync,
        }));
      } catch (error) {
        console.error('[useSync] Failed to initialize:', error);
        setState(s => ({
          ...s,
          isInitialized: true,
          error: 'Failed to initialize sync service',
        }));
      }
    };
    init();
  }, []);

  /**
   * Update device name
   */
  const setDeviceName = useCallback(async (name: string) => {
    try {
      await syncService.setDeviceName(name);
      setState(s => ({
        ...s,
        deviceInfo: s.deviceInfo ? { ...s.deviceInfo, device_name: name } : null,
      }));
      addToast?.(`Device name updated to "${name}"`, 'success');
    } catch (error) {
      console.error('[useSync] Failed to set device name:', error);
      addToast?.('Failed to update device name', 'error');
    }
  }, [addToast]);

  /**
   * Push a project to the server
   */
  const pushProject = useCallback(async (projectId: string): Promise<SyncPushResponse | null> => {
    console.log('[useSync] pushProject called with projectId:', projectId);
    setState(s => ({ ...s, isPushing: true, isSyncing: true, error: null }));
    
    try {
      console.log('[useSync] Calling syncService.pushProject...');
      const result = await syncService.pushProject(projectId);
      console.log('[useSync] Push successful:', result);
      
      const lastSync = await syncService.getLastSyncTime();
      setState(s => ({
        ...s,
        isPushing: false,
        isSyncing: false,
        lastSyncTime: lastSync,
      }));
      
      // Show result summary
      const { results } = result;
      const summary = `Pushed: ${results.projects.created + results.projects.updated} projects, ${results.plans.created + results.plans.updated} plans, ${results.pins.created + results.pins.updated} pins`;
      addToast?.(summary, 'success');
      
      // Show conflicts if any
      if (result.conflicts && result.conflicts.length > 0) {
        addToast?.(`${result.conflicts.length} conflict(s) detected`, 'error');
      }
      
      return result;
    } catch (error) {
      console.error('[useSync] Push error:', error);
      const message = error instanceof Error ? error.message : 'Push failed';
      setState(s => ({
        ...s,
        isPushing: false,
        isSyncing: false,
        error: message,
      }));
      addToast?.(message, 'error');
      return null;
    }
  }, [addToast]);

  /**
   * List available projects on the server
   */
  const listServerProjects = useCallback(async (): Promise<ServerProjectSummary[]> => {
    setState(s => ({ ...s, isSyncing: true, error: null }));
    
    try {
      const projects = await syncService.listServerProjects();
      setState(s => ({ ...s, isSyncing: false }));
      return projects;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list projects';
      setState(s => ({
        ...s,
        isSyncing: false,
        error: message,
      }));
      addToast?.(message, 'error');
      return [];
    }
  }, [addToast]);

  /**
   * Pull a project from the server and merge into local database
   */
  const pullProject = useCallback(async (projectId: string): Promise<ServerFullProject | null> => {
    setState(s => ({ ...s, isPulling: true, isSyncing: true, error: null }));
    
    try {
      const result = await syncService.pullProject(projectId);
      
      // Reload projects in the store to reflect changes
      await loadProjects();
      
      const lastSync = await syncService.getLastSyncTime();
      setState(s => ({
        ...s,
        isPulling: false,
        isSyncing: false,
        lastSyncTime: lastSync,
      }));
      
      // Show result summary
      const summary = `Pulled: ${result.merged.plans} plans, ${result.merged.pins} pins`;
      addToast?.(summary, 'success');
      
      return result.project;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pull failed';
      setState(s => ({
        ...s,
        isPulling: false,
        isSyncing: false,
        error: message,
      }));
      addToast?.(message, 'error');
      return null;
    }
  }, [addToast, loadProjects]);

  /**
   * Check if device is online
   */
  const checkOnline = useCallback(async (): Promise<boolean> => {
    return syncService.isOnline();
  }, []);

  /**
   * Clear any error state
   */
  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    setDeviceName,
    pushProject,
    pullProject,
    listServerProjects,
    checkOnline,
    clearError,
  };
}

export default useSync;
