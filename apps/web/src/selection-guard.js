// 长按选字的 JS 兜底：部分国产浏览器（夸克/UC 系、小米浏览器）不完全遵守 user-select，
// 这里按 CSS 的意图拦截选字和长按菜单。可选区域仍以 CSS 为准：输入控件和 user-select 不为 none 的元素放行。

function elementOf(node) {
  return node?.nodeType === 1 ? node : node?.parentElement || null
}

function isEditable(element) {
  return !!element && (element.isContentEditable || element.matches('input, textarea, select'))
}

export function allowsSelection(node, view = window) {
  const element = elementOf(node)
  if (!element) return false
  if (isEditable(element)) return true
  const style = view.getComputedStyle(element)
  return (style.userSelect || style.webkitUserSelect) !== 'none'
}

export function installSelectionGuard(doc = document) {
  const view = doc.defaultView
  const blockUnlessAllowed = (event) => {
    if (!allowsSelection(event.target, view)) event.preventDefault()
  }
  const blockContextMenu = (event) => {
    // 桌面鼠标右键保留（Ruffle 等自带菜单靠它）；触屏长按和未知来源一律拦截。
    if (event.pointerType === 'mouse') return
    blockUnlessAllowed(event)
  }
  const clearStraySelection = () => {
    const selection = doc.getSelection()
    if (!selection || selection.isCollapsed || isEditable(doc.activeElement)) return
    if (!allowsSelection(selection.anchorNode, view)) selection.removeAllRanges()
  }

  doc.addEventListener('selectstart', blockUnlessAllowed, true)
  doc.addEventListener('contextmenu', blockContextMenu, true)
  doc.addEventListener('selectionchange', clearStraySelection)

  // UC 系内核（夸克）的私有接口：关闭浏览器自带的长按菜单。其他浏览器没有这个对象。
  try { view.navigator.control?.longpressMenu?.(false) } catch {}
}
