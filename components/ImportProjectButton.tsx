import React, { useState } from 'react';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { ContentUriReader } from '../src/plugins/ContentUriReader';
import { previewImport } from '@/services/ImportService';
import ImportPreviewModal from './ImportPreviewModal';
import useSiteStore from '@/store/useSiteStore';

/**
 * Convert base64 to Uint8Array in chunks to avoid blocking the UI thread
 * This is critical for large files (45MB+)
 */
const base64ToUint8 = async (b64: string, onProgress?: (percent: number) => void): Promise<Uint8Array> => {
  try {
    console.log('[IMPORT DEBUG] base64ToUint8: Starting conversion, base64 length:', b64.length);
    const startTime = performance.now();
    
    // Base64 encodes 3 bytes into 4 characters, so chunks must be multiples of 4
    const base64ChunkSize = 0x40000; // 256KB base64 chunks (will decode to ~192KB binary)
    const totalLength = b64.length;
    const chunks: Uint8Array[] = [];
    let processed = 0;
    let chunkCount = 0;
    
    console.log('[IMPORT DEBUG] base64ToUint8: Processing in chunks...');
    
    for (let i = 0; i < totalLength; i += base64ChunkSize) {
      // Align to 4-character boundary
      const chunkStart = Math.floor(i / 4) * 4;
      const chunkEnd = Math.min(Math.ceil((i + base64ChunkSize) / 4) * 4, totalLength);
      const base64Chunk = b64.substring(chunkStart, chunkEnd);
      
      // Decode this chunk
      const binaryChunk = atob(base64Chunk);
      const chunkBytes = new Uint8Array(binaryChunk.length);
      for (let j = 0; j < binaryChunk.length; j++) {
        chunkBytes[j] = binaryChunk.charCodeAt(j);
      }
      
      chunks.push(chunkBytes);
      processed = chunkEnd;
      chunkCount++;
      
      // Yield to UI thread every chunk and update progress
      const percent = (processed / totalLength) * 100;
      console.log(`[IMPORT DEBUG] base64ToUint8: Processed chunk ${chunkCount}, ${percent.toFixed(1)}% (${processed}/${totalLength})`);
      
      // Yield to UI thread
      await new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
      
      if (onProgress) {
        onProgress(percent);
      }
    }
    
    // Combine all chunks into a single Uint8Array
    console.log('[IMPORT DEBUG] base64ToUint8: Combining chunks...');
    const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    
    const endTime = performance.now();
    console.log(`[IMPORT DEBUG] base64ToUint8: Conversion complete in ${(endTime - startTime).toFixed(0)}ms, total chunks: ${chunkCount}, final size: ${bytes.length}`);
    
    return bytes;
  } catch (err) {
    console.error('[IMPORT DEBUG] base64ToUint8 ERROR:', err);
    throw err;
  }
};

interface ImportProjectButtonProps {
  projectId?: string; // Optional - can import without being tied to a specific project
}

