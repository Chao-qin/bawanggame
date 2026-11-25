# Review Record: 安装包在线服务、冒泡全量目录、整机旋转与全局键盘系统

- Branch: `feat/apk-services-orientation-keyboard-system`
- Base SHA: `c7fc8d4`
- Reviewer model: anthropic/claude（Claude Code 冷启动子 agent，每轮每个 pass 均为新上下文）
- Spec: `docs/superpowers/specs/2026-11-25-apk-services-orientation-keyboard-system-design.md`

## R1

| Pass | 结论 | Findings |
|---|---|---|
| diff | fix_required | P1×1、P3×4 |
| feature-audit | fix_required | P2×2、P3×3 |
| validation | pass | P3×1（测试站点缺 APK 专用清单，仅影响模拟环境） |

| 级别 | 问题 | 处理 |
|---|---|---|
| P1 | 父页面缓存已发送的方向，第二次退出 J2ME/冒泡后不再向原生宿主交还方向 | 已修：`auto` 总是发送 |
| P2 | CSS 旋转时进入全屏，全屏元素不受 `#root` 变换影响，布局与触点错位；退出全屏后锁定记录未清除 | 已修：全屏期间不做 CSS 旋转；退出全屏清除锁定记录 |
| P2 | 全键盘类在横屏嵌入时遮住画面、两侧留空 | 已修：横屏时浮在画面下方、可拖动，画面占满舞台 |
| P3 | 宿主无条件声明能力 | 已修：按平台与原生模块声明 |
| P3 | 桥接请求超时后挂起项不清理；宿主依赖 `AbortSignal.timeout` | 已修：请求带超时并清理；宿主改用 AbortController |
| P3 | JAR 经 base64 写盘的内存峰值 | 已修：JAR 上限 16 MiB |
| P3 | 游戏内「恢复默认」把全局映射复制为本游戏映射 | 已修：只保存游戏自有的映射 |
| P3 | 离线启动未随包的冒泡游戏只显示「启动失败」 | 已修：提示需联网，进度更新不再覆盖 |
| P3 | Flash 加载中打开按键映射拿不到控制器 | 已修：面板轮询时重新读取 |
| P3 | 浮空键盘大小选项与菜单步进不一致 | 已修：0.6–1.6，步进 0.1 |

## R2

| Pass | 结论 | Findings |
|---|---|---|
| diff | pass | R1 全部修复确认；P3×1 |
| feature-audit | pass | 无回归；P3×2 |
| validation（主 agent 执行） | pass | Web/运行时 87、服务端 9、宿主 29 项测试通过；两端 TypeScript 检查通过；Node 代理预检 204；模拟宿主下 52java 30 款、Flash 16 款、键盘页 21 行映射，无页面错误 |

## 记录的 P3（后续处理）

1. 横屏下被强制浮空的全键盘：菜单「取消浮空」无效果，透明度仍按嵌入计算（`ScreenKeypad.jsx`、`KeypadPiece.jsx`）。
2. J2ME 每次重新适配都会向宿主发送一次 `auto`（无害的重复调用）。
3. 宿主原生 SWF 下载没有自己的超时，仅受页面 120 秒限制。
4. 镜像返回 404/5xx 时也提示「需联网」（`mrp-runtime.js`）。
5. APK 商城失败时直接显示英文技术信息（`Network request failed`、`HTTP 502`），离线与超时无法区分。

## 未验证

Android 原生模块编译、APK 安装与启动、真机旋转、真机商城访问、真机手柄与实体键盘、性能数据（本机无 JDK / Android SDK / 设备）；vmrp.github.io 镜像在审查沙箱中曾不可达，主环境中可访问。
