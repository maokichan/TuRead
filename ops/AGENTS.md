# ops/ —— 仓库治理（agent 子树入口）

> 本目录只放**仓库治理**脚本：守卫与声明，防的是仓库因 agent 而变形——路径泄漏、密钥入库、
> 文档膨胀、文档与事实脱钩。业务与验证探针在 `client/scripts/`（信任分级见其 README），两者分治。
> 红线全表在仓库根 `AGENTS.md`；洗文口径与行数上限的域规则在 `docs/AGENTS.md`。

## 脚本（三件套，`<域><动作>.mjs`；Guard 族挡提交，报错自带修法）

| 脚本 | 拦什么 |
|---|---|
| [`docIndex`](scripts/docIndex.mjs) | 文末「跟踪：」声明的路径缺失 = 拦；被跟踪事实变了而声明文档没动 = 提醒不拦；引用向上（祖先）或出仓 = 拦 |
| [`repoGuard`](scripts/repoGuard.mjs) | 绝对路径（三形态，只扫文档/配置扩展）与 API key（八类，扫全部文本源）= 拦；密钥命中不回显；`<占位符>` 豁免 |
| [`docGuard`](scripts/docGuard.mjs) | Markdown 行数超上限 = 拦（入口类硬上限、其余 800；上限表见其头注，动笔前先登记） |

## 门控链（pre-commit；clone 后一次性激活 `git config core.hooksPath .githooks`）

`set -e` 串联：docIndex hook → repoGuard → docGuard，任一失败即中止提交。`--no-verify` 是
人类的绕行特权，agent 不用——门控为纪律而设，不是安全机制。体检：各脚本 `--report` / `check`。

## 路径红线（repoGuard 的口径依据）

- 所有路径一律仓库相对：命令示例从仓库根运行；指代仓库根写 `<仓库根>` 占位。
- 引用仓库外文件属越权动作：改写为指认来源的相对引用，或删除。
- 密钥检出 = 立即移出并轮换；占位符（`<二级令牌，可空>` 这类）是文档示例的合法形态。

## 声明规则（docIndex 的口径依据）

- 声明 = 文末最后一行 `跟踪：[标签](路径) · …`；只登记入库路径，gitignored 不可声明；
  一文件尽量单声明者；纯纪律文档（AGENTS/notes）不声明——例外：本文件声明自有脚本、
  清单类 README 声明清单项。
- 声明的义务：被跟踪路径变了，声明文档同批更新——「该看一眼」固定在 commit 时刻。

跟踪：[docGuard](scripts/docGuard.mjs) · [repoGuard](scripts/repoGuard.mjs) · [docIndex](scripts/docIndex.mjs)
