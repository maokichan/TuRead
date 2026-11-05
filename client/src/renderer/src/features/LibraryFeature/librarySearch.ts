/**
 * 书库全库检索（底面全局搜索·书库作用域）——自 LibraryFeature 拆出，行为契约不变：
 * SQL 侧 `searchHoldings`（标题/来源路径/收录路径子串、大小写不敏感、不含来源缺失）；
 * 不看当前层，清词回层；词非空 = 检索态，结果是**书的平面列表**（書箱/文件夹不参与）；
 * 代次守卫防乱序回填（快速输入时旧结果不得覆盖新结果）；空串不发起。
 */
import { useEffect, useRef, useState } from 'react'
import type { EditionRecord, LibraryItem, ReadingState } from '@core/domain/types'
import type { ILibraryStore } from '@core/ports/store'
import type { ServiceContainer } from '@core/container'
import type { FeatureHost } from '../types'
import { getCoverUrl } from '../coverCache'

/** 检索防抖（style/components-notes.md「配套纪律」，与 NotesFeature 同值同口径） */
const QUERY_DEBOUNCE_MS = 200

/** 层级取数与检索结果共用的封面补齐（同一套 coverCache 口径；返回非空 [id, url] 对） */
export async function coverUrlPairs(
  store: ILibraryStore,
  items: LibraryItem[]
): Promise<Array<[string, string]>> {
  const pairs = await Promise.all(
    items.map(
      async (it) =>
        [it.edition.id, await getCoverUrl(store, it.edition.id, it.edition.coverPath)] as const
    )
  )
  return pairs.filter((p): p is [string, string] => p[1] !== null)
}

export function useLibrarySearch(params: {
  container: ServiceContainer
  host: FeatureHost
  /** 底面全局搜索框经 chromeSearchBus 写入的原始词（未防抖） */
  libraryQuery: string
  /** 检索是库内动作（searchHoldings 带库） */
  libraryId: string
}): {
  debouncedLibraryQuery: string
  /** 防抖后的检索小写词（空串 = 非检索态；也喂窗口化 resetKey） */
  q: string
  searching: boolean
  /** null = 在途（不闪空态）；[] = 无命中 */
  searchResults: EditionRecord[] | null
  searchCovers: Record<string, string>
  searchReadingStates: Record<string, ReadingState>
} {
  const { container, host, libraryQuery, libraryId } = params
  const [debouncedLibraryQuery, setDebouncedLibraryQuery] = useState(libraryQuery)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedLibraryQuery(libraryQuery), QUERY_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [libraryQuery])
  const q = debouncedLibraryQuery.trim().toLowerCase()
  const searching = q.length > 0

  // 检索态的结果装载（代次守卫防乱序回填；空串不发起）。
  // 封面/阅读状态随结果补齐（与 loadLevel 同一套 coverCache / 状态表）。
  const [searchResults, setSearchResults] = useState<EditionRecord[] | null>(null)
  const [searchCovers, setSearchCovers] = useState<Record<string, string>>({})
  const [searchReadingStates, setSearchReadingStates] = useState<Record<string, ReadingState>>({})
  const searchSeq = useRef(0)
  useEffect(() => {
    if (!searching || !libraryId) {
      setSearchResults(null)
      return
    }
    const seq = ++searchSeq.current
    void container.store
      .searchHoldings(libraryId, q)
      .then(async (items) => {
        if (seq !== searchSeq.current) return
        setSearchResults(items.map((it) => it.edition))
        setSearchReadingStates(
          Object.fromEntries(
            items.flatMap((it) =>
              it.readingState ? [[it.edition.id, it.readingState] as const] : []
            )
          )
        )
        const pairs = await coverUrlPairs(container.store, items)
        if (seq !== searchSeq.current) return
        setSearchCovers(Object.fromEntries(pairs))
      })
      .catch((err) => {
        if (seq !== searchSeq.current) return
        host.pushLog(`書庫檢索失敗：${(err as Error).message}`)
        setSearchResults([])
      })
  }, [container, host, searching, q, libraryId])

  return { debouncedLibraryQuery, q, searching, searchResults, searchCovers, searchReadingStates }
}
