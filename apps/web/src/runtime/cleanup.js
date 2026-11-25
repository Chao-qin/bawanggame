const RUNTIME_NODE_IDS = ['fps-hud', 'screen-hint', 'text-diag', 'drawlog-btn']

export function cleanupRuntimeArtifacts() {
  try { window.KeypadCanvas?.destroy?.() } catch (_) {}
  try { window.__XIAOCHAO_RUNTIME_EXTRAS_CLEANUP__?.() } catch (_) {}
  try { window.__XIAOCHAO_TOUCH_LAYOUT_RESET__?.() } catch (_) {}
  try { window.__XIAOCHAO_KEYMAP_RESET__?.() } catch (_) {}
  try { window.__XIAOCHAO_INPUT_RESET__?.() } catch (_) {}
  delete window.__XIAOCHAO_TOUCH_LAYOUT_ADAPTER__

  RUNTIME_NODE_IDS.forEach((id) => document.getElementById(id)?.remove())
  document.querySelectorAll('.screen-hint').forEach((node) => node.remove())

  // These globals are initialized by cached classic scripts and are reused by
  // the next J2ME session. Hide them between sessions without destroying them.
  const gear = document.getElementById('gear')
  if (gear) gear.style.setProperty('display', 'none', 'important')
  document.getElementById('panel')?.setAttribute('hidden', '')
  document.getElementById('btroom')?.setAttribute('hidden', '')
  document.getElementById('fb-toast')?.setAttribute('hidden', '')

  document.querySelectorAll('link[data-runtime-style]').forEach((node) => node.remove())
  document.querySelectorAll('script[data-runtime-session], link[data-runtime-session]').forEach((node) => node.remove())
  const body = document.body
  ;['runtime-active', 'fullscreen-active', 'settings-open', 'fixed-screen'].forEach((name) => body.classList.remove(name))
  ;['theme', 'orientation', 'dpadLayout', 'sideLayout', 'keypadStyle', 'keypadPlacement', 'keypadWide'].forEach((name) => delete body.dataset[name])
}
