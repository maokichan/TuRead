/**
 * 功能组件（Feature）标准容器契约 —— 依据：client/docs/FEATURES.md（UI 功能组件设计）。
 * 目的：为「官方插件」铺路的 UI 侧边界 —— 一个功能插件 = 实现某端口的适配器
 * （进 ServiceContainer）+ 一个 FeatureDescriptor（进 registry，Shell 自动发现）。
 * 约定：功能组件只依赖 ServiceContainer / 领域类型 / components/*，不直接 import
 * kookit / better-sqlite3 / WebSocket 实现 / window.turead 桥。
 */
import type { ComponentType } from 'react'
import type { ServiceContainer } from '@core/container'

/** 内置功能组件 id。官方插件扩展时追加新的 id 字面量（不与内置冲突即可）。 */
export const FEATURE_IDS = ['library', 'reader', 'room', 'settings'] as const
export type FeatureId = (typeof FEATURE_IDS)[number]

/**
 * 功能组件宿主 —— 跨功能导航与状态继承的唯一通道。
 * 功能组件之间不互相 import；需要「换功能 / 带状态跳转」一律走 host。
 */
export interface FeatureHost {
  /** 切换到指定功能组件（侧边栏等价） */
  navigate(featureId: FeatureId): void
  /**
   * 打开阅读器并打开指定书（本地打开 / 房间加入后的状态继承都走这里）。
   * 副作用：把该书设为当前选中书 + 切到阅读功能组件。
   */
  openReader(bookId: string): void
  /** 关闭阅读器（清空 readerBookId） */
  closeReader(): void
  /** 设置当前选中书籍（跨功能：Library 选中 → Room 标定 / Reader 打开） */
  selectBook(bookId: string | null): void
  /** 追加一行到全局日志栏 */
  pushLog(line: string): void
}

/**
 * 功能组件统一 props —— 标准容器契约。
 * 跨功能共享态由 AppShell 持有并下发；各功能组件只读自己关心的字段。
 */
export interface FeatureProps {
  container: ServiceContainer
  host: FeatureHost
  /** 当前选中的书（Library 产出；Room 标定 / Reader 打开的目标） */
  selectedBookId: string | null
  /** 阅读器中当前打开的书（null = 未打开；ReaderFeature 受它驱动） */
  readerBookId: string | null
  /** 当前激活的功能组件（v0.1.12：ReaderFeature 用它做沉浸态激活时 applyTheme） */
  activeFeature: FeatureId
}

/** 功能组件注册描述 —— 官方插件 = 新增一条 descriptor 注册进 registry。 */
export interface FeatureDescriptor {
  id: FeatureId
  /** 侧边栏符号（单色：汉字首字等，不用带颜色的 emoji） */
  icon: string
  /** 侧边栏悬停提示 / 可访问名 */
  label: string
  component: ComponentType<FeatureProps>
  /** true = 钉在侧边栏最下角（如设置） */
  pinned?: boolean
}
