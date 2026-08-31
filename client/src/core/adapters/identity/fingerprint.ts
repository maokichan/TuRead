/**
 * IBookIdentityService 适配器（真实实现）。
 * 指纹算法 md5-sample3-v1：头 64KB + 中点 64KB + 尾 64KB 三点采样拼接后计算 md5（配合 size 防碰撞）。
 * 依据：docs/ARCHITECTURE.md §1 + server/docs/API.md。
 * 实现：spark-md5（MIT，支持 ArrayBuffer 增量/拼接哈希）。
 */
import SparkMD5 from 'spark-md5'
import type { IBookIdentityService } from '@core/ports/identity'
import type { BookFingerprint, BookFormat, BookMetadata } from '@core/domain/types'

const SAMPLE_SIZE = 64 * 1024

export function computeSample3Md5(buffer: ArrayBuffer): { hash: string; size: number } {
  const bytes = new Uint8Array(buffer)
  const size = bytes.byteLength

  const head = bytes.subarray(0, SAMPLE_SIZE)
  const midStart = Math.floor(size / 2)
  const mid = bytes.subarray(midStart, midStart + SAMPLE_SIZE)
  const tailStart = Math.max(0, size - SAMPLE_SIZE)
  const tail = bytes.subarray(tailStart)

  const combined = new Uint8Array(head.byteLength + mid.byteLength + tail.byteLength)
  combined.set(head, 0)
  combined.set(mid, head.byteLength)
  combined.set(tail, head.byteLength + mid.byteLength)

  const hash = SparkMD5.ArrayBuffer.hash(combined.buffer as ArrayBuffer)
  return { hash, size }
}

export class FingerprintService implements IBookIdentityService {
  computeFingerprint(buffer: ArrayBuffer): Promise<BookFingerprint> {
    const { hash, size } = computeSample3Md5(buffer)
    return Promise.resolve({ algorithm: 'md5-sample3-v1', hash, size })
  }

  /** 元数据提取：骨架阶段从文件名推导 title，结构化字段（epub/fb2）后续交给 kookit 解析。 */
  extractMetadata(_buffer: ArrayBuffer, _format: BookFormat, name: string): Promise<BookMetadata> {
    const title = stripExtension(name) || '未命名'
    return Promise.resolve({ title })
  }

  verify(local: BookFingerprint, room: BookFingerprint): boolean {
    return (
      local.algorithm === room.algorithm &&
      local.hash === room.hash &&
      local.size === room.size
    )
  }
}

function stripExtension(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? name
  const idx = base.lastIndexOf('.')
  return idx > 0 ? base.slice(0, idx) : base
}
