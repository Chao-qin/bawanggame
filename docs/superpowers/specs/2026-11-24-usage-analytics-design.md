# 匿名使用统计上报

## 任务契约

| 项 | 内容 |
|---|---|
| 目标行为 | 不登录、不带 token 也能统计：有多少台设备在用、玩了哪些游戏、每次玩了多久。客户端按本文格式上报，接收接口由项目方自建 |
| 修改范围 | `apps/web`（上报模块、入口与游戏路由接入）、`apps/mobile`（设备 ID、桥接字段、前后台通知）、`Dockerfile` 与 Android 发布流水线（传入接口地址） |
| 不可破坏 | 未配置接口地址时不采集、不写本地存储、不发请求；游戏启动、退出确认、直达链接流程不变；本地游玩记录（`cloud.js`）不变 |
| 验收 | 见文末「验证」 |

## 1. 用户怎么区分

- 每台设备一个随机 ID（`device_id`），不含任何个人信息。
  - APK：原生层生成 UUID v4，存在应用私有目录 `device-id` 文件（`apps/mobile/src/host/deviceId.ts`），启动时经注入桥 `window.__XIAOCHAO_RN_HOST__.deviceId` 交给页面。页面自己存不住：内置站点每次启动换一个回环端口，浏览器存储按端口隔离。
  - Web：首次打开生成，存 `localStorage` 的 `xiaochao-device-id`。
- 统计的是「设备数」不是「人数」：同一个人用两台设备记 2 个；清除应用数据、卸载重装、换浏览器或无痕模式记为新设备。
- `session_id`：每次打开应用（每次页面加载）一个，用来算打开次数和单次使用时长。

## 2. 开启方式

构建时设置 `VITE_ANALYTICS_URL`，值为接收接口的完整地址；不设置就不采集。

| 构建方式 | 设置位置 |
|---|---|
| 本地 / 自部署 | `VITE_ANALYTICS_URL=https://example.com/collect pnpm build` |
| Docker | `docker build --build-arg VITE_ANALYTICS_URL=https://example.com/collect .` |
| APK（GitHub Actions 发版） | 仓库 Actions 变量 `ANALYTICS_URL` |
| APK（本地） | `VITE_ANALYTICS_URL=… pnpm mobile:build-android` |

接口请用 HTTPS：站点或 APK 页面是 HTTP 时也能请求 HTTPS 地址，反过来，HTTPS 站点请求 HTTP 接口会被浏览器当作混合内容拦截。

## 3. 接收接口要求

```
POST <VITE_ANALYTICS_URL>
Content-Type: text/plain;charset=UTF-8     ← 正文是 JSON 字符串，按 JSON 解析即可
```

- 用 `text/plain` 是为了让它属于 CORS 简单请求：浏览器不发 OPTIONS 预检。接口只需在响应里带 `Access-Control-Allow-Origin: *`。没有这个头时，浏览器读不到响应，客户端会当作失败，并在下次重发这一批。
- 返回任意 2xx（推荐 204）表示收下，客户端随即从队列删除这一批；非 2xx 或网络失败会保留，之后重发。
- 页面关闭或切到后台时改用 `navigator.sendBeacon` 发送，浏览器接受即视为已发出，客户端拿不到响应。
- 同一事件可能因重发到达多次，按 `events[].id` 去重。
- 不带 Cookie（`credentials: 'omit'`），也不带任何鉴权头。

### 请求体

