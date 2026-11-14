# 小潮霸王 RN 宿主

这个目录是 Android/iOS React Native 宿主。它不会重写游戏界面，而是在应用构建时把根项目的 React 模拟器和运行时资源复制到 `web/`，启动内置本地 HTTP 服务，再由 WebView 加载本地首页。

## 前置条件

- Node.js 22+
- pnpm 10+
- Android Studio、Android SDK 和可用设备/模拟器
- macOS 上的 Xcode 15+、CocoaPods（iOS）
- `maopao-revival/vendor/vmrp.github.io` 已按仓库文档准备好（冒泡运行时资源不入库）

## 命令

在仓库根目录执行：

```bash
pnpm mobile:prepare-web
pnpm --filter @xiaochao/mobile start
pnpm --filter @xiaochao/mobile android
pnpm --filter @xiaochao/mobile ios
pnpm mobile:typecheck
pnpm mobile:verify-web
```

`mobile:prepare-web` 会执行根项目的 Web build 和 `pack-site.sh`，生成 `apps/mobile/web`。这个目录是生成物，不能手工编辑；下一次准备资源会完整覆盖它。

## 宿主行为

- WebView 只加载应用内置的 `127.0.0.1` 本地资源，不依赖远程 Web 首页。
- Android 首次启动会把 APK assets 中的 Web 目录复制到应用私有目录；资源版本变化时重新复制。
- Android 返回键先交给 Web 页面。游戏路由会触发现有退出确认，回到大厅后再允许退出宿主。
- Web 页面、J2ME/MRP 运行时和全屏/旋转设置仍由现有 React 应用负责。
- 本地静态服务只绑定回环地址，卸载 RN 宿主时停止。

