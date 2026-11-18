# Mobile Web UI Implementation Plan

**Goal:** 让小潮霸王的移动浏览器和 WebView 共用新版触控界面。

**Architecture:** 通过 Ant Design Mobile 组件和应用主题更新 React 表现层，沿用当前路由、存储及播放器生命周期。

**Tech Stack:** React 18、Ant Design Mobile 5、Vite、UnoCSS、React Native WebView。

## Chunk 1: UI and validation

- [ ] 锁定组件库版本，在 `apps/web/src/main.jsx` 接入中文配置和主题。
- [ ] 更新 `apps/web/src/App.jsx` 的导航、搜索、商城、游戏选项和播放器控制，覆盖文件选择和离线状态。
- [ ] 在 `apps/web/src/mobile-ui.css` 定义响应式视觉、安全区、键盘与全屏相关样式。
- [ ] 运行 `pnpm build`、现有 Web 冒烟流程和服务端测试。
- [ ] 验证 Android 资源、APK 安装和启动。汇总验证结果与独立审查状态。
