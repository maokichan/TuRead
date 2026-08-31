/// <reference types="vite/client" />
import type { TureadBridge } from '../../shared/ipc'

declare global {
  interface Window {
    /** preload 注入的主进程桥（见 src/preload/index.ts） */
    turead: TureadBridge
  }
}

export {}
