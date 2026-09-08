/**
 * IBookPicker —— 文件/目录选择与目录扫描（端口）。
 * 依据：client/docs/FEATURES.md §10（书库重做：导入菜单「文件…/文件夹…」）。
 *
 * 为什么立这个端口：书库导入此前直接调用 `window.turead` 桥（IPC 通道名渗进 UI 层），
 * 而"导入文件夹"还需要目录扫描能力 —— 两件事都属于**文件系统能力**，应收敛为端口，
 * UI 只依赖 `ServiceContainer`（六边形纪律）。
 *
 * 平台约束（Electron，2026-09-08 核实）：**同一对话框不能既选文件又选目录**
 * （Windows 下 `openFile` + `openDirectory` 只会给出目录，见 electron#26885）→ 因此是两个方法。
 */
export interface IBookPicker {
  /** 系统对话框选**多个文件**；取消 → 空数组 */
  pickFiles(): Promise<string[]>
  /** 系统对话框选**一个目录**；取消 → null */
  pickDirectory(): Promise<string | null>
  /**
   * 列出目录下的电子书路径（按扩展名过滤，排序稳定）。
   * @param recursive false = 只此节点（当前目录）；true = 此节点及其所有子节点（可配置选项）
   */
  listEbooks(dir: string, recursive: boolean): Promise<string[]>
  /** 读文件字节（导入用）—— 同属"本地文件能力"，放这里以彻底消除 UI 直用 IPC 桥的例外 */
  readFile(path: string): Promise<ArrayBuffer>
}
