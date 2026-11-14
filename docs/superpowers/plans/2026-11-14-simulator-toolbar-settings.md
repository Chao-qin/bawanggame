# 模拟器工具栏与设置面板修复 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让模拟器设置入口稳定可用、设置面板可滚动，并避免顶部工具栏遮挡游戏画面。

**Architecture:** React 播放器等待 J2ME 脚本初始化后再暴露设置入口，并控制固定工具栏高度与模拟器阶段的顶部空间。运行时 CSS 为手机面板提供明确的可视高度和纵向滚动容器。

**Tech Stack:** React 18、UnoCSS、原生模拟器 CSS/JavaScript。

---

## Chunk 1: 工具栏与面板行为

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/runtime/J2MEPlayer.jsx`
- Modify: `apps/web/src/runtime/cleanup.js`
- Modify: `apps/web/uno.config.js`
- Modify: `runtime/j2me/panel.js`
- Modify: `runtime/j2me/style/main.css`

- [ ] 等待 J2ME 初始化完成且设置节点存在后才启用顶部设置按钮，并保证按钮调用现有面板切换事件。
- [ ] 为播放器阶段预留工具栏的实际高度和安全区，不再让工具栏覆盖模拟器内容。
- [ ] 打开面板时仅为设置层恢复纵向触摸滚动，并在关闭面板或退出运行时清除状态。
- [ ] 限定手机设置面板在扣除安全区后的可视窗口内，确保内容区域可纵向触摸滚动。
- [ ] 运行时检查：初始化前设置不可点击、初始化后单击可开关；手机竖屏画面不被工具栏覆盖且面板可滚动到底；桌面和横屏布局仍可操作。
- [ ] 检查 `git diff --check` 与前端生产构建。
- [ ] 提交修复并通过 GitHub MCP 创建、验证单个 PR。
