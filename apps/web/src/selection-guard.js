// 长按选字的 JS 兜底：部分国产浏览器（夸克/UC 系、小米浏览器）不完全遵守 user-select，
// 这里按 CSS 的意图拦截选字和长按菜单。可选区域仍以 CSS 为准：输入控件和 user-select 不为 none 的元素放行。

function elementOf(node) {
  return node?.nodeType === 1 ? node : node?.parentElement || null
}

function isEditable(element) {
  return !!element && (element.isContentEditable || element.matches('input, textarea, select'))
}

export function allowsSelection(node, view = window) {
  let element = elementOf(node)
  if (!element) return false
  if (isEditable(element)) return true
  // 规范里 user-select 不继承，auto 取决于祖先：Chromium 直接算成 none，其他内核可能报 auto，所以向上找。
  for (; element; element = element.parentElement) {
    const style = view.getComputedStyle(element)
    const value = style.userSelect || style.webkitUserSelect
    if (value !== 'auto') return value !== 'none'
  }
  return true
}

export function installSelectionGuard(doc = document) {
  const view = doc.defaultView
  const blockUnlessAllowed = (event) => {
    if (!allowsSelection(event.target, view)) event.preventDefault()
  }
  // 只拦触屏长按，桌面右键和键盘菜单键保留（Ruffle 等自带菜单靠它）。部分内核（Safari、UC 系）
  // 派发的 contextmenu 不带 pointerType，这时看最近一次按下的指针类型。
  let lastPointerType = ''
  const rememberPointer = (event) => { lastPointerType = event.pointerType || 'touch' }
  const blockContextMenu = (event) => {
    if ((event.pointerType || lastPointerType) === 'touch') blockUnlessAllowed(event)
  }
  const clearStraySelection = () => {
    const selection = doc.getSelection()
    if (!selection || selection.isCollapsed || isEditable(doc.activeElement)) return
    if (!allowsSelection(selection.anchorNode, view)) selection.removeAllRanges()
  }

  doc.addEventListener('pointerdown', rememberPointer, true)
  doc.addEventListener('touchstart', rememberPointer, { capture: true, passive: true })
  doc.addEventListener('selectstart', blockUnlessAllowed, true)
  doc.addEventListener('contextmenu', blockContextMenu, true)
  doc.addEventListener('selectionchange', clearStraySelection)

  // UC 系内核（夸克）的私有接口：关闭浏览器自带的长按菜单。其他浏览器没有这个对象。
  try { view.navigator.control?.longpressMenu?.(false) } catch {}
}
