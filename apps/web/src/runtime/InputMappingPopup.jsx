import { useEffect, useRef, useState } from 'react'
import { Button, Popup, Tabs } from 'antd-mobile'

const ACTIONS = [
  ['up', '上'], ['down', '下'], ['left', '左'], ['right', '右'], ['ok', '确认'],
  ['choice', '左软键'], ['back', '右软键'], ['ret', '返回'], ['clear', '清除'],
  ['star', '*'], ['pound', '#'],
  ...Array.from({ length: 10 }, (_, digit) => [`num${digit}`, String(digit)]),
]
function controlName(control) {
  if (control.startsWith('button:')) return `按钮 ${control.slice(7)}`
  const axis = /^axis:(\d+):([+-])$/.exec(control)
  if (axis) return `摇杆 ${Number(axis[1]) + 1} ${axis[2] === '-' ? '负向' : '正向'}`
  return control
}

function controlsFor(bindings, action) {
  return Object.keys(bindings || {}).filter((control) => bindings[control] === action).map(controlName).join('、') || '未绑定'
}

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
    const current = window.__XIAOCHAO_INPUT_CONTROLLER__
    setController(current || null)
    const refresh = () => {
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
    const timer = current && activeTab === 'devices' ? window.setInterval(refresh, 1000) : 0
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

  return <Popup
    visible={visible}
    onMaskClick={onClose}
    onClose={onClose}
    closeOnMaskClick
    getContainer={getContainer}
    position="bottom"
    maskClassName="runtimeSettingsMask"
    bodyClassName="inputMappingSheet"
  >
    <section className="inputMappingPanel" role="dialog" aria-modal="true" aria-label="按键映射">
      <header className="inputMappingHeader">
        <strong>按键映射</strong>
        <Button size="small" fill="none" onClick={onClose}>关闭</Button>
      </header>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <Tabs.Tab title="键盘与手柄" key="devices">
          <div className="inputMappingStatus" role="status">{connected ? '检测到手柄' : '等待手柄输入'} · {capturing ? '请按下键盘按键或手柄控件' : '选择动作后可重新绑定'}</div>
          <div className="inputMappingRows">
            <div className="inputMappingLabels"><strong>动作</strong><strong>键盘</strong><strong>手柄</strong><span /></div>
            {ACTIONS.map(([action, label]) => <div className="inputMappingRow" key={action}>
              <strong>{label}</strong>
              <span title={controlsFor(bindings.keyboard, action)}>{controlsFor(bindings.keyboard, action)}</span>
              <span title={controlsFor(bindings.gamepad, action)}>{controlsFor(bindings.gamepad, action)}</span>
              <Button size="small" fill="outline" onClick={() => capture(action)} aria-label={`设置${label}的按键或手柄映射`}>
                {capturing === action ? '等待输入' : '设置'}
              </Button>
            </div>)}
          </div>
          <footer className="inputMappingFooter">
            <Button size="small" fill="outline" onClick={resetKeyboard}>恢复键盘默认</Button>
            <Button size="small" fill="outline" onClick={resetGamepad}>恢复手柄默认</Button>
          </footer>
        </Tabs.Tab>
        <Tabs.Tab title="触屏键位" key="touch"><div ref={layoutHost} className="touchLayoutEditor" /></Tabs.Tab>
      </Tabs>
    </section>
  </Popup>
}
