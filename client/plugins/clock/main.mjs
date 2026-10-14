// 時鐘 —— 插件系统的第一个验证插件（契约 = client/docs/CONTRACTS.md §9，功能 = FEATURES §13）。
// 验收链 = 发现 → manifest 校验 → 激活 → 注册右段格 → 挂载 → 启停（用户定的最小验证件）。
// 形态 = 用户定：纯文字走时；**零自创视觉语汇**——颜色与字号都走宿主样式层的 `.plugin-clock`
// （styles.css），插件代码里不写任何样式。宿主保证：收起/卸载/禁用时清理函数会被调用。
export function activate(api) {
  api.registerPanel({
    id: 'clock',
    label: '時鐘',
    title: '時鐘',
    mount(el) {
      el.className = 'plugin-clock'
      const render = () => {
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')
        el.textContent = `${hh}:${mm}`
      }
      render()
      const timer = window.setInterval(render, 1000)
      return () => window.clearInterval(timer)
    }
  })
  api.log('插件「時鐘」已啟用')
}
