import * as THREE from 'three'

/**
 * 聚焦舞台引擎（框架无关，three.js 场景；React 侧壳 = `FocusStage.tsx`）。
 *
 * 来源：`docs/prototypes/detail-orbit.html` 交互原型（形态与参数由原型定妆）。
 * 编排：单击书卡 → 卡片作为共享元素携旋转飞向视口中央（尺寸不变）→ 页面其余景深失焦
 * （blur 幕由 React 侧渲染，本引擎只管 WebGL 层）→ 三维平绶带渐显绕卡、文字贴独立承载层
 * 流转、卡后被深度缓冲遮挡 → 收场原路反向（任何时刻可打断，从现场状态平滑收场）。
 *
 * 不变量（违反即出真实故障）：
 * ① **渲染器全局持久**（一次创建反复复用、闲时隐藏）——每次开合新建/销毁 WebGL 上下文
 *   会被浏览器回收，丢上下文 = 冻结；② **补间进度走墙钟**（tms - t0，非逐帧 dt 累加）——
 *   rAF 节流/冻结时 dt=0 会把收场永久卡死，墙钟进度在恢复后一次补完；另加 3s 收场看门狗；
 * ③ 绶带**不扭转**（带宽方向全程 = 轨道面法向——扭转伤可读性）；④ **文字与带分离**
 *   （带 = 纯形状；文字住贴面 2px 的独立承载层 → 字重/字号/颜色直接控制）；⑤ 文字映射
 *   旋转 180°（v/u 同翻）保证近弧正立可读。
 *
 * 颜色纪律：本文件只经 `cssVar()` 读 styles.css 的语义 token（颜色唯一来源），
 * 唯一例外是卡影的黑色径向渐变（canvas 绘制，无主题语义；随深色专项如需 token 化另立）。
 */

/* ======== 绶带定妆配置（px 世界单位；卡片 ≈ 174×261） ======== */
export interface BandConfig {
  rx: number
  ry: number
  tiltX: number
  tiltZ: number
  /** 环绕高度（正 = 下移） */
  offY: number
  /** 轨道中心前后平移（正 = 靠近镜头） */
  zOff: number
  /** 带宽 */
  w: number
  /** 文字流转一圈秒数 */
  dur: number
  /** 文字世界字高 */
  textPx: number
}
export const DEFAULT_BANDS: BandConfig[] = [
  { rx: 120, ry: 60, tiltX: 78, tiltZ: -3, offY: -195, zOff: 0, w: 24, dur: 26, textPx: 15 },
  { rx: 214, ry: 112, tiltX: 63, tiltZ: 12, offY: -70, zOff: 0, w: 45, dur: 22, textPx: 15 },
  { rx: 408, ry: 144, tiltX: 62, tiltZ: 19, offY: 28, zOff: 0, w: 36, dur: 8, textPx: 15 },
  { rx: 246, ry: 102, tiltX: 61, tiltZ: -20, offY: 122, zOff: 0, w: 40, dur: 26, textPx: 15 },
  { rx: 120, ry: 174, tiltX: 85, tiltZ: -1, offY: 260, zOff: 16, w: 30, dur: 12, textPx: 15 }
]

const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
/* 字体栈**画时现读**，不在模块加载时缓存——dev 模式 styles.css 经 JS 注入，
   模块求值早于样式注入时缓存会得到空串，canvas 判字体串非法后退回 10px 默认字号，
   绶带文字缩成点阵（真机踩过；原型无此坑是它的样式内联在 head 里） */
const fontStack = (): string => cssVar('--font-ui')
const TEXT_WEIGHT = 700
const TEXT_GAP = '　　'
const FOCV = 40

/* ======== 能力探测（缓存；降级路径 = 回落旧详情抽屉） ======== */
let supportCache: boolean | null = null
export function stageSupported(): boolean {
  if (supportCache !== null) return supportCache
  try {
    const c = document.createElement('canvas')
    supportCache = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    supportCache = false
  }
  /* 探测结果落日志：回落旧抽屉必须可归因（真机首跑 WebGL 探测在沙箱化启动下失败过） */
  console.warn('[focusStage] WebGL 探测 =', supportCache)
  return supportCache
}

