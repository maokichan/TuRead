/**
 * 阅读参数面板（右侧可召唤）—— `STYLE.md` §5.8（阅读页零控件 + 贴缘召唤）/ §5.9（可调参数清单）。
 *
 * 设计口径：
 * - **不是常驻状态栏**：默认收起，只在贴右缘的窄条上点一下才出来（与左侧侧边栏召回条同款形态、镜像到右侧）。
 * - **纯文字选项**（P1：文字即界面）：无边框无底色，选中态靠 `--accent` 色温；每一行 = 小标签 + 若干文字按钮。
 * - **容器全透明**（与目录挂载线同一语言），行间用发丝分割线；底部「收起」上方也有一条引导线。
 * - 档位只是**呈现**：回调交出的是**数值**（字号 px / 行距倍数 / 段距 px / 纸宽 px / 内边距 px），
 *   缺省档 = 该参数**不注入**（尊重书自带排版）。
 * - 组件是**纯 props**（值 + 回调），状态与持久化归 ReaderFeature —— 也方便样式样张直接复用。
 */
export interface ReaderParams {
  /** 正文字号 px；null = 不改（默認） */
  fontSize: number | null
  /** 行距倍数；null = 不改（默認） */
  lineHeight: number | null
  /** 段间距 px；null = 不改（默認） */
  paragraphSpacing: number | null
  /** 纸内边距 px（宿主 token --page-pad-x） */
  pagePadX: number
  /** 纸宽 px（宿主 token --read-width） */
  readerWidth: number
}

export const DEFAULT_READER_PARAMS: ReaderParams = {
  fontSize: null,
  lineHeight: null,
  paragraphSpacing: null,
  pagePadX: 44,
  readerWidth: 760
}

interface Option<T> {
  value: T
  label: string
}

const FONT_SIZES: Option<number | null>[] = [
  { value: null, label: '默認' },
  { value: 15, label: '小' },
  { value: 17, label: '中' },
  { value: 19, label: '大' }
]

const LINE_HEIGHTS: Option<number | null>[] = [
  { value: null, label: '默認' },
  { value: 1.5, label: '緊' },
  { value: 1.75, label: '標準' },
  { value: 2, label: '寬' }
]

const PARAGRAPH_SPACING: Option<number | null>[] = [
  { value: null, label: '默認' },
  { value: 0, label: '無' },
  { value: 8, label: '標準' },
  { value: 16, label: '寬' }
]

const PAGE_PAD: Option<number>[] = [
  { value: 24, label: '窄' },
  { value: 44, label: '中' },
  { value: 72, label: '寬' }
]

const READER_WIDTHS: Option<number>[] = [
  { value: 620, label: '窄' },
  { value: 760, label: '中' },
  { value: 920, label: '寬' }
]

interface ReaderControlsProps {
  open: boolean
  params: ReaderParams
  onToggle: () => void
  onChange: (patch: Partial<ReaderParams>) => void
}

export function ReaderControls({
  open,
  params,
  onToggle,
  onChange
}: ReaderControlsProps): React.JSX.Element {
  /** 一行参数：小标签 + 文字选项（选中态 = accent 色温） */
  const Row = <T,>({
    label,
    options,
    value,
    onPick
  }: {
    label: string
    options: Option<T>[]
    value: T
    onPick: (v: T) => void
  }): React.JSX.Element => (
    <section className="reader-controls__field">
      <span className="reader-controls__label">{label}</span>
      <div className="reader-controls__options">
        {options.map((o, i) => (
          <button
            key={i}
            className={`text-action ${o.value === value ? 'text-action--primary' : ''}`}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  )

  return (
    <>
      {/* 贴右缘的召唤条：默认收起；展开时随面板移到面板左缘（与左侧召回条同一逻辑，镜像） */}
      <button
        className={`reader-controls-toggle ${open ? 'reader-controls-toggle--open' : ''}`}
        aria-label={open ? '收起閱讀參數' : '閱讀參數'}
        aria-expanded={open}
        title={open ? '收起閱讀參數' : '閱讀參數'}
        onClick={onToggle}
      />

      {open && (
        <div className="reader-controls">
          <Row
            label="字號"
            options={FONT_SIZES}
            value={params.fontSize}
            onPick={(v) => onChange({ fontSize: v })}
          />
          <Row
            label="行距"
            options={LINE_HEIGHTS}
            value={params.lineHeight}
            onPick={(v) => onChange({ lineHeight: v })}
          />
          <Row
            label="段距"
            options={PARAGRAPH_SPACING}
            value={params.paragraphSpacing}
            onPick={(v) => onChange({ paragraphSpacing: v })}
          />
          <Row
            label="紙寬"
            options={READER_WIDTHS}
            value={params.readerWidth}
            onPick={(v) => onChange({ readerWidth: v })}
          />
          <Row
            label="內邊距"
            options={PAGE_PAD}
            value={params.pagePadX}
            onPick={(v) => onChange({ pagePadX: v })}
          />
          <div className="reader-controls__fold">
            <button className="text-action" onClick={onToggle}>
              收起
            </button>
          </div>
        </div>
      )}
    </>
  )
}
