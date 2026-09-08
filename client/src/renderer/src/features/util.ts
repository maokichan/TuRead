import type { BookRecord } from '@core/domain/types'

/** 文件名后缀 → BookFormat（LibraryFeature 导入与 dev 自检共用） */
export function extToFormat(name: string): BookRecord['format'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, BookRecord['format']> = {
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
  return map[ext] ?? 'TXT'
}
