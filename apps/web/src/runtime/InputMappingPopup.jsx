import { useEffect, useRef, useState } from 'react'
import { Button, Tabs } from 'antd-mobile'
import { RuntimeSheet } from './RuntimeSheet.jsx'
import { controlsFor, KEYBOARD_FAMILIES } from '../keyboard/system.js'

/** 按键映射 for the game being played: its keyboard and gamepad bindings (over the 「键盘」 page's global ones) and,
 *  for the phone keypad, its touch layout. */
export function InputMappingPopup({ visible, onClose, getContainer }) {
  const [controller, setController] = useState(null)
  const [bindings, setBindings] = useState({ keyboard: {}, gamepad: {} })
  const [capturing, setCapturing] = useState('')
  const [connected, setConnected] = useState(false)
  const [activeTab, setActiveTab] = useState('devices')
  const layoutHost = useRef(null)

  // Shallow-compare two flat binding maps so an unchanged poll does not create a
  // fresh object and force a full re-render of the binding rows.
  const sameBindings = (a, b) => {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    return keysA.length === keysB.length && keysA.every((key) => a[key] === b[key])
  }
  useEffect(() => {
    if (!visible) {
      setCapturing('')
      return undefined
    }
    // A runtime still loading has no controller yet (Flash creates it once the movie is in): pick it up when it comes.
    let current = window.__XIAOCHAO_INPUT_CONTROLLER__ || null
    setController(current)
    const refresh = () => {
      const latest = window.__XIAOCHAO_INPUT_CONTROLLER__ || null
      if (latest !== current) {
        current = latest
        setController(latest)
      }
      if (!current) return
      const nextKeyboard = current.keyboardBindings()
      const nextGamepad = current.gamepadBindings()
      setBindings((prev) => (
        sameBindings(prev.keyboard, nextKeyboard) && sameBindings(prev.gamepad, nextGamepad)
          ? prev
          : { keyboard: nextKeyboard, gamepad: nextGamepad }
      ))
      setConnected((prev) => {
        const next = current.hasGamepad()
        return prev === next ? prev : next
      })
    }
    const onBinding = () => {
      setCapturing('')
      refresh()
    }
    refresh()
    // Gamepad presence only needs a slow poll, and only while the device tab is
    // visible. A 500ms no-op poll re-rendered the whole sheet and fought the
    // runtime canvas for main-thread time on mobile.
    const timer = activeTab === 'devices' ? window.setInterval(refresh, 1000) : 0
    window.addEventListener('xiaochao:inputbinding', onBinding)
    window.addEventListener('xiaochao:gamepadbinding', onBinding)
    return () => {
      if (timer) window.clearInterval(timer)
      window.removeEventListener('xiaochao:inputbinding', onBinding)
      window.removeEventListener('xiaochao:gamepadbinding', onBinding)
      if (current) current.cancelCapture()
    }
  }, [visible, activeTab])

  const capture = (action) => {
    controller?.captureControl(action)
    setCapturing(action)
  }

  const resetGamepad = () => {
    controller?.resetGamepadBindings()
    if (controller) setBindings((state) => ({ ...state, gamepad: controller.gamepadBindings() }))
  }

  const actions = KEYBOARD_FAMILIES[controller?.family || 'phone']?.actions || KEYBOARD_FAMILIES.phone.actions
  const touchLayout = (controller?.family || 'phone') === 'phone'

  const resetKeyboard = () => {
    controller?.resetKeyboardBindings()
    if (controller) setBindings((state) => ({ ...state, keyboard: controller.keyboardBindings() }))
  }

  useEffect(() => {
    const host = layoutHost.current
    const adapter = window.__XIAOCHAO_TOUCH_LAYOUT_ADAPTER__
    if (!visible || activeTab !== 'touch' || !host || !adapter) return
    controller?.cancelCapture()
    setCapturing('')
    host.replaceChildren(window.TouchLayout.renderControls(adapter))
    return () => host.replaceChildren()
  }, [visible, activeTab, controller])

  return <RuntimeSheet visible={visible} onClose={onClose} title="按键映射" getContainer={getContainer}>
    <Tabs activeKey={activeTab} onChange={setActiveTab}>
      <Tabs.Tab title="键盘与手柄" key="devices">
        <div className="inputMappingStatus" role="status">{!controller ? '游戏启动后可设置按键' : `${connected ? '检测到手柄' : '等待手柄输入'} · ${capturing ? '请按下键盘按键或手柄控件' : '只改当前游戏；所有游戏的默认映射在大厅的「键盘」页设置'}`}</div>
        <div className="inputMappingRows">
          <div className="inputMappingLabels"><strong>动作</strong><strong>键盘</strong><strong>手柄</strong><span /></div>
          {actions.map(([action, label]) => <div className="inputMappingRow" key={action}>
            <strong>{label}</strong>
            <span title={controlsFor(bindings.keyboard, action)}>{controlsFor(bindings.keyboard, action)}</span>
            <span title={controlsFor(bindings.gamepad, action)}>{controlsFor(bindings.gamepad, action)}</span>
            <Button size="small" fill="outline" disabled={!controller} onClick={() => capture(action)} aria-label={`设置${label}的按键或手柄映射`}>
              {capturing === action ? '等待输入' : '设置'}
            </Button>
          </div>)}
        </div>
        <footer className="inputMappingFooter">
          <Button size="small" fill="outline" onClick={resetKeyboard}>恢复键盘默认</Button>
          <Button size="small" fill="outline" onClick={resetGamepad}>恢复手柄默认</Button>
        </footer>
      </Tabs.Tab>
      {touchLayout && <Tabs.Tab title="触屏键位" key="touch"><div ref={layoutHost} className="touchLayoutEditor" /></Tabs.Tab>}
    </Tabs>
  </RuntimeSheet>
}