/* ======== token 曲线进 JS（与 styles.css 同源） ======== */
function bezier(p1x: number, p1y: number, p2x: number, p2y: number): (u: number) => number {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by
  const fx = (t: number): number => ((ax * t + bx) * t + cx) * t
  const dfx = (t: number): number => (3 * ax * t + 2 * bx) * t + cx
  return (u) => {
    if (u <= 0) return 0
    if (u >= 1) return 1
    let t = u
    for (let i = 0; i < 6; i++) {
      const e = fx(t) - u
      if (Math.abs(e) < 1e-5) break
      t -= e / dfx(t)
    }
    return ((ay * t + by) * t + cy) * t
  }
}
const easeOutT = bezier(0.23, 1, 0.32, 1)
const easeInOutT = bezier(0.77, 0, 0.175, 1)

/* ======== 封面纹理：真实封面字节（cover-fit）或文字封面（拟合标题） ======== */
const fitSize = (t: string): number => (t.length <= 4 ? 26 : t.length <= 8 ? 20 : t.length <= 12 ? 16 : 13.5)

function drawCoverTexture(cover: HTMLImageElement | null, w: number, h: number, title: string): THREE.CanvasTexture {
  const s = 2
  const cv = document.createElement('canvas')
  cv.width = w * s
  cv.height = h * s
  const ctx = cv.getContext('2d')!
  const radius = (parseFloat(cssVar('--radius-item')) || 8) * s
  /* 圆角裁剪（与网格封面同语汇：--radius-item + 1px 边）；角落透明 + 材质 alphaTest
     保证圆角外不写深度，不遮挡身后的绶带 */
  ctx.beginPath()
  ctx.roundRect(0, 0, cv.width, cv.height, radius)
  ctx.clip()
  ctx.fillStyle = cssVar('--panel-2')
  ctx.fillRect(0, 0, cv.width, cv.height)
  if (cover && cover.width > 0) {
    const k = Math.max(cv.width / cover.width, cv.height / cover.height)
    const dw = cover.width * k, dh = cover.height * k
    ctx.drawImage(cover, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh)
  } else {
    let size = fitSize(title) * s
    let lines: string[] = []
    for (; size >= 18; size -= 2 * s) {
      ctx.font = `700 ${size}px ${fontStack()}`
      lines = []
      let line = ''
      for (const ch of title) {
        if (ctx.measureText(line + ch).width > cv.width - 20 * s && line) {
          lines.push(line)
          line = ch
        } else line += ch
      }
      if (line) lines.push(line)
      if (lines.length <= 4) break
    }
    ctx.fillStyle = cssVar('--text')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lh = size * 1.35
    const y0 = cv.height / 2 - (lines.length - 1) * lh / 2
    lines.forEach((ln, i) => ctx.fillText(ln, cv.width / 2, y0 + i * lh))
  }
  ctx.strokeStyle = cssVar('--border')
  ctx.lineWidth = s
  ctx.strokeRect(s / 2, s / 2, cv.width - s, cv.height - s)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/* ======== 文字层纹理（内容承载层）：透明底 + 一段墨字（整周期画布 → Repeat 无缝） ======== */
function drawBandTextTexture(text: string, worldW: number, circumference: number, textPx: number): THREE.CanvasTexture {
  const CH = 256
  const fontPx = Math.max(12, (textPx / worldW) * CH)
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = `${TEXT_WEIGHT} ${fontPx}px ${fontStack()}`
  try { probe.letterSpacing = '1px' } catch { /* 旧内核无此 API */ }
  const periodCanvas = Math.max(64, probe.measureText(text + TEXT_GAP).width)
  const cv = document.createElement('canvas')
  cv.width = Math.round(periodCanvas)
  cv.height = CH
  const ctx = cv.getContext('2d')!
  ctx.font = `${TEXT_WEIGHT} ${fontPx}px ${fontStack()}`
  try { ctx.letterSpacing = '1px' } catch { /* 同上 */ }
  ctx.fillStyle = cssVar('--text')
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text + TEXT_GAP, 0, CH / 2 + 2)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.anisotropy = 8
  const periodWorld = (periodCanvas / CH) * worldW
  const n = Math.max(1, Math.round(circumference / periodWorld))
  tex.repeat.set(n, 1)
  return tex
}

