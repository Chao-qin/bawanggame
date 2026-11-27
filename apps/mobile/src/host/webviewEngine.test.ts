import { MIN_WEBVIEW_CHROME, openWebViewUpdate, outdatedWebViewVersion } from './webviewEngine'

const webView = (major: number) => `Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${major}.0.4280.141 Mobile Safari/537.36`

describe('outdatedWebViewVersion', () => {
  it('reports a WebView below the minimum Chrome version', () => {
    expect(outdatedWebViewVersion(webView(MIN_WEBVIEW_CHROME - 1))).toBe(MIN_WEBVIEW_CHROME - 1)
  })

  it('accepts the minimum version and newer ones', () => {
    expect(outdatedWebViewVersion(webView(MIN_WEBVIEW_CHROME))).toBeNull()
    expect(outdatedWebViewVersion(webView(142))).toBeNull()
  })

  it('does not warn when the user agent is missing or not Chromium-based', () => {
    expect(outdatedWebViewVersion(undefined)).toBeNull()
    expect(outdatedWebViewVersion('Mozilla/5.0 (Android 10; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0')).toBeNull()
  })
})

describe('openWebViewUpdate', () => {
  it('falls back to the web store page when no app handles market links', async () => {
    const opened: string[] = []
    const linking = { openURL: async (url: string) => { opened.push(url); if (url.startsWith('market:')) throw new Error('no handler') } }
    await expect(openWebViewUpdate(linking)).resolves.toBe(true)
    expect(opened).toEqual(['market://details?id=com.google.android.webview', 'https://play.google.com/store/apps/details?id=com.google.android.webview'])
  })

  it('reports failure when nothing can open either link', async () => {
    await expect(openWebViewUpdate({ openURL: async () => { throw new Error('no handler') } })).resolves.toBe(false)
  })
})
