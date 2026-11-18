# 小潮霸王现代化整合 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** 用 pnpm、React PWA 和 Node.js 服务端统一小潮霸王模拟器项目。

**Architecture:** React/Vite 是唯一前端应用；Node/TypeScript 提供静态文件、JAR API、WebSocket 蓝牙和 TCP 代理；运行时 URL 先保持兼容，再逐步归档源码。

**Tech Stack:** pnpm workspace、React 18、Vite 5、TypeScript、Node.js、ws、Vitest。

---

### Task 1: 建立 pnpm workspace

**Files:** `package.json`, `pnpm-workspace.yaml`, `apps/web/package.json`, `pnpm-lock.yaml`

- [ ] 创建 workspace 配置和根脚本。
- [ ] 将现有 `ui` 作为 `apps/web` workspace（不复制 node_modules）。
- [ ] 删除 npm lockfile，生成 pnpm lockfile。
- [ ] 验证 `pnpm install` 与 `pnpm --filter @xiaochao/web build`。

### Task 2: 修复 React PWA 根路径

**Files:** `apps/web/index.html`, `apps/web/src/main.jsx`, `apps/web/public/manifest.webmanifest`, `apps/web/vite.config.js`

- [ ] 删除 `/app` manifest、图标和 URL 引用。
- [ ] 构建输出统一到根 `public/`。
- [ ] 保留模拟器运行页的根路径兼容。
- [ ] 验证根页面、manifest、icons、SW。

### Task 3: 创建 Node 服务端

**Files:** `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/src/index.ts`, `apps/server/src/static.ts`, `apps/server/src/jars.ts`

- [ ] 实现静态文件服务和安全路径解析。
- [ ] 实现 `/__jars`、`/__icon`。
- [ ] 使用 `ws` 实现 WebSocket 升级和帧读写。
- [ ] 实现 `/__proxy` TCP/TLS 桥接。
- [ ] 实现 `/__bt` 房间控制与二进制转发。

### Task 4: 接入根命令与部署

**Files:** `package.json`, `apps/server/src/config.ts`, `Dockerfile`, `README.md`

- [ ] 统一 `pnpm dev/build/start/test`。
- [ ] Node 服务监听 8080，静态根目录指向构建输出和模拟器资源。
- [ ] 更新 Docker/部署文档。
- [ ] 删除 Python 启动引用。

### Task 5: 回归验证与清理

- [ ] HTTP smoke test：`/`、manifest、SW、`/__jars`、`React 播放器`、`React 冒泡播放器`。
- [ ] React 构建和 Node 类型检查通过。
- [ ] 浏览器验证 J2ME/MRP 卡片与播放器 React 播放器。
- [ ] 删除 `server.py`、npm lockfile、旧 `app` 入口和无关残留。
