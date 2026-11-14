# RN WebView 宿主设计

## 目标

新增一个 Android/iOS React Native 宿主应用。宿主在构建时打包现有 React 模拟器及其完整运行时资源，启动后通过内置本地 HTTP 服务提供资源，再由 WebView 加载本地首页。现有 Web 站点继续可以独立部署和运行。

## 范围

- 新增 `apps/mobile` RN TypeScript 工程。
- 使用 `react-native-webview` 承载 React 大厅、J2ME/MRP 运行时和游戏资源。
- 使用 `react-native-static-server` 在应用内以 `127.0.0.1` 提供 `site-deploy`。
- 构建前自动执行 Web build/pack，并把完整静态目录同步到移动端资源目录。
- RN 处理启动加载、错误重试、前后台生命周期、Android 返回键和系统状态栏。
- Web 页面继续负责游戏路由、退出确认、运行时设置和输入。

不在本次范围内：原生重写游戏页面、账号/支付、远程热更新、原生文件选择器和跨端存档桥接。

## 架构

```text
apps/mobile
  RN App
    StaticServer -> bundled site-deploy/
    WebView -> http://127.0.0.1:<port>/

apps/web + runtime + games
  pnpm build -> public/
  ./pack-site.sh -> site-deploy/
  mobile:prepare-web -> apps/mobile/web/
```

本地 HTTP 服务是资源边界。这样 Web 端现有的 `/style`、`/config`、`/bld`、`/jar`、`/maopao` 和 API 路径在移动端仍然使用同一套 URL，不需要为 `file://`、Android asset URL 和 iOS bundle URL 写三套运行时逻辑。服务只绑定回环地址，WebView 关闭网络访问时仍能读取内置资源；商城等现有远程接口按 Web 端当前行为继续请求网络。

## RN 生命周期与返回行为

1. `App` 启动时显示加载界面。
2. 启动本地静态服务，拿到随机端口后设置 WebView URL。
3. WebView 加载完成后隐藏加载界面；加载失败显示错误信息和“重试”。
4. Android BackHandler 先通过 `webView.goBack()` 处理 WebView 自身历史；没有历史时向页面派发 `navigation.back` 事件。游戏页沿用现有退出确认，确认退出后回到大厅；大厅无历史时退出宿主应用。
5. 应用进入后台时保留 WebView 和本地服务，恢复前台后重新检查服务状态。
6. 卸载宿主组件时停止服务，避免端口和线程泄漏。

## 资源同步

`mobile:prepare-web` 在 `apps/mobile/web` 下生成可审查的资源目录：先运行根项目 `pnpm build`，再运行 `pnpm pack`，最后复制 `site-deploy`。目录由构建任务生成，不手工维护；RN 原生工程把该目录作为 Android assets 与 iOS bundle resource。构建校验必须确认 `index.html`、React assets、J2ME runtime、JAR 目录、MRP runtime 和 manifest 均存在。

## 原生配置

- Android 使用 `react-native-webview` 的 DOM storage、JavaScript、媒体播放、混合内容和回退手势配置；状态栏与导航栏颜色使用应用深色背景。
- iOS 使用 WKWebView 的内联媒体播放和 DOM storage 配置。
- RN 工程默认不锁死横竖屏，具体游戏旋转仍由 Web 运行时处理；宿主只提供全屏安全区域和生命周期承载。
- Android 返回键和 WebView 消息桥接通过明确的 `navigation.back` JSON 消息处理，页面未注入桥接时保持纯 Web 行为。

## 失败处理

- 静态服务启动失败：显示错误页，提供重试按钮和诊断文本。
- WebView 加载失败：停止当前服务后重新启动一次；仍失败则显示错误页。
- 资源目录不完整：构建脚本在打包前失败，不生成可发布的移动端资源。
- RN bridge 不可用：Web 页面不依赖 bridge，继续使用浏览器的返回和全屏回退行为。

## 验收标准

- `pnpm mobile:prepare-web` 能生成完整移动端 Web 资源。
- `apps/mobile` 能通过 Metro 启动，WebView 加载 `127.0.0.1` 本地首页。
- Android/iOS 原生工程能完成依赖安装和 debug 构建配置检查。
- WebView 内能打开大厅、启动已有游戏并执行现有退出确认流程。
- Android 返回键、WebView 历史和大厅退出行为符合上述顺序。
- 静态服务在组件卸载后停止，错误页和重试逻辑可用。

