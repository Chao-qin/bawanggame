# 小潮霸王现代化整合设计

## 目标

将小潮霸王整理为一个 pnpm workspace 项目：React 是唯一 Web/PWA 主应用，Node.js/TypeScript 是唯一服务端入口，保留 J2ME 与 MRP 模拟器的运行时兼容能力，移除 Python 启动入口和旧 `/app` 路径。

## 结构

```text
xiaochao-bawang/
├── apps/web/       React + Vite PWA
├── apps/server/    Node.js + TypeScript HTTP/WebSocket 服务
├── runtime/        J2ME/MRP 静态运行时资源
├── games/jar/      本地 JAR 游戏
├── packages/shared 共享类型（按需）
├── public/         Web 构建输出
├── pnpm-workspace.yaml
└── package.json
```

第一阶段允许运行时文件保持兼容位置，通过服务端 URL 映射提供 `/bld`、`/jar`、`/React 播放器`、`/React 冒泡播放器` 等路径；确认功能稳定后再移动源码，避免一次性破坏模拟器相对路径。

## 服务端

Node 服务实现现有 `server.py` 的公开行为：静态文件、`/__jars`、`/__icon`、`/__proxy`、`/__bt`，以及 WebSocket 帧解析、J2ME TCP 代理和蓝牙房间。使用 Node 原生 HTTP/网络模块与 `ws`，不改变浏览器端协议。

## 构建与命令

根目录统一提供：

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
pnpm test
```

React 构建输出到根 `public/`，PWA 的 manifest、图标、Service Worker 全部使用根路径；不再生成或引用 `/app`。

## 兼容与验证

- J2ME 游戏列表、图标读取、`React 播放器` 加载必须正常。
- MRP 大厅和 `React 冒泡播放器` 必须正常。
- WebSocket 代理和蓝牙握手端点必须返回预期协议响应。
- Node 服务启动后根页面、manifest、Service Worker、JAR API 做 HTTP smoke test。
- 旧 Python 文件在 Node 通过验证后删除。
