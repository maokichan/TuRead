/**
 * 房间域的 REST 请求组（自 RoomSession 拆出）——createRoom / 副本上传下载 / 房间发现 / 聊天历史。
 * 全部零共享状态：只吃 `INetService.request`，错误一律抛（调用方进日志/系统消息）。
 * 协议细节（路径、载荷形状、错误口径）以 server/docs/API.md 为准。
 */
import { buildChatHistoryPath, isChatMessage } from '@core/domain/protocol'
import type { BookRecord, ChatMessage, RoomInfo } from '@core/domain/types'
import type { INetService } from '@core/ports/net'

/**
 * 创建房间并注册 work/edition（POST /rooms）。
 * 协议固定 content-hash-v1（edition 内容指纹）——server 只登记不重算。
 */
export async function createRoom(
  net: INetService,
  book: BookRecord,
  owner: string
): Promise<{ roomId: string; editionId: number }> {
  const res = await net.request<{ roomId: string; editionId: number }>({
    method: 'POST',
    path: '/rooms',
    body: {
      owner,
      book: {
        protocol: 'content-hash-v1',
        code: book.fingerprint.hash,
        title: book.metadata.title,
        ext: book.format.toLowerCase(),
        hashAlgo: book.fingerprint.algorithm,
        hash: book.fingerprint.hash,
        size: book.fingerprint.size
      }
    }
  })
  if (!res.ok) throw new Error(`创建房间失败: ${JSON.stringify(res.data)}`)
  return res.data
}

/** 上传电子版副本（POST /books/{editionID}/file，幂等去重，分发源） */
export async function uploadBookCopy(net: INetService, editionId: number, buffer: ArrayBuffer): Promise<void> {
  const res = await net.request<unknown>({
    method: 'POST',
    path: `/books/${editionId}/file`,
    body: buffer,
    rawBody: true,
    responseType: 'text'
  })
  if (!res.ok) throw new Error(`上传副本失败: ${JSON.stringify(res.data)}`)
}

/**
 * 下载电子版副本（GET /books/{editionID}/file → ArrayBuffer）。
 * 无书成员的获取路径（服务器 `localCopy = 1` 时可用；404 = 副本未上传，调用方提示）。
 * 字节回来后由调用方落盘（`picker.saveBookCopy`）→ 导入（`books.importBook`）→ 打开。
 */
export async function downloadBookCopy(net: INetService, editionId: number): Promise<ArrayBuffer> {
  const res = await net.request<ArrayBuffer>({
    method: 'GET',
    path: `/books/${editionId}/file`,
    responseType: 'arraybuffer'
  })
  if (!res.ok) {
    const detail =
      typeof res.data === 'string' || res.data == null ? String(res.data ?? '') : JSON.stringify(res.data)
    throw new Error(`下载副本失败（HTTP ${res.status}）${detail ? `：${detail.slice(0, 120)}` : ''}`)
  }
  return res.data
}

/** 房间发现（GET /rooms，可按 edition 找房） */
export async function listRooms(net: INetService, editionId?: number): Promise<RoomInfo[]> {
  const q = editionId != null ? `?edition=${editionId}` : ''
  const res = await net.request<{ rooms: RoomInfo[] }>({
    method: 'GET',
    path: `/rooms${q}`
  })
  if (!res.ok) throw new Error(`拉取房间列表失败: ${JSON.stringify(res.data)}`)
  return res.data.rooms
}

/**
 * 拉取聊天历史（`GET /rooms/{roomID}/messages?after=&limit=`，追加日志模型）。
 * 加入房间自动拉最近一页；`after` 用于重连后增量补拉。
 */
export async function listChatMessages(
  net: INetService,
  roomId: string,
  opts?: { after?: number; limit?: number }
): Promise<ChatMessage[]> {
  const res = await net.request<{ messages?: ChatMessage[] }>({
    method: 'GET',
    path: buildChatHistoryPath(roomId, opts)
  })
  if (!res.ok) throw new Error(`拉取聊天歷史失敗：${JSON.stringify(res.data)}`)
  const list = res.data?.messages
  if (!Array.isArray(list)) return []
  return list.filter(isChatMessage).sort((a, b) => a.id - b.id)
}
