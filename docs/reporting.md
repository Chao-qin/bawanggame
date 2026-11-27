# 日志与飞书上报

Web 默认向所在环境的 `/collect` 上报；`VITE_ANALYTICS_URL` 为完整地址时向该地址上报，为 `off` 时关闭，为空等同未设置。APK 需配置完整 HTTPS 接口地址，发版流程未设置时默认 `https://frp-net.com:59352/collect`。使用事件、前端错误和 Nest/HTTP 错误统一打印为 JSON 控制台日志，并保存到本地待同步队列。

每个环境使用独立电子表格，内部为「使用统计」「前端报错」「后端日志」三个工作表，均有 19 列；另有可选的「会话」工作表（16 列），每次使用和每一局各占一行并原地更新，用于判断用户何时离开，见 [会话 ack 设计](superpowers/specs/2026-11-27-usage-session-ack-design.md)。字段顺序为：事件 ID、接收时间、环境、来源、级别、事件类型、设备 ID、平台、会话 ID、游玩 ID、游戏类型、游戏文件、游戏名称、前台毫秒数、错误类别、消息、堆栈、上下文、客户端时间。

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
| `FEISHU_SESSION_SHEET_ID` | 会话工作表 ID；不填时会话状态只保存在 `LOG_DIR/sessions.json`，启动时会在 stderr 提示 |

### 会话工作表

在每个环境的工作簿里新建一个工作表（建议命名「会话」），第 1 行填 16 列表头：`类型, ID, 环境, 设备ID, 平台, 会话ID, 游戏类型, 游戏文件, 游戏名称, 开始时间, 最后确认时间, 最后序号, 确认次数, 前台时长毫秒, 状态, 结束时间`，再把它的 sheet ID 填进 `FEISHU_SESSION_SHEET_ID`。服务端按记下的行号原地更新各行，**不要在这个工作表里排序、插入或删除行**，否则后续更新会写到别的行上；需要分析时复制到另一个工作表再处理。「最后序号 − 确认次数」只在「应用」行表示丢失的确认数，`seq` 按整次打开应用计数，「游玩」行只统计这一局的事件。

服务端用 Compose、`node --env-file=.env` 或 `deploy.sh`（systemd 读取 `/etc/j2me.env`）运行时，飞书相关变量都要写进对应的环境文件；部署平台运行时在平台的环境变量里设置。

已有 Compose 文件会透传以上配置并挂载持久卷；其他宿主应给日志目录写权限并持久化。一个目录仅供一个服务实例使用。直接重建容器而不保留该目录会丢失未同步日志。无需数据库。

## 已创建的环境表格

| 环境 | 工作簿 | 使用统计 ID | 前端报错 ID | 后端日志 ID |
|---|---|---|---|---|
| production | [生产日志](https://my.feishu.cn/sheets/AcNrsmuLBhaZ0ytUq4McDpixnpe) | `2d1e23` | `UywsXp` | `iOypFx` |
| development | [开发日志](https://my.feishu.cn/sheets/Qtc0s3PYEhkSSVtdqTrcUrN2npg) | `fdb3a6` | `yRKh5N` | `QvW0LO` |

两个工作簿的「会话」工作表尚未创建，建好后把 sheet ID 填入 `FEISHU_SESSION_SHEET_ID` 并补进上表。

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

接口最多接收 128 KiB、50 个 v1 事件；客户端同时按完整正文 UTF-8 字节数切分到 48 KiB 以下。普通 fetch 不占用 keepalive 配额，退出页面时使用 beacon，保留队列直到 fetch 确认。记录持久化后才返回 204，磁盘失败或容量不足返回 503，客户端保留重试。后台每 5 秒按类别、每批最多 50 条追加飞书（`insertDataOption=INSERT_ROWS` 作为查询参数，不覆盖已有行）。会话表同样每 5 秒更新：90 秒没有收到确认的会话和游戏局标为「超时结束」。同步失败不删除队列，服务重启后恢复。超过 5000 条或 50 MiB 待同步数据时停止接收新记录，控制台会提示；应及时修复飞书连接并释放积压。

事件 ID 在本地保留 7 天去重。飞书写入成功但响应丢失时可能重复追加，表格保留事件 ID 以供识别；不承诺严格恰好一次投递。浏览器存储配额、设备清理和未持久化的容器目录也可能导致日志丢失。

默认不上报完整请求正文、Cookie、Authorization 或 URL 查询参数；错误文本做凭据脱敏与长度限制。任意业务文本仍可能包含用户自行输入的内容，导出或分享日志前应再次核对。

## 检查

`pnpm test` 包含后端与前端测试。`pnpm typecheck` 和 `pnpm build` 分别检查服务端类型和 Web 构建；服务端构建为 `pnpm --filter @xiaochao/server build`。飞书同步需实际发送一条使用事件、一条前端错误、一条服务端日志并回读三个工作表；配置了会话表时，还要打开页面确认「应用」行出现并在 30 秒内更新「最后确认时间」，关闭页面约 95 秒后变为「超时结束」。未完成回读不能认为云端同步已完成。
