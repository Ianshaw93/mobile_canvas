import React, { useEffect, useState } from 'react';
import { database } from '../services/database';
import { fileStorageService } from '../services/fileStorage';
import useSiteStore from '../store/useSiteStore';
import { Capacitor } from '@capacitor/core';
import { requestAllPermissions } from './requestiPermission';

interface AppInitializerProps {
  children: React.ReactNode;
}

const AppInitializer: React.FC<AppInitializerProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initStatus, setInitStatus] = useState<string>('Initializing...');
  const [logs, setLogs] = useState<string[]>([]);
  const store = useSiteStore();

  const log = (message: string) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setLogs(prev => [...prev, logMessage]);
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        log('Starting app initialization...');
        const platform = Capacitor.getPlatform();
        const isNative = Capacitor.isNativePlatform();
        log(`Platform detected: ${platform}, Is Native: ${isNative}`);

        // Initialize database first
        try {
          log('Initializing database...');
          await database.initialize();
          log('Database initialized successfully');
        } catch (dbError) {
          log(`Database initialization error: ${dbError}`);
          throw dbError;
        }

        // Initialize file storage
        try {
          log('Initializing file storage...');
          await fileStorageService.initialize();
          log('File storage initialized successfully');
        } catch (fsError) {
          log(`File storage initialization error: ${fsError}`);
          throw fsError;
        }

        // Request permissions only on native platforms
        if (isNative) {
          try {
            log('Requesting permissions...');
            const { camera, filesystem } = await requestAllPermissions();
            log(`Permission results - Camera: ${camera}, Filesystem: ${filesystem}`);

            if (!camera) {
              log('Warning: Camera permission not granted');
              setInitStatus('Camera permission not granted - some features may be limited');
            }
            if (!filesystem) {
              log('Warning: Filesystem permission not granted');
              setInitStatus('Filesystem permission not granted - some features may be limited');
            }
          } catch (permError) {
            log(`Permission request error: ${permError}`);
            // Continue even if permissions fail
          }
        } else {
          log('Skipping permission requests on web platform');
        }

        // Initialize store last
        try {
          log('Initializing store...');
          await store.initialize();
          log('Store initialized successfully');
        } catch (storeError) {
          log(`Store initialization error: ${storeError}`);
          throw storeError;
        }

        setIsInitialized(true);
        log('App initialization completed successfully');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        log(`Fatal initialization error: ${errorMessage}`);
        setError(errorMessage);
        setInitStatus('Initialization failed');
      }
    };

    // Start initialization
    log('Starting initialization process...');
    initialize();
  }, [store]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Initialization Error</h1>
        <p className="text-gray-700 mb-4">{error}</p>
        <div className="w-full max-w-2xl bg-gray-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Initialization Logs:</h2>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index} className="text-sm font-mono">
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-2xl font-bold mb-4">Initializing App</h1>
        <p className="text-gray-700 mb-4">{initStatus}</p>
        <div className="w-full max-w-2xl bg-gray-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Initialization Logs:</h2>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index} className="text-sm font-mono">
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AppInitializer; 