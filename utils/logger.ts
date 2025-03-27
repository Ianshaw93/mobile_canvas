// Log levels that match Android Logcat
const LOG_LEVELS = {
  DEBUG: 'D',
  INFO: 'I',
  WARN: 'W',
  ERROR: 'E'
};

// Tag for our app's logs
const APP_TAG = 'MobileCanvas';

// Helper function to format log messages
const formatLogMessage = (level: string, tag: string, message: string, data?: any) => {
  let logMessage = `${message}`;
  if (data) {
    logMessage += `\n${JSON.stringify(data, null, 2)}`;
  }
  return logMessage;
};

// Main logging functions
export const logger = {
  debug: (message: string, data?: any) => {
    const logMessage = formatLogMessage(LOG_LEVELS.DEBUG, APP_TAG, message, data);
    console.log(`[${APP_TAG}] ${logMessage}`);
    // Also log to Android Logcat if available
    if (window.Android) {
      window.Android.log(LOG_LEVELS.DEBUG, APP_TAG, logMessage);
    }
  },
  
  info: (message: string, data?: any) => {
    const logMessage = formatLogMessage(LOG_LEVELS.INFO, APP_TAG, message, data);
    console.log(`[${APP_TAG}] ${logMessage}`);
    if (window.Android) {
      window.Android.log(LOG_LEVELS.INFO, APP_TAG, logMessage);
    }
  },
  
  warn: (message: string, data?: any) => {
    const logMessage = formatLogMessage(LOG_LEVELS.WARN, APP_TAG, message, data);
    console.warn(`[${APP_TAG}] ${logMessage}`);
    if (window.Android) {
      window.Android.log(LOG_LEVELS.WARN, APP_TAG, logMessage);
    }
  },
  
  error: (message: string, data?: any) => {
    const logMessage = formatLogMessage(LOG_LEVELS.ERROR, APP_TAG, message, data);
    console.error(`[${APP_TAG}] ${logMessage}`);
    if (window.Android) {
      window.Android.log(LOG_LEVELS.ERROR, APP_TAG, logMessage);
    }
  }
};

// Type declaration for Android interface
declare global {
  interface Window {
    Android?: {
      log: (level: string, tag: string, message: string) => void;
    };
  }
} 