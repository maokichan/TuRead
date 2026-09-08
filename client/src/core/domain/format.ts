/**
 * 文件扩展名 → BookFormat（领域词汇映射，纯函数）。
 * 依据：client/docs/CONTRACTS.md §2 BookFormat。
 *
 * 为什么放在领域层：导入用例（ImportQueue）需要它，而用例不得依赖 UI 层工具
 * （此前在 `renderer/src/features/util.ts`，随导入编排下沉到 core 一起搬过来）。
 */
import type { BookFormat } from './types'

const EXT_TO_FORMAT: Record<string, BookFormat> = {
  epub: 'EPUB',
  pdf: 'PDF',
  mobi: 'MOBI',
  azw3: 'AZW3',
  azw: 'AZW',
  txt: 'TXT',
  md: 'MD',
  fb2: 'FB2',
  docx: 'DOCX',
  html: 'HTML',
  mhtml: 'MHTML',
  xml: 'XML',
  cbz: 'CBZ',
  cbr: 'CBR',
  cbt: 'CBT',
  cb7: 'CB7'
}

/** 取扩展名 → BookFormat；未知扩展名回退 TXT（调用方负责过滤，见 IBookPicker.listEbooks） */
export function extToFormat(name: string): BookFormat {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_FORMAT[ext] ?? 'TXT'
}

/** 取路径末段（跨平台分隔符）——导入用例用它生成显示名 */
export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
