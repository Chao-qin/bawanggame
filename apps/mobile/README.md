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

推送 `v*` 格式的 Git tag（例如 `v1.2.0`）会触发 GitHub Actions：构建已签名 APK、验证签名，并将 `xiaochao-bawang-v1.2.0.apk` 附加到同名 GitHub Release。首次启用前，在仓库 **Settings → Secrets and variables → Actions** 添加以下 secrets：

- `ANDROID_KEYSTORE_BASE64`：Release `.keystore` / `.jks` 文件的 base64 内容
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

可用 `base64 <release.keystore`（macOS 可用 `base64 -i release.keystore`）生成 base64 内容。签名密钥只保存在 GitHub Actions secrets 中，不要提交到仓库。工作流从 tag 设置 Android `versionName`，并用 GitHub Actions run number 设置递增的 `versionCode`。

52java 商城与 Flash 商城（Flash 保存计划）在安装包中开箱即用：页面的商城请求由 RN 宿主直接访问 52emu / flash.homes（原生请求不受 CORS 限制，见 `src/host/onlineProxy.ts`），下载的 JAR / SWF 先写入本地静态目录 `__downloads/`，再由页面读入本机库；该目录在每次启动时清空。页面与桌面 Node 代理共用同一套页面解析（`apps/server/src/javaCatalog.ts`、`flashCatalog.ts`）。

如需改用自建的 Node 服务，可在构建时设置（可选）：

```bash
MOBILE_52JAVA_API_BASE=https://your-server.example pnpm mobile:build-android
```

发布包的 J2ME 游戏清单由构建时生成的 `web/jar-manifest.json` 提供，内置 JAR 的图标同时导出到 `web/jar-icons/`，不需要桌面 Node 服务。
冒泡社区列出全部 664 款游戏：兼容扫描确认能运行的 32 款打进安装包、可离线游玩；其余标记「需联网」，启动时从 vmrp.github.io 公共镜像加载。“大宋豪侠 · 本地复活”仍需要单独运行 `dasong-server`。

「屏幕方向」选择横屏或竖屏时，宿主通过原生模块 `XiaochaoOrientation`（`android/.../XiaochaoOrientationModule.kt`）旋转整个 Activity；选择「跟随手机」时交还给重力感应。

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