const ImportProjectButton: React.FC<ImportProjectButtonProps> = ({ projectId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [preview, setPreview] = useState<any>(null);
  const [zipBytes, setZipBytes] = useState<Uint8Array | null>(null);
  const loadProjects = useSiteStore((state) => state.loadProjects);
  const setSelectedProjectId = useSiteStore((state) => state.setSelectedProjectId);

  const handleImport = async () => {
    console.log('[IMPORT DEBUG] ====== handleImport CALLED ======');
    let progressInterval: NodeJS.Timeout | null = null;
    
    try {
      console.log('[IMPORT DEBUG] Starting import process...');
      console.log('[IMPORT DEBUG] About to call setIsLoading(true)');
      setIsLoading(true);
      console.log('[IMPORT DEBUG] setIsLoading(true) called');
      
      console.log('[IMPORT DEBUG] About to call setLoadingMessage');
      setLoadingMessage('Selecting file...');
      console.log('[IMPORT DEBUG] setLoadingMessage called');
      
      console.log('[IMPORT DEBUG] About to call setProgressPercent(0)');
      setProgressPercent(0);
      console.log('[IMPORT DEBUG] Set loading state, progress: 0%');
      
      // Yield to UI thread so loading state can render
      console.log('[IMPORT DEBUG] About to yield to UI thread...');
      await new Promise<void>((resolve) => {
        console.log('[IMPORT DEBUG] Inside yield promise, checking window...');
        if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
          console.log('[IMPORT DEBUG] Using requestAnimationFrame');
          requestAnimationFrame(() => {
            console.log('[IMPORT DEBUG] requestAnimationFrame callback fired');
            resolve();
          });
        } else {
          console.log('[IMPORT DEBUG] Using setTimeout fallback');
          setTimeout(() => {
            console.log('[IMPORT DEBUG] setTimeout callback fired');
            resolve();
          }, 0);
        }
      });
      console.log('[IMPORT DEBUG] Yielded to UI thread, opening file picker...');

      console.log('[IMPORT DEBUG] About to call FilePicker.pickFiles...');
      // Use readData: false to avoid blocking - we'll read the file ourselves
      const pickFilesPromise = FilePicker.pickFiles({
        types: ['application/zip', '.zip'], 
        limit: 1, 
        readData: false  // Changed: Don't read data here to avoid blocking
      });
      console.log('[IMPORT DEBUG] FilePicker.pickFiles called, awaiting result...');
      const { files } = await pickFilesPromise;
      console.log('[IMPORT DEBUG] File picker returned, files:', files?.length || 0);
      
      if (!files?.length || !files[0]) {
        console.log('[IMPORT DEBUG] No files selected, aborting');
        setIsLoading(false);
        setLoadingMessage('');
        setProgressPercent(0);
        return;
      }

      const selectedFile = files[0];
      console.log('[IMPORT DEBUG] File selected:', selectedFile.name, 'URI:', selectedFile.path);
      
      setLoadingMessage('Preparing file...');
      setProgressPercent(10);
      console.log('[IMPORT DEBUG] Starting file preparation, progress: 10%');
      
      // Read file in chunks using capacitor-file-chunk (avoids loading entire file into memory)
      let bytes: Uint8Array;
      let tempFilePath: string | null = null;
      
      if (Capacitor.isNativePlatform() && selectedFile.path) {
        // Native platform: Use custom ContentUriReader plugin to stream file in chunks
        console.log('[IMPORT DEBUG] Native platform detected, file path:', selectedFile.path);
        
        setLoadingMessage('Reading file in chunks...');
        setProgressPercent(12);
        console.log('[IMPORT DEBUG] Using ContentUriReader plugin to stream file from content URI...');
        
        try {
          // Use ContentUriReader plugin for true streaming from content:// URIs
          bytes = await new Promise<Uint8Array>((resolve, reject) => {
            let resultBuffer: Uint8Array | null = null;
            let writeOffset = 0;
            let totalSize = -1;
            let chunkListener: any = null;
            let chunkCount = 0;
            
            // Set up chunk listener
            chunkListener = ContentUriReader.addListener('chunk', (chunk) => {
              try {
                if (chunk.isLast) {
                  // Last chunk - resolve with final buffer (trimmed to actual size)
                  console.log(`[IMPORT DEBUG] Received last chunk, file complete. Total chunks: ${chunkCount}, final size: ${(writeOffset / 1024 / 1024).toFixed(2)}MB`);
                  
                  // Clean up listener
                  if (chunkListener) {
                    chunkListener.remove();
                  }
                  
                  if (resultBuffer) {
                    // Trim buffer to actual size if it was over-allocated
                    const finalResult = writeOffset < resultBuffer.length 
                      ? resultBuffer.slice(0, writeOffset)
                      : resultBuffer;
                    resolve(finalResult);
                  } else {
                    reject(new Error('No data received'));
                  }
                } else {
                  // Regular chunk - decode and write directly into pre-allocated buffer
                  chunkCount++;
                  
                  // Initialize buffer on first chunk if we know the size
                  if (!resultBuffer && chunk.totalSize > 0) {
                    totalSize = chunk.totalSize;
                    resultBuffer = new Uint8Array(totalSize);
                    console.log(`[IMPORT DEBUG] Allocated buffer for ${(totalSize / 1024 / 1024).toFixed(2)}MB file`);
                  } else if (!resultBuffer) {
                    // If we don't know size yet, we'll need to grow the buffer
                    // For now, estimate based on first chunk (will be resized if needed)
                    resultBuffer = new Uint8Array(Math.max(chunk.size * 100, 50 * 1024 * 1024)); // Start with 50MB or 100x first chunk
                    console.log(`[IMPORT DEBUG] Allocated estimated buffer: ${(resultBuffer.length / 1024 / 1024).toFixed(2)}MB`);
                  }
                  
                  // Decode base64 chunk
                  const base64Data = chunk.data;
                  const binaryString = atob(base64Data);
                  
                  // Check if we need to resize buffer (if totalSize was unknown)
                  if (writeOffset + binaryString.length > resultBuffer!.length) {
                    console.log(`[IMPORT DEBUG] Resizing buffer from ${(resultBuffer!.length / 1024 / 1024).toFixed(2)}MB to ${((writeOffset + binaryString.length) / 1024 / 1024).toFixed(2)}MB`);
                    const newBuffer = new Uint8Array(writeOffset + binaryString.length + (10 * 1024 * 1024)); // Add 10MB padding
                    newBuffer.set(resultBuffer!);
                    resultBuffer = newBuffer;
                  }
                  
                  // Write chunk directly into buffer (avoiding intermediate arrays)
                  for (let i = 0; i < binaryString.length; i++) {
                    resultBuffer![writeOffset + i] = binaryString.charCodeAt(i);
                  }
                  writeOffset += binaryString.length;
                  
                  // Update progress (12% to 30% range for file reading)
                  if (chunk.totalSize > 0) {
                    totalSize = chunk.totalSize;
                    const percent = (chunk.totalRead / chunk.totalSize) * 100;
                    const uiProgress = 12 + (percent * 0.18); // 12% to 30% range
                    setProgressPercent(Math.min(uiProgress, 30));
                    console.log(`[IMPORT DEBUG] ContentUriReader progress: ${(chunk.totalRead / 1024 / 1024).toFixed(2)}MB / ${(chunk.totalSize / 1024 / 1024).toFixed(2)}MB (${percent.toFixed(1)}%)`);
                  } else {
                    // Estimate progress if we don't know total size
                    const estimatedProgress = Math.min(12 + (chunkCount * 0.5), 30);
                    setProgressPercent(estimatedProgress);
                    console.log(`[IMPORT DEBUG] ContentUriReader chunk ${chunkCount}, ${(writeOffset / 1024 / 1024).toFixed(2)}MB`);
                  }
                  
                  // Yield to UI thread periodically to keep UI responsive
                  if (chunkCount % 5 === 0) {
                    // Use requestAnimationFrame to yield to UI
                    requestAnimationFrame(() => {
                      // Yield complete
                    });
                  }
                }
              } catch (chunkError) {
                console.error('[IMPORT DEBUG] Error processing chunk:', chunkError);
                if (chunkListener) {
                  chunkListener.remove();
                }
                reject(chunkError);
              }
            });
            
            // Start reading
            ContentUriReader.readInChunks({
              uri: selectedFile.path!,
              chunkSize: 1024 * 1024, // 1MB chunks
            }).catch((readError) => {
              console.error('[IMPORT DEBUG] ContentUriReader.readInChunks failed:', readError);
              if (chunkListener) {
                chunkListener.remove();
              }
              reject(readError);
            });
          });
          
        } catch (pluginError: any) {
          console.warn('[IMPORT DEBUG] ContentUriReader plugin failed, falling back to Filesystem.readFile:', pluginError);
          
          // Fallback: Use Filesystem.readFile (will crash on very large files, but works for smaller ones)
          // This is a last resort
          setLoadingMessage('Reading file (fallback method)...');
          setProgressPercent(12);
          
          const sourceFile = await Filesystem.readFile({
            path: selectedFile.path!,
          });
          
          setProgressPercent(20);
          console.log('[IMPORT DEBUG] File read via fallback, converting to bytes...');
          
          // Convert base64 to Uint8Array in chunks
          bytes = await base64ToUint8(sourceFile.data as string, (percent) => {
            const newProgress = 20 + (percent * 0.1);
            setProgressPercent(newProgress);
            console.log(`[IMPORT DEBUG] Base64 conversion progress: ${percent.toFixed(1)}%`);
          });
        }
      } else {
        // Web platform: use FileReader API or fetch
        console.log('[IMPORT DEBUG] Web platform detected...');
        
        if (selectedFile.data) {
          // Fallback: if data is already available
          bytes = await base64ToUint8(selectedFile.data, (percent) => {
            const newProgress = 10 + (percent * 0.1);
            setProgressPercent(newProgress);
          });
        } else {
          throw new Error('File data not available on web platform. FilePicker may need readData: true for web.');
        }
      }
      
      const bytesSizeMB = (bytes.length / 1024 / 1024).toFixed(2);
      console.log(`[IMPORT DEBUG] File read complete, bytes size: ${bytesSizeMB}MB`);

      // Yield again before the potentially long-running parse operation
      await new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
      console.log('[IMPORT DEBUG] Yielded before zip parsing');

      setLoadingMessage('Parsing zip file...');
      setProgressPercent(20);
      console.log('[IMPORT DEBUG] Starting zip parsing, progress: 20%');
      
      // Start progress animation (since JSZip doesn't provide progress callbacks)
      // This gives visual feedback even though it's not accurate
      progressInterval = setInterval(() => {
        setProgressPercent((prev) => {
          // Gradually increase progress, but cap at 90% until actually done
          if (prev < 90) {
            return Math.min(prev + 2, 90);
          }
          return prev;
        });
      }, 200);

      // Preview the import
      console.log('[IMPORT DEBUG] Calling previewImport...');
      const importPreview = await previewImport(bytes);
      console.log('[IMPORT DEBUG] previewImport completed');
      
      // Clear interval and set to 100%
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      setProgressPercent(100);
      setLoadingMessage('Complete!');
      console.log('[IMPORT DEBUG] Import complete, showing preview modal');
      
      // Small delay to show completion
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setPreview(importPreview);
      setZipBytes(bytes);
      console.log('[IMPORT DEBUG] Preview modal state set');
    } catch (err) {
      console.error('[IMPORT DEBUG] Import failed:', err);
      console.error('[IMPORT DEBUG] Error stack:', err instanceof Error ? err.stack : 'No stack trace');
      alert(`Failed to import zip: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setIsLoading(false);
      setLoadingMessage('');
      setProgressPercent(0);
      console.log('[IMPORT DEBUG] Cleanup complete');
    }
  };

  const handleClose = () => {
    setPreview(null);
    setZipBytes(null);
  };

  const handleComplete = async (importedProjectId: string) => {
    // Reload projects and select the imported/merged project
    await loadProjects();
    setSelectedProjectId(importedProjectId);
    handleClose();
  };

  return (
    <>
      <button
        onClick={() => {
          console.log('[IMPORT DEBUG] ====== BUTTON CLICKED ======');
          handleImport().catch((err) => {
            console.error('[IMPORT DEBUG] Unhandled error in handleImport:', err);
          });
        }}
        disabled={isLoading}
        className="ml-2 bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:bg-gray-400"
      >
        {isLoading ? 'Loading…' : 'Import Zip'}
      </button>

      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Loading Import</h3>
              <p className="text-sm text-gray-600 mb-4">{loadingMessage || 'Preparing import...'}</p>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className="bg-purple-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">{Math.round(progressPercent)}%</p>
            </div>
          </div>
        </div>
      )}

      {preview && zipBytes && (
        <ImportPreviewModal
          preview={preview}
          zipBytes={zipBytes}
          onClose={handleClose}
          onComplete={handleComplete}
        />
      )}
    </>
  );
};

export default ImportProjectButton;


