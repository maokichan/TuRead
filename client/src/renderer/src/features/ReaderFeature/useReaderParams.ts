/**
 * 阅读参数钩子（自 ReaderFeature 拆出）：参数态 + 应用到渲染层。
 * 应用分工（STYLE.md §5.9）：**宿主几何** → CSS 变量挂在 documentElement（与主题同款做法，
 * 渲染层不感知设置来源）；**正文排版** → `applyTypography` 注入正文 iframe。
 * 改参数的落库与重开编排（readerSettings 唯一写者 = 参数面板）留在 Feature（要粘 book 格式）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { ReaderSettings } from '@core/domain/types'
import type { ServiceContainer } from '@core/container'
import { DEFAULT_READER_PARAMS, type ReaderParams } from '../../components/ReaderControls'

export function useReaderParams(container: ServiceContainer): {
  params: ReaderParams
  paramsRef: MutableRefObject<ReaderParams>
  applyParams: (p: ReaderParams, isPdf: boolean) => void
} {
  const [params, setParams] = useState<ReaderParams>(DEFAULT_READER_PARAMS)
  const paramsRef = useRef<ReaderParams>(DEFAULT_READER_PARAMS)

  /**
   * 应用参数到渲染层。
   * - **宿主几何** → CSS 变量挂在 documentElement（与主题同款做法，渲染层不感知设置来源）
   * - **正文排版** → `applyTypography` 注入正文 iframe
   */
  const applyParams = useCallback(
    (p: ReaderParams, isPdf: boolean) => {
      const root = document.documentElement
      // PDF 用专属宽档（位图页比文字列宽才舒服）；仍受 --page-w 的让位 min() 约束
      root.style.setProperty('--read-width', `${isPdf ? p.readerWidthPdf : p.readerWidth}px`)
      root.style.setProperty('--page-pad-x', `${p.pagePadX}px`)
      void container.render.applyTypography({
        fontSize: p.fontSize ?? undefined,
        lineHeight: p.lineHeight ?? undefined,
        paragraphSpacing: p.paragraphSpacing ?? undefined
      })
    },
    [container]
  )

  // 启动载入阅读参数（缺省 = 不改，尊重书自带排版）
  useEffect(() => {
    void container.store.getSetting<ReaderSettings>('readerSettings', {}).then((cfg) => {
      const loaded: ReaderParams = {
        fontSize: cfg.fontSize ?? DEFAULT_READER_PARAMS.fontSize,
        lineHeight: cfg.lineHeight ?? DEFAULT_READER_PARAMS.lineHeight,
        paragraphSpacing: cfg.paragraphSpacing ?? DEFAULT_READER_PARAMS.paragraphSpacing,
        pagePadX: cfg.pagePadX ?? DEFAULT_READER_PARAMS.pagePadX,
        readerWidth: cfg.readerWidth ?? DEFAULT_READER_PARAMS.readerWidth,
        readerWidthPdf: cfg.readerWidthPdf ?? DEFAULT_READER_PARAMS.readerWidthPdf,
        readerMode: cfg.readerMode ?? DEFAULT_READER_PARAMS.readerMode
      }
      paramsRef.current = loaded
      setParams(loaded)
      // 此时尚无"当前书"格式信息 → 先按文字类应用；开书 effect 里会按本书格式再切一次。
      // readerMode 由 Feature 经打开流程读 readerSettings 消费（这里不重复设置）。
      applyParams(loaded, false)
    })
  }, [container, applyParams])

  return { params, paramsRef, applyParams }
}
