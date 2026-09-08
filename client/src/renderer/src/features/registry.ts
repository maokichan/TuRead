/**
 * 功能组件注册表 —— 标准容器发现机制。
 * 内置功能组件在此登记；未来官方插件 = 新增一条 FeatureDescriptor 追加进 FEATURES。
 * 符号：繁体汉字单字（書/閱/房/設），以「源流明体」字体栈显示（见 styles.css .feature-icon）；
 * 禁用带颜色的 emoji。settings 钉在侧边栏最下角。
 */
import type { FeatureDescriptor } from './types'
import { LibraryFeature } from './LibraryFeature'
import { ReaderFeature } from './ReaderFeature'
import { RoomFeature } from './RoomFeature'
import { SettingsFeature } from './SettingsFeature'

/** 侧边栏顺序 = 数组顺序；pinned 项由 AppShell 单独渲染到最下角 */
export const FEATURES: FeatureDescriptor[] = [
  { id: 'library', icon: '書', label: '书架', component: LibraryFeature },
  { id: 'reader', icon: '閱', label: '阅读', component: ReaderFeature },
  { id: 'room', icon: '房', label: '房间', component: RoomFeature },
  { id: 'settings', icon: '設', label: '设置', component: SettingsFeature, pinned: true }
]