/* 椭圆周长（Ramanujan 近似）—— 文字平铺周期数的换算依据 */
function ellipseCircumference(rx: number, ry: number): number {
  const h = ((rx - ry) * (rx - ry)) / ((rx + ry) * (rx + ry))
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
}

/* ======== 绶带几何：倾斜椭圆轨道上扫出的平带（带宽方向全程 = 轨道面法向） ========
   faceOffset = 沿面法向的外移量（文字层 = 2，浮在带面之上避免 z-fighting） */
function buildBandGeometry(cfg: BandConfig, faceOffset = 0): THREE.BufferGeometry {
  const SEG = 220
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], norm: number[] = []
  const euler = new THREE.Euler(THREE.MathUtils.degToRad(cfg.tiltX), 0, THREE.MathUtils.degToRad(cfg.tiltZ), 'XYZ')
  const q = new THREE.Quaternion().setFromEuler(euler)
  const p = new THREE.Vector3(), t = new THREE.Vector3()
  const w = new THREE.Vector3(), nrm = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3()
  const offY = -cfg.offY
  for (let i = 0; i <= SEG; i++) {
    const th = (i / SEG) * Math.PI * 2
    p.set(cfg.rx * Math.cos(th), cfg.ry * Math.sin(th), 0).applyQuaternion(q)
    if (cfg.zOff) p.z += cfg.zOff
    t.set(-cfg.rx * Math.sin(th), cfg.ry * Math.cos(th), 0).normalize().applyQuaternion(q)
    w.set(0, 0, 1).applyQuaternion(q)
    nrm.copy(t).cross(w).normalize()
    if (faceOffset) p.addScaledVector(nrm, faceOffset)
    a.copy(p).addScaledVector(w, -cfg.w / 2)
    a.y += offY
    b.copy(p).addScaledVector(w, cfg.w / 2)
    b.y += offY
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
    norm.push(nrm.x, nrm.y, nrm.z, nrm.x, nrm.y, nrm.z)
    /* 文字正立：v 翻转 = 近弧字面向上；u 翻转 = 近弧阅读自左向右（净效果 = 映射旋转 180°）。
       接缝处 u=1 与 u=0 经 RepeatWrapping 相接，闭环无缝 */
    uv.push(1 - i / SEG, 1, 1 - i / SEG, 0)
  }
  for (let i = 0; i < SEG; i++) {
    const k = i * 2
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/* ======== 持久 GL（渲染器一次创建反复复用；上下文反复创建会被浏览器回收） ======== */
interface PersistentGL {
  canvas: HTMLCanvasElement
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
}
let GL: PersistentGL | null = null
function ensureGL(host: HTMLElement): PersistentGL {
  if (GL) {
    /* 二次聚焦：旧 host 随组件卸载，画布成了孤儿——必须跟新 host 走，
       否则渲染照跑、画布不在文档里 = 第二次聚焦永远看不见（真机踩过） */
    if (GL.canvas.parentElement !== host) host.appendChild(GL.canvas)
    return GL
  }
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;width:100%;height:100%'
  host.appendChild(canvas)
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  const camera = new THREE.PerspectiveCamera(FOCV, 1, 10, 8000)
  GL = { canvas, renderer, camera }
  return GL
}
const camDistFor = (vh: number): number => vh / 2 / Math.tan(THREE.MathUtils.degToRad(FOCV / 2))
function sizeGL(gl: PersistentGL, vw: number, vh: number): void {
  gl.renderer.setSize(vw, vh)
  gl.camera.aspect = vw / vh
  gl.camera.updateProjectionMatrix()
}

/* ======== 会话内对象 ======== */
interface BandObjects {
  cfg: BandConfig
  bandMesh: THREE.Mesh
  bandMat: THREE.MeshLambertMaterial
  textMesh: THREE.Mesh
  textMat: THREE.MeshBasicMaterial
  tex: THREE.CanvasTexture
}
interface SceneContent {
  scene: THREE.Scene
  card: THREE.Mesh
  cardMat: THREE.MeshBasicMaterial
  shadow: THREE.Mesh
  bands: BandObjects[]
}
interface Tween {
  p: number
  dur: number
  ease?: (u: number) => number
  fn: (t: number) => void
  t0: number
  k0: number
}

let state: 'idle' | 'opening' | 'focused' | 'closing' = 'idle'
let session: {
  gl: PersistentGL
  content: SceneContent
  book: { title: string; cover: HTMLImageElement | null }
  coverUrl: string | null
  texts: string[]
  bands: BandConfig[]
  tweens: Tween[]
  timers: number[]
  raf: number
  closeT0: number
  originSelector: string
  originRect: { left: number; top: number; width: number; height: number }
  host: HTMLElement
  reduceMotion: boolean
  onExited: () => void
  onSettled?: () => void
  coverVersion: number
} | null = null

function makeBandObjects(cfg: BandConfig, text: string): BandObjects {
  const bandMat = new THREE.MeshLambertMaterial({
    color: cssVar('--panel'), side: THREE.DoubleSide, transparent: true, opacity: 0
  })
  const bandMesh = new THREE.Mesh(buildBandGeometry(cfg), bandMat)
  const C = ellipseCircumference(cfg.rx, cfg.ry)
  const tex = drawBandTextTexture(text, cfg.w, C, cfg.textPx)
  const textMat = new THREE.MeshBasicMaterial({
    map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false
  })
  const textMesh = new THREE.Mesh(buildBandGeometry(cfg, 2), textMat)
  return { cfg, bandMesh, bandMat, textMesh, textMat, tex }
}

function buildScene(
  title: string, cover: HTMLImageElement | null, rect: { width: number; height: number },
  texts: string[], bands: BandConfig[], hostRect: DOMRect, originCenter: { x: number; y: number }
): SceneContent {
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 2.3))
  const dir = new THREE.DirectionalLight(0xffffff, 0.55)
  dir.position.set(0, 300, 800)
  scene.add(dir)

  /* 卡片（共享元素；尺寸全程不变；世界原点 = 舞台容器中心） */
  const vw = hostRect.width, vh = hostRect.height
  const cardMat = new THREE.MeshBasicMaterial({ map: drawCoverTexture(cover, rect.width, rect.height, title), transparent: true, alphaTest: 0.5 })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(rect.width, rect.height), cardMat)
  card.position.set(originCenter.x - vw / 2, vh / 2 - originCenter.y, 0)
  scene.add(card)

  /* 卡影：卡片背后的软暗晕（把卡从远侧绶带里剥出来；跟随卡片补间移动）。
     黑色径向渐变无主题语义（唯一颜色字面例外，见文件头纪律） */
  const shadowCv = document.createElement('canvas')
  shadowCv.width = 256
  shadowCv.height = 256
  const sctx = shadowCv.getContext('2d')!
  const grad = sctx.createRadialGradient(128, 128, 20, 128, 128, 126)
  grad.addColorStop(0, 'rgba(0,0,0,0.6)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.3)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  sctx.fillStyle = grad
  sctx.fillRect(0, 0, 256, 256)
  const shadowTex = new THREE.CanvasTexture(shadowCv)
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(rect.width * 1.75, rect.height * 1.55),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  )
  shadow.position.set(card.position.x, card.position.y, -40)
  scene.add(shadow)

  const bandObjects = bands.map((cfg, i) => makeBandObjects(cfg, texts[i % texts.length]))
  bandObjects.forEach((b) => {
    scene.add(b.bandMesh)
    scene.add(b.textMesh)
  })

  return { scene, card, cardMat, shadow, bands: bandObjects }
}

