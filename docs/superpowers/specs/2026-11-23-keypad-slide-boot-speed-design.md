# 虚拟键盘滑动触发、T9 八向轮与模拟器启动提速

## 背景与复现

真实服务（`PORT=18090 pnpm start`）+ 无头 Chromium，390×844 手机视口，Diamond Rush（J2ME）与雷电1944（冒泡）。对照组为同一时段在 18091 端口运行的 `origin/main`（7e2434f）。

| 现象 | 复现 | 根因 |
|---|---|---|
| 从「大家都在玩」点进的游戏加载失败 | 在 J2ME 标签导入本机 JAR 并玩一次，切到冒泡标签，点「大家都在玩」里的这款游戏 → `jar/mygame.jar: HTTP 404`，一直停在启动中 | `cloud.js` 的游玩记录不保存 `local`；历史行也不按标签过滤，冒泡标签的库里没有本机 JAR，补不回 `local`，于是按服务器 JAR 启动。J2ME 标签里点得早（本机库还没加载完）也一样 |
| T9 键盘滑过按键不触发 | 在 4 上按下滑到 5：只有 `+num4 -num4` | `KeyboardCanvas` 只在 Konva 按键的 `pointerdown` 上命中一次，之后不再看指针位置 |
| Flash 触屏键滑过不触发 | 上 → 右 → 下 → A 一路滑过：只有 `+ArrowUp -ArrowUp` | 每个按钮各自 `setPointerCapture`，按下即锁定 |
| T9 没有八向轮 | — | 方向键是 4 个独立方块，斜向只能两指同按 |
| 经典键盘 | 5 → 6 → 9 一路滑过：`+num5 -num5 +num6 -num6 +num9 -num9`；但落在 5 和 6 之间的键缝再滑到 6：无任何事件 | `touchpad.js` 已支持按键间滑动，但 `pointerdown` 没命中按键就不跟踪这个手指 |
| Java 启动慢 | 4Mbps / 150ms、CPU 降速 4 倍，冷启动 13.5–14.0s | `java/classes.jar`（2.3MB）要等 `bld/main-all.js` 执行时才开始下载，比脚本晚约 2s；首帧要等 12 张 emoji 图（约 400KB）全部下载完；每次启动 30 多个运行时文件都要 304 往返 |
| 冒泡启动慢 | 同条件冷启动 16–17s | `vmrp_v1.0/fs` 的字库 `gb16.uc2` / `gb12.uc2` 与 `cfunction.ext` 共 3.6MB 未压缩传输（gzip 后约 0.9MB） |

## 目标行为

1. **滑动触发（所有画布键盘与 Flash 触屏键）**：手指落在键盘区域后一直被跟踪到抬起；离开一个键时抬起它，进入另一个键时按下它；从键缝滑入按键也会按下。经典键盘原有的按键间滑动保持不变，补上「落在键缝再滑入」（只限 `#nav` / `#numpad` 内，从游戏画面滑进键盘仍不按键）。
2. **T9 八向轮**：方向区改为一个圆形轮盘，中心为 OK。四个主方向各占 60°，斜向各占 30° 并同时按住相邻两个方向；扇区边缘 6° 滞回，手指抖动不跳键。只有落在中心的触摸才确认 OK，从方向滑进中心只松开方向（与经典键盘一致）。正在转轮盘的手指在 1.25 倍半径内保持在轮盘上，不会误按旁边的软键。
3. **T9 外观**：渐变键面 + 实心底边（不用模糊阴影，保持性能）、软键指示条、「挂机」红色、「C 清除」琥珀色、轮盘扇区刻度与主方向箭头、按下时点亮对应扇区。横屏导航区宽高比收窄，不再顶到折叠工具栏下方。
4. **游玩记录**：记录里保存 `local`；每个标签只显示本标签类别的记录，并以本标签已加载的库为准还原游戏（库加载完之前不显示，库里已没有的游戏不显示，Java 游戏按大厅的身份合并去重），过滤后每行取前 12 条。
5. **启动提速**：
   - J2ME 播放器在加载脚本前就开始下载 `java/classes.jar`，`main-all.js` 的 `load()` 直接取用；预取失败时回退到原请求。
   - emoji 图在首帧之后再加载；加载前含 emoji 的文字按普通文字绘制与测量（`©` 等字符也在 emoji 表里，必须有此回退）。
   - 服务器对 `.uc2` / `.ext` 开启 gzip；`/assets/`（Vite 哈希文件）与带 `?v=` 的运行时脚本返回 `Cache-Control: public, max-age=31536000, immutable`。
   - `RUNTIME_VERSION` 升到 `20261123-4`。

