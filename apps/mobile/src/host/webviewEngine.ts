// Policy floor, not a hard build limit: the modern bundle is ES2020 (Chrome 80+) and its polyfills cover only the latest
// two browser versions (apps/web/vite.config.js), so engines below 87 are likely to miss APIs the page uses.
export const MIN_WEBVIEW_CHROME = 87

export const WEBVIEW_UPDATE_URLS = [
  'market://details?id=com.google.android.webview',
  'https://play.google.com/store/apps/details?id=com.google.android.webview',
] as const

/** The WebView's Chrome major version when it is below MIN_WEBVIEW_CHROME; null when it is recent or unknown. */
export function outdatedWebViewVersion(userAgent: unknown): number | null {
  const match = /\bChrome\/(\d+)\./.exec(typeof userAgent === 'string' ? userAgent : '')
  if (!match) return null
  const major = Number(match[1])
  return major < MIN_WEBVIEW_CHROME ? major : null
}

/** Opens the first store page the device can handle; vendor app stores answer market:// links too. */
export async function openWebViewUpdate(linking: { openURL(url: string): Promise<unknown> }) {
  for (const url of WEBVIEW_UPDATE_URLS) {
    try {
      await linking.openURL(url)
      return true
    } catch {}
  }
  return false
}