function disposeContent(content: SceneContent): void {
  content.scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const raw = mesh.material as unknown as { map?: { dispose(): void }; dispose(): void } | Array<{ map?: { dispose(): void }; dispose(): void }> | undefined
    const ms = Array.isArray(raw) ? raw : raw ? [raw] : []
    ms.forEach((m) => {
      m.map?.dispose()
      m.dispose()
    })
  })
}

function addTween(s: NonNullable<typeof session>, tw: Omit<Tween, 'p' | 't0' | 'k0'>): void {
  s.tweens.push({ ...tw, p: 0, t0: 0, k0: 1 })
}

/* ======== 主循环（唯一 rAF：墙钟补间 + 文字流转 + 渲染） ======== */
function startLoop(s: NonNullable<typeof session>): void {
  let last = performance.now()
  const step = (tms: number): void => {
    if (session !== s) return
    try {
      const dt = Math.min(64, tms - last)
      last = tms
      /* 进度走墙钟（rAF 冻结时 dt=0 会卡死补间——原型实机教训），恢复后一次补完 */
      s.tweens = s.tweens.filter((tw) => {
        if (tw.p >= 1) return false
        if (!tw.t0) tw.t0 = tms
        tw.p = Math.min(1, (tms - tw.t0) / tw.dur)
        tw.fn((tw.ease ?? ((x: number) => x))(tw.p))
        return tw.p < 1
      })
      s.content.bands.forEach((b) => {
        b.tex.offset.x = (b.tex.offset.x + dt / 1000 / b.cfg.dur) % 1
      })
      s.gl.renderer.render(s.content.scene, s.gl.camera)
      if (state === 'closing') {
        if (!s.closeT0) s.closeT0 = tms
        /* 看门狗：收场 3s 内必须归位（墙钟补间已保证；兜底未知环境因素） */
        if (s.tweens.length === 0 || tms - s.closeT0 > 3000) {
          finishClose(s)
          return
        }
      } else {
        s.closeT0 = 0
      }
    } catch (err) {
      console.warn('[focusStage] loop error, force teardown', err)
      forceTeardown(s, true)
      return
    }
    s.raf = requestAnimationFrame(step)
  }
  s.raf = requestAnimationFrame(step)
}

