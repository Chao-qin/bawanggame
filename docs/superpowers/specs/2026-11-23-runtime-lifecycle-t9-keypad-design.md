# 模拟器生命周期修复与 T9 直板键盘

## 背景与复现

在 390×844 手机视口的无头 Chromium 里，用真实服务（`PORT=18080 pnpm start`）、Diamond Rush（J2ME）和雷电1944（冒泡）复现到下列问题：

| 现象 | 复现 | 根因 |
|---|---|---|
| 退出游戏退不出去，路由停在 `/play/` | 工具栏「返回大厅 → 退出游戏」后 URL 不变、iframe 仍在、大厅不可见 | iframe 发出退出消息后，父页面 `leaveGame` 的 `navigate` 被自己的 `useBlocker`（拦截一切离开 `/play/` 的导航）拦下，又转成「请求返回」弹回确认框 |
| 进游戏后提示加载不到资源、各种 js 报错 | 原生返回或浏览器返回一次、点「继续游戏」后，控制台 `TypeError: Cannot redefine property: CLASSES`（`bld/j2me.js`）与 `removeChild ... not of type 'Node'`（`bld/main-all.js`） | `App` / `RuntimeFramePage` 每次渲染都新建 `game` 对象，`J2MEPlayer` / `MrpPlayer` 的启动 effect 依赖 `[game, onExit]`，于是任何一次重渲染都会在**同一个文档**里停掉模拟器、重新执行全部 classic 运行时脚本；这些脚本不可重入 |
| Java 异常卡顿 / 卡死 | CPU 降速 4 倍下，游戏帧率（`MIDP.frames`）15.6 fps → 返回并继续后 0 fps | 同上：重启后虚拟机停摆 |
| 浏览器滑动返回乱跳 | 切换大厅标签每次 push 历史；退出游戏用 replace，历史里出现两条大厅；iframe 里点「继续游戏」后父页面 blocker 不复位，之后的返回全部失效 | 历史栈与 blocker 状态没有统一管理 |
| 资源失败被长期缓存 | — | `sw.js` 把 404 / 500 响应也写进 cache-first 缓存 |
| 空闲耗电 | — | `input-mapping.js` 在没有手柄时也每 16ms 轮询 `getGamepads()` |
| 点弹窗时误按游戏键 | 在键盘设置弹窗上点「关闭」，控制器收到 `touch:clear` | `touchpad.js` 在 document 上监听 `pointerdown`，用 `elementsFromPoint` 按坐标找键，透过浮层命中下面的经典按键；按键映射弹窗、退出确认框同样受影响 |
| 冒泡竖屏画面被工具栏压住 | 冒泡画面从 y=0 开始 | 竖屏「工具栏独占一行」的样式只写给了 `.j2mePlayer` |
| 经典键盘按键时卡顿 | CPU 降速 4 倍、每 250ms 按一次真实按键：main 上 7.9–9.0 fps，P95 83–100ms | `keypad-canvas.js` 每次按下 / 抬起都整块重画 DPR 3 画布（每键偏移阴影、OK 键模糊阴影、逐键 `getBoundingClientRect`）。本 PR 未改经典键盘，改为默认 T9 |

## 目标行为

1. **游戏会话生命周期**：一个游戏页面里运行时只启动一次；外层重渲染（返回请求、确认框、设置变化）不会重启模拟器。同一文档里再次启动被拒绝，并给出明确的失败提示，而不是静默执行不可重入的脚本。
2. **退出与返回**：
   - 应用自己发起的退出不经过 blocker。
   - 从大厅进入的游戏，退出时回退到进入前的那条历史记录，不留下重复记录。
   - 直达链接进入的游戏退出时替换为大厅。
   - 浏览器返回 / 滑动返回 / 原生返回都先弹确认框；在 iframe 里选「继续游戏」时，父页面的 blocker 复位。
   - 切换大厅标签用 replace，返回手势不在标签之间来回跳。
