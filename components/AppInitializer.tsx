import React, { useEffect, useState } from 'react';
import { database } from '../services/database';
import { fileStorageService } from '../services/fileStorage';
import useSiteStore from '../store/useSiteStore';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { SQLiteDBConnection } from '@capacitor-community/sqlite';

interface AppInitializerProps {
  children: React.ReactNode;
}

interface InitState {
  database: 'pending' | 'success' | 'error';
  fileStorage: 'pending' | 'success' | 'error';
  permissions: 'pending' | 'success' | 'error';
  store: 'pending' | 'success' | 'error';
}

const AppInitializer: React.FC<AppInitializerProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initStatus, setInitStatus] = useState<string>('Initializing...');
  const [logs, setLogs] = useState<string[]>([]);
  const [dbConnection, setDbConnection] = useState<SQLiteDBConnection | null>(null);
  const [initState, setInitState] = useState<InitState>({
    database: 'pending',
    fileStorage: 'pending',
    permissions: 'pending',
    store: 'pending'
  });
  
  const store = useSiteStore();

  const log = (message: string) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setLogs(prev => [...prev, logMessage]);
  };

  const updateInitState = (service: keyof InitState, status: 'success' | 'error') => {
    setInitState(prev => ({ ...prev, [service]: status }));
  };

  const checkPermissions = async () => {
    if (typeof window === 'undefined') return { camera: false, filesystem: false };

    try {
      const cameraPermission = await Camera.checkPermissions();
      const hasCameraPermission = cameraPermission.camera === 'granted';

      // Check filesystem permission (if available in your Capacitor setup)
      const hasFilesystemPermission = true; // Implement actual filesystem permission check

      return {
        camera: hasCameraPermission,
        filesystem: hasFilesystemPermission
      };
    } catch (error) {
      log(`Error checking permissions: ${error}`);
      return { camera: false, filesystem: false };
    }
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      const permission = await Camera.requestPermissions();
      return permission.camera === 'granted';
    } catch (error) {
      log(`Error requesting camera permission: ${error}`);
      return false;
    }
  };

  const checkAndRequestPermissions = async () => {
    if (!Capacitor.isNativePlatform()) {
      log('Skipping permission checks on web platform');
      updateInitState('permissions', 'success');
      return;
    }
    
    try {
      log('Checking permissions...');
      const { camera, filesystem } = await checkPermissions();
      
      if (!camera) {
        log('Requesting camera permission...');
        const granted = await requestCameraPermission();
        log(`Camera permission ${granted ? 'granted' : 'denied'}`);
      }
      
      // Add filesystem permission request if needed
      // if (!filesystem) { ... }
      
      updateInitState('permissions', 'success');
    } catch (error) {
      log(`Permission error: ${error}`);
      updateInitState('permissions', 'error');
    }
  };

  const initializeDatabase = async () => {
    try {
      log('Initializing database...');
      const connection = await database.initialize();
      setDbConnection(connection);
      
      if (!connection) {
        throw new Error('Database connection failed');
      }
      
      log('Database initialized successfully');
      updateInitState('database', 'success');
    } catch (error) {
      log(`Database initialization error: ${error}`);
      updateInitState('database', 'error');
      throw error;
    }
  };

  const initializeFileStorage = async () => {
    try {
      log('Initializing file storage...');
      await fileStorageService.initialize();
      log('File storage initialized successfully');
      updateInitState('fileStorage', 'success');
    } catch (error) {
      log(`File storage initialization error: ${error}`);
      updateInitState('fileStorage', 'error');
      throw error;
    }
  };

  const initializeStore = async () => {
    try {
      log('Initializing store...');
      await store.initialize();
      log('Store initialized successfully');
      updateInitState('store', 'success');
    } catch (error) {
      log(`Store initialization error: ${error}`);
      updateInitState('store', 'error');
      throw error;
    }
  };

  const initializeWithRetry = async (
    fn: () => Promise<void>,
    service: keyof InitState,
    retries = 3
  ) => {
    for (let i = 0; i < retries; i++) {
      try {
        await fn();
        return;
      } catch (error) {
        log(`Attempt ${i + 1} failed for ${service}: ${error}`);
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      if (!isMounted) return;

      try {
        log('Starting app initialization...');
        const platform = Capacitor.getPlatform();
        const isNative = Capacitor.isNativePlatform();
        log(`Platform detected: ${platform}, Is Native: ${isNative}`);

        // Initialize critical services with retry
        await initializeWithRetry(() => initializeDatabase(), 'database');
        await initializeWithRetry(() => initializeFileStorage(), 'fileStorage');
        
        // Check and request permissions
        await checkAndRequestPermissions();
        
        // Initialize store last
        await initializeWithRetry(() => initializeStore(), 'store');

        if (isMounted) {
          setIsInitialized(true);
          log('App initialization completed successfully');
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
          log(`Fatal initialization error: ${errorMessage}`);
          setError(errorMessage);
          setInitStatus('Initialization failed');
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
      // Cleanup
      if (dbConnection) {
        // @ts-ignore
        database.closeConnection();
      }
    };
  }, [store]);

  const LoadingScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-2xl font-bold mb-4">Initializing App</h1>
      <div className="w-full max-w-2xl space-y-4">
        {Object.entries(initState).map(([service, status]) => (
          <div key={service} className="flex items-center justify-between p-2 bg-gray-100 rounded">
            <span className="capitalize">{service}</span>
            <span className={`
              ${status === 'success' ? 'text-green-500' : ''}
              ${status === 'error' ? 'text-red-500' : ''}
              ${status === 'pending' ? 'text-yellow-500' : ''}
            `}>
              {status}
            </span>
          </div>
        ))}
      </div>
      <div className="w-full max-w-2xl bg-gray-100 p-4 rounded-lg mt-4">
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
    return <LoadingScreen />;
  }

  return <>{children}</>;
};

export default AppInitializer;