## 修改范围

| 区域 | 文件 |
|---|---|
| 命中判定（新） | `apps/web/src/keyboard/hit-test.js`、`hit-test.test.js` |
| 指针状态 | `apps/web/src/keyboard/pointer-state.js`（一个指针可按住多个键、在键缝里也被跟踪）、测试 |
| 键盘画布 | `apps/web/src/keyboard/KeyboardCanvas.jsx`（宿主元素上做坐标命中与滑动；外观；轮盘绘制） |
| T9 预设 | `apps/web/src/keyboard/layouts.js`、`layouts.test.js` |
| 使用方 | `runtime/RuntimeKeypad.jsx`（每个手指 + 动作一个输入源，斜向一次震动）、`keyboard/KeyboardTestPage.jsx`、`runtime/FlashControls.jsx` |
| 经典键盘 | `runtime/j2me/touchpad.js`（落在 `#nav` / `#numpad` 键缝的触摸也跟踪，滑到键上即按下） |
| 游玩记录 | `apps/web/src/cloud.js`、`App.jsx`（`Library` 历史行） |
| 启动 | `runtime/J2MEPlayer.jsx`、`runtime/loadScript.js`、`runtime/j2me/bld/main-all.js`、`apps/server/src/index.ts` |
| 文档 | 本文件、`docs/superpowers/plans/2026-11-23-keypad-slide-boot-speed.md` |
| 冒烟 | `apps/web/verify.mjs`（键盘测试页：滑到相邻键换键、滑出键盘抬起） |

## 不可破坏的现有行为

- 经典键盘、自定义触屏键位、按键映射、物理键盘与手柄输入。
- T9 长按连发沿用 `InputMapping` 参数；多指按同一键要全部抬起才释放；`blur` / 页面隐藏时全部释放。
- 键盘测试页的物理键盘、控制器布局键数与几何不变。
- 本机 JAR、服务器 JAR 的启动路径与错误提示；RN 宿主协议。

## 验收与结果

| 项 | 方式 | 结果 |
|---|---|---|
| 预设几何、每个动作恰好一个键、轮盘扇区 / 滞回 / 中心确认 / 漂移保持、指针状态 | `node --test apps/web/src/keyboard/*.test.js apps/web/src/runtime/*.test.js` | 25 项通过 |
| T9 滑动：5→6→9→键缝→8 | CDP 真实触摸，J2ME 竖屏嵌入 / 浮空、冒泡竖屏嵌入 | `+num5 -num5 +num6 -num6 +num9 -num9 +num6 -num6 +num5 -num5 +num8 -num8`（路径经过 6、5） |
| 轮盘：上→右上→右→下→中心→左 | 同上 | `+up +right -up +down -right -down +left -left`；滑进中心不确认 |
| 中心落指：中心→右→中心 | 同上 | `+ok -ok +right -right +ok -ok` |
| 左软键滑上轮盘 | 同上 | `+choice -choice +left +up -left -up` |
| 经典键盘 | 同上 | 按键间滑动 `+num5 -num5 +num6 -num6 +num9 -num9`（与 main 相同）；键缝落指 → 6 → 9：`+num6 -num6 +num9 -num9`（main 无事件）；从游戏画面滑到 5：无事件 |
| Flash 触屏键滑动 | 上→右→下→A | 分支 `+ArrowUp -ArrowUp +ArrowRight -ArrowRight +ArrowDown -ArrowDown +ArrowRight -ArrowRight +Space -Space`；main 只有 `+ArrowUp -ArrowUp` |
| 冒泡标签不再出现本机 Java 记录；J2ME 标签点历史正常启动 | 探针 | 通过；旧格式记录（无 `local`）按本机优先还原；已卸载游戏不显示；同一款游戏只出现一次 |
| 键盘测试页滑入 / 滑出 | `verify.mjs`（`VERIFY_KEYBOARD_ONLY=1`） | 键盘段通过；后面 Flash 退出段在 main 上同样超时（既有问题） |
| 外观 | 截图：390×844 / 320×568 竖屏，844×390 / 667×375 横屏，嵌入与浮空，键盘测试页 | 无重叠、无溢出；横屏软键不再被折叠工具栏压住 |

