// The J2ME and MRP runtimes are classic scripts that define non-configurable globals and move DOM nodes once
// (bld/j2me.js defines CLASSES, bld/main-all.js detaches #splash-screen): they cannot run twice in one document.
// Each game gets its own runtime frame, so one boot per document is the whole contract; a second attempt is
// refused loudly instead of re-executing them into a half-broken VM.
let booted = ''

export function claimRuntimeDocument(kind) {
  if (booted) return false
  booted = kind
  return true
}

export const RUNTIME_ALREADY_BOOTED = '模拟器已在本页面启动过，请返回大厅后重新进入游戏'
