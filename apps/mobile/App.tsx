import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, BackHandler, Pressable, StatusBar, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import type { WebViewErrorEvent, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview/lib/WebViewTypes'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { startAssetServer, stopAssetServer } from './src/host/assetServer'
import { injectedBridge, parseHostMessage } from './src/host/protocol'
import { styles } from './src/host/styles'

const MAX_START_ATTEMPTS = 2
const BrowserView = WebView as any

export default function App() {
  const webViewRef = useRef<any>(null)
  const [origin, setOrigin] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const start = useCallback(async () => {
    setError('')
    setOrigin(null)
    try {
      const nextOrigin = await startAssetServer()
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
    })
    return () => subscription.remove()
  }, [origin])

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

  return (
    <SafeAreaProvider>
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
            injectedJavaScriptBeforeContentLoaded={injectedBridge}
            onMessage={handleMessage}
            onError={handleWebError}
            onNavigationStateChange={handleNavigation}
            onLoadEnd={() => setAttempt(0)}
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
    </SafeAreaProvider>
  )
}
