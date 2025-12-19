export interface ContentUriReaderPlugin {
  readInChunks(options: ReadInChunksOptions): Promise<void>;
  addListener(
    eventName: 'chunk',
    listenerFunc: (chunk: ChunkEvent) => void
  ): Promise<any>;
  removeAllListeners(): Promise<void>;
}

export interface ReadInChunksOptions {
  uri: string;
  chunkSize?: number;
}

export interface ChunkEvent {
  data: string;
  offset: number;
  size: number;
  totalRead: number;
  totalSize: number;
  isLast: boolean;
}