3. **T9 直板键盘**：
   - 键盘测试页新增「直板手机」类别，包含 `T9 直板（竖屏）` 与 `T9 横屏（左方向 · 右数字）` 两个预设。
   - Java 与冒泡默认使用 T9 键盘：竖屏用竖屏预设；横屏用横屏预设，导航区在屏幕左侧，数字区在右侧。「横屏」与运行时样式同一判据：`body[data-orientation="landscape"]`（J2ME 的 `screen.js`，含游戏强制方向）或 `body.viewport-landscape`（视口，冒泡只有这个）。
   - 用户可在游戏工具栏的「键盘」里选择：
     - 键盘样式：T9 直板（默认）/ 经典。
     - 键盘位置：嵌入布局（占用文档流，屏幕让出空间，默认）/ 浮空（叠在屏幕上方、半透明，屏幕占满舞台）。
   - 选择全局保存（`localStorage` 的 `xiaochao.runtimeKeypad.v1`），对两个模拟器都生效。
4. T9 按键统一经 `window.__XIAOCHAO_INPUT_CONTROLLER__` 注入（Java 由 `keymap.js` 创建，冒泡由 `mrp-runtime.js` 创建）。长按连发沿用 `InputMapping` 的既有参数；按下时按设置震动。

## 修改范围

| 区域 | 文件 |
|---|---|
| 路由与退出 | `apps/web/src/App.jsx` |
| 运行时启动 | `apps/web/src/runtime/J2MEPlayer.jsx`、`MrpPlayer.jsx`、`runtime-boot.js`（新）、`cleanup.js` |
| 键盘 | `apps/web/src/keyboard/layouts.js`、`KeyboardTestPage.jsx`、`runtime/RuntimeKeypad.jsx`（新）、`runtime/keypad-prefs.js`（新）、`runtime/KeypadSettingsPopup.jsx`（新）、`runtime/runtime-keypad.css`（新）、`runtime/PhoneMarkup.jsx` |
| 运行时脚本 | `runtime/mrp/mrp-runtime.js`（`tapFx` 判空；`#display-container` 尺寸变化时重新适配画面）、`runtime/j2me/input-mapping.js`（手柄按需轮询）、`runtime/j2me/touchpad.js`（只处理落在 `#phone` 里的触摸） |
| 键盘画布 | `apps/web/src/keyboard/KeyboardCanvas.jsx`：按像素坐标绘制（缩放组里的中文字形会叠在一起）、实心底边代替模糊阴影、静态层 + 按下层 |
| 冒泡布局 | `apps/web/src/mobile-ui.css`、`App.jsx`：竖屏工具栏规则改为针对 `.phoneRuntimePlayer`（J2ME 与冒泡共用） |
| 离线缓存 | `apps/web/public/sw.js` |

## 不可破坏的现有行为

- 经典键盘（DOM 按钮 + `keypad-canvas.js` + `touchpad.js`）、自定义触控布局、按键映射弹窗、物理键盘与手柄输入照常可用。
- 经典键盘的 DOM 始终保留（只隐藏），运行时脚本按 id 查找它们。
- Flash 与本地复活走父页面 `Player`，行为不变。
- RN 宿主的原生返回协议（`__XIAOCHAO_NATIVE_BACK__` / `__XIAOCHAO_NATIVE_BACK_REQUEST__`）不变。

## 验收标准

| 项 | 验证方式 |
|---|---|
| 进入 → 退出 → 再进入 Java 游戏连续 3 次，每次都回到大厅，无页面异常 | 无头浏览器探针 |
| 返回请求 + 继续游戏后，游戏帧率不归零，无 `CLASSES` / `removeChild` 异常 | 探针，CPU 降速 4 倍，记录帧率 |
| 浏览器返回弹确认、继续游戏后再返回仍能弹确认 | 探针 |
| 退出后历史栈不出现重复的大厅记录 | 探针记录 `history.length` 与 URL |
| T9 竖屏 / 横屏 × 嵌入 / 浮空 四种组合在 Java 与冒泡里都能渲染并驱动游戏 | 探针截图 + 按键后游戏画面变化 |
| 预设几何：每个动作恰好一个键，键不重叠，横屏两组之间留出屏幕空间 | `node --test` 单测 |
| 手柄：无手柄时不轮询，连接后轮询，断开后停止 | `node --test` 单测 |
| `sw.js` 不缓存非 2xx 响应 | 代码审查（无自动化） |