/* ======== 拆装 ========
   ⚠ 通知边界（真机踩坑）：`onExited` = "用户主动收场已落定"，**只有 finishClose 发**。
   dispose（React 卸载清理）绝不通知——StrictMode 的模拟卸载会跑一遍清理，
   若它也通知，父级会把 detailId 置空，第二次挂载直接被拆（舞台"弹不出来"）。 */
function finishClose(s: NonNullable<typeof session>): void {
  s.timers.forEach(clearTimeout)
  disposeContent(s.content)
  session = null
  state = 'idle'
  s.onExited()
}
function forceTeardown(s: NonNullable<typeof session>, notify = false): void {
  /* notify = true 仅限"运行时故障需父级复位"（循环崩溃）；卸载清理必须静默（见上） */
  try {
    s.timers.forEach(clearTimeout)
    disposeContent(s.content)
  } catch { /* 拆台失败不再抛 */ }
  session = null
  state = 'idle'
  if (notify) s.onExited()
}

function refreshTextures(s: NonNullable<typeof session>): void {
  s.content.cardMat.map?.dispose()
  s.content.cardMat.map = drawCoverTexture(s.book.cover, s.originRect.width, s.originRect.height, s.book.title)
  s.content.cardMat.needsUpdate = true
  s.content.bands.forEach((b) => {
    b.bandMat.color.set(cssVar('--panel'))
    b.tex.dispose()
    const C = ellipseCircumference(b.cfg.rx, b.cfg.ry)
    const i = s.bands.indexOf(b.cfg)
    b.tex = drawBandTextTexture(s.texts[i % s.texts.length], b.cfg.w, C, b.cfg.textPx)
    b.textMat.map = b.tex
    b.textMat.needsUpdate = true
  })
}

/* 复查诊断钩子（原型 __protoState 同款；CDP 真机调试用，生产无害） */
;(window as unknown as { __focusStageDebug?: () => unknown }).__focusStageDebug = () => ({
  state,
  hasSession: !!session,
  sessionKeys: session ? Object.keys(session) : [],
  canvases: [...document.querySelectorAll('canvas')].map((c) => ({
    w: c.clientWidth, h: c.clientHeight, bufW: c.width, bufH: c.height, connected: c.isConnected
  }))
})

