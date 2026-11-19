import { useEffect, useState } from 'react'
import { Button, Popup, Tabs } from 'antd-mobile'

const ACTIONS = [
  ['up', '上'], ['down', '下'], ['left', '左'], ['right', '右'], ['ok', '确认'],
  ['choice', '左软键'], ['back', '右软键'], ['ret', '返回'], ['clear', '清除'],
  ['star', '*'], ['pound', '#'],
  ...Array.from({ length: 10 }, (_, digit) => [`num${digit}`, String(digit)]),
]
const LAYOUT_SLOTS = ['up', 'right', 'down', 'left', 'ok', 'choice', 'back', 'ret', 'clear', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9', 'num0', 'star', 'pound']
const LAYOUT_LABELS = {
  up: '↑', right: '→', down: '↓', left: '←', ok: '确认', choice: '软键 1', back: '软键 2',
  ret: '返回', clear: '清除', star: '*', pound: '#', num0: '0',
}

function controlName(control) {
  if (control.startsWith('button:')) return `按钮 ${control.slice(7)}`
  const axis = /^axis:(\d+):([+-])$/.exec(control)
  if (axis) return `摇杆 ${Number(axis[1]) + 1} ${axis[2] === '-' ? '负向' : '正向'}`
  return control
}

function controlsFor(bindings, action) {
  return Object.keys(bindings || {}).filter((control) => bindings[control] === action).map(controlName).join('、') || '未绑定'
}

function actionLabel(action) {
  return LAYOUT_LABELS[action] || action.replace(/^num/, '')
}

export function InputMappingPopup({ visible, onClose }) {
  const [controller, setController] = useState(null)
  const [bindings, setBindings] = useState({ keyboard: {}, gamepad: {} })
  const [capturing, setCapturing] = useState('')
  const [connected, setConnected] = useState(false)
  const [activeTab, setActiveTab] = useState('devices')
  const [layoutAdapter, setLayoutAdapter] = useState(null)
  const [touchLayout, setTouchLayout] = useState(null)

  useEffect(() => {
    if (!visible) {
      setCapturing('')
      return undefined
    }
    const current = window.__XIAOCHAO_INPUT_CONTROLLER__
    const currentLayout = window.__XIAOCHAO_TOUCH_LAYOUT_ADAPTER__
    setController(current || null)
    setLayoutAdapter(currentLayout || null)
    setTouchLayout(currentLayout && window.TouchLayout ? window.TouchLayout.normalize(currentLayout.get()) : null)
    const refresh = () => {
      if (!current) return
      setBindings({ keyboard: current.keyboardBindings(), gamepad: current.gamepadBindings() })
      setConnected(current.hasGamepad())
    }
    const onBinding = (event) => {
      setCapturing('')
      refresh()
    }
    refresh()
    const timer = current ? window.setInterval(refresh, 500) : 0
    window.addEventListener('xiaochao:inputbinding', onBinding)
    window.addEventListener('xiaochao:gamepadbinding', onBinding)
    return () => {
      if (timer) window.clearInterval(timer)
      window.removeEventListener('xiaochao:inputbinding', onBinding)
      window.removeEventListener('xiaochao:gamepadbinding', onBinding)
      if (current) current.cancelCapture()
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

  const saveTouchLayout = (value) => {
    if (!layoutAdapter || !window.TouchLayout) return
    setTouchLayout(layoutAdapter.save(window.TouchLayout.normalize(value)))
  }

  const changeNumber = (index, selected) => {
    if (!touchLayout) return
    const numbers = touchLayout.numbers.slice()
    const previousIndex = numbers.indexOf(selected)
    if (previousIndex >= 0 && previousIndex !== index) numbers[previousIndex] = numbers[index]
    numbers[index] = selected
    saveTouchLayout({ ...touchLayout, numbers })
  }

  const renderTouchLayout = () => {
    if (!touchLayout || !window.TouchLayout) return <div className="layout-note">触屏布局不可用</div>
    const update = (key, value) => saveTouchLayout({ ...touchLayout, [key]: value })
    const nextActions = { ...touchLayout.actions }
    const actionOptions = window.TouchLayout.actions
    return <div className="touchLayoutEditor">
      <label className="opt"><span className="opt-name">方向键</span><select value={touchLayout.dpad} onChange={(event) => update('dpad', event.target.value)}>
        <option value="standard">标准</option><option value="mirror">左右镜像</option><option value="rotate-cw">顺时针 90°</option><option value="rotate-ccw">逆时针 90°</option>
      </select></label>
      <label className="opt"><span className="opt-name">横屏两侧</span><select value={touchLayout.sides} onChange={(event) => update('sides', event.target.value)}>
        <option value="standard">数字键左 / 导航键右</option><option value="swapped">导航键左 / 数字键右</option>
      </select></label>
      <p className="layout-note">数字键保持 3×4 网格；选择已占用数字时会交换位置。</p>
      <div className="layout-order">{touchLayout.numbers.map((number, index) => <select key={index} aria-label={`数字键槽位 ${index + 1}`} value={number} onChange={(event) => changeNumber(index, event.target.value)}>
        {window.TouchLayout.numbers.map((item) => <option key={item} value={item}>{item === 'star' ? '*' : item === 'pound' ? '#' : item}</option>)}
      </select>)}</div>
      <div className="layout-actions">{LAYOUT_SLOTS.map((slot) => <label className="layout-action-row" key={slot}>
        <span className="opt-name">{actionLabel(slot)}</span>
        <select value={nextActions[slot] || slot} aria-label={`${actionLabel(slot)}触屏动作`} onChange={(event) => {
          nextActions[slot] = event.target.value
          saveTouchLayout({ ...touchLayout, actions: nextActions })
        }}>
          {actionOptions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
        </select>
      </label>)}</div>
      <Button size="small" fill="outline" onClick={() => setTouchLayout(layoutAdapter.reset())}>恢复 Java 默认布局</Button>
    </div>
  }

  return <Popup visible={visible} onMaskClick={onClose} onClose={onClose} position="bottom" bodyClassName="inputMappingSheet">
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
        <Tabs.Tab title="触屏键位" key="touch">{renderTouchLayout()}</Tabs.Tab>
      </Tabs>
    </section>
  </Popup>
}