## 性能实测

无头 Chromium（软件光栅，真机 GPU 画布的绝对数值会不同，只看相对关系），390×844，DPR 3，CPU 降速 4 倍，Diamond Rush 游戏中，10 秒，每 250ms 用 `page.touchscreen.tap` 点一次**真实按键中心**（轮流 5/8/2/4/6），同时统计控制器实际收到的按下次数。共享主机，测量时 load average 约 28–43，**绝对数值随负载浮动，只比较同一时段内的相对关系**：

| 键盘 | 游戏帧率（`MIDP.frames`） | 平均帧间隔 | P95 | >50ms 帧 | 按下 / 点击 |
|---|---|---|---|---|---|
| main，经典（改动前默认） | 7.9 / 9.0 | 29.7 / 28.1ms | 99.9 / 83.3ms | 63 / 63 | 29/29、30/30 |
| 本分支，经典 | 8.7 / 8.7 | 29.4 / 29.0ms | 83.4 / 83.4ms | 61 / 61 | 29/29 |
| 本分支，T9（默认） | 15.9 / 16.2 | 17.9 / 17.8ms | 16.8 / 16.8ms | 8 / 6 | 35/35 |

T9 首版（每键模糊阴影、按下重画整层）同条件下 10 秒只画 8 帧；改为实心底边、静态层 + 按下层后得到上表。

返回并继续游戏前后（同条件，不点键盘）：修复前 15.6 → 0 fps；修复后 15.8 → 19.6 fps。

（R1 前此表的「经典」一行点在 `#numpad` 正中的空隙上，一次也没按到，已作废。）

R2 validation 在另一时段独立复测（同样 4 倍降速）：经典键盘 main / 本分支用触摸点击 5.9 / 5.8 fps、P95 约 150ms，用鼠标点击（按住 60ms）1.5–2.1 fps；T9 15.6–16.0 fps、P95 16.8ms，40/40 次全部按到。绝对值与上表不同，但「经典键盘慢且 main 与本分支一致、T9 明显更快」的关系不变。

## R1 评审处理

| 来源 | 级别 | 问题 | 处理 |
|---|---|---|---|
| validation | P2 | 经典键盘性能数据没按到键 | 重测，见上表 |
| feature audit | P2 | 冒泡横屏转回竖屏后画面错位 | 冒泡的 `fit()` 在工具栏行与键盘尺寸落定前就量了显示区；改为显示区尺寸变化时重新适配。旋转探针：竖 → 横 → 竖三次尺寸一致 |
| diff review | P3 | J2ME 强制竖屏 + 横屏视口时 T9 选错预设 | 横屏判据与运行时样式一致 |
| diff review | P3 | 冒泡经典键盘横屏行为被改变 | 撤掉为冒泡写入 `data-orientation` 的代码（冒泡本就由 `.viewport-landscape` 得到横屏布局） |
| 自查 | — | 浮空横屏时屏幕没有铺满 | 显示区去掉左右留边（宽 326 → 788px） |
| feature audit | P3 | 键盘图标像放大镜；横屏两半无障碍标签相同 | 换图标；两半分别标注 |
| feature audit | P3 | 浮空遮住画面下部 | 选项说明写明 |
| feature audit | P3 | 以前自定义过经典触屏键位的用户会默认切到 T9 | 弹窗说明写明「经典支持自定义触屏键位」；记为残余风险 |
| feature audit | P3 | T9 不支持按住滑到相邻键 | 记为已知限制 |
| validation | P3 | 横屏时折叠的工具栏按钮压住画面顶部约 60px | main 上同样存在（J2ME 画面 top 12 / 工具栏 bottom 62），不在本 PR 处理 |

## R2 评审处理

三个 pass 均为 `pass`，只有 P3。以下修复后进入 R3：

