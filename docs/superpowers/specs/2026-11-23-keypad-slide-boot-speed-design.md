# 虚拟键盘滑动触发、T9 八向轮与模拟器启动提速

## 背景与复现

真实服务（`PORT=18090 pnpm start`）+ 无头 Chromium，390×844 手机视口，Diamond Rush（J2ME）与雷电1944（冒泡）。对照组为同一时段在 18091 端口运行的 `origin/main`（7e2434f）。

| 现象 | 复现 | 根因 |
|---|---|---|
| 从「大家都在玩」点进的游戏加载失败 | 在 J2ME 标签导入本机 JAR 并玩一次，切到冒泡标签，点「大家都在玩」里的这款游戏 → `jar/mygame.jar: HTTP 404`，一直停在启动中 | `cloud.js` 的游玩记录不保存 `local`；历史行也不按标签过滤，冒泡标签的库里没有本机 JAR，补不回 `local`，于是按服务器 JAR 启动。J2ME 标签里点得早（本机库还没加载完）也一样 |
| T9 键盘滑过按键不触发 | 在 4 上按下滑到 5：只有 `+num4 -num4` | `KeyboardCanvas` 只在 Konva 按键的 `pointerdown` 上命中一次，之后不再看指针位置 |
| Flash 触屏键滑过不触发 | 上 → 右 → 下 → A 一路滑过：只有 `+ArrowUp -ArrowUp` | 每个按钮各自 `setPointerCapture`，按下即锁定 |
| T9 没有八向轮 | — | 方向键是 4 个独立方块，斜向只能两指同按 |
| 经典键盘 | 5 → 6 → 9 一路滑过：`+num5 -num5 +num6 -num6 +num9 -num9` | 已支持滑动（`touchpad.js`），不改 |
| Java 启动慢 | 4Mbps / 150ms、CPU 降速 4 倍，冷启动 13.5–14.0s | `java/classes.jar`（2.3MB）要等 `bld/main-all.js` 执行时才开始下载，比脚本晚约 2s；首帧要等 12 张 emoji 图（约 400KB）全部下载完；每次启动 30 多个运行时文件都要 304 往返 |
| 冒泡启动慢 | 同条件冷启动 16–17s | `vmrp_v1.0/fs` 的字库 `gb16.uc2` / `gb12.uc2` 与 `cfunction.ext` 共 3.6MB 未压缩传输（gzip 后约 0.9MB） |

## 目标行为

1. **滑动触发（所有画布键盘与 Flash 触屏键）**：手指落在键盘区域后一直被跟踪到抬起；离开一个键时抬起它，进入另一个键时按下它；从键缝滑入按键也会按下。经典键盘本就如此，保持不变。
2. **T9 八向轮**：方向区改为一个圆形轮盘，中心为 OK。四个主方向各占 60°，斜向各占 30° 并同时按住相邻两个方向；扇区边缘 6° 滞回，手指抖动不跳键。只有落在中心的触摸才确认 OK，从方向滑进中心只松开方向（与经典键盘一致）。正在转轮盘的手指在 1.25 倍半径内保持在轮盘上，不会误按旁边的软键。
3. **T9 外观**：渐变键面 + 实心底边（不用模糊阴影，保持性能）、软键指示条、「挂机」红色、「C 清除」琥珀色、轮盘扇区刻度与主方向箭头、按下时点亮对应扇区。横屏导航区宽高比收窄，不再顶到折叠工具栏下方。
4. **游玩记录**：记录里保存 `local`；每个标签只显示本标签类别的记录，并以本标签已加载的库为准还原游戏（库加载完之前不显示，库里已没有的游戏不显示，同一款游戏按大厅的身份合并去重）。
5. **启动提速**：
   - J2ME 播放器在加载脚本前就开始下载 `java/classes.jar`，`main-all.js` 的 `load()` 直接取用；预取失败时回退到原请求。
   - emoji 图在首帧之后再加载；加载前含 emoji 的文字按普通文字绘制与测量（`©` 等字符也在 emoji 表里，必须有此回退）。
   - 服务器对 `.uc2` / `.ext` 开启 gzip；`/assets/`（Vite 哈希文件）与带 `?v=` 的运行时脚本返回 `Cache-Control: public, max-age=31536000, immutable`。
   - `RUNTIME_VERSION` 升到 `20261123-3`。

## 修改范围