### 启动耗时（4Mbps 下行 / 150ms 延迟 / CPU 降速 4 倍，无 Service Worker，同一时段交替运行，各 2 次）

| 运行时 | 指标 | main | 本分支 |
|---|---|---|---|
| J2ME | 冷启动到首帧（`MIDP.frames > 0`，此时画面仍是白屏） | 13.5 / 14.0s | 11.1 / 11.0s |
| J2ME | 再次启动（HTTP 缓存） | 3.9 / 3.8s | 2.6 / 2.6s |
| J2ME | 运行时文件传输 | 4089KB | 3446KB |
| 冒泡 | 冷启动到画面出现 | 17.3 / 17.1s | 12.0 / 10.9s |
| 冒泡 | 再次启动 | 6.3 / 6.7s | 5.6 / 5.2s |
| 冒泡 | 运行时文件传输 | 4980KB | 2065KB |

R1 validation 独立复测（同条件，交替各 2 次）：J2ME 冷启动首帧 13.4 / 13.4s → 10.8 / 10.6s，**标题画面出现** 19.4 / 19.3s → 16.9 / 16.7s，再次启动 3.7 / 4.0s → 2.6 / 2.8s；冒泡冷启动 16.2 / 16.0s → 10.4 / 10.2s，再次启动 5.4s → 4.3s。本机回环（不限速，CPU 4 倍，含模拟 RN 静态服务器的代理）下 main 与分支一致（J2ME 冷启动约 4.3s，冒泡约 4.6s）：本 PR 的提速只在网络是瓶颈时生效。

J2ME 冷启动现在接近带宽下限（3.4MB ÷ 4Mbps ≈ 6.8s，其余是 CPU 降速下的 JVM 初始化）。冒泡再次启动时资源 1.4s 内到齐，剩下是游戏自身开机画面。

### T9 按键帧率（CPU 降速 4 倍，DPR 3，10 秒每 250ms 触摸一次数字键，共享主机 load 20–27）

| | 游戏帧率 | 平均帧间隔 | P95 | >50ms | 按下 / 触摸 |
|---|---|---|---|---|---|
| main | 12.4 / 11.8 | 18.4 / 19.4ms | 16.8 / 33.3ms | 7 / 13 | 31/31、30/30 |
| 本分支 | 11.7 / 12.6 | 19.4 / 18.6ms | 33.3 / 16.8ms | 14 / 9 | 30/30、31/31 |

两者在噪声范围内一致。

### 提速在各平台的适用范围

用户反馈的「启动慢」在网页端（访问部署的服务器）。本 PR 以网页端为目标：

| 优化 | 网页（`apps/server` / Docker） | Android / iOS 应用（`react-native-static-server` 本机回环服务） |
|---|---|---|
| J2ME 预取 `classes.jar`、emoji 首帧后加载 | 生效 | 逻辑生效，但回环上下载不是瓶颈，实测无收益 |
| `.uc2` / `.ext` gzip、带版本 / 哈希资源（含 Ruffle 哈希文件）长缓存 | 生效 | 不生效：应用的静态服务器不走 `apps/server` |

应用里启动主要受 CPU 限制（JVM 初始化、脚本解析），不在本 PR 范围，需要另开任务。

## R1 评审处理

