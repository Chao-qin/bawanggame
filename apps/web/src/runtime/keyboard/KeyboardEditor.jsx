import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addControl, clearExplicitProfileAssignment, clearMigratedPerGameOverride, cloneLayoutForEditing, getLayoutWarnings, hideControl, moveControl,
  reassignAction, reorderControl, resizeControl,
} from './editor-model.js'
import { BUILTIN_LAYOUTS, BUILTIN_THEMES, DEFAULT_PROFILES, resolveProfile } from './profiles.js'
import { loadKeyboardConfig, saveKeyboardConfig } from './storage.js'

const profiles = ['flash:portrait', 'flash:landscape', 'j2me:portrait', 'j2me:landscape', 'mrp:portrait', 'mrp:landscape']
const actions = ['up', 'down', 'left', 'right', 'ok', 'choice', 'back', 'ret', 'clear', 'star', 'pound', ...Array.from({ length: 10 }, (_, i) => `num${i}`)]
const clone = (value) => JSON.parse(JSON.stringify(value))
const announce = (text) => (typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('xiaochao:keyboard-editor-status', { detail: text })))

function Button({ children, label, onActivate, tabIndex = 0, className = '' }) {
  return <g className={`keyboardEditorButton ${className}`} role="button" tabIndex={tabIndex} aria-label={label} onClick={onActivate}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivate() } }}>
    <rect x="0" y="0" width="1" height="1" rx=".025" />
    <text x=".5" y=".64" textAnchor="middle">{children}</text>
  </g>
}

function shapeFor(control, theme, selected) {
  const props = { fill: theme.tokens.keyFill, stroke: selected ? theme.tokens.focused : theme.tokens.border, strokeWidth: selected ? 0.012 : 0.006, vectorEffect: 'non-scaling-stroke' }
  if (control.shape === 'circle') return <circle cx={control.x + control.width / 2} cy={control.y + control.height / 2} r={Math.min(control.width, control.height) / 2} {...props} />
  return <rect x={control.x} y={control.y} width={control.width} height={control.height} rx={control.shape === 'rounded-rect' ? Math.min(control.width, control.height) * .18 : 0} {...props} />
}

