import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, DotLoading, Tabs } from 'antd-mobile'
import { KeyboardCanvas } from './KeyboardCanvas.jsx'
import { getLayout } from './layouts.js'
import {
  bindControl, captureNextControl, controlsFor, gamepadConnected, INPUT_ENGINE_URL, KEYBOARD_FAMILIES, previewAction,
  readGlobalBindings, unbindAction, writeGlobalBindings,
} from './system.js'
import { loadClassic } from '../runtime/loadScript.js'
import { KeypadSettingsFields } from '../runtime/KeypadSettingsPopup.jsx'
import { FLASH_KEYS_DEFAULT_GAME } from '../runtime/flash-keys.js'

/** The engine's default bindings per family (runtime/j2me/input-mapping.js is their single source). */
function useEngineDefaults() {
  const [state, setState] = useState({ loading: true, error: '', families: null })
  useEffect(() => {
    let alive = true
    loadClassic(INPUT_ENGINE_URL)
      .then(() => {
        if (!alive) return
        const engine = window.InputMapping
        if (!engine?.family) throw new Error('输入引擎未就绪')
        setState({ loading: false, error: '', families: Object.fromEntries(Object.keys(KEYBOARD_FAMILIES).map((id) => [id, engine.family(id).defaults])) })
      })
      .catch((cause) => { if (alive) setState({ loading: false, error: cause.message || String(cause), families: null }) })
    return () => { alive = false }
  }, [])
  return state
}

function useGamepadPresence() {
  const [connected, setConnected] = useState(() => gamepadConnected())
  useEffect(() => {
    const sync = () => setConnected(gamepadConnected())
    window.addEventListener('gamepadconnected', sync)
    window.addEventListener('gamepaddisconnected', sync)
    return () => {
      window.removeEventListener('gamepadconnected', sync)
      window.removeEventListener('gamepaddisconnected', sync)
    }
  }, [])
  return connected
}

function BindingEditor({ family, defaults }) {
  const definition = KEYBOARD_FAMILIES[family]
  const [bindings, setBindings] = useState(() => readGlobalBindings(family, defaults))
  const [capturing, setCapturing] = useState('')
  const capture = useRef(null)
  const connected = useGamepadPresence()

  useEffect(() => () => capture.current?.abort(), [])
  const save = (next) => setBindings(writeGlobalBindings(family, next))

  const startCapture = useCallback(async (action) => {
    capture.current?.abort()
    const controller = new AbortController()
    capture.current = controller
    setCapturing(action)
    const result = await captureNextControl({ signal: controller.signal })
    if (capture.current !== controller) return
    capture.current = null
    setCapturing('')
    if (!result) return
    setBindings((current) => writeGlobalBindings(family, { ...current, [result.kind]: bindControl(current[result.kind], action, result.control) }))
  }, [family])
  const cancelCapture = () => {
    capture.current?.abort()
    capture.current = null
    setCapturing('')
  }

  const preview = definition.preview
  const capturingLabel = definition.actions.find(([id]) => id === capturing)?.[1]
  return <section className="keyboardSystemSection" aria-labelledby={`${family}-mapping`}>
    <h3 id={`${family}-mapping`}>按键映射</h3>
    <p className="keyboardSystemNote">
      点按下方键盘上的键，或点「设置」，再按下实体键盘或手柄上要用的键。所有游戏默认使用这里的映射；在游戏里的「按键映射」中可以为单个游戏另行调整。
      {family === 'flash' ? '没有绑定的实体键盘按键会直接输入 Flash 游戏。' : ''}
    </p>
    {preview && <div className={`keyboardSystemPreview keyboardSystemPreview-${family}`}>
      <KeyboardCanvas layout={getLayout(preview)} accessibleLabel={`${definition.name}：点按一个键设置它的映射`}
        onKeyDown={(unit) => { const action = previewAction(family, unit); if (action) startCapture(action) }} />
    </div>}
    <div className="inputMappingStatus" role="status">
      {capturing ? `请按下要用作「${capturingLabel}」的键盘按键或手柄按键…` : connected ? '已连接手柄' : '未检测到手柄：连接后按任意手柄按键即可识别'}
      {capturing && <Button size="mini" fill="none" onClick={cancelCapture}>取消</Button>}
    </div>
    <div className="inputMappingRows keyboardSystemRows">
      <div className="inputMappingLabels"><strong>动作</strong><strong>键盘</strong><strong>手柄</strong><span /></div>
      {definition.actions.map(([action, label]) => <div className={capturing === action ? 'inputMappingRow inputMappingRowActive' : 'inputMappingRow'} key={action}>
        <strong>{label}</strong>
        <span title={controlsFor(bindings.keyboard, action)}>{controlsFor(bindings.keyboard, action)}</span>
        <span title={controlsFor(bindings.gamepad, action)}>{controlsFor(bindings.gamepad, action)}</span>
        <span className="keyboardSystemRowActions">
          <Button size="small" fill="outline" onClick={() => startCapture(action)} aria-label={`设置「${label}」的按键或手柄映射`}>{capturing === action ? '等待输入' : '设置'}</Button>
          <Button size="small" fill="none" onClick={() => save({ keyboard: unbindAction(bindings.keyboard, action), gamepad: unbindAction(bindings.gamepad, action) })} aria-label={`清除「${label}」的映射`}>清除</Button>
        </span>
      </div>)}
    </div>
    <footer className="inputMappingFooter">
      <Button size="small" fill="outline" onClick={() => save({ ...bindings, keyboard: { ...defaults.keyboard } })}>恢复键盘默认</Button>
      <Button size="small" fill="outline" onClick={() => save({ ...bindings, gamepad: { ...defaults.gamepad } })}>恢复手柄默认</Button>
    </footer>
  </section>
}

/**
 * 「键盘」: one place for every keyboard of the app — each runtime family's on-screen keypad (style, orientation,
 * placement, size, opacity) and its key mapping for physical keyboards and gamepads.
 */
export function KeyboardSystemPage({ onBack }) {
  const engine = useEngineDefaults()
  const [family, setFamily] = useState('phone')
  useEffect(() => {
    // The app host's back key returns to the lobby instead of leaving the app.
    window.__XIAOCHAO_NATIVE_BACK_OVERRIDE__ = () => { onBack(); return true }
    return () => { delete window.__XIAOCHAO_NATIVE_BACK_OVERRIDE__ }
  }, [onBack])
  return <section className="keyboardSystem">
    <div className="sectionHeading">
      <div><h2>键盘</h2><p className="keyboardSystemNote">统一管理屏幕键盘、实体键盘和手柄。</p></div>
      <Button className="ghostButton" size="small" fill="outline" onClick={onBack}>返回游戏库</Button>
    </div>
    <Tabs activeKey={family} onChange={setFamily}>
      {Object.values(KEYBOARD_FAMILIES).map((item) => <Tabs.Tab key={item.id} title={`${item.name}`}>
        <p className="keyboardSystemNote">适用于：{item.runtimeLabel}</p>
        <section className="keyboardSystemSection" aria-label="屏幕键盘">
          <h3>屏幕键盘</h3>
          <KeypadSettingsFields family={item.id} game={item.id === 'flash' ? FLASH_KEYS_DEFAULT_GAME : undefined} />
        </section>
        {engine.loading ? <div className="status" role="status"><DotLoading /> 正在读取按键映射…</div>
          : engine.error ? <div className="status statusError" role="alert">按键映射暂不可用：{engine.error}</div>
            : <BindingEditor key={item.id} family={item.id} defaults={engine.families[item.id]} />}
      </Tabs.Tab>)}
    </Tabs>
  </section>
}
