/**
 * preload：通过 contextBridge 暴露最小桥接口 `window.turead`（invoke + subscribe）。
 * 渲染进程的 core 适配器经由它访问主进程能力（WS/REST、SQLite 存储、文件系统）。
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type TureadBridge } from '@shared/ipc'

const devBookArg = process.argv.find((a) => a.startsWith('--turead-dev-book='))
const devBook = devBookArg ? devBookArg.slice('--turead-dev-book='.length) : undefined

const devProbeArg = process.argv.find((a) => a.startsWith('--turead-dev-probe='))
const devProbe = devProbeArg ? devProbeArg.slice('--turead-dev-probe='.length) : undefined

const bridge: TureadBridge = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  subscribe: (channel, listener) => {
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  },
  // 拖拽导入：Electron ≥29 移除了 File.path，真实磁盘路径只能经 preload 的 webUtils 取
  getPathForFile: (file) => webUtils.getPathForFile(file),
  // 剪贴板（2026-09-16）：**具名方法**（不是让渲染层拿泛化 invoke 随便打通道）——
  // 笔记管理的「複製批註」用；通道白名单化的第一步，方向见 TODO「IPC 桥信任边界过宽」
  writeClipboardText: (text) => ipcRenderer.invoke(IPC.clipboardWriteText, text) as Promise<void>,
  devBook,
  devProbe
}

contextBridge.exposeInMainWorld('turead', bridge)
