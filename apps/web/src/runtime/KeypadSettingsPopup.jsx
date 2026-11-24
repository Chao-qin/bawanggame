import { Selector, Switch } from 'antd-mobile'
import { useKeypadPrefs } from './RuntimeKeypad.jsx'
import { effectiveOpacity, effectivePlacement, KEYPAD_FAMILIES } from './keypad-prefs.js'
import { FLASH_ACTION_KEYS, FLASH_DIRECTION_KEYS } from './flash-keys.js'
import { useFlashKeys } from './FlashKeypad.jsx'
import { RuntimeSheet } from './RuntimeSheet.jsx'

// What each runtime family offers, and what its keys do — so the sheet always says which keypad is on screen.
const FAMILY_COPY = {
  phone: {
    scope: 'J2ME 与冒泡社区共用此设置',
    styles: [
      { label: 'T9 直板', value: 't9', description: '方向轮盘加数字键，横排时分列画面两侧' },
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
      { label: '游戏手柄', value: 'gamepad', description: '方向轮盘加 A、B 键，横排时分列画面两侧' },
    ],
  },
}
const LAYOUT_OPTIONS = [
  { label: '跟随屏幕', value: 'auto', description: '竖屏在下方，横屏在两侧' },
  { label: '竖排', value: 'portrait', description: '键盘整块在画面下方' },
  { label: '横排', value: 'landscape', description: '键盘分列画面两侧' },
]
const PLACEMENT_OPTIONS = [
  { label: '嵌入布局', value: 'docked', description: '键盘占用自己的位置，画面不被遮挡' },
  { label: '浮空', value: 'floating', description: '画面放大，键盘浮在上面' },
]
const OPACITY_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: '100%', value: '1' },
  { label: '80%', value: '0.8' },
  { label: '60%', value: '0.6' },
  { label: '40%', value: '0.4' },
]
const FIT_OPTIONS = [
  { label: '完整显示', value: 'contain', description: '等比缩放，画面完整' },
  { label: '宽度撑满', value: 'width', description: '左右占满，上下超出部分裁掉' },
  { label: '高度撑满', value: 'height', description: '上下占满，左右超出部分裁掉' },
]

function Section({ title, children }) {
  return <section className="runtimeSheetSection">
    <h3>{title}</h3>
    {children}
  </section>
}

function Field({ label, hint, children }) {
  return <div className="runtimeSheetField">
    <div className="inputMappingStatus">{label}{hint ? <small>{hint}</small> : null}</div>
    {children}
  </div>
}

const pick = (update, key) => ([value]) => value && update({ [key]: value })

/** Flash keys for the game being played: which keyboard key each part of the gamepad sends. */
function FlashKeysFields({ game }) {
  const [keys, update] = useFlashKeys(game)
  const actionOptions = FLASH_ACTION_KEYS.map(([value, label]) => ({ label, value }))
  return <>
    <Field label="方向轮盘"><Selector columns={2} options={FLASH_DIRECTION_KEYS.map(([value, label]) => ({ label, value }))} value={[keys.directions]} onChange={pick(update, 'directions')} /></Field>
    <Field label="轮盘中心 OK"><Selector columns={5} options={actionOptions} value={[keys.ok]} onChange={pick(update, 'ok')} /></Field>
    <Field label="A 键"><Selector columns={5} options={actionOptions} value={[keys.a]} onChange={pick(update, 'a')} /></Field>
    <Field label="B 键"><Selector columns={5} options={actionOptions} value={[keys.b]} onChange={pick(update, 'b')} /></Field>
    <p className="inputMappingStatus">只对当前游戏生效；实体键盘的按键直接输入游戏。</p>
  </>
}

/** 「游戏表现」: keypad (shown, style, layout direction, placement, opacity), screen fit and keys, for one runtime
 *  family; the family's choices are saved once for every game of that family, Flash keys per game. */
export function KeypadSettingsPopup({ family = 'phone', runtime, game, visible, onClose, getContainer }) {
  const [prefs, update] = useKeypadPrefs(family)
  const copy = FAMILY_COPY[family] || FAMILY_COPY.phone
  const current = copy.styles.find((option) => option.value === prefs.style) || copy.styles[0]
  const floatable = KEYPAD_FAMILIES[family].floating
  const canFloat = floatable.includes(prefs.style)
  const floatingStyles = copy.styles.filter((option) => floatable.includes(option.value)).map((option) => option.label)
  const opacity = Math.round(effectiveOpacity(prefs, family) * 100)
  return <RuntimeSheet visible={visible} onClose={onClose} title="游戏表现" getContainer={getContainer}>
    <div className="keypadCurrent" role="status">
      <span>当前键盘</span>
      <strong>{prefs.visible ? current.label : `${current.label}（已隐藏）`}</strong>
      <small>{current.description} · {copy.scope}</small>
    </div>
    <Section title="键盘">
      <div className="runtimeSheetSwitch">
        <span>显示键盘<small>顶栏的键盘按钮也可以随时显示或隐藏</small></span>
        <Switch checked={prefs.visible} onChange={(value) => update({ visible: value })} aria-label="显示键盘" />
      </div>
      {copy.styles.length > 1 && <Field label="键盘样式">
        <Selector columns={2} options={copy.styles} value={[prefs.style]} onChange={pick(update, 'style')} />
      </Field>}
      <Field label="布局方向" hint={runtime === 'j2me' ? '游戏设置里的「屏幕方向」不是「跟随设备」时，以游戏设置为准' : ''}>
        <Selector columns={3} options={LAYOUT_OPTIONS} value={[prefs.layout]} onChange={pick(update, 'layout')} />
      </Field>
      <Field label="键盘位置" hint={canFloat ? '' : `仅${floatingStyles.join('、')}可浮空`}>
        <Selector
          columns={2}
          options={PLACEMENT_OPTIONS.map((option) => ({ ...option, disabled: !canFloat && option.value === 'floating' }))}
          value={[effectivePlacement(prefs, family)]}
          onChange={pick(update, 'placement')}
        />
      </Field>
      <Field label="透明度" hint={prefs.opacity === 'auto' ? `当前 ${opacity}%：嵌入不透明，浮空半透明` : ''}>
        <Selector columns={5} options={OPACITY_OPTIONS} value={[prefs.opacity]} onChange={pick(update, 'opacity')} />
      </Field>
    </Section>
    <Section title="画面">
      <Field label="画面缩放">
        <Selector columns={3} options={FIT_OPTIONS} value={[prefs.fit]} onChange={pick(update, 'fit')} />
      </Field>
    </Section>
    <Section title={family === 'flash' ? '本游戏按键' : '按键说明'}>
      {family === 'flash' && game ? <FlashKeysFields game={game} /> : <dl className="keypadLegend">
        {copy.keys.map(([name, meaning]) => <div key={name}><dt>{name}</dt><dd>{meaning}</dd></div>)}
      </dl>}
    </Section>
  </RuntimeSheet>
}