diff review、validation 为 `pass`，feature audit 为 `fix_required`（1 条 P2）。

| 来源 | 级别 | 问题 | 处理 |
|---|---|---|---|
| feature audit | P2 | 提速对 Android / iOS 应用基本无效，spec 没写清 | 用户确认反馈的是网页端；补「各平台适用范围」，应用的 CPU 瓶颈另开任务 |
| validation | P3 | 回环下预取与 emoji 延后也无收益 | 同上，写入适用范围 |
| validation | P3 | 「首帧」是白屏 | 表中注明，并补标题画面出现时间 |
| validation | P3 | `main-all.js` 注释说 emoji 被跳过 | 改为「按普通文字显示」 |
| diff review | P3 | 冒泡历史按 Java 身份去重，同名同厂商的不同冒泡游戏被合并（大厅里 13 组） | 身份去重只用于 J2ME；探针：两款「野蛮女教师」都显示 |
| diff review | P3 | 旧记录（无 `local`）与新记录分摊游玩次数 | `recordPlay` 把同类别同文件名的旧记录并入；验证：旧记录 4 次 + 本次 → 5 次 |
| diff review | P3 | `?v=` 长缓存依赖手动升级版本号 | 服务器注释写明「改运行时脚本必须升 `RUNTIME_VERSION`」；本轮改了 `touchpad.js`，升到 `20261123-4` |
| feature audit | P3 | 经典键盘落在键缝的触摸被忽略 | 修复，见验收表 |
| feature audit | P3 | Flash 未测、Ruffle 哈希文件仍每次 304 | Ruffle 哈希 core / wasm 改长缓存；`ruffle.js` 由 `loadScript` 以 `?v=` 加载，同样长缓存，升级 Ruffle 时必须一并升 `RUNTIME_VERSION`；Flash 启动时间未测，列入未覆盖 |
| feature audit | P3 | Flash 方向键无斜向 | 未做：八向轮的要求针对 T9；记录为后续 |

## R2 评审处理

diff review、feature audit、validation 均为 `pass`，只有 P3。

| 来源 | 问题 | 处理 |
|---|---|---|
| feature audit | 历史先按全部类别取前 12 条再按标签过滤，另一类别玩得多时本标签的行会消失 | 改为先按标签过滤、以库还原、去重，再取前 12 条；探针：12 条更新的冒泡记录下 J2ME 标签仍显示 Diamond Rush |
| diff review | 同一款 Java 游戏本机版与服务器版各有记录时，「大家都在玩」按其中一条的次数排序，不是两者之和 | 记录：只影响排序，不影响启动 |
| validation | spec 说 `ruffle.js` 仍 `no-cache`，实际以 `?v=` 加载、长缓存 | 改正 R1 表述；服务器注释写明升级 Ruffle 也要升版本号 |
| feature audit | 精致化只覆盖 T9（默认键盘），经典键盘与 Flash 触屏键外观未改 | 记录：用户反馈的 T9 键盘已重做；经典与 Flash 外观列为后续 |

## R3 评审处理（最后一轮）

diff review、feature audit 均为 `pass`。feature audit 的 P3（修改范围表漏列 `touchpad.js` 与计划文档、目标 4 未写「过滤后取前 12 条」）已补。之后不再改代码。

## 未覆盖

- 没有 Android / iOS 真机与 APK 验证，只在桌面无头 Chromium 的手机视口、CPU 降速与网络限速下测量；真机 GPU、真实网络和 RN WebView 的数值会不同。
- 有 Service Worker 缓存后的再次启动（大多数回访用户）本就走缓存，本次提速主要作用在首次启动、清缓存后或 Service Worker 不可用的场景。
- emoji 改为首帧后加载：在加载完成前绘制的含 emoji 文字显示为系统字体字符而不是图片。
- Flash 与本地复活的启动时间没有测量；经典键盘与 Flash 触屏键外观未改（只改了交互）。
- 横屏时导航区与数字区是两块画布，手指不会从一侧滑到另一侧（两者分居屏幕两边）。
