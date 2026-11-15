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
pnpm mobile:build-android
pnpm --filter @xiaochao/mobile ios
pnpm mobile:typecheck
pnpm mobile:verify-web
```

`mobile:prepare-web` 会执行根项目的 Web build 和 `pack-site.sh`，生成 `apps/mobile/web`。这个目录是生成物，不能手工编辑；下一次准备资源会完整覆盖它。

`mobile:build-android` 会准备 Web 资源并生成可独立运行的 release APK：
`apps/mobile/android/app/build/outputs/apk/release/app-release.apk`。
这个包内置 React Native bundle 和 `assets/web`，安装后不需要启动 Metro。
开发调试仍使用 `pnpm --filter @xiaochao/mobile android`，该命令依赖 Metro。

需要让 APK 使用 52java 商城时，构建前设置 Node 服务的可访问地址：

```bash
MOBILE_52JAVA_API_BASE=http://192.168.0.100:8080 pnpm mobile:build-android
```

手机和 Node 服务必须在同一局域网；正式环境应使用 HTTPS 公网地址。未设置该变量时，APK 仍可离线运行内置游戏，商城会显示未配置提示。

发布包的 J2ME 游戏清单由构建时生成的 `web/jar-manifest.json` 提供，内置 JAR 不需要桌面 Node 服务。
52java 商城是在线目录，安装包中会明确显示离线提示；“大宋豪侠 · 本地复活”仍需要单独运行 `dasong-server`。

Flash 商城不把用户游戏上传到服务器。通过商城 URL 或本地文件加入的 SWF 保存在当前浏览器/WebView 的 IndexedDB 中，Flash 库可在离线时继续启动；远程 URL 需要目标站点允许浏览器 CORS 读取。

## 宿主行为

- WebView 只加载应用内置的 `127.0.0.1` 本地资源服务，不依赖远程 Web 首页；这个地址是应用内回环桥接，不是远端服务器。
- Android 首次启动会把 APK assets 中的 Web 目录复制到应用私有目录；资源版本变化时重新复制。
- Android 返回键先交给 Web 页面。游戏路由会触发现有退出确认，回到大厅后再允许退出宿主。
- Web 页面、J2ME/MRP 运行时和全屏/旋转设置仍由现有 React 应用负责。
- 本地静态服务只绑定回环地址，卸载 RN 宿主时停止。

## 仿真 App Shell 规范

- 竖屏是大厅和列表的默认方向：顶部品牌栏、分类页签、搜索/操作行和游戏网格保持稳定，不使用大面积营销式 Hero、渐变装饰或卡片套卡片。
- 运行页在竖屏使用安全区下方的固定控制栏，在横屏让游戏舞台占满可用区域；横屏控制收缩到左上角，舞台为控制按钮预留空间，不覆盖游戏画面。
- 加载、运行、错误和退出确认都在同一个固定舞台内分层显示，状态切换不能改变舞台尺寸。
- Flash/Ruffle 和本地复活运行时退出时只清理当前会话并返回列表，不刷新整个 WebView；J2ME 和冒泡 MRP 仍使用受控刷新隔离旧 VM 全局状态。
- Android 返回键、浏览器返回和运行页顶部返回按钮使用同一套退出确认流程；列表页的 Android 返回键才交给宿主退出应用。

