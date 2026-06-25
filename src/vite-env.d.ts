/// <reference types="vite/client" />

import type { GridVideoTestApi, StorageApi } from './shared/types';

declare global {
  interface Window {
    gridVideo: StorageApi;
    gridVideoTest?: GridVideoTestApi;
  }
}

export {};
