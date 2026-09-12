/**
 * TXT 编码检测（2026-09-12）。
 *
 * 为什么需要：kookit 的 TxtRender 渲染时 `new TextDecoder(config.charset)` —— charset 由
 * **调用方**提供（它只在 getMetadata 里自带检测，渲染路径不检测）；传 `''` 会直接
 * RangeError（此前 TXT 全格式打不开的根因）。中文 TXT 的现实分布是 UTF-8 / GB18030（GBK 系）
 * / Big5 / UTF-16，人工判别不现实 → 用 chardet（MIT，kookit 同款依赖）按 kookit 的口径
 * （首 4KB 采样）检测。
 */
import * as chardet from 'chardet'

/** TextDecoder 不认的 chardet 标签 → 标准编码名（其余标签 Chromium 原生可解） */
const LABEL_MAP: Record<string, string> = {
  ASCII: 'utf-8', // ASCII ⊂ UTF-8；TextDecoder 无 'ascii' 标签
  'ISO-8859-1': 'windows-1252',
  WIN1250: 'windows-1250',
  WIN1251: 'windows-1251',
  WIN1252: 'windows-1252',
  WIN1255: 'windows-1255',
  WIN1256: 'windows-1256'
}

export function detectTextCharset(buffer: ArrayBuffer): string {
  const bytes = buffer.byteLength > 0 ? new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4096)) : new Uint8Array(0)
  let detected = ''
  try {
    detected = (chardet.detect(bytes) ?? '').toUpperCase()
  } catch {
    detected = ''
  }
  if (!detected) return 'utf-8'
  return LABEL_MAP[detected] ?? detected.toLowerCase()
}