| 来源 | 问题 | 处理 |
|---|---|---|
| diff review | `leaveGame` 被连续调用（如连点 Flash 失败页的返回、退出途中又按返回）会 `navigate(-1)` 两次，越过大厅离开应用 | 退出中再次调用直接返回；探针：iframe 连发两次退出消息，修复前落到 `about:blank`，修复后停在大厅 |
| diff review | 按下层下沉 0.04 单位，上沿露出静止键面 | 按下的键面与静止键面重合，不再偏移 |
| diff review | 经典键盘只认 `#phone` 内的触摸，可能丢掉安全区留白里的触摸 | 放宽到运行时舞台 `[data-runtime-stage]`（弹窗、确认框、工具栏都在舞台之外）。R3 实测：按键边缘的触摸照常按下；留白里本就没有按键元素，点在那里仍不会按键——这条只是不再把舞台内的触摸提前排除，并不额外扩大可按区域 |
| feature audit | 键盘设置图标不像键盘 | 换成九宫格 `AppstoreOutline` |
| validation | 性能表绝对值不可复现 | 注明点击方式与主机负载，并附 R2 的独立复测 |

R2 记录、不在本 PR 处理（main 上同样存在）：游戏在竖屏视口里强制横屏时画面缩到约 10×13px；冒泡直达链接带 `tab=j2me`，退出落到 J2ME 标签；每次触摸控制台都有一条 passive 监听器的 preventDefault 警告；横屏时折叠的工具栏压住画面顶部。
退出改为历史回退后，大厅之后会留一条「前进」记录，前进手势会重新打开该游戏（新的运行时）。

## R3 评审处理（最后一轮）

diff review、feature audit、validation 三个 pass 均为 `pass`，没有 P0/P1/P2。R3 之后不再改代码，以下 P3 记录为后续任务：

| 来源 | 问题 | 现状 |
|---|---|---|
| diff review / feature audit / validation | 浏览器返回已被拦截时，同一任务里收到两条退出消息，第二次 `blocker.proceed()` 抛 `Invalid blocker state transition` | 仍正确回到大厅、历史不增；正常使用由 iframe 内 `exitStartedRef` 挡住重复发送，只有程序化重复发送能触发；main 同样存在。修法：在 `proceed()` 前置 `exitingRef` |
| diff review | 应用自己的退出导航尚未完成时用户再按返回，可能多退一步 | 窗口极短，且第二次是用户主动返回；`leaveGame` 的注释比代码覆盖的多 |
| diff review | 宿主 WebView 若改写历史，`navigate(-1)` 可能退不出 | 目前所有进入路径都保证游戏条目下方是大厅；可加「退出 500ms 后仍在 /play/ 则 replace 到大厅」兜底 |
| diff review | 键盘设置图标与品牌、J2ME 标签相同 | 外观问题 |

R3 validation 对照（CPU 降速 4 倍）：本分支三轮「返回请求 → 继续游戏」帧率 14.6–17.8 → 19.4、脚本数 30 → 30、退出回大厅、`history.length` 恒为 3；main 第一轮后停帧、退出停在 `/play/`、报 `CLASSES` / `removeChild`。按键映射弹窗上点击：main 21/21 误按下层经典键，本分支 0/21。T9 每键 20/20（J2ME 竖横屏、嵌入与浮空；冒泡竖横屏嵌入）；T9 18.0 fps、P95 16.8ms，经典 7.6 fps、P95 83.4ms。

## 未覆盖

- 真机：没有 Android / iOS 真机，本次只在桌面 Chromium 的手机视口和 CPU 降速下验证。
- RN 宿主里的原生返回只验证了网页侧协议，没有跑 APK。
- 手柄按需轮询只有单测，没有接真实手柄；`sw.js` 只做了代码审查。
- 经典键盘的按键卡顿是原有问题，本 PR 只把默认换成 T9，没有优化经典键盘的绘制。
- T9 键不支持按住滑到相邻键；T9 画布对读屏只是一张图，不如经典键盘的按钮可访问。
