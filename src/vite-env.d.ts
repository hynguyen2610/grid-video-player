/// <reference types="vite/client" />

import type { StorageApi } from './shared/types';

declare global {
  interface Window {
    gridVideo: StorageApi;
  }
}

export {};
