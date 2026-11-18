# 移动 Web 界面重构

## 选型

2026-11-19 通过 npm latest 与近七天下载接口核对。下载量反映包的采用度，仅用于候选对照。

| 候选 | 最新版 | 近七天下载 | 项目适配 |
| --- | --- | ---: | --- |
| [Ionic React](https://ionicframework.com/docs/react/quickstart) | 9.0.12 | 163,257 | 移动组件齐全。需验证 Web Components 弹层和现有全屏播放器的组合 |
| [Ant Design Mobile](https://mobile.ant.design/) | 5.43.0 | 97,888 | 直接支持 React 18，有移动搜索、输入、弹层和反馈组件 |
| [Konsta UI](https://konstaui.com/react/installation) | 5.5.0 | 21,072 | 原生风格新鲜，需引入 Tailwind v4 |
| [Framework7 React](https://framework7.io/react/) | 9.3.0 | 16,210 | 提供完整应用框架和路由 |
| [Vant](https://vant-ui.github.io/vant/) | 4.10.2 | 115,882 | 官方主包面向 Vue 3 |

采用 Ant Design Mobile 5.43.0。用深蓝灰表面、青绿色主操作、原有游戏图标和清晰的触控布局建立视觉层级。移动端用固定底部导航，桌面用顶部导航。

## 任务契约

- 目标行为：五个大厅入口、商城、弹层和播放器工具栏使用统一的移动 Web 组件与主题。
- 修改范围：React UI、应用主题、对应浏览器冒烟用例。Web 与 React Native WebView 共用 Web 产物。
- 行为约束：保留 URL、返回逻辑、JAR 和 SWF 导入及卸载、商城分类和下载、最近和热门、运行时画布、键盘、全屏和清理生命周期。
- 验收标准：浏览器验证导航、搜索、商城、弹层及各运行时。Android 检查 APK 资源并安装启动。分别报告桌面、移动视口、Android 模拟器与真机覆盖。
