/**
 * IBookIdentityService —— 书籍标定（指纹/元数据）。
 * 依据：client/docs/CONTRACTS.md §4.3 + docs/ARCHITECTURE.md §1。
 * 指纹策略：头/中/尾三点采样（头 64KB、中点 64KB、尾 64KB 拼接后计算哈希，配合 size 降低碰撞），
 * 算法 md5-sample3-v1（server 侧已按此注册，client 计算必须一致）。
 * 注意：kookit 的 Book.md5 字段由调用方计算后传入 —— 本服务即计算方。
 */
import type { BookFingerprint, BookFormat, BookMetadata } from '@core/domain/types'

export interface IBookIdentityService {
  computeFingerprint(buffer: ArrayBuffer): Promise<BookFingerprint>
  extractMetadata(buffer: ArrayBuffer, format: BookFormat, name: string): Promise<BookMetadata>
  verify(local: BookFingerprint, room: BookFingerprint): boolean
}
