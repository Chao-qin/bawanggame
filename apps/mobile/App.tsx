import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, BackHandler, Linking, NativeModules, Platform, Pressable, StatusBar, Text, View, Vibration } from 'react-native'
import { WebView } from 'react-native-webview'
import type { WebViewErrorEvent, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview/lib/WebViewTypes'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as RNFS from 'react-native-fs'
import { blobToBase64, onlineFiles, startAssetServer, stopAssetServer, webRoot } from './src/host/assetServer'
import { injectedBridge, parseHostMessage, resolveRequestScript, type HostCapability } from './src/host/protocol'
import { loadDeviceId } from './src/host/deviceId'
import { dispatchHapticMessage } from './src/host/haptics'
import { handleOnlineRequest, type OnlineResult } from './src/host/onlineProxy'
import { dispatchOrientationMessage } from './src/host/orientation'
import { styles } from './src/host/styles'

const MAX_START_ATTEMPTS = 2
const BrowserView = WebView as any
// Downloads are written into the served web root, which only Android copies to writable storage (assetServer.ts);
// rotation needs the native module.
const hostCapabilities: HostCapability[] = [
  ...(Platform.OS === 'android' ? ['online.fetch' as const] : []),
  ...(NativeModules.XiaochaoOrientation ? ['orientation.lock' as const] : []),
]
const deviceIdReady = loadDeviceId(RNFS, `${RNFS.DocumentDirectoryPath}/device-id`)

function AppContent() {
  const webViewRef = useRef<any>(null)
  const insets = useSafeAreaInsets()
  const [origin, setOrigin] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [bridgeScript, setBridgeScript] = useState(() => injectedBridge(hostCapabilities))

  const start = useCallback(async () => {
    setError('')
    setOrigin(null)
    try {
      const [nextOrigin, deviceId] = await Promise.all([startAssetServer(), deviceIdReady])
      setBridgeScript(injectedBridge(hostCapabilities, { deviceId, platform: Platform.OS }))
      setOrigin(`${nextOrigin}/?host=rn`)
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : String(startError))
    }
  }, [])

  useEffect(() => {
    start().catch(() => {})
    return () => { stopAssetServer().catch(() => {}) }
  }, [start])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') webViewRef.current?.injectJavaScript("window.__XIAOCHAO_RN_HOST__?.send('network.state', {active:true}); true;")
      // The page counts play time only while the app is in front (web analytics.js); a backgrounded WebView may keep the page visible.
      if (state === 'active' || state === 'background') webViewRef.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('xiaochao:hostactive', { detail: ${state === 'active'} })); true;`)
    })
    return () => subscription.remove()
  }, [origin])

  const syncInsets = useCallback(() => {
    if (!webViewRef.current) return
    const payload = JSON.stringify({
      version: 1,
      top: insets.top,
      right: insets.right,
      bottom: insets.bottom,
      left: insets.left,
    })
    webViewRef.current.injectJavaScript(`window.__XIAOCHAO_RN_HOST__?.setInsets(${payload}); true;`)
  }, [insets.top, insets.right, insets.bottom, insets.left])

  useEffect(() => {
    if (origin) syncInsets()
  }, [origin, syncInsets])

  const handleBack = useCallback(() => {
    if (!webViewRef.current) return false
    webViewRef.current.injectJavaScript('window.__XIAOCHAO_NATIVE_BACK__?.(); true;')
    return true
  }, [])

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack)
    return () => subscription.remove()
  }, [handleBack])

  const handleMessage = (event: WebViewMessageEvent) => {
    const message = parseHostMessage(event.nativeEvent.data)
    if (!message) return
    if (message.type === 'haptic') {
      dispatchHapticMessage(message, Vibration)
      return
    }
    if (dispatchOrientationMessage(message, NativeModules.XiaochaoOrientation)) return
    if (message.type === 'online.fetch' && message.id) {
      const id = message.id
      const reply = (result: OnlineResult) => webViewRef.current?.injectJavaScript(resolveRequestScript(id, result))
      const path = (message.payload as { path?: unknown } | undefined)?.path
      const root = webRoot()
      if (typeof path !== 'string' || !root) {
        reply({ status: 503, body: { error: 'host_not_ready' } })
        return
      }
      handleOnlineRequest(path, { fetch, files: onlineFiles, webRoot: root, blobToBase64 })
        .then(reply, (cause: unknown) => reply({ status: 502, body: { error: String(cause) } }))
      return
    }
    if (message.type === 'navigation.back' && typeof message.payload === 'object' && message.payload !== null && 'handled' in message.payload && message.payload.handled === false) {
      BackHandler.exitApp()
    }
  }

  const handleWebError = (_event: WebViewErrorEvent) => {
    if (attempt + 1 < MAX_START_ATTEMPTS) {
      setAttempt((value) => value + 1)
      start().catch(() => {})
    } else {
      setError('模拟器页面加载失败，请重试。')
    }
  }

  const handleNavigation = (_state: WebViewNavigation) => {
    // The bundled page is the only allowed origin; game links stay in the WebView.
  }

  // An external page (e.g. the 52java 「打开原站」 link) opens in the system browser instead of replacing the app.
  const handleShouldStartLoad = (request: { url: string }) => {
    if (!/^https?:\/\//i.test(request.url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(request.url)) return true
    Linking.openURL(request.url).catch(() => {})
    return false
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.root}>
          {origin && !error ? (
            <BrowserView
              ref={webViewRef}
              source={{ uri: origin }}
              style={styles.webView}
              originWhitelist={['http://localhost:*', 'http://127.0.0.1:*']}
              javaScriptEnabled
              domStorageEnabled
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              allowsFullscreenVideo
              mixedContentMode="always"
              setSupportMultipleWindows={false}
              injectedJavaScriptBeforeContentLoaded={bridgeScript}
              onMessage={handleMessage}
              onError={handleWebError}
              onNavigationStateChange={handleNavigation}
              onShouldStartLoadWithRequest={handleShouldStartLoad}
              onLoadEnd={() => { syncInsets(); setAttempt(0) }}
            />
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.title}>模拟器启动失败</Text>
              <Text style={styles.message}>{error}</Text>
              <Pressable style={styles.action} onPress={() => { setAttempt(0); start().catch(() => {}) }}>
                <Text style={styles.actionText}>重试</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.title}>正在启动小潮霸王</Text>
              <Text style={styles.message}>正在准备内置模拟器资源…</Text>
            </View>
          )}
        </View>
    </SafeAreaView>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  )
}