| 区域 | 文件 |
|---|---|
| 命中判定（新） | `apps/web/src/keyboard/hit-test.js`、`hit-test.test.js` |
| 指针状态 | `apps/web/src/keyboard/pointer-state.js`（一个指针可按住多个键、在键缝里也被跟踪）、测试 |
| 键盘画布 | `apps/web/src/keyboard/KeyboardCanvas.jsx`（宿主元素上做坐标命中与滑动；外观；轮盘绘制） |
| T9 预设 | `apps/web/src/keyboard/layouts.js`、`layouts.test.js` |
| 使用方 | `runtime/RuntimeKeypad.jsx`（每个手指 + 动作一个输入源，斜向一次震动）、`keyboard/KeyboardTestPage.jsx`、`runtime/FlashControls.jsx` |
| 游玩记录 | `apps/web/src/cloud.js`、`App.jsx`（`Library` 历史行） |
| 启动 | `runtime/J2MEPlayer.jsx`、`runtime/loadScript.js`、`runtime/j2me/bld/main-all.js`、`apps/server/src/index.ts` |
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
| 经典键盘不变 | 同上 | `+num5 -num5 +num6 -num6 +num9 -num9`（与 main 相同） |
| Flash 触屏键滑动 | 上→右→下→A | 分支 `+ArrowUp -ArrowUp +ArrowRight -ArrowRight +ArrowDown -ArrowDown +ArrowRight -ArrowRight +Space -Space`；main 只有 `+ArrowUp -ArrowUp` |
| 冒泡标签不再出现本机 Java 记录；J2ME 标签点历史正常启动 | 探针 | 通过；旧格式记录（无 `local`）按本机优先还原；已卸载游戏不显示；同一款游戏只出现一次 |
| 键盘测试页滑入 / 滑出 | `verify.mjs`（`VERIFY_KEYBOARD_ONLY=1`） | 键盘段通过；后面 Flash 退出段在 main 上同样超时（既有问题） |
| 外观 | 截图：390×844 / 320×568 竖屏，844×390 / 667×375 横屏，嵌入与浮空，键盘测试页 | 无重叠、无溢出；横屏软键不再被折叠工具栏压住 |

### 启动耗时（4Mbps 下行 / 150ms 延迟 / CPU 降速 4 倍，无 Service Worker，同一时段交替运行，各 2 次）

| 运行时 | 指标 | main | 本分支 |
|---|---|---|---|
| J2ME | 冷启动到首帧 | 13.5 / 14.0s | 11.1 / 11.0s |
| J2ME | 再次启动（HTTP 缓存） | 3.9 / 3.8s | 2.6 / 2.6s |
| J2ME | 运行时文件传输 | 4089KB | 3446KB |
| 冒泡 | 冷启动到画面出现 | 17.3 / 17.1s | 12.0 / 10.9s |
| 冒泡 | 再次启动 | 6.3 / 6.7s | 5.6 / 5.2s |
| 冒泡 | 运行时文件传输 | 4980KB | 2065KB |

J2ME 冷启动现在接近带宽下限（3.4MB ÷ 4Mbps ≈ 6.8s，其余是 CPU 降速下的 JVM 初始化）。冒泡再次启动时资源 1.4s 内到齐，剩下是游戏自身开机画面。

### T9 按键帧率（CPU 降速 4 倍，DPR 3，10 秒每 250ms 触摸一次数字键，共享主机 load 20–27）

| | 游戏帧率 | 平均帧间隔 | P95 | >50ms | 按下 / 触摸 |
|---|---|---|---|---|---|
| main | 12.4 / 11.8 | 18.4 / 19.4ms | 16.8 / 33.3ms | 7 / 13 | 31/31、30/30 |
| 本分支 | 11.7 / 12.6 | 19.4 / 18.6ms | 33.3 / 16.8ms | 14 / 9 | 30/30、31/31 |

两者在噪声范围内一致。

## 未覆盖

- 没有 Android / iOS 真机与 APK 验证，只在桌面无头 Chromium 的手机视口、CPU 降速与网络限速下测量；真机 GPU、真实网络和 RN WebView 的数值会不同。
- 有 Service Worker 缓存后的再次启动（大多数回访用户）本就走缓存，本次提速主要作用在首次启动、清缓存后或 Service Worker 不可用的场景。
- emoji 改为首帧后加载：在加载完成前绘制的含 emoji 文字显示为系统字体字符而不是图片。
- 横屏时导航区与数字区是两块画布，手指不会从一侧滑到另一侧（两者分居屏幕两边）。
