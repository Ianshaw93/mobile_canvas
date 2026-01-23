/**
 * SyncButton - Component for project synchronization
 * 
 * Provides UI for:
 * - Pushing current project to server
 * - Pulling projects from server
 * - Viewing sync status
 */

import React, { useState } from 'react';
import useSync, { ServerProjectSummary } from '@/hooks/useSync';

interface SyncButtonProps {
  projectId?: string;
  onSyncComplete?: () => void;
}

export const SyncButton: React.FC<SyncButtonProps> = ({ projectId, onSyncComplete }) => {
  const {
    isInitialized,
    isSyncing,
    isPushing,
    isPulling,
    deviceInfo,
    lastSyncTime,
    error,
    progressMessage,
    progressPercent,
    pushProject,
    pullProject,
    listServerProjects,
    setDeviceName,
    clearError,
  } = useSync();

  const [showModal, setShowModal] = useState(false);
  const [serverProjects, setServerProjects] = useState<ServerProjectSummary[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [showDeviceNameInput, setShowDeviceNameInput] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');

  const handlePush = async () => {
    console.log('[SyncButton] handlePush called, projectId:', projectId);
    if (!projectId) {
      console.log('[SyncButton] No projectId, returning');
      return;
    }
    console.log('[SyncButton] Calling pushProject...');
    await pushProject(projectId);
    console.log('[SyncButton] pushProject completed');
    onSyncComplete?.();
  };

  const handleOpenPullModal = async () => {
    setShowModal(true);
    setIsLoadingProjects(true);
    const projects = await listServerProjects();
    setServerProjects(projects);
    setIsLoadingProjects(false);
  };

  const handlePullProject = async (id: string) => {
    await pullProject(id);
    setShowModal(false);
    onSyncComplete?.();
  };

  const handleSetDeviceName = async () => {
    if (newDeviceName.trim()) {
      await setDeviceName(newDeviceName.trim());
      setShowDeviceNameInput(false);
      setNewDeviceName('');
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  if (!isInitialized) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        Initializing...
      </div>
    );
  }

  return (
    <>
      {/* Sync Controls */}
      <div className="flex flex-col gap-2">
        {/* Device Info */}
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <span>Device: {deviceInfo?.device_name || 'Unknown'}</span>
          <button
            onClick={() => {
              setNewDeviceName(deviceInfo?.device_name || '');
              setShowDeviceNameInput(true);
            }}
            className="text-blue-500 hover:text-blue-700"
          >
            Edit
          </button>
        </div>

        {/* Last Sync Time */}
        {lastSyncTime && (
          <div className="text-xs text-gray-400">
            Last sync: {formatDate(lastSyncTime)}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="text-xs text-red-500 flex items-center gap-2">
            <span>{error}</span>
            <button onClick={clearError} className="text-red-700 font-bold">×</button>
          </div>
        )}

        {/* Progress Bar */}
        {isPushing && progressMessage && (
          <div className="w-full">
            <div className="text-xs text-gray-600 mb-1">{progressMessage}</div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1 text-right">{Math.round(progressPercent)}%</div>
          </div>
        )}

        {/* Sync Buttons */}
        <div className="flex gap-2">
          {/* Push Button */}
          {projectId && (
            <button
              onClick={handlePush}
              disabled={isSyncing}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                isSyncing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isPushing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Pushing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  Push to Server
                </>
              )}
            </button>
          )}

          {/* Pull Button */}
          <button
            onClick={handleOpenPullModal}
            disabled={isSyncing}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              isSyncing
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            {isPulling ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Pulling...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8V16m0 0l4-4m-4 4l-4-4M7 8V16m0 0L3 12m4 4l4-4" />
                </svg>
                Pull from Server
              </>
            )}
          </button>
        </div>
      </div>

      {/* Device Name Edit Modal */}
      {showDeviceNameInput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-80 shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Edit Device Name</h3>
            <input
              type="text"
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              placeholder="e.g., John's iPad"
              className="w-full border rounded-lg px-3 py-2 mb-4 text-gray-900 bg-white"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeviceNameInput(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSetDeviceName}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pull Projects Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Pull Project from Server</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-600 hover:text-gray-900 text-2xl"
              >
                ×
              </button>
            </div>

            {isLoadingProjects ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : serverProjects.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                No projects found on server
              </div>
            ) : (
              <div className="space-y-2">
                {serverProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handlePullProject(project.id)}
                    disabled={isPulling}
                    className="w-full text-left p-3 border rounded-lg hover:bg-gray-50 disabled:opacity-50 bg-white"
                  >
                    <div className="font-medium text-gray-900">{project.name}</div>
                    {project.client_name && (
                      <div className="text-sm text-gray-600">Client: {project.client_name}</div>
                    )}
                    {project.created_by_device_name && (
                      <div className="text-xs text-gray-500">
                        Created by: {project.created_by_device_name}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      Visit #{project.site_visit_number} • Updated: {formatDate(project.updated_at)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default SyncButton;
