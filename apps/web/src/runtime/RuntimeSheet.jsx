import { Button, Popup } from 'antd-mobile'

/**
 * The one bottom sheet every in-game panel uses (game settings, keyboard settings, key mapping): same layer, size,
 * header and close behaviour. It renders into the player's overlay root (`getContainer`), which stays visible in
 * fullscreen, and it is the only sheet open at a time — the player keeps one `openSheet` state.
 */
export function RuntimeSheet({ visible, onClose, title, getContainer, children, forceRender = false }) {
  return <Popup
    visible={visible}
    onMaskClick={onClose}
    onClose={onClose}
    closeOnMaskClick
    getContainer={getContainer}
    forceRender={forceRender}
    position="bottom"
    maskClassName="runtimeSheetMask"
    bodyClassName="runtimeSheet"
  >
    <section className="runtimeSheetPanel" role="dialog" aria-modal="true" aria-label={title}>
      <header className="runtimeSheetHeader">
        <strong>{title}</strong>
        <Button size="small" fill="none" onClick={onClose}>关闭</Button>
      </header>
      {children}
    </section>
  </Popup>
}
