# 冒泡运行时性能修复设计

## 背景

冒泡 MRP 内核在移动 WebView 中使用 Canvas 2D 接收 WASM 的像素帧。当前运行时直接让 Emscripten 首次创建普通 2D 上下文，并保留大量启动日志输出。移动设备上这会增加 Canvas 合成等待和 JS 主线程工作，表现为游戏画面卡顿。

## 目标

- 降低冒泡 Canvas 帧提交对移动 WebView 主线程和合成器的阻塞。
- 发布运行时默认不输出内核日志，避免无用的控制台工作。
- 保留桌面浏览器、旧 WebView 和调试场景的兼容性。
- 不改变 MRP 游戏逻辑、输入映射、画布内部分辨率和全屏布局。

## 方案

在 `runtime/mrp/mrp-runtime.js` 中，在加载 WASM 前尝试预创建 Canvas 2D 上下文，使用 `alpha: false` 和 `desynchronized: true`，并关闭像素画布的平滑插值。Emscripten 随后取得同一个上下文；如果浏览器忽略这些选项，仍回退到普通 2D 上下文，不阻止游戏启动。

运行时日志通过 URL 查询参数 `mrpDebug=1` 显式开启。默认把 `Module.print` 和 `Module.printErr` 设为空函数；开启调试时恢复到 `console.log` 和 `console.error`，方便定位兼容性问题。

## 验证

- 运行 Web 构建和 TypeScript 检查。
- 启动 Node 网页服务，直接打开一个 MRP 游戏，确认 `Module`、Canvas 尺寸、输入键盘和退出流程正常。
- 用 Chrome CDP 记录 5 秒帧间隔，比较修改前后平均帧间隔和超过 33ms 的帧数。
- 检查普通桌面浏览器和 RN 静态 Web 资源都能加载运行时脚本。

## 风险与回退

部分旧浏览器可能不认识 Canvas 上下文选项，但标准 `getContext('2d')` 会正常返回；代码捕获异常并继续启动。调试日志可通过 `?mrpDebug=1` 恢复，不需要修改发布包代码。
