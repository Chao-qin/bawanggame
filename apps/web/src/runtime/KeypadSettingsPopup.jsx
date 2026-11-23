import { Button, Popup, Selector } from 'antd-mobile'
import { useKeypadPrefs } from './RuntimeKeypad.jsx'

const STYLE_OPTIONS = [
  { label: 'T9 直板', value: 't9', description: '竖屏方向键在上、数字在下；横屏左方向、右数字' },
  { label: '经典', value: 'classic', description: '原来的圆形方向键，支持自定义触屏键位' },
]
const PLACEMENT_OPTIONS = [
  { label: '嵌入布局', value: 'docked', description: '键盘占用自己的位置，游戏画面不被遮挡' },
  { label: '浮空', value: 'floating', description: '画面放大，半透明键盘浮在上面，会遮住画面下部' },
]

/** Keypad choice for the J2ME and MRP runtimes; saved once for every game. */
export function KeypadSettingsPopup({ visible, onClose }) {
  const [prefs, update] = useKeypadPrefs()
  return <Popup
    visible={visible}
    onMaskClick={onClose}
    onClose={onClose}
    closeOnMaskClick
    destroyOnClose
    position="bottom"
    maskClassName="runtimeSettingsMask"
    bodyClassName="inputMappingSheet"
  >
    <section className="inputMappingPanel" role="dialog" aria-modal="true" aria-label="键盘设置">
      <header className="inputMappingHeader">
        <strong>键盘设置</strong>
        <Button size="small" fill="none" onClick={onClose}>关闭</Button>
      </header>
      <div className="inputMappingStatus">键盘样式</div>
      <Selector columns={2} options={STYLE_OPTIONS} value={[prefs.style]} onChange={([style]) => style && update({ style })} />
      <div className="inputMappingStatus">键盘位置{prefs.style === 't9' ? '' : '（仅 T9 键盘可浮空）'}</div>
      <Selector
        columns={2}
        options={PLACEMENT_OPTIONS.map((option) => ({ ...option, disabled: prefs.style !== 't9' && option.value === 'floating' }))}
        value={[prefs.style === 't9' ? prefs.placement : 'docked']}
        onChange={([placement]) => placement && update({ placement })}
      />
    </section>
  </Popup>
}