export function KeyboardEditor({ gameId, onClose }) {
  const [config, setConfig] = useState(() => loadKeyboardConfig())
  const [profileKey, setProfileKey] = useState('j2me:portrait')
  const [layout, setLayout] = useState(null)
  const [selected, setSelected] = useState('')
  const [dirty, setDirty] = useState(false)
  const [drag, setDrag] = useState(null)
  const rootRef = useRef(null)

  const [runtime, orientation] = profileKey.split(':')
  const resolved = useMemo(() => resolveProfile(config, { runtime, orientation, gameId }), [config, runtime, orientation, gameId])
  const theme = BUILTIN_THEMES[resolved.themeId] || BUILTIN_THEMES.classic

  useEffect(() => {
    const next = clone(resolved.layout)
    setLayout(next)
    setSelected(next.controls.find((control) => control.visible !== false)?.id || '')
    setDirty(false)
  }, [resolved.layoutId, profileKey])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    window.__XIAOCHAO_KEYBOARD_SESSION__?.releaseAll?.()
    window.__XIAOCHAO_INPUT_CONTROLLER__?.releaseAll?.()
    const stop = (event) => {
      if (root.contains(event.target)) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) event.stopPropagation()
      }
    }
    window.addEventListener('keydown', stop, true)
    return () => window.removeEventListener('keydown', stop, true)
  }, [])

  const warnings = layout ? getLayoutWarnings(layout, { emulatorDisplay: { x: .26, y: .16, width: .48, height: .38 }, safeArea: { x: .04, y: .04, width: .92, height: .92 } }) : []
  const selectedControl = layout?.controls.find((control) => control.id === selected)
  const mutate = (next) => { setLayout(next); setDirty(true) }
  const commitConfig = (next) => {
    if (!saveKeyboardConfig(next)) return false
    setConfig(next)
    window.dispatchEvent(new CustomEvent('xiaochao:keyboardprofilechange', { detail: { runtime, gameId } }))
    window.__XIAOCHAO_KEYBOARD_SESSION__?.refreshConfig?.(next)
    return true
  }
  const step = (field, amount) => {
    if (!selectedControl) return
    const value = Number(selectedControl[field]) + amount
    if (field === 'x' || field === 'y') mutate(moveControl(layout, selected, { x: field === 'x' ? value : selectedControl.x, y: field === 'y' ? value : selectedControl.y }))
    else mutate(resizeControl(layout, selected, { width: field === 'width' ? value : selectedControl.width, height: field === 'height' ? value : selectedControl.height }))
  }
  const save = () => {
    if (!layout || warnings.some((warning) => warning.type === 'invalid-geometry')) return announce('布局几何无效，无法保存')
    const next = clone(config)
    next.customLayouts[layout.id] = layout
    next.profileAssignments[profileKey] = { layoutId: layout.id, themeId: resolved.themeId }
    if (commitConfig(next)) {
      setDirty(false)
      announce('键盘布局已保存')
    }
  }
  const clonePreset = () => {
    const next = cloneLayoutForEditing(layout || resolved.layout, { id: `${resolved.layout.id}-custom-${Date.now()}` })
    mutate(next)
  }
  const restore = () => {
    const next = clone(config)
    delete next.profileAssignments[profileKey]
    if (commitConfig(next)) {
      setDirty(false)
      announce('已恢复默认布局')
    }
  }
  const clearExplicit = () => {
    const next = clearExplicitProfileAssignment(config, runtime, orientation)
    if (commitConfig(next)) {
      setDirty(false)
      announce('已清除显式配置')
    }
  }
  const clearMigrated = () => {
    if (!gameId) return announce('当前没有游戏迁移覆盖')
    const next = clearMigratedPerGameOverride(config, gameId, runtime)
    if (commitConfig(next)) {
      setDirty(false)
      announce('已清除迁移覆盖')
    }
  }
  const onKeyDown = (event) => {
    if (!selectedControl) return
    const amount = event.shiftKey ? .02 : .01
    const resize = event.altKey || event.metaKey || event.ctrlKey
    const delta = { ArrowUp: [0, -amount], ArrowDown: [0, amount], ArrowLeft: [-amount, 0], ArrowRight: [amount, 0] }[event.key]
    if (!delta) return
    event.preventDefault()
    if (resize) step(delta[0] ? 'width' : 'height', delta[0] || delta[1])
    else mutate(moveControl(layout, selected, { x: selectedControl.x + delta[0], y: selectedControl.y + delta[1] }))
  }
  const onPointerMove = (event) => {
    if (!drag || !layout) return
    const svg = event.currentTarget
    const box = svg.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width
    const y = (event.clientY - box.top) / box.height
    mutate(moveControl(layout, drag.id, { x: x - drag.dx, y: y - drag.dy }))
  }

  if (!layout) return null
  const controls = [...layout.controls].sort((a, b) => a.z - b.z)
  const profileIndex = profiles.indexOf(profileKey)
  const changeProfile = (direction) => setProfileKey(profiles[(profileIndex + direction + profiles.length) % profiles.length])
  return <svg ref={rootRef} className="keyboardEditorSvg" data-keyboard-editor data-editor-dirty={dirty} viewBox="0 0 1 1"
    role="application" aria-label="SVG 键盘布局编辑器" onKeyDown={onKeyDown} onPointerMove={onPointerMove}
    onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
    <rect className="keyboardEditorBackground" x="0" y="0" width="1" height="1" fill={theme.tokens.background} />
    <g className="keyboardEditorToolbar" aria-label="配置">
      <Button label="上一个配置" onActivate={() => changeProfile(-1)}><tspan>配置</tspan></Button>
      <text x=".08" y=".035" className="keyboardEditorTitle">{profileKey} · {layout.name}</text>
      <Button label="下一个配置" onActivate={() => changeProfile(1)}><tspan>切换</tspan></Button>
      <Button label="选择主题" onActivate={() => { const ids = Object.keys(BUILTIN_THEMES); const index = ids.indexOf(resolved.themeId); const next = clone(config); next.profileAssignments[profileKey] = { layoutId: resolved.layoutId, themeId: ids[(index + 1) % ids.length] }; setConfig(next); setDirty(true) }}>主题</Button>
      <Button label="克隆当前预设" onActivate={clonePreset}>克隆</Button>
    </g>
    <g className="keyboardEditorStage" aria-label="布局预览">
      <rect className="keyboardEditorSafeArea" x=".04" y=".04" width=".92" height=".92" />
      <rect className="keyboardEditorDisplay" x=".26" y=".16" width=".48" height=".38" />
      {controls.map((control) => <g key={control.id} data-control-id={control.id} data-action-id={control.actionId} role="button" tabIndex={0}
        aria-label={`${control.label} ${control.actionId}`} opacity={control.visible === false ? .22 : 1}
        onClick={() => setSelected(control.id)} onPointerDown={(event) => { const box = event.currentTarget.ownerSVGElement.getBoundingClientRect(); setSelected(control.id); setDrag({ id: control.id, dx: (event.clientX - box.left) / box.width - control.x, dy: (event.clientY - box.top) / box.height - control.y }) }}>
        {shapeFor(control, theme, selected === control.id)}<text x={control.x + control.width / 2} y={control.y + control.height / 2 + .012} textAnchor="middle" fill={theme.tokens.text}>{control.label}</text>
      </g>)}
    </g>
    <g className="keyboardEditorInspector" aria-label="选中控件">
      <text x=".05" y=".965">{selectedControl ? `${selectedControl.label} · ${selectedControl.actionId}` : '未选择控件'} · 警告 {warnings.length}</text>
      {selectedControl && <>
        <Button label="减小 X" onActivate={() => step('x', -.01)}>X-</Button><Button label="增加 X" onActivate={() => step('x', .01)}>X+</Button>
        <Button label="减小宽度" onActivate={() => step('width', -.01)}>W-</Button><Button label="增加宽度" onActivate={() => step('width', .01)}>W+</Button>
        <Button label="隐藏或显示控件" onActivate={() => mutate(hideControl(layout, selected))}>显隐</Button>
        <Button label="上移层级" onActivate={() => mutate(reorderControl(layout, selected, selectedControl.z + 1))}>上移</Button>
        <Button label="下移层级" onActivate={() => mutate(reorderControl(layout, selected, selectedControl.z - 1))}>下移</Button>
        <Button label="更换动作" onActivate={() => { const index = actions.indexOf(selectedControl.actionId); mutate(reassignAction(layout, selected, actions[(index + 1) % actions.length])) }}>动作</Button>
      </>}
    </g>
    <g className="keyboardEditorCommands" aria-label="编辑命令">
      <Button label="保存布局" onActivate={save}>保存</Button><Button label="放弃更改" onActivate={() => { setLayout(clone(resolved.layout)); setDirty(false) }}>放弃</Button>
      <Button label="恢复默认" onActivate={restore}>恢复</Button><Button label="清除显式配置" onActivate={clearExplicit}>清显式</Button>
      <Button label="清除迁移覆盖" onActivate={clearMigrated}>清迁移</Button>
      <Button label="添加控件" onActivate={() => mutate(addControl(layout, { id: `custom-${layout.controls.length + 1}`, actionId: 'custom:control', label: '+', x: .42, y: .62, width: .08, height: .08, z: layout.controls.length }))}>添加</Button>
      <Button label="关闭编辑器" onActivate={onClose}>关闭</Button>
    </g>
  </svg>
}

export { DEFAULT_PROFILES }
