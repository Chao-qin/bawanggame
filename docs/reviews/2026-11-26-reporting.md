# PR78 日志追加验收

基线 `0c1dd54`，交付分支 `feat/babel-polyfill-nestjs`。本次追加包含前端报错、Nest 接收/日志模块、文件持久队列及飞书分类适配。

## 审查与修复

独立冷审均使用 `openai/gpt-6.1-sol`，没有可设置的上下文容量参数。每轮按 diff、feature audit、独立 validation 顺序完成。

| 轮次 | 发现 | 裁决 |
|---|---|---|
| R1 | P2：仅按条数切批，长错误超过 keepalive 与接口字节限制，堵塞队首。 | 已修复：完整 UTF-8 正文按 48 KiB/50 条切批；fetch、beacon 共用规则。 |
| R2 | P2：连续普通 keepalive 请求仍可能耗尽共享配额；JSON 引号凭据、完整 Cookie 的文本脱敏有遗漏。 | 已修复：普通 fetch 不使用 keepalive，退出用 beacon；前后端补完整凭据文本规则及回归断言。 |
| R3 | diff、feature、validation 无新增 finding。 | 本地代码交付范围 pass；真实飞书验收仍被权限阻塞。 |

## 实际验证

- `pnpm typecheck`、`pnpm --filter @xiaochao/server build`：退出 0。
- `pnpm test`：退出 0；后端 31 项、前端与运行时 105 项，共 136 项通过。
- `taskset -c 0-3 pnpm build`：退出 0；保留既有包体积提示。
- 后端覆盖协议校验、真实 Nest 路由、CORS、413、重复事件、磁盘失败 503；文件队列覆盖恢复、分类、部分成功、容量、并发与关闭。
- 独立 Chromium 最终无诊断覆盖：40 条长中文错误断网积压后恢复并清空队列，17 次请求均为 204，最大正文 41042 字节；四类错误、同源 iframe、只记一次 app_open、去除敏感串及三分类落盘通过。
- 不同源页面的简单请求和 JSON 预检请求均通过真实浏览器 CORS 检查。
- Node 22 容器以 uid 1000、只读根文件系统及独立可写队列挂载运行，首页 200、接收 204，实际持久化 12 条记录；临时容器已停止。
- 后端源码依赖检查：26 模块、42 依赖，无违规。软 hook 的 readable-stream 第三方环没有通过修改依赖或 hook 绕过。
- 未修改 `.env*`、锁文件或生成契约；密钥不进入源码。源码和文档按当前差异复核，新增测试已进入根测试入口。

## 链路检查

| 模块 | 输入 | 转换 | 输出 | 结论 |
|---|---|---|---|---|
| 前端 | 使用事件、全局/Promise/资源/路由/已捕获运行时错误 | 身份、脱敏、字节切批、父页汇聚 | v1 上报、本地保留 | 测试与浏览器通过。 |
| 后端 | `/collect` 请求、Nest/HTTP 日志 | 校验、服务端环境、脱敏、文件去重 | 控制台、持久队列 | 测试、浏览器、容器通过。 |
| 飞书 | 本地记录、服务端凭据和分类 sheet ID | token 缓存、分类、批量追加、公式防护 | 三张工作表 | 模拟 API 测试通过，真实回读未完成。 |

## 未完成项

指定应用 `cli_ab82e4f599b85cf3` 实际创建工作簿两次均返回 `99991672 / app_scope_not_applied`，未创建任何工作簿。需在飞书开发者后台开通电子表格创建、读取、写入权限（或 `sheets:spreadsheet`）并发布版本，之后继续创建各环境表格、配置 sheet ID、执行三类真实写入和回读。未使用其他应用替代，也没有将模拟结果标为真实同步。

完整 coturn 生产镜像仍未执行（其安装会初始化 SQLite，受 query_only 限制）；未验证 Android 真机和旧浏览器。飞书容量、网络故障和本地磁盘限额的运行边界见 [接入说明](../../docs/reporting.md)。远端 CI/PR 正文未通过 GitHub MCP 回读。

## 产物

Web：`/home/project/bawanggame-wt-pr78/public/`、`apps/web/dist/`；服务端：`/home/project/bawanggame-wt-pr78/apps/server/dist/src/`。

脚本、最终日志、JSON 和截图：`/home/project/artifacts/bawanggame-pr78-telemetry-20261126/`。`browser-results.json` 的 `diagnostic_no_keepalive_override=false` 为最终证据；带 true 的诊断文件仅用于定位旧问题，不代表候选通过。
