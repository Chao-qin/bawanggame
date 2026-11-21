# Flash 保存计划接入实施计划

**目标**　把 flash.homes 的公开 Flash 馆藏接入现有 Flash 商城和本机 Ruffle 播放流程。

- [x] 逆向搜索页、详情页和 SWF 对象存储地址。
- [x] 增加 Node 搜索、详情和流式下载代理。
- [x] 增加 Flash 商城搜索结果和加入本机按钮。
- [x] 验证造梦西游2升级版搜索、详情、SWF 大小和 SHA-256。
- [ ] 完成冷启动独立 review。

## 验证记录（2026-11-21）

- `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test`（1 passed）、`pnpm build`、`git diff --check` 通过。
- Node 服务（`tsx src/index.ts`，PORT=8183）冒烟：
  - `GET /` → 200；`/__flash/catalog?query=造梦西游` → 《造梦西游2升级版》(`3V7Q-JCZ3-RX5Z`)。
  - `/__flash/detail/3V7Q-JCZ3-RX5Z` → size `8861802`、sha256 `1ecf7933…67f7`。
  - `/__flash/download/3V7Q-JCZ3-RX5Z` → 200、`application/x-shockwave-flash`、`Content-Length: 8861802`，本地 SHA-256 与详情一致，`file` 识别为 Macromedia Flash (v10)。
- `VERIFY_BASE_URL=http://127.0.0.1:8183/ node apps/web/verify.mjs` → `RESULT PASS`（外壳、Flash 启动/横竖屏/退出回归）。
- 新面板端到端（headless Chrome CDP，临时脚本）：面板渲染 → 搜索「造梦西游」出结果 → 加入本机 → IndexedDB 写入 `url:http://…/__flash/download/3V7Q-JCZ3-RX5Z` → 按钮变「已加入」→ 重复加入提示「已安装过」且记录数仍为 1 → `RESULT PASS`。
- `apps/web/verify-local-flash.mjs`：Flash 商城、去重、批量卸载断言通过；最终在 `.card 大宋豪侠` 处失败——同脚本在 main 容器（8080）上失败点相同，原因为本地 JAR manifest 名为「大宋2」而非测试期望的「大宋豪侠」，属既有环境不匹配，与本改动无关。
- 未验证：Android WebView / 真机、iOS、flash.homes 上游长期结构稳定性（解析依赖其 HTML 结构）。
