# 打包字体：源流明體（GenRyuMin2 TW Bold）

| 项 | 值 |
|---|---|
| 字体名 | 源流明體 / GenRyuMin2（TW = 繁体中文切面） |
| 文件 | `GenRyuMinTW-B.otf`（由系统 `GenRyuMin2-B.ttc` 的第 0 个 face 抽取，再子集化） |
| 版本 | 2.100（`name` 表 nameID 5） |
| 许可 | **SIL Open Font License 1.1**（字体自带 nameID 13/14 声明；全文 <http://scripts.sil.org/OFL>） |
| 用途 | 侧边栏功能符号（書/閱/房/設）+ 书库无封面时的「文字封面」 |
| 子集 | BMP CJK（U+4E00–9FFF）+ 拉丁 + 常用标点 + 全角标点；`--no-hinting`、`--layout-features=''` |
| 体积 | 原始 face 18.8MB → 子集 **10.95MB** |

## 子集边界（已知）

- 只保留 **BMP CJK 基本区**（U+4E00–9FFF，20992 字）与拉丁/标点；**Ext-A/B 等生僻区未包含**。
- 因此极生僻字会回退到字栈里的下一个字体（`Source Han Serif SC` / `SimSun` 等），视觉上是同类明体，可接受。
- 若需覆盖全部字符，去掉子集重打包即可（代价：+8MB）。

## 复现方式

```powershell
# 1) 从系统 TTC 抽取「源流明體月 B」切面（face 0）
python -c "from fontTools.ttLib import TTCollection; TTCollection(r'C:\Users\1\AppData\Local\Microsoft\Windows\Fonts\GenRyuMin2-B.ttc')[0].save('GenRyuMinTW-B.otf')"
# 2) 子集化（保留 BMP CJK + 拉丁 + 标点，去提示指令与布局表）
pyftsubset GenRyuMinTW-B.otf `
  --unicodes=U+0020-007E,U+00A0-00FF,U+2000-206F,U+3000-303F,U+4E00-9FFF,U+FF00-FFEF `
  --no-hinting --layout-features= `
  --output-file=GenRyuMinTW-B.otf
```

> ⚠ OFL 1.1 要求随字体分发许可声明。本文件记录来源与许可；若需严格的**许可全文**随包，
> 请把 <https://openfontlicense.org/open-font-license-official-text/> 的正文存为同目录 `OFL.txt`
> （本仓库未内置该正文，避免手抄出错）。来源/子集/复现步骤以本文件为准；`借物表.md` 已退役（2026-09-11），许可义务见 `docs/STATUS.md` §3。
