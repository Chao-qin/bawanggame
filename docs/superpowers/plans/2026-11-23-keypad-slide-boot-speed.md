# 虚拟键盘滑动、T9 八向轮与启动提速：实施计划

方案与验收见 `docs/superpowers/specs/2026-11-23-keypad-slide-boot-speed-design.md`。

1. 命中判定与指针状态：新增 `keyboard/hit-test.js`（矩形键 + 八向轮，含滞回、中心确认、漂移保持）；`pointer-state.js` 改为一个指针持有多个单元、键缝中也跟踪。→ verify：`node --test apps/web/src/keyboard/*.test.js`
2. `KeyboardCanvas`：宿主元素上 `pointerdown/move/up/cancel/lostpointercapture` + 指针捕获，按坐标命中，差分抬起 / 按下；Konva 只负责绘制（静态层 + 按下层），重画键面与轮盘。→ verify：键盘测试页滑动、`verify.mjs` 键盘段
3. T9 预设换成轮盘；`RuntimeKeypad` 每个「手指 + 动作」一个输入源；键盘测试页按「指针 + 键」记录。→ verify：J2ME / 冒泡 CDP 触摸探针
4. `FlashControls`：容器级指针处理 + `elementFromPoint` 滑动换键。→ verify：Flash 探针
5. 游玩记录：`cloud.js` 记录 `local`；`Library` 历史行按标签过滤、以库还原、按身份去重。→ verify：本机 JAR + 冒泡标签探针、旧格式记录探针
6. 启动：J2ME 预取 `classes.jar`；`main-all.js` 取用预取、emoji 首帧后加载并加回退；服务器 gzip `.uc2/.ext`、immutable 缓存；`RUNTIME_VERSION` 升级。→ verify：同时段 main / 分支限速对照
7. 横屏几何与截图检查；T9 按键帧率对照。
