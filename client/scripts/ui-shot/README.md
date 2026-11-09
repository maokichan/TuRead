# ui-shot —— 真窗口截屏/点击探针（批1.5 起，"自己看自己"的验收工具）

> 背景：样式样张（[`scripts/style-gallery/`](../style-gallery)）只覆盖组件层，**AppShell 级的观感它照不到**。
> 批1.5 卡片化改动曾"改完不看"就交付（教训）；本工具 = 用真实 dev 实例截屏 + 模拟点击，
> 让界面改动**必须看过再交付**。全部走 PowerShell + user32，无新依赖。

## 组成

| 脚本 | 作用 |
|---|---|
| `shot.ps1 -out <png>` | 全屏截屏（DPI-aware，物理像素） |
| `printwin.ps1 -targetPid <pid> -out <png>` | **PrintWindow 直接抓窗口内容**（无视遮挡/跨屏坐标，首选） |
| `click.ps1 -x <x> -y <y> [-double 0]` | 模拟鼠标点击（物理像素坐标；默认双击） |

## 用法（典型回路）

```bash
# 1. 起一个独立 userData 的 dev 实例（⚠ 必须绝对路径，相对路径主进程会 "Path must be absolute" 拒载）
TUREAD_USER_DATA="<仓库根>/client/.probe-shot" npm run dev &

# 2. 找窗口 PID（标题 = TuRead）
powershell -c 'Get-Process electron | ? {$_.MainWindowHandle -ne 0} | % { "{0} {1}" -f $_.Id, $_.MainWindowTitle }'

# 3. 抓内容（窗口可被遮挡，无需置前）
powershell -File scripts/ui-shot/printwin.ps1 -targetPid <PID> -out shot.png

# 4. 点击走 shot.ps1 + 物理坐标（点击能把窗口抬到前台；坐标 = 窗口位置 + 逻辑坐标 × DPI 缩放）
```

## 已知坑（都踩过）

- `TUREAD_USER_DATA` **必须绝对路径**（相对 → 主进程 "Path must be absolute"，静默无窗）。
- 后台/被遮挡的窗口可能不重绘（PrintWindow 抓到旧帧 + tooltip 黏帧）：最小化再还原（`ShowWindow 6 → 9`）强制重绘，或点一下窗口。
- **中文路径经环境变量传入会被编码坑掉**（ENOENT）：`TUREAD_DEV_BOOK` 用 ASCII 文件名（`.probe-book.mobi` 之类）。
- 坐标两套空间：PrintWindow 输出 = 逻辑像素（DPI 虚拟化）；`click.ps1`/`shot.ps1` = 物理像素（已 SetProcessDPIAware）。换算 ×DPI（本机 125% = ×1.25）。
- 鼠标悬停会触发原生 tooltip 黏进截图——抓图前把光标挪开。
- dev 自检（`TUREAD_DEV_BOOK`）跑完会自退；要留在界面：不带该变量重启同一 userData。
- **PrintWindow 仍可能抓到陈旧帧**（ShowWindow 6→9 强刷都救不回，批1.22 实测）→
  **CDP compositor 截图是终审手段**：dev 加 `-- --remote-debugging-port=9223`，
  `node -e` 走 `Page.captureScreenshot`（参照 `dom.mjs` 的连接方式；DOM 真相查询同路）。
