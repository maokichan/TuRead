# 决策：插件生命周期与分发形态（官方插件手动安装）

Status: implemented

## Problem

插件系统生命周期五段缺三：分发（无）、安装（无主动管道）、升级（未定）。插件 v1 的 seeder
「缺则种」让官方件默认自动装，且曾衍生出「官方件不可卸载」的错误执行（见
implemented/product/2026-11-10-seed-uninstallable）。用户 2026-11-10 连续三轮裁定，把插件
获取形态彻底定死。

## Decision（用户 2026-11-10 裁定）

- **官方插件 = 手动安装**。首发自动补齐机制**整体废除**（第一轮裁「可卸载」、第二轮裁
  「术语退役」、本轮裁「机制本身废除」）：安装包不再携带插件，新装机零插件。
- **分发 = GitHub Release**（项目无托管插件的服务器）；官方插件 zip 随版本发布
  （BUILD.md 滚版本第 5 步）。
- **安装 = 本地 zip 导入，唯一管道**（设置页「安裝插件…」，对话框收在主进程、渲染层零路径）。
  完整性 = manifest 校验 + zip 结构与路径围栏；第三方插件走同一管道（契约只认形状不认出身），
  自担风险；信任模型官方独占不变（不防恶意只防误用，已明示写进契约文档 PLUGINS.md §1）。
- **更新检查 = 不做**。升级 = 从 GitHub Release 重新下载 zip 重新导入，同一管道做版本比较
  （`comparePluginVersions`：同版本拒、低版本拒防降级、高版本覆盖 = 升级）。
- **dev 豁免**（用户确认「重启 dev 可接受」）：政策住装配点——`!app.isPackaged` 时把工作区
  `client/plugins/` **覆盖同步**进运行时目录（`PluginManager.syncFrom`）；改完源码重启 dev 即
  生效；单向覆盖不删多余；打包路径物理触达不到同步。
- **词汇退役**：「种子件」概念不复存在；「opt-out」清单随机制一起删除。

## Consequences

- 新装机零插件：「問」（AI 共读）不再开箱即用——README 与发版说明已口径化「插件到 GitHub
  Release 下载后经设置页导入」。
- `PluginManager` 简化：provision / bundledDirs / 已卸载清单 / `seeded` 标记全链删除；
  `uninstall` 无「复活」问题；设置页 = 注册表 + 获取动作（安裝/啟停/卸載）。
- 打包瘦身：`extraResources` 不再带 `plugins/`（electron-builder.yml）。
- 依赖：`fflate`（MIT，AGPL 兼容）已声明为直接依赖（zip 解析；计划批准时征得同意）。
- 已知残留不变：`plugin-secret:<id>:*` 密文清不掉（store 无按前缀删键原语，TODO）；
  IPC 未隔离 / 无运行时隔离两处「弱」= 已知边界（第三方开放已裁定，见 PLUGINS.md §1）。

## Alternatives considered

- **随包 + 「恢復官方隨附」一键重装**：输在——仍是一种自动/半自动获取，违背「手动安装」
  的明示裁定；且资源包体积只为提「重装便利」，与 GitHub Release 分发重复。
- **自动补齐 + 已卸载清单豁免**（上一版设计）：输在——用户三轮裁定层层收紧（可卸→退役
  术语→废机制），保留任何形态的自动获取都是没听懂。
- **dev 侧手动 zip 导入**：输在——开发要速度，每次迭代重装一遍不可接受；覆盖同步一次到位。

## Acceptance criteria（实现批已达成）

1. `plugins:install-zip` 管道：对话框收在主进程、manifest + zip 双校验、路径围栏、版本比较、
   临时目录原子落位（`installZip`，`main/plugins.ts`）；
2. 设置页「安裝插件…」+ 安装后全量重载 + 错误就地可见 + 空态指引；
3. provision / 已卸载清单 / seeded 标记全链删除（IPC、runtime、设置页、测试同步）；
4. 打包配方移除 extraResources 的 plugins（electron-builder.yml + BUILD.md 口径）；
5. 单测覆盖：syncFrom（覆盖/不删多余/缺源正常）、installZip（根/文件夹形态/文件夹名不符/
   同版本拒/降级拒/升级覆盖/坏 zip/路径穿越/多顶层目录/无 manifest/卸后重装）；
6. 契约文档：第三方立场明示（PLUGINS.md §1）+ zip 打包规范（§2）+ 生命周期重写（§4）。
   面向人的插件开发指南未做（与「人类可读文档」TODO 同源，独立待办）。
