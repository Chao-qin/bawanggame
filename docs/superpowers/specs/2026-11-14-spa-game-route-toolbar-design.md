# SPA Game Route and Runtime Toolbar Design

**Goal:** 将游戏页变成可恢复的 hash SPA 路由，统一运行时顶部控制，并让浏览器原生返回在游戏中先确认退出。

## Architecture

- 使用 hash 路由保存大厅 tab 和当前游戏：`#/library/<tab>`、`#/play/<kind>/<encoded-file>`。刷新时从 hash 恢复，避免服务端为每条路径配置回退。
- `App` 负责解析和写入路由，播放器负责运行时生命周期。进入游戏用 `pushState`，原生返回由 `popstate` 拦截；游戏确认退出后再提交大厅路由。
- `Player` 提供唯一一条固定顶部栏，包含返回、标题、设置、固定宽度/高度和全屏。旧运行时状态条和 gear 不再占据可见布局；设置按钮通过兼容桥触发 legacy `#gear`。

## Behavior

- 游戏路由可直接刷新并重新加载对应游戏。
- 返回按钮、浏览器返回、Android/WebView 原生返回复用同一个退出确认框。
- 取消确认会恢复游戏 hash 和运行状态；确认后停止运行时、退出全屏并回到大厅。
- 顶部栏拥有独立安全区和层级，不随旋转舞台移动，不被 canvas、键盘或 legacy 面板覆盖。

## Validation

- 构建通过。
- 手动验证游戏路由刷新、浏览器返回确认、取消/确认退出，以及竖屏、横屏、全屏下顶部控制可点击。
