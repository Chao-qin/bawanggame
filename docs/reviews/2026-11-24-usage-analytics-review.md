# Review Record: 匿名使用统计上报

- Branch: `feat/user-analytics`
- Base SHA: `2a1ad43`
- Reviewer model: anthropic/claude（Claude Code 冷启动子 agent，每轮每个 pass 均为新上下文，审查只读快照 worktree）
- Spec: `docs/superpowers/specs/2026-11-24-usage-analytics-design.md`

## R1（Head `9468abb`）

| Pass | 结论 | Findings |
|---|---|---|
| diff | pass | P3×3 |
| feature-audit | pass | 无新增 |

| 级别 | 问题 | 处理 |
|---|---|---|
| P3 | 时长用墙钟计算，设备改时间会让 `active_ms` 变负或暴涨 | 已修：时长改用 `performance.now()`，`ts` 仍用 `Date.now()` |
| P3 | fetch 无超时，卡住的请求会挡住之后所有 fetch 上报 | 已修：15 秒后中止 |
| P3 | APK 注入桥若晚于页面脚本，会退回按端口存的页面 ID | 已修：`?host=rn` 页面拿到宿主 ID 前只排队，不生成页面 ID |

## R2（Head `1d2f684`）

| Pass | 结论 | Findings |
|---|---|---|
| diff | pass | P3×2 |
| feature-audit | pass | 无新增 |

| 级别 | 问题 | 处理 |
|---|---|---|
| P3 | 积压超过 50 条时，一次成功只发一批，其余等下一次触发 | 已修：成功后继续发送直到队列清空，失败即停 |
| P3 | 读设备 ID 文件出错时会覆盖已存的有效 ID，设备从此被算两次 | 已修：读出错只用本次临时 ID，不写文件 |

## R3（Head `1f66f9e`）

| Pass | 结论 | Findings |
|---|---|---|
| diff | pass | P3×2 |
| feature-audit | pass | 无新增 |

| 级别 | 问题 | 处理 |
|---|---|---|
| P3 | 读 ID 出错的那次启动记为新设备，spec 未写明 | 已在 spec「已知限制」补充（仅文档） |
| P3 | 缺少 `exists` 抛错的用例（与 `readFile` 抛错同一分支） | 记录，不阻塞 |

## Validation（R3，Head `1f66f9e`）

结论：pass（P3×1）。

| 级别 | 问题 | 处理 |
|---|---|---|
| P3 | 一批 50 个事件且游戏名、文件名都是接近 200 字的中文时，请求体可超过 keepalive / beacon 的 64 KB 上限，这一批会一直重试（常见批次约 20 KB，极端约 73 KB） | 记录为后续项：按字节预算切批（如 ≤ 32 KB）。R3 后不再开轮次 |

已验证：

- `VITE_ANALYTICS_URL=http://127.0.0.1:19911/collect pnpm build` 成功，产物含该地址；`PORT=18081 pnpm start` 起服务，本地接收端返回 204 与 `Access-Control-Allow-Origin: *`。
- 无头 Chrome：大厅 → Flash「Star Catcher」→ 约 55 秒 → 退出游戏，接收端依次收到 `app_open`、`game_start`、`heartbeat`（30001 ms）、`game_end`（22757 ms）；只有 POST，没有 OPTIONS 预检，`Content-Type: text/plain;charset=UTF-8`。控制台只有无头环境下 Ruffle 拿不到 GPU 的既有报错。
- 直达链接只记一次 `game_start`；刷新后设备 ID 不变；离开页面时通过 beacon 补发心跳。
- 模拟 APK 页（`/?host=rn`，无宿主 ID）：事件只排队、不发送、不生成页面 ID；注入宿主 ID 并触发 `online` 后，以宿主 ID 和 `platform: android` 发出。
- `node --test apps/web/src/analytics.test.js` 11/11；移动端 jest 35/35（仓库 jest 预设在本地 pnpm 布局下对所有用例都无法转译，使用临时配置放开 `.pnpm` 转译）；`tsc --noEmit` 通过。

未验证（需真机）：

1. `VITE_ANALYTICS_URL=http://<局域网IP>:19911/collect pnpm mobile:build-android`，`adb install -r` 后启动。
2. 接收端首批为 `platform: "android"`、UUID v4 的 `device_id`；`adb shell am force-stop com.xiaochao.bawang` 后重启，`device_id` 不变、`session_id` 变化。
3. 玩 20 秒 → 按 Home 等 60 秒 → 回来再玩 20 秒 → 退出，该局 `active_ms` 合计约 40 秒，后台期间没有心跳。
4. 游戏中开关飞行模式，积压在本次启动内补发。
5. `adb shell pm clear com.xiaochao.bawang` 或卸载重装后 `device_id` 变化（`allowBackup="false"`）。
6. iOS 全部未验证；iOS 的 `inactive`（控制中心、来电）不算后台，这段时间会计入时长。
