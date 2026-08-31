/**
 * 服务装配（ServiceContainer）—— 依据：client/docs/CONTRACTS.md §6。
 * 规则：
 * - 构造函数注入依赖（RoomSession(net, render, identity)；BookService(identity, store)）。
 * - UI 只依赖 ServiceContainer，不直接 import kookit / better-sqlite3 / WebSocket 实现。
 * - 适配器目录：core/adapters/{net,storage,identity,render}。
 */
import type { IRenderService } from '@core/ports/render'
import type { INetService } from '@core/ports/net'
import type { IBookIdentityService } from '@core/ports/identity'
import type { ILibraryStore } from '@core/ports/store'
import type { IRoomSession } from '@core/usecases/RoomSession'
import type { IBookService } from '@core/usecases/BookService'

import { IpcNetAdapter } from '@core/adapters/net/ipcNetAdapter'
import { IpcStoreAdapter } from '@core/adapters/storage/ipcStoreAdapter'
import { FingerprintService } from '@core/adapters/identity/fingerprint'
import { KookitRenderAdapter } from '@core/adapters/render/kookitRenderAdapter'
import { RoomSession } from '@core/usecases/RoomSession'
import { BookService } from '@core/usecases/BookService'
import { IPC, type TureadBridge } from '@shared/ipc'

export interface ServiceContainer {
  // 能力服务（ports）
  render: IRenderService
  net: INetService
  identity: IBookIdentityService
  store: ILibraryStore
  // 应用服务（usecases）
  room: IRoomSession
  books: IBookService
}

/** 装配真实服务容器（渲染进程调用，桥 = preload 注入的 window.turead） */
export function createContainer(bridge: TureadBridge): ServiceContainer {
  const render: IRenderService = new KookitRenderAdapter((path) =>
    bridge.invoke(IPC.fsReadFile, path) as Promise<ArrayBuffer>
  )
  const net: INetService = new IpcNetAdapter(bridge)
  const identity: IBookIdentityService = new FingerprintService()
  const store: ILibraryStore = new IpcStoreAdapter(bridge)

  const room: IRoomSession = new RoomSession(net, render, identity)
  const books: IBookService = new BookService(identity, store)

  return { render, net, identity, store, room, books }
}
