import { AddCircleOutline } from 'antd-mobile-icons'
import { Button, Popup } from 'antd-mobile'
import { useEffect, useState } from 'react'
import { isEmbeddedHost } from '../online.js'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function InstallShortcutButton() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [messageVisible, setMessageVisible] = useState(false)
  const [standalone, setStandalone] = useState(() => isStandalone())

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const handleInstalled = () => {
      setInstallPrompt(null)
      setStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  async function install() {
    if (installPrompt) {
      installPrompt.prompt()
      await installPrompt.userChoice
      setInstallPrompt(null)
      return
    }
    setMessageVisible(true)
  }

  if (standalone) return null

  const message = isEmbeddedHost()
    ? '当前已经在应用中运行。请在手机浏览器打开本站，再使用浏览器菜单中的“添加到主屏幕”创建桌面快捷方式。'
    : '请打开浏览器菜单，选择“添加到主屏幕”或“安装应用”，即可在桌面创建快捷方式。'

  return (
    <>
      <Button className="headerAction installShortcut" fill="none" onClick={install} aria-label="添加到桌面">
        <AddCircleOutline /><span>桌面</span>
      </Button>
      <Popup visible={messageVisible} onMaskClick={() => setMessageVisible(false)} onClose={() => setMessageVisible(false)} position="bottom">
        <div className="installShortcutMessage">
          <strong>添加到桌面</strong>
          <p>{message}</p>
          <Button color="primary" block onClick={() => setMessageVisible(false)}>知道了</Button>
        </div>
      </Popup>
    </>
  )
}
