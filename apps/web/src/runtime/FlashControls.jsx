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

  function press(event, key) {
    event.preventDefault()
    if (pointers.current.has(event.pointerId)) return
    target.focus({ preventScroll: true })
    pointers.current.set(event.pointerId, key)
    const count = counts.current.get(key) || 0
    counts.current.set(key, count + 1)
    if (count === 0) sendKey(target, key, 'keydown')
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch (_) {}
  }

  function release(event) {
    const key = pointers.current.get(event.pointerId)
    if (!key) return
    pointers.current.delete(event.pointerId)
    const count = (counts.current.get(key) || 1) - 1
    if (count > 0) counts.current.set(key, count)
    else {
      counts.current.delete(key)
      sendKey(target, key, 'keyup')
    }
  }

  if (!target) return null
  const keyButton = (key, label, className, content) => <button key={label} className={`flashKey ${className}`} type="button" aria-label={label} onPointerDown={(event) => press(event, key)} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>{content}</button>
  return <div className="flashControls" aria-label="Flash 触屏按键">
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
