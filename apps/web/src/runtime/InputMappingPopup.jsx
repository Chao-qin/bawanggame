import { useEffect, useState } from 'react'
import { Button, Popup } from 'antd-mobile'

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

export function InputMappingPopup({ visible, onClose }) {
  const [controller, setController] = useState(null)
  const [bindings, setBindings] = useState({ keyboard: {}, gamepad: {} })
  const [capturing, setCapturing] = useState('')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!visible) {
      setCapturing('')
      return undefined
    }
    const current = window.__XIAOCHAO_INPUT_CONTROLLER__
    if (!current) return undefined
    setController(current)
    const refresh = () => {
      setBindings({ keyboard: current.keyboardBindings(), gamepad: current.gamepadBindings() })
      setConnected(current.hasGamepad())
    }
    const onBinding = (event) => {
      setCapturing('')
      refresh()
    }
    refresh()
    const timer = window.setInterval(refresh, 500)
    window.addEventListener('xiaochao:inputbinding', onBinding)
    window.addEventListener('xiaochao:gamepadbinding', onBinding)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('xiaochao:inputbinding', onBinding)
      window.removeEventListener('xiaochao:gamepadbinding', onBinding)
      current.cancelCapture()
    }
  }, [visible])

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

  return <Popup visible={visible} onMaskClick={onClose} onClose={onClose} position="bottom" bodyClassName="inputMappingSheet">
    <section className="inputMappingPanel" role="dialog" aria-modal="true" aria-label="按键映射">
      <header className="inputMappingHeader">
        <strong>按键映射</strong>
        <Button size="small" fill="none" onClick={onClose}>关闭</Button>
      </header>
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
    </section>
  </Popup>
}
