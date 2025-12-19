import { WebPlugin } from '@capacitor/core';
import type { ContentUriReaderPlugin, ReadInChunksOptions } from './definitions';

export class ContentUriReaderWeb extends WebPlugin implements ContentUriReaderPlugin {
  async readInChunks(_options: ReadInChunksOptions): Promise<void> {
    throw new Error('ContentUriReader is not implemented on web platform');
  }
}
