import { useEffect, useRef } from 'react'
import { CheckOutline, DownOutline, LeftOutline, RightOutline, UpOutline } from 'antd-mobile-icons'

const DIRECTIONS = [
  { id: 'up', key: 'ArrowUp', label: '上', Icon: UpOutline },
  { id: 'left', key: 'ArrowLeft', label: '左', Icon: LeftOutline },
  { id: 'confirm', key: 'Enter', label: '确认', Icon: CheckOutline },
  { id: 'right', key: 'ArrowRight', label: '右', Icon: RightOutline },
  { id: 'down', key: 'ArrowDown', label: '下', Icon: DownOutline },
]

function sendKey(target, key, type) {
  const code = key === ' ' ? 'Space' : key.length === 1 ? `Key${key.toUpperCase()}` : key
  target.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }))
}

export function FlashControls({ target }) {
  const pointers = useRef(new Map())
  const counts = useRef(new Map())

  useEffect(() => {
    if (!target) return undefined
    const releaseAll = () => {
      for (const key of counts.current.keys()) sendKey(target, key, 'keyup')
      counts.current.clear()
      pointers.current.clear()
    }
    const onVisibility = () => { if (document.hidden) releaseAll() }
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('fullscreenchange', releaseAll)
    document.addEventListener('webkitfullscreenchange', releaseAll)
    return () => {
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('fullscreenchange', releaseAll)
      document.removeEventListener('webkitfullscreenchange', releaseAll)
      releaseAll()
    }
  }, [target])

  // Every finger is tracked from where it lands in the controls until it lifts (pointerId → key under it, or null
  // between keys). Touch pointers stay captured by the controls, so the key under the finger is found by position:
  // sliding off a key releases it and sliding onto another presses that one.
  function keyAt(event) {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.flashKey')
    return element && event.currentTarget.contains(element) ? element.dataset.key : null
  }

  function hold(key) {
    const count = counts.current.get(key) || 0
    counts.current.set(key, count + 1)
    if (count === 0) sendKey(target, key, 'keydown')
  }

  function letGo(key) {
    const count = (counts.current.get(key) || 1) - 1
    if (count > 0) counts.current.set(key, count)
    else {
      counts.current.delete(key)
      sendKey(target, key, 'keyup')
    }
  }

  function press(event) {
    if (pointers.current.has(event.pointerId)) return
    const key = keyAt(event)
    event.preventDefault()
    target.focus({ preventScroll: true })
    pointers.current.set(event.pointerId, key)
    if (key) hold(key)
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch (_) {}
  }

  function slide(event) {
    if (!pointers.current.has(event.pointerId)) return
    const previous = pointers.current.get(event.pointerId)
    const key = keyAt(event)
    if (key === previous) return
    pointers.current.set(event.pointerId, key)
    if (previous) letGo(previous)
    if (key) hold(key)
  }

  function release(event) {
    if (!pointers.current.has(event.pointerId)) return
    const key = pointers.current.get(event.pointerId)
    pointers.current.delete(event.pointerId)
    if (key) letGo(key)
  }

  if (!target) return null
  const keyButton = (key, label, className, content) => <button key={label} className={`flashKey ${className}`} type="button" aria-label={label} data-key={key}>{content}</button>
  return <div className="flashControls" aria-label="Flash 触屏按键" onPointerDown={press} onPointerMove={slide} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <div className="flashDpad" aria-label="方向键">
      {DIRECTIONS.map(({ id, key, label, Icon }) => keyButton(key, label, `flashKey-${id}`, <Icon aria-hidden="true" />))}
    </div>
    <div className="flashActions" aria-label="动作键">
      {keyButton(' ', '动作 A，空格键', 'flashKey-action', 'A')}
      {keyButton('x', '动作 B，X 键', 'flashKey-action', 'B')}
      {keyButton('Enter', '确认，回车键', 'flashKey-start', 'OK')}
    </div>
  </div>
}
