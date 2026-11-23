import { useMemo, useRef, useState } from 'react'
import { KeyboardCanvas } from './KeyboardCanvas.jsx'
import { KEYBOARD_LAYOUTS } from './layouts.js'
import './keyboard-test.css'

const categories = [
  { id: 'physical', label: '实体键盘' },
  { id: 'controller', label: '游戏控制器' },
  { id: 'phone', label: '直板手机' },
]

export function KeyboardTestPage() {
  const [category, setCategory] = useState('physical')
  const [layoutId, setLayoutId] = useState('full-size')
  const [held, setHeld] = useState([])
  const [latestEvent, setLatestEvent] = useState(null)
  const heldPointers = useRef(new Map())
  const layouts = useMemo(() => KEYBOARD_LAYOUTS.filter((layout) => layout.type === category), [category])
  const layout = KEYBOARD_LAYOUTS.find((item) => item.id === layoutId) || layouts[0]

  function selectCategory(nextCategory) {
    setCategory(nextCategory)
    const nextLayout = KEYBOARD_LAYOUTS.find((item) => item.type === nextCategory)
    if (nextLayout) setLayoutId(nextLayout.id)
  }

  function keyDown(key, pointerId) {
    heldPointers.current.set(pointerId, key)
    const keys = [...new Map([...heldPointers.current.values()].map((item) => [item.id, item])).values()]
    setHeld(keys)
    setLatestEvent({ action: '按下', key, pointerId })
  }

  function keyUp(key, pointerId) {
    heldPointers.current.delete(pointerId)
    const keys = [...new Map([...heldPointers.current.values()].map((item) => [item.id, item])).values()]
    setHeld(keys)
    setLatestEvent({ action: '抬起', key, pointerId })
  }

  return (
    <main className="keyboardTest">
      <header className="keyboardTestHeader">
        <div>
          <p className="keyboardEyebrow">REACT KONVA</p>
          <h1>键盘交互测试</h1>
        </div>
        <span className="keyboardLayoutCount">{layout.keys.length} 个按键</span>
      </header>

      <div className="keyboardCategoryTabs" role="tablist" aria-label="键盘类别">
        {categories.map((item) => (
          <button
            key={item.id}
            id={`keyboard-category-${item.id}`}
            type="button"
            role="tab"
            aria-selected={category === item.id}
            className={category === item.id ? 'keyboardCategoryActive' : ''}
            onClick={() => selectCategory(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <nav className="keyboardLayouts" aria-label="键盘布局">
        {layouts.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={layout.id === item.id}
            className={layout.id === item.id ? 'keyboardLayoutActive' : ''}
            onClick={() => setLayoutId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="keyboardCanvasSection" aria-label={`${layout.label}画布`}>
        <KeyboardCanvas
          key={layout.id}
          layout={layout}
          accessibleLabel={`${layout.label}交互键盘`}
          onKeyDown={keyDown}
          onKeyUp={keyUp}
        />
      </section>

      <section className="keyboardFeedback" aria-live="polite">
        <div className="keyboardHeld">
          <span className="keyboardFeedbackLabel">当前按下</span>
          <div className="keyboardHeldValues">
            {held.length ? held.map((key) => (
              <span key={key.id} className="keyboardKeyValue">{key.label || key.value}</span>
            )) : <span className="keyboardIdle">无</span>}
          </div>
        </div>
        <div className="keyboardLastEvent">
          <span className="keyboardFeedbackLabel">最近事件</span>
          {latestEvent
            ? <strong>{latestEvent.action} · {latestEvent.key.value} · 指针 {latestEvent.pointerId}</strong>
            : <span className="keyboardIdle">等待输入</span>}
        </div>
      </section>
    </main>
  )
}
