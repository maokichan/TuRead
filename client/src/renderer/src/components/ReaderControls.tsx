/**
 * 阅读参数面板内容（挂载线实体的底部挂件，线本体与开合把手在 `ReaderRail`）——
 * `STYLE.md` §5.8 / §5.9。2026-09-12 用户定：右侧独立召唤条与面板内「收起」按钮废除，
 * 参数与目录同处一条挂载线，**把手开合、面板向上展开**。
 *
 * 设计口径：
 * - **纯文字选项**（P1：文字即界面）：无边框无底色，选中态靠 `--accent` 色温；每一行 = 小标签 + 若干文字按钮。
 * - **内容统一中间对齐**（用户 2026-09-12 定）：标签与选项都居中。
 * - **容器全透明**（与目录同一语言），行间用发丝分割线；底部「折疊」按钮**与目录同款**
 *   （居中 + 引导分割线，2026-09-12 用户定）；开合也可点挂载线右段 / `p`。
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
  params: ReaderParams
  onChange: (patch: Partial<ReaderParams>) => void
  /** 折叠面板（底部「折疊」按钮；挂载线右段 / `p` 亦可） */
  onToggle: () => void
}

export function ReaderControls({ params, onChange, onToggle }: ReaderControlsProps): React.JSX.Element {
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
      {/* 底部「折疊」：与目录列表的折疊同款（居中 + 引导分割线，样式类见 styles.css） */}
      <div className="reader-controls__fold">
        <button className="text-action" onClick={onToggle}>
          折疊
        </button>
      </div>
    </div>
  )
}
