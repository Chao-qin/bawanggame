import { Selector } from 'antd-mobile'
import { useKeypadPrefs } from './RuntimeKeypad.jsx'
import { effectivePlacement, KEYPAD_FAMILIES } from './keypad-prefs.js'
import { RuntimeSheet } from './RuntimeSheet.jsx'

// What each runtime family offers, and what its keys do — so the sheet always says which keypad is on screen.
const FAMILY_COPY = {
  phone: {
    scope: 'J2ME 与冒泡社区共用此设置',
    styles: [
      { label: 'T9 直板', value: 't9', description: '竖屏方向轮盘在上、数字在下；横屏左方向、右数字' },
      { label: '经典', value: 'classic', description: '原来的圆形方向键，支持自定义触屏键位' },
    ],
    keys: [
      ['方向轮盘', '上下左右，中心为确认'],
      ['左 / 右软键', '游戏菜单左右两个选项'],
      ['挂机 / 清除', '返回、删除'],
      ['0–9 * #', '数字键'],
    ],
  },
  flash: {
    scope: '所有 Flash 游戏共用此设置',
    styles: [
      { label: '游戏手柄', value: 'gamepad', description: '方向轮盘加 A、B 键；横屏分列画面两侧' },
      { label: '隐藏', value: 'hidden', description: '不显示屏幕按键，适合点击画面操作的游戏' },
    ],
    keys: [
      ['方向轮盘', '方向键 ↑ ↓ ← →，中心为 Enter'],
      ['A', '空格键'],
      ['B', 'X 键'],
      ['实体键盘', '按键直接输入游戏'],
    ],
  },
}
const PLACEMENT_OPTIONS = [
  { label: '嵌入布局', value: 'docked', description: '键盘占用自己的位置，游戏画面不被遮挡' },
  { label: '浮空', value: 'floating', description: '画面放大，半透明键盘浮在上面，会遮住画面边缘' },
]

/** Keypad choice for one runtime family; saved once for every game of that family. */
export function KeypadSettingsPopup({ family = 'phone', visible, onClose, getContainer }) {
  const [prefs, update] = useKeypadPrefs(family)
  const copy = FAMILY_COPY[family] || FAMILY_COPY.phone
  const current = copy.styles.find((option) => option.value === prefs.style) || copy.styles[0]
  const canFloat = KEYPAD_FAMILIES[family].floating.includes(prefs.style)
  const floatingStyles = copy.styles.filter((option) => KEYPAD_FAMILIES[family].floating.includes(option.value)).map((option) => option.label)
  return <RuntimeSheet visible={visible} onClose={onClose} title="键盘设置" getContainer={getContainer}>
    <div className="keypadCurrent" role="status">
      <span>当前键盘</span>
      <strong>{current.label}</strong>
      <small>{current.description} · {copy.scope}</small>
    </div>
    <div className="inputMappingStatus">键盘样式</div>
    <Selector columns={2} options={copy.styles} value={[prefs.style]} onChange={([style]) => style && update({ style })} />
    <div className="inputMappingStatus">键盘位置{canFloat ? '' : `（仅${floatingStyles.join('、')}可浮空）`}</div>
    <Selector
      columns={2}
      options={PLACEMENT_OPTIONS.map((option) => ({ ...option, disabled: !canFloat && option.value === 'floating' }))}
      value={[effectivePlacement(prefs, family)]}
      onChange={([placement]) => placement && update({ placement })}
    />
    <div className="inputMappingStatus">按键说明</div>
    <dl className="keypadLegend">
      {copy.keys.map(([name, meaning]) => <div key={name}><dt>{name}</dt><dd>{meaning}</dd></div>)}
    </dl>
  </RuntimeSheet>
}
