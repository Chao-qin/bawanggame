import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreOutline } from 'antd-mobile-icons'
import { clampScale, effectiveOpacity, SCALE_RANGE } from './keypad-prefs.js'

// Asks the player to open one of its sheets ('keypad' 游戏表现, 'mapping' 按键映射); Player in App.jsx listens.
export const RUNTIME_SHEET_EVENT = 'xiaochao:runtimesheet'
const OPACITY_STEPS = [0.4, 0.6, 0.8, 1]
const DRAG_THRESHOLD = 6

function stageOf(node) {
  return node?.closest('.playerStage') || node?.parentElement || null
}

// The app's laid-out viewport (responsive.js), which stays right while orientation.js turns the page.
function viewportSize() {
  const style = getComputedStyle(document.documentElement)
  return {
    width: parseFloat(style.getPropertyValue('--viewport-width')) || window.innerWidth,
    height: parseFloat(style.getPropertyValue('--viewport-height')) || window.innerHeight,
  }
}

function KeypadMenu({ anchor, prefs, family, update, onClose }) {
  const menuRef = useRef(null)
  const [position, setPosition] = useState(null)
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!anchor || !menu) return
    const rect = anchor.getBoundingClientRect()
    const viewport = viewportSize()
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    const left = Math.min(Math.max(8, rect.right - width), viewport.width - width - 8)
    const below = rect.bottom + 6
    const top = below + height <= viewport.height - 8 ? below : Math.max(8, rect.top - height - 6)
    setPosition({ left, top })
  }, [anchor])
  useEffect(() => {
    const onDown = (event) => {
      if (menuRef.current?.contains(event.target) || anchor?.contains(event.target)) return
      onClose()
    }
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [anchor, onClose])

  const opacity = effectiveOpacity(prefs, family)
  const stepOpacity = (direction) => {
    const index = OPACITY_STEPS.findIndex((value) => value >= opacity - 0.01)
    const next = OPACITY_STEPS[Math.min(OPACITY_STEPS.length - 1, Math.max(0, (index < 0 ? OPACITY_STEPS.length - 1 : index) + direction))]
    update({ opacity: String(next) })
  }
  const openSheet = (name) => {
    onClose()
    window.dispatchEvent(new CustomEvent(RUNTIME_SHEET_EVENT, { detail: { name } }))
  }
  const container = anchor?.closest('.player')?.querySelector('.runtime-overlay-root') || document.body
  return createPortal(<div ref={menuRef} className="keypadMenu" role="menu" aria-label="键盘菜单"
    style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
    onPointerDown={(event) => event.stopPropagation()}>
    <p className="keypadMenuHint">按住右上角的菜单键可拖动键盘</p>
    <div className="keypadMenuRow">
      <span>大小</span>
      <button type="button" aria-label="缩小键盘" disabled={prefs.scale <= SCALE_RANGE.min} onClick={() => update({ scale: clampScale(prefs.scale - SCALE_RANGE.step) })}>−</button>
      <output aria-live="polite">{Math.round(prefs.scale * 100)}%</output>
      <button type="button" aria-label="放大键盘" disabled={prefs.scale >= SCALE_RANGE.max} onClick={() => update({ scale: clampScale(prefs.scale + SCALE_RANGE.step) })}>+</button>
    </div>
    <div className="keypadMenuRow">
      <span>透明度</span>
      <button type="button" aria-label="更透明" disabled={opacity <= OPACITY_STEPS[0]} onClick={() => stepOpacity(-1)}>−</button>
      <output aria-live="polite">{Math.round(opacity * 100)}%</output>
      <button type="button" aria-label="更不透明" disabled={opacity >= 1} onClick={() => stepOpacity(1)}>+</button>
    </div>
    <button type="button" role="menuitem" className="keypadMenuItem" onClick={() => update({ offsets: {}, scale: 1 })}>复位位置与大小</button>
    <button type="button" role="menuitem" className="keypadMenuItem" onClick={() => { onClose(); update({ placement: 'docked' }) }}>固定到布局中（取消浮空）</button>
    <button type="button" role="menuitem" className="keypadMenuItem" onClick={() => { onClose(); update({ visible: false }) }}>隐藏键盘</button>
    <button type="button" role="menuitem" className="keypadMenuItem" onClick={() => openSheet('keypad')}>更多键盘设置…</button>
    <button type="button" role="menuitem" className="keypadMenuItem" onClick={() => openSheet('mapping')}>按键映射…</button>
  </div>, container)
}

/**
 * One piece of an on-screen keypad (the whole keypad in portrait, one side half in landscape). Docked, it is a plain
 * box laid out by the runtime stylesheet. Floating, it can be dragged and resized: its corner menu key drags it on
 * press-and-move and opens the keypad menu on a tap. The position is kept per piece as a fraction of the stage, so it
 * survives rotation and a different screen size.
 */
export function KeypadPiece({ floating, family, piece, prefs, update, className, origin = 'center bottom', children, ...rest }) {
  const ref = useRef(null)
  const handleRef = useRef(null)
  const drag = useRef(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  const [dragOffset, setDragOffset] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    const node = stageOf(ref.current)
    if (!floating || !node) return undefined
    const sync = () => setStage({ width: node.clientWidth, height: node.clientHeight })
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => observer.disconnect()
  }, [floating])
  useEffect(() => { if (!floating) setMenuOpen(false) }, [floating])

  if (!floating) return <div ref={ref} className={className} {...rest}>{children}</div>

  const saved = prefs.offsets[piece] || [0, 0]
  const offset = dragOffset || [saved[0] * stage.width, saved[1] * stage.height]

  const onPointerDown = (event) => {
    if (drag.current) return
    event.preventDefault()
    event.stopPropagation()
    const node = ref.current
    const box = node.getBoundingClientRect()
    const area = stageOf(node).getBoundingClientRect()
    drag.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY, from: offset, moved: false,
      // How far the piece may move each way and stay on the stage.
      limits: [area.left - box.left, area.right - box.right, area.top - box.top, area.bottom - box.bottom],
    }
    try { handleRef.current.setPointerCapture(event.pointerId) } catch {}
  }
  const onPointerMove = (event) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    state.moved = true
    const [minX, maxX, minY, maxY] = state.limits
    state.last = [state.from[0] + Math.min(maxX, Math.max(minX, dx)), state.from[1] + Math.min(maxY, Math.max(minY, dy))]
    setDragOffset(state.last)
  }
  const onPointerUp = (event) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    drag.current = null
    if (!state.moved) {
      setMenuOpen((open) => !open)
      return
    }
    setMenuOpen(false)
    setDragOffset(null)
    if (state.last && stage.width && stage.height) update({ offsets: { ...prefs.offsets, [piece]: [state.last[0] / stage.width, state.last[1] / stage.height] } })
  }
  const onPointerCancel = () => {
    drag.current = null
    setDragOffset(null)
  }

  return <div ref={ref} className={`${className} keypadPieceFloating`} data-keypad-piece={piece} {...rest}
    style={{ ...rest.style, translate: `${offset[0]}px ${offset[1]}px`, scale: String(prefs.scale), transformOrigin: origin, '--keypad-piece-scale': prefs.scale }}>
    {children}
    <button ref={handleRef} type="button" className="keypadPieceHandle" aria-label="键盘菜单（按住拖动）" aria-haspopup="menu" aria-expanded={menuOpen}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setMenuOpen((open) => !open) } }}>
      <MoreOutline aria-hidden="true" />
    </button>
    {menuOpen && <KeypadMenu anchor={handleRef.current} prefs={prefs} family={family} update={update} onClose={closeMenu} />}
  </div>
}
