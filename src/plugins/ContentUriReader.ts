import { registerPlugin } from '@capacitor/core';

export interface ContentUriReaderPlugin {
  /**
   * Read a content:// URI in chunks
   * @param options The read options
   * @returns Promise that resolves when reading starts (chunks come via events)
   */
  readInChunks(options: ReadInChunksOptions): Promise<void>;
  
  /**
   * Add a listener for chunk events
   */
  addListener(
    eventName: 'chunk',
    listenerFunc: (chunk: ChunkEvent) => void
  ): Promise<any>;
  
  /**
   * Remove a listener for chunk events
   */
  removeAllListeners(): Promise<void>;
}

export interface ReadInChunksOptions {
  /**
   * The content:// URI to read
   */
  uri: string;
  
  /**
   * Chunk size in bytes (default: 1MB)
   */
  chunkSize?: number;
}

export interface ChunkEvent {
  /**
   * Base64-encoded chunk data
   */
  data: string;
  
  /**
   * Byte offset of this chunk
   */
  offset: number;
  
  /**
   * Size of this chunk in bytes
   */
  size: number;
  
  /**
   * Total bytes read so far
   */
  totalRead: number;
  
  /**
   * Total file size (if known, -1 otherwise)
   */
  totalSize: number;
  
  /**
   * True if this is the last chunk
   */
  isLast: boolean;
}

const ContentUriReader = registerPlugin<ContentUriReaderPlugin>('ContentUriReader', {
  web: () => import('./ContentUriReader.web').then(m => new m.ContentUriReaderWeb()),
  // Explicitly specify Android implementation exists
});

export * from './definitions';
export { ContentUriReader };