```json
{
  "v": 1,
  "device_id": "48315c73-5202-4dd2-8418-b73a43ddde48",
  "platform": "web",
  "events": [
    { "id": "…", "type": "app_open",   "ts": 1795590372641, "session_id": "…" },
    { "id": "…", "type": "game_start", "ts": 1795590380000, "session_id": "…", "play_id": "…",
      "game": { "kind": "flash", "file": "sample-game.swf", "name": "Star Catcher", "local": false } },
    { "id": "…", "type": "heartbeat",  "ts": 1795590410000, "session_id": "…", "play_id": "…", "game": { … }, "active_ms": 30000 },
    { "id": "…", "type": "game_end",   "ts": 1795590413345, "session_id": "…", "play_id": "…", "game": { … }, "active_ms": 3345 }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `v` | 协议版本，当前 `1` |
| `device_id` | 设备 ID（第 1 节） |
| `platform` | `web` / `android` / `ios` |
| `events[].id` | 事件唯一 ID，用于去重 |
| `events[].type` | `app_open` 打开应用；`game_start` 进入游戏；`heartbeat` 游戏中每 30 秒一次，切后台时也补一次；`game_end` 退出游戏 |
| `events[].ts` | 客户端时间，毫秒时间戳（设备时钟可能不准，可另记服务端收到时间） |
| `events[].session_id` | 本次打开应用的 ID |
| `events[].play_id` | 这一局的 ID，`game_start` 到 `game_end` 相同 |
| `events[].game` | `kind`（`j2me` / `maopao` / `flash` / `local-revival`）、`file`、`name`（最长 200 字）、`local`（是否为用户自己导入到浏览器的游戏） |
| `events[].active_ms` | 距上一次上报之间、游戏在前台的毫秒数；页面隐藏或 APK 在后台的时间不计 |

一批最多 50 个事件；离线时最多在本地保留 500 个，超出丢最早的。

## 4. 指标怎么算

| 指标 | 算法 |
|---|---|
| 设备数（总 / 日活 / 月活） | 按时间段对 `device_id` 去重计数 |
| 新增设备 | 每个 `device_id` 首次出现的日期 |
| 打开次数 | `app_open` 计数，或 `session_id` 去重 |
| 每个游戏的游玩次数 / 人数 | 按 `game.kind + game.file` 分组，`play_id` 去重计数 / `device_id` 去重计数 |
| 每局时长 | 同一 `play_id` 的 `active_ms` 求和 |
| 每个游戏总时长、人均时长 | 按游戏分组对 `active_ms` 求和，再除以 `device_id` 去重数 |

`game_end` 可能因进程被杀而丢失，此时一局最多少算最后不到 30 秒；不需要 `game_end` 也能算时长。

## 5. 接入点

- `apps/web/src/main.jsx`：应用页（不含游戏 iframe）调用 `installAnalytics(import.meta.env.VITE_ANALYTICS_URL)`，记 `app_open`，监听页面隐藏、关闭和恢复联网。
- `apps/web/src/App.jsx`：从大厅进入游戏（路由带 `xiaochaoGameEntry`）时 `trackPlay(game)`，离开游戏路由时结束。直达链接会先转成「大厅 + 游戏」再进入，只记一局；iframe 中运行的 J2ME / 冒泡游戏由应用页统一记录，不会重复记录。
- `apps/mobile/App.tsx`：应用切到后台 / 回到前台时向页面派发 `xiaochao:hostactive`，因为 WebView 在后台时页面不一定变成隐藏状态。

## 6. 验证

- `node --test apps/web/src/analytics.test.js`：设备 ID 复用、APK 优先使用宿主 ID、前台时长、失败保留与重发、beacon、未配置时不采集。
- `apps/mobile` jest：`deviceId.test.ts`（生成、复用、损坏替换、存储失败）与 `protocol.test.ts`（桥接字段）。
- 浏览器冒烟：带测试接收端构建，从大厅进入游戏约 60 秒再退出，接收端按顺序收到 `app_open`、`game_start`、两次 `heartbeat`、`game_end`，`active_ms` 合计与实际时长一致；直达链接只记一次 `game_start`。

## 7. 已知限制

- 设备数不等于人数（第 1 节）。
- 同一浏览器同时开多个标签页时，它们共用本地队列，可能有事件重复（按 `id` 去重）或少量丢失。
- APK 的离线队列存在页面存储里，端口每次启动都会变，所以只能在本次启动期间重发。
- 设备 ID 与 IP 在国内法规下属于个人信息，上架应用商店时需要在隐私政策中说明。
