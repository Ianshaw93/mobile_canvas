import React, { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

const DebugPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Function to scroll to bottom of logs
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll to bottom when new logs are added
  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  // Override the logger to capture logs
  useEffect(() => {
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error
    };

    const addLog = (level: string, message: string, data?: any) => {
      const timestamp = new Date().toLocaleTimeString();
      setLogs(prev => [...prev, { timestamp, level, message, data }]);
    };

    console.log = (...args) => {
      originalConsole.log(...args);
      addLog('D', args.join(' '));
    };

    console.info = (...args) => {
      originalConsole.info(...args);
      addLog('I', args.join(' '));
    };

    console.warn = (...args) => {
      originalConsole.warn(...args);
      addLog('W', args.join(' '));
    };

    console.error = (...args) => {
      originalConsole.error(...args);
      addLog('E', args.join(' '));
    };

    return () => {
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
    };
  }, []);

  const getLogColor = (level: string) => {
    switch (level) {
      case 'E': return 'text-red-500';
      case 'W': return 'text-yellow-500';
      case 'I': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  const downloadLogs = () => {
    // Create a formatted JSON string
    const logData = {
      timestamp: new Date().toISOString(),
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      },
      logs: logs
    };

    const jsonString = JSON.stringify(logData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mobile_canvas_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Debug Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg z-50"
      >
        {isOpen ? 'Hide Debug' : 'Show Debug'}
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl h-[80vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Debug Logs</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {/* Logs Container */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
              {logs.map((log, index) => (
                <div key={index} className="mb-2">
                  <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                  <span className={getLogColor(log.level)}>[{log.level}]</span>{' '}
                  <span>{log.message}</span>
                  {log.data && (
                    <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>

            {/* Footer */}
            <div className="p-4 border-t flex justify-between items-center">
              <div className="space-x-2">
                <button
                  onClick={() => setLogs([])}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Clear Logs
                </button>
                <button
                  onClick={downloadLogs}
                  className="text-sm text-blue-500 hover:text-blue-700"
                >
                  Download Logs
                </button>
              </div>
              <span className="text-sm text-gray-500">
                {logs.length} log entries
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DebugPanel; 