/* ======== 对外 API ======== */
export interface FocusStageOptions {
  /** canvas 挂载点（fixed 定位容器；引擎只往里放 canvas） */
  host: HTMLElement
  /** 原格封面矩形（viewport 坐标；飞行起点） */
  originRect: { left: number; top: number; width: number; height: number }
  /** 原格封面元素选择器（收场回飞落点的现场重测；可见性归 React 的"空缺提示槽"） */
  originSelector: string
  title: string
  coverUrl: string | null
  /** 五条带的流转文案（不足循环取用） */
  texts: string[]
  bands?: BandConfig[]
  reduceMotion: boolean
  /** 收场补间落定（或异常拆台）后回调；React 据此卸载组件 */
  onExited: () => void
  /** 开场编排落定（state → focused）时回调；RM 路径即时 */
  onSettled?: () => void
}
export interface FocusStageSession {
  /** 封面异步就位/变化后补画 */
  setCover(url: string | null): void
  /** 收场（幂等；落定后回调 onExited） */
  close(): void
  /** 主题切换后重建纹理（颜色唯一来源 = styles.css） */
  refreshTheme(): void
  /** 跳过补间直接拆（组件卸载兜底；幂等） */
  dispose(): void
}

export function openFocusStage(opts: FocusStageOptions): FocusStageSession {
  if (state !== 'idle') throw new Error('[focusStage] 已有会话在场（单例）')
  state = 'opening'

  const gl = ensureGL(opts.host)
  const hostRect = opts.host.getBoundingClientRect()
  sizeGL(gl, hostRect.width, hostRect.height)
  gl.camera.position.set(0, 0, camDistFor(hostRect.height))

  /* 原格的可见性归 React（空缺提示槽），引擎不再直改 style */
  const cover = opts.coverUrl ? new Image() : null
  const s: NonNullable<typeof session> = {
    gl,
    content: null as unknown as SceneContent,
    book: { title: opts.title, cover: null },
    coverUrl: opts.coverUrl,
    texts: opts.texts,
    bands: opts.bands ?? DEFAULT_BANDS,
    tweens: [],
    timers: [],
    raf: 0,
    closeT0: 0,
    originSelector: opts.originSelector,
    originRect: opts.originRect,
    host: opts.host,
    reduceMotion: opts.reduceMotion,
    onExited: opts.onExited,
    onSettled: opts.onSettled,
    coverVersion: 0
  }
  const originCenter = {
    x: opts.originRect.left + opts.originRect.width / 2 - hostRect.left,
    y: opts.originRect.top + opts.originRect.height / 2 - hostRect.top
  }
  s.content = buildScene(opts.title, null, opts.originRect, opts.texts, s.bands, hostRect, originCenter)
  session = s

  if (cover) {
    const version = ++s.coverVersion
    cover.onload = () => {
      if (session !== s || version !== s.coverVersion) return
      s.book.cover = cover
      refreshTextures(s)
      if (s.reduceMotion) s.gl.renderer.render(s.content.scene, s.gl.camera)
    }
    cover.src = opts.coverUrl!
  }

  if (s.reduceMotion) {
    /* 弱化：不飞不转不流转，静态一帧焦点态；close = 直接复位 */
    s.content.card.position.set(0, 0, 0)
    s.content.shadow.position.set(0, 0, -40)
    s.content.bands.forEach((b) => {
      b.bandMat.opacity = 1
      b.textMat.opacity = 1
    })
    gl.renderer.render(s.content.scene, gl.camera)
    state = 'focused'
    s.onSettled?.()
  } else {
    /* ① 飞行：从当前位置（buildScene 已摆到原格的世界坐标）插值到中央，落点即焦点。
       起点必须捕获现场位置——不能拿 host-local 的 originCenter 直接当世界坐标
       （world y-up、host-local y-down，直接用会从镜像位置起飞；下半屏的书起点会被镜到
       屏幕外上方，叠加 ease-out 可见运动段在起点附近 → 整段飞行几乎全在画外，
       观感 = "动画弹不出来"，真机首跑踩过） */
    const px = s.content.card.position.x, py = s.content.card.position.y
    addTween(s, {
      dur: 460,
      ease: easeOutT,
      fn: (t) => {
        s.content.card.position.set(px * (1 - t), py * (1 - t), 0)
        s.content.shadow.position.set(s.content.card.position.x, s.content.card.position.y, -40)
      }
    })
    addTween(s, { dur: 460, ease: easeInOutT, fn: (t) => { s.content.card.rotation.y = t * Math.PI * 2 } })
    /* ② 绶带渐显（错峰 120ms），文字层稍后显影 */
    s.content.bands.forEach((b, i) => {
      s.timers.push(window.setTimeout(() => {
        if (session !== s || state === 'closing' || state === 'idle') return
        addTween(s, { dur: 450, ease: easeOutT, fn: (t) => { b.bandMat.opacity = t } })
      }, 240 + i * 120))
      s.timers.push(window.setTimeout(() => {
        if (session !== s || state === 'closing' || state === 'idle') return
        addTween(s, { dur: 350, ease: easeOutT, fn: (t) => { b.textMat.opacity = t } })
      }, 400 + i * 120))
    })
    s.timers.push(window.setTimeout(() => {
      if (state === 'opening') {
        state = 'focused'
        s.onSettled?.()
      }
    }, 480))
    startLoop(s)
  }

  const onResize = (): void => {
    const r = s.host.getBoundingClientRect()
    sizeGL(gl, r.width, r.height)
    gl.camera.position.z = camDistFor(r.height)
    if (s.reduceMotion && session === s) gl.renderer.render(s.content.scene, gl.camera)
  }
  addEventListener('resize', onResize)

  return {
    setCover(url: string | null): void {
      if (session !== s) return
      s.coverUrl = url
      const version = ++s.coverVersion
      if (!url) {
        s.book.cover = null
        refreshTextures(s)
        return
      }
      const img = new Image()
      img.onload = () => {
        if (session !== s || version !== s.coverVersion) return
        s.book.cover = img
        refreshTextures(s)
      }
      img.src = url
    },
    close(): void {
      if (session !== s || (state !== 'focused' && state !== 'opening')) return
      state = 'closing'
      s.timers.forEach(clearTimeout)
      s.timers = []
      if (s.reduceMotion) {
        forceTeardown(s)
        return
      }
      /* 回原格：现场重测空缺槽位（窗口可能变过尺寸）；从当前状态平滑收场（可打断） */
      const el = document.querySelector(s.originSelector)
      const r0 = el instanceof HTMLElement ? el.getBoundingClientRect() : s.originRect
      const hr = s.host.getBoundingClientRect()
      const sx = r0.left + r0.width / 2 - (hr.left + hr.width / 2)
      const sy = hr.top + hr.height / 2 - (r0.top + r0.height / 2)
      s.tweens = []
      const px = s.content.card.position.x, py = s.content.card.position.y, rz = s.content.card.rotation.y
      addTween(s, {
        dur: 300,
        ease: easeOutT,
        fn: (t) => {
          s.content.card.position.set(px + (sx - px) * t, py + (sy - py) * t, 0)
          s.content.shadow.position.set(s.content.card.position.x, s.content.card.position.y, -40)
        }
      })
      addTween(s, { dur: 300, ease: easeInOutT, fn: (t) => { s.content.card.rotation.y = rz * (1 - t) } })
      s.content.bands.forEach((b) => {
        ;[b.bandMat, b.textMat].forEach((m) => {
          const op0 = m.opacity
          if (op0 <= 0) {
            m.opacity = 0
            return
          }
          addTween(s, { dur: 180, ease: easeOutT, fn: (t) => { m.opacity = op0 * (1 - t) } })
        })
      })
    },
    refreshTheme(): void {
      if (session !== s) return
      refreshTextures(s)
      if (s.reduceMotion) gl.renderer.render(s.content.scene, gl.camera)
    },
    dispose(): void {
      removeEventListener('resize', onResize)
      if (session !== s) return
      if (state === 'closing') {
        /* 收场中卸载：等价于看门狗直拆 */
        forceTeardown(s)
        return
      }
      forceTeardown(s)
    }
  }
}
