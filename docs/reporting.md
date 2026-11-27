# 日志与飞书上报

Web 默认向所在环境的 `/collect` 上报；设置 `VITE_ANALYTICS_URL=''` 关闭，APK 需配置完整 HTTPS 接口地址。使用事件、前端错误和 Nest/HTTP 错误统一打印为 JSON 控制台日志，并保存到本地待同步队列。

每个环境使用独立电子表格，内部为「使用统计」「前端报错」「后端日志」三个工作表，均有 19 列。字段顺序为：事件 ID、接收时间、环境、来源、级别、事件类型、设备 ID、平台、会话 ID、游玩 ID、游戏类型、游戏文件、游戏名称、前台毫秒数、错误类别、消息、堆栈、上下文、客户端时间。

## 运行时环境变量

| 变量 | 说明 |
|---|---|
| `LOG_ENV` | 环境标签；默认 `NODE_ENV`，其次 `development`，由服务端决定 |
| `LOG_DIR` | 独占的可写持久队列目录；默认当前目录下 `.data/reporting`；Docker 为 `/app/.data/reporting` |
| `FEISHU_APP_ID` | 飞书应用 ID；本次指定应用为 `cli_ab82e4f599b85cf3` |
| `FEISHU_APP_SECRET` | 应用密钥，通过部署平台密钥配置或进程环境注入，禁止放入前端构建变量 |
| `FEISHU_SPREADSHEET_TOKEN` | 当前环境电子表格 token |
| `FEISHU_USAGE_SHEET_ID` | 使用统计工作表 ID |
| `FEISHU_ERROR_SHEET_ID` | 前端报错工作表 ID |
| `FEISHU_SERVER_SHEET_ID` | 后端日志工作表 ID |

已有 Compose 文件会透传以上配置并挂载持久卷；其他宿主应给日志目录写权限并持久化。一个目录仅供一个服务实例使用。直接重建容器而不保留该目录会丢失未同步日志。无需数据库。

## 已创建的环境表格

| 环境 | 工作簿 | 使用统计 ID | 前端报错 ID | 后端日志 ID |
|---|---|---|---|---|
| production | [生产日志](https://my.feishu.cn/sheets/AcNrsmuLBhaZ0ytUq4McDpixnpe) | `2d1e23` | `UywsXp` | `iOypFx` |
| development | [开发日志](https://my.feishu.cn/sheets/Qtc0s3PYEhkSSVtdqTrcUrN2npg) | `fdb3a6` | `yRKh5N` | `QvW0LO` |

工作簿 token 为链接 `/sheets/` 后的一段。两个环境不可混用 token 和 sheet ID。开发表保留 6 条带 `integration-check` 标识的接入验证记录，生产表仅初始化表头。

配置模板为项目根目录的 `.env.example`，已预填生产表的 ID，只有 `FEISHU_APP_SECRET` 需要自行填写：

```sh
cp .env.example .env   # 填入 FEISHU_APP_SECRET；开发环境改为上表 development 一行的值，并设 LOG_ENV=development
docker compose up -d --build                        # Compose 自动读取根目录 .env
node --env-file=.env apps/server/dist/src/main.js   # 直接运行 Node 时需显式加载
```

`.env` 已被 Git 忽略，不要提交；部署平台有密钥管理时，优先在平台注入 `FEISHU_APP_SECRET`。

## 权限与交付语义

应用须获得电子表格创建、读取和写入权限，并能访问目标文件。应用未开通权限时，密钥有效也不能创建或写入表格。配置不完整时只打印和保留本地队列，不向飞书发送。

接口最多接收 128 KiB、50 个 v1 事件；客户端同时按完整正文 UTF-8 字节数切分到 48 KiB 以下。普通 fetch 不占用 keepalive 配额，退出页面时使用 beacon，保留队列直到 fetch 确认。记录持久化后才返回 204，磁盘失败或容量不足返回 503，客户端保留重试。后台每 5 秒按类别、每批最多 50 条追加飞书。同步失败不删除队列，服务重启后恢复。超过 5000 条或 50 MiB 待同步数据时停止接收新记录，控制台会提示；应及时修复飞书连接并释放积压。

事件 ID 在本地保留 7 天去重。飞书写入成功但响应丢失时可能重复追加，表格保留事件 ID 以供识别；不承诺严格恰好一次投递。浏览器存储配额、设备清理和未持久化的容器目录也可能导致日志丢失。

默认不上报完整请求正文、Cookie、Authorization 或 URL 查询参数；错误文本做凭据脱敏与长度限制。任意业务文本仍可能包含用户自行输入的内容，导出或分享日志前应再次核对。

## 检查

`pnpm test` 包含后端与前端测试。`pnpm typecheck` 和 `pnpm build` 分别检查服务端类型和 Web 构建；服务端构建为 `pnpm --filter @xiaochao/server build`。飞书同步需实际发送一条使用事件、一条前端错误、一条服务端日志并回读三个工作表；未完成回读不能认为云端同步已完成。
