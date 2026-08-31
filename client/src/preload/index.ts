/**
 * preload：通过 contextBridge 暴露最小桥接口 `window.turead`（invoke + subscribe）。
 * 渲染进程的 core 适配器经由它访问主进程能力（WS/REST、JSON 存储）。
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { TureadBridge } from '@shared/ipc'

const devBookArg = process.argv.find((a) => a.startsWith('--turead-dev-book='))
const devBook = devBookArg ? devBookArg.slice('--turead-dev-book='.length) : undefined

const bridge: TureadBridge = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  subscribe: (channel, listener) => {
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  },
  devBook
}

contextBridge.exposeInMainWorld('turead', bridge)
