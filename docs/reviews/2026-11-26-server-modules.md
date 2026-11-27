# PR78 后端模块拆分验收

基线 `9a3f7bb`，交付分支 `feat/babel-polyfill-nestjs`。本次追加把原先由 catch-all 控制器转发的 `index.ts` 中央分发器拆成 Java、Flash、本地 JAR、静态资源、实时通信、日志六个 Nest 模块，`AppModule` 只做组装；同时新增根目录 `.env.example`。设计见 `docs/superpowers/specs/2026-11-26-server-modules-design.md`。

## 审查与裁决

独立冷审使用 `anthropic/claude-opus-5-5` 子 agent，只读。它把旧分发器（`9a3f7bb` 的 `index.ts`）和新模块分别在本地端口启动，用 curl 对照约 40 个请求：路由、方法、查询参数、状态码、CORS / Cache-Control / ETag / gzip / immutable / 304 等响应头、响应体、路径穿越防护和非法编码返回 400，两边全部一致。

| 级别 | 发现 | 裁决 |
|---|---|---|
| P3 | Express 路由默认不区分大小写、允许尾斜杠：`/__JARS`、`/__jars/`、`/__52JAVA/open`、`/__flash/catalog/` 等旧版 404，新版命中接口；`/__ICON` 旧版 404 带 `Not found`，新版为空体 404；`--path-as-is /x/../__jars` 旧版 200，新版 404。 | 接受。前端、移动端和文档只使用精确小写路径；为这些非规范路径改 Express 路由选项会连带改变 `/collect/` 等已有路由，不划算。 |
| P3 | `2026-11-25-apk-services-orientation-keyboard-system-design.md` 仍写解析器旧路径。 | 已修复。 |
| P3 | 本次之前已有：`pnpm start` / `pnpm dev` 经 tsx 的 sh 包装启动，数字开头的 `52JAVA_*` 变量被丢弃。 | 不在本次范围。已实测：经 tsx 读到 `undefined`，直接用 node 能读到；Docker 用 node 直接启动，不受影响。 |

## 实际验证

| 项 | 结果 |
|---|---|
| 服务端测试 | 36 项通过，含新增 `test/routes.test.ts` 5 项：Java、Flash、JAR、`/collect`、首页各由所属模块响应，未知路径落到静态兜底 404 |
| 路由顺序变异检验 | 把 `AssetsModule` 移到 imports 首位后，5 项路由测试全部失败；恢复后通过 |
| Web 测试 | 105 项通过 |
| 类型与构建 | 服务端 `tsc` 类型检查和构建通过，产物入口仍为 `dist/src/main.js`；移动端 `tsc --noEmit` 通过，覆盖新的解析器导入路径 |
| 编译入口冒烟 | `node apps/server/dist/src/main.js`：首页、`/__jars`、`/__52java/open`、带 `?v=` 的 runtime 文件（immutable）均 200，`OPTIONS /__52java/x` 与 `OPTIONS /collect` 均 204，非法 Flash 编码与未知路径 404；SIGTERM 后进程退出 |

## 未验证

- 移动端 jest：本 worktree 的 RN jest preset 加载失败（`Cannot use import statement outside a module`），与本次无关的对照用例 `deviceId.test.ts` 失败方式相同，属于环境问题；导入路径已由移动端 `tsc` 覆盖。
- 完整含 coturn 的生产镜像、真机 WebView、远端 CI：与前两次验收相同，仍未验证。
