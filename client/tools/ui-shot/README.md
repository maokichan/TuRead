# ui-shot —— 真窗口截屏/点击探针（批1.5 起，"自己看自己"的验收工具）

> 背景：样式样张（`tools/style-gallery/`）只覆盖组件层，**AppShell 级的观感它照不到**。
> 批1.5 卡片化改动曾"改完不看"就交付（教训）；本工具 = 用真实 dev 实例截屏 + 模拟点击，
> 让界面改动**必须看过再交付**。全部走 PowerShell + user32 + CDP，无新依赖。

## 组成

| 脚本 | 作用 |
|---|---|
| **`cdp-shot.mjs <port> <out.png> [预执行js]`** | **首选**：CDP `Page.captureScreenshot` 直接抓渲染层 —— 像素级真相，无视遮挡/最小化/多屏坐标 |
| **`dom.mjs <port> '<js 表达式>'`** | CDP `Runtime.evaluate` —— DOM 真相（元素存在性/几何/状态），截图存疑时的仲裁 |
| `shot.ps1 -out <png>` | 全屏截屏（DPI-aware，物理像素）—— 需要窗口在屏且前台 |
| `click.ps1 -x <x> -y <y> [-double 0]` | 模拟鼠标点击（物理像素坐标；默认双击）—— 依赖屏幕几何，易被多屏/DPI 坑 |
| `printwin.ps1 -targetPid <pid> -out <png>` | PrintWindow 抓窗口 —— ⚠ 对后台节流窗口会给出**陈旧/空洞帧**（半张旧半张新），只当兜底 |

## 用法（典型回路）

```bash
# 1. 带 CDP 端口起 dev（⚠ TUREAD_USER_DATA 必须绝对路径）
TUREAD_USER_DATA="D:\\PROJECT\\TuRead\\client\\.probe-shot" TUREAD_DEV_CDP=9223 npm run dev &

# 2. 截图 / 查 DOM（例如派发 dblclick 开书后再截）
node tools/ui-shot/cdp-shot.mjs 9223 shot.png "document.querySelector('[data-book-id]')?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))"
node tools/ui-shot/dom.mjs 9223 "JSON.stringify({iframe: !!document.querySelector('#page-area iframe')})"
```

## 已知坑（都踩过）

- **PrintWindow 陈旧帧**：后台/被遮挡的 Electron 窗口合成器可能不重绘，PrintWindow 抓到半新半旧的帧
  （批1.6 实测：新布局在、窗控/設不在，DOM 查询证明都在）→ **以 CDP 截图为准**；
  强制重绘手段（最小化-还原 / MoveWindow resize）不可靠，且反复折腾可能把节流窗口的渲染面搞挂
  （整窗透明透出壁纸）。**真窗口物理截图**（shot.ps1）只在需要看"真实屏幕上的观感"时用，
  且先用 CDP 确认 DOM 就绪。
- `TUREAD_USER_DATA` **必须绝对路径**（相对 → 主进程 "Path must be absolute"，静默无窗）。
- **中文路径经环境变量传入会被编码坑掉**（ENOENT）：`TUREAD_DEV_BOOK` 用 ASCII 文件名（`.probe-book.mobi` 之类）。
- 坐标两套空间：Chromium 的 `window.screenX/screenY` = DIP；`click.ps1`/`shot.ps1` = 物理像素。
  多屏 + 125% 缩放下人肉换算极易错 → **交互一律走 CDP 的 `Input.dispatchMouseEvent`/事件派发**，
  物理点击只在"验证拖拽区/系统级行为"时用。
- 鼠标悬停会触发原生 tooltip 黏进截图——抓图前把光标挪开。
- dev 自检（`TUREAD_DEV_BOOK`）跑完会自退；要留在界面：不带该变量重启同一 userData。

