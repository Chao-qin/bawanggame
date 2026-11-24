# 运行时弹层统一、键盘统一、横竖屏统一与按键震动

## 背景与复现

在 412×860（竖屏）与 860×412（横屏）的移动端仿真 Chromium 中，用本地服务（`PORT=8093 pnpm start` + Vite）、Diamond Rush（J2ME）、雷电1944（冒泡）、Star Catcher（Flash）复现：

| 现象 | 复现 | 根因 |
|---|---|---|
| 打开「键盘设置」「按键映射」弹层塌陷成左侧一条窄栏 | 竖屏 J2ME 点工具栏键盘图标，弹层体宽 26px、`.adm-popup` 为 0×0 | `mobile-ui.css` 给 `.adm-popup:has(.inputMappingSheet)` 加了 `transform: translateZ(0)`。`.adm-popup` 是 0×0 的包装层，transform 让它成为内部 `position: fixed` 弹层体的包含块，`width: 100%` 变成 0。「游戏设置」是 `panel.js` 自绘的抽屉，不经过这条规则，所以只有它正常 |
| 三个弹层实现不一致 | 游戏设置是 `panel.js` 的 DOM 抽屉；另外两个是各自拼装的 antd `Popup` | 没有共享组件 |
| 方向轮盘太小 | 竖屏 T9 轮盘直径 3.4 / 7.4 设计单位（约 170px） | 四个功能键各占近一半宽度 |
| 功能键图标偏离可见区域 | 图标放在键盒几何中心附近，键盒内角被轮盘的弧切掉 | 只按几何中心再「推离弧线」 |
| Flash 看不到键盘切换，也不知道接的是什么键 | Flash 工具栏没有键盘按钮；屏幕按键是另一套 DOM 方向键，没有说明 | 键盘设置只给 J2ME / 冒泡 |
| 横屏工具栏收起后仍盖住游戏画面顶部 | J2ME / 冒泡横屏收起态是一条 46vw 宽的空栏 | 横屏浮动工具栏的宽度规则没有排除收起态；Flash 走另一套规则 |
| J2ME 强制横屏时工具栏仍按竖屏处理 | 视口竖屏 + 游戏强制横屏 | 工具栏只看视口方向，舞台和键盘看 `body[data-orientation]` |
| Flash 屏幕按键没有震动 | — | `FlashControls` 未调用任何震动 |
| 按键震动「有时不灵，玩很久才出现」 | 桌面仿真里每次按下都调用了 `navigator.vibrate`；用真实触摸从大厅启动游戏后，新建的运行时 iframe 在它自己的第一次触摸结束前 `userActivation.hasBeenActive` 一直为 `false`，浏览器会拒绝该 iframe 的震动，而大厅主文档已被启动那一下激活 | 已确认一处：每局游戏开头的按键在浏览器里不震。「玩很久才出现」的完整根因未在真机确认 |

### 冒烟脚本 `apps/web/verify.mjs` 的既有失败

origin/main 上 `verify.mjs` 在第一处就失败。逐处判定是脚本过时还是应用错误，结论如下：

| 失败点 | 判定 | 依据 | 处理 |
|---|---|---|---|
| direct play route 后返回大厅超时 | **应用缺陷** | 复现：退出过一次游戏后再通过直达链接进入，立即弹出「退出当前游戏？」，之后去大厅的导航被吞、游戏被重新拉起。直达链接会先把 `/play/` 替换成大厅再压入游戏，这次应用自己的替换被 `useBlocker` 当成离开游戏拦下 | `App.jsx`：直达入口的替换跳转标记为应用自身导航（与「退出游戏」同一个 `exitingRef`） |
| 「浏览器返回没有恢复上一个标签」 | 脚本过时 | 2026-11-22 的生命周期方案明确「切换大厅标签用 replace」，断言写于 2026-11-19 | 改为断言切换标签不新增历史记录 |
| J2ME 横屏几何读 `#nav/#numpad` 全为 0 | 脚本过时 | T9 已是默认，经典键盘 DOM 被隐藏 | 两种键盘样式各测一遍 |
| 游戏中点击大厅「Flash 商城」标签后商城不出现 | 脚本过时 | 游戏中大厅标签是隐藏的，用户点不到；离开游戏需要确认 | 先经确认退出游戏再切标签 |
| 经典键盘「标准」左右布局仍把导航放在左边 | **应用缺陷** | 复现：`TouchLayout.apply({ sides: 'standard' })` 后 `data-side-layout` 变了但导航仍在左列。`main.css` 横屏规则用 `grid-column … !important` 无条件钉死左右；「互换」规则又只认 `data-orientation`，冒泡走不到 | `main.css`：去掉无条件的 `!important` 列，左右由 `data-side-layout` 决定，并覆盖 `viewport-landscape` |
| 冒泡段找不到 `.player` | 脚本过时 | 冒泡早已在运行时 iframe 里运行 | 进入 iframe 检查，并补「共用 T9 键盘」「退出回到冒泡大厅」断言 |

## 目标行为

1. **统一弹层 `RuntimeSheet`**：游戏设置、键盘设置、按键映射都用同一个底部弹层组件（同一层级、尺寸、标题栏与关闭按钮），一次只开一个。游戏设置的内容仍由 `panel.js` 生成，打开时挂进弹层体（`window.__XIAOCHAO_SETTINGS_HOST__`），面板内部的关闭（Esc、打开文件管理、切换蓝牙房间）会关闭弹层。合成层提示只加在遮罩和弹层体上，不加在 `.adm-popup` 包装层上。
2. **T9 竖屏布局**：轮盘直径 3.4 → 4.2（超过键盘宽度一半），四个功能键只占轮盘留下的角；数字区键尺寸与间距不变（2.4×0.8，步进 2.5×0.9），键盘整体略增高，CSS 比例同步为 7.4 / 7.95。
3. **功能键图标视觉居中**：图标中心取可见区域（键盒减去轮盘圆盘）的最大内切圆圆心，多个近似最优点中取最接近可见区域质心的一个；图标尺寸按内切半径给出。软键指示条放在图标上方。
4. **键盘按模拟器族统一**：
   - 手机族（J2ME + 冒泡）共用 `xiaochao.runtimeKeypad.v1`：T9 直板 / 经典，嵌入 / 浮空（仅 T9）。
   - Flash 族用 `xiaochao.flashKeypad.v1`：游戏手柄（方向轮盘，中心 Enter；A = 空格，B = X）/ 隐藏；嵌入 / 浮空（仅手柄）。鼠标设备未保存过选择时默认隐藏，触屏默认手柄。
   - Flash 手柄改用与 T9 同一个画布键盘（`KeyboardCanvas`），新增 `flash-portrait` / `flash-landscape` 预设。
   - 键盘设置弹层显示「当前键盘」、适用范围与按键说明。
5. **横竖屏统一**：工具栏、舞台、键盘都用同一判据（`body[data-orientation="landscape"]` 或 `body.viewport-landscape`）。竖屏：工具栏独占一行，收起后舞台占满；横屏：展开时工具栏浮在画面上方中间，收起时只剩左上角按钮。Flash 竖屏键盘在画面下方、横屏分列两侧，与 J2ME / 冒泡一致；全屏保留所选键盘。
6. **震动**：所有屏幕键盘（T9、Flash 手柄、经典键盘）走同一个 `haptics.js`：触摸才震、读取运行时震动设置（未设置 24ms）、一次滑动按下两个方向只震一次（经典键盘也一样）。浏览器里改用最外层同源窗口（大厅主文档，已有用户激活）的 `navigator.vibrate`，不再用新建的运行时 iframe 自己的；原生宿主在每次按下时沿 iframe → 父窗口查找；合并窗口改用按下时的 `performance.now()`。这些是已确认问题的修复与加固，「玩很久才出现」的完整根因仍需真机确认。

## 修改范围

| 区域 | 文件 |
|---|---|
| 统一弹层 | `apps/web/src/runtime/RuntimeSheet.jsx`（新）、`GameSettingsSheet.jsx`（新）、`KeypadSettingsPopup.jsx`、`InputMappingPopup.jsx`、`App.jsx`、`runtime/j2me/panel.js`、`runtime/j2me/input-mapping.js`（输入排除选择器改名） |
| 键盘 | `apps/web/src/keyboard/layouts.js`、`KeyboardCanvas.jsx`（圆形键）、`apps/web/src/runtime/keypad-prefs.js`、`RuntimeKeypad.jsx`、`FlashKeypad.jsx`（新，替换 `FlashControls.jsx`）、`FlashPlayer.jsx`、`runtime-keypad.css` |
| 横竖屏 | `apps/web/src/mobile-ui.css`、`App.jsx`、`RuntimeKeypad.jsx`（`useRuntimeOrientation`） |
| 震动 | `apps/web/src/runtime/haptics.js`（新）、`PhoneMarkup.jsx`、`runtime/j2me/touchpad.js` |
| 缓存 | `apps/web/src/runtime/loadScript.js`：运行时脚本改动，`RUNTIME_VERSION` 升到 `20261124-1` |
| 路由 / 经典键盘缺陷 | `apps/web/src/App.jsx`（直达入口）、`runtime/j2me/style/main.css`（横屏左右列） |
| 验证 | `layouts.test.js`、`keypad-prefs.test.js`、`haptics.test.js`（新）、`apps/web/verify.mjs`（见上表） |

## 不可破坏的现有行为

- J2ME / 冒泡键盘选择的存储键与默认值不变（T9 + 嵌入）。
- 经典键盘、自定义触屏键位、按键映射、手柄绑定不变。
- Flash 实体键盘输入仍直达 Ruffle；屏幕按键成对发送 keydown / keyup，多指按同一键时最后一指抬起才释放。
- 运行时只启动一次、退出与返回流程不变。

## 验收标准

| 项 | 验证 |
|---|---|
| 三个弹层不塌陷 | 竖屏打开键盘设置：弹层体宽 412、高 563；游戏设置：宽 412，内容为 `panel.js` 设置；按键映射：宽 412 |
| 轮盘与数字区 | 单测：轮盘 4.2、数字键 2.4×0.8 不变；截图 |
| 图标视觉居中 | 单测：图标中心的可见深度 ≥ 独立细网格最大值的 90%，且不低于键盒几何中心 |
| Flash 键盘 | 工具栏出现键盘设置；手柄按键依次发出 ArrowRight / Enter / 空格 / X 的 keydown + keyup；切到「隐藏」后屏幕键消失、画面占满 |
| 横竖屏 | J2ME、冒泡、Flash 横屏截图：收起态只剩左上角按钮，画面不被遮挡 |
| 震动 | 单测：触摸才震、合并窗口、设置为 0 时不震、iframe 中能找到后注入的原生宿主 |
| 冒烟脚本 | `VERIFY_J2ME_FILE=diamond.jar VERIFY_MRP_FILE=1000_240320_gld.mrp node apps/web/verify.mjs` 输出 `RESULT PASS` |

## R1 审查与修复

| 来源 | 级别 | 问题 | 处理 |
|---|---|---|---|
| diff review + feature audit | P1 | J2ME 游戏强制横屏、手机竖拿时，工具栏默认收起且展开按钮被隐藏，返回大厅、游戏设置、全屏都不可达（本 PR 引入：工具栏改用统一方向判据，而显示按钮的规则只看视口） | `mobile-ui.css`：`body[data-orientation="landscape"]` 下显示按钮、收起时舞台让出左上角；verify 新增该场景 |
| diff review | P2 | J2ME / 冒泡横屏打开键盘设置，弹层内容高于屏幕却不能用手指滚动（运行时 `main.css` 对 iframe 内所有元素 `touch-action: none !important`） | `mobile-ui.css`：弹层及其内容 `touch-action: pan-y !important`；verify 新增横屏触摸滚动检查 |
| diff review | P3 | 游戏设置挪进弹层后，输入框失去 `#panel *` 的文本选择豁免 | `main.css`：豁免扩展到 `.runtimeSheet .panel-box` |
| diff review | P3 | 经典键盘震动没有走合并窗口；`FLASH_KEY_LEGENDS` 未使用 | 经典键盘经 `keyHaptic` 合并；删除死导出 |
| feature audit | P2 | 震动根因未证实 | 补充证据与修复（见上「震动」），报告中标注为「加固，完整根因待真机确认」 |
| feature audit | P3 | 横屏 T9 轮盘未放大；Flash 震动无法关闭；`local-revival` 竖屏工具栏也变为独立一行 | 记录为已知取舍：横屏轮盘已占所在列约 71%；Flash 暂无设置页；`local-revival` 与其他运行时一致 |


## 追加需求（同一 PR，第二批）

用户在 R2 之后追加：顶栏收起/展开不得影响虚拟屏幕；顶栏随时显示/隐藏键盘；键盘透明度可选；键盘布局方向可手选；虚拟屏幕可选宽度撑满/高度撑满；把键盘设置扩充为「游戏表现」并分区；修复此前列出的全部可优化项。

| 需求 | 实现 | 验证 |
|---|---|---|
| 顶栏收起/展开不影响画面 | 顶栏占用的空间固定：竖立屏幕在舞台上方留一行，横放屏幕在舞台左侧留一条；收起只隐藏按钮。原先按收起状态改舞台的 uno preflight 已删除（`mobile-ui.css`、`uno.config.js`） | verify：J2ME 竖横屏各切一次，画布矩形不变；浏览器中 J2ME、冒泡、Flash × 横竖屏 6 种组合均不变 |
| 顶栏显示/隐藏键盘 | 顶栏新增眼睛按钮，与「游戏表现 → 显示键盘」是同一个设置 `visible`；隐藏时画面占满舞台（`runtime-keypad.css`、`FlashKeypad.jsx`） | verify：J2ME 与 Flash 各点一次 |
| 键盘透明度 | `opacity`：自动（嵌入 100%、浮空 60%）/ 100 / 80 / 60 / 40% | verify：40% 时 T9 键盘计算透明度 0.4 |
| 布局方向手选 | `layout`：跟随屏幕 / 竖排 / 横排。舞台只认 `body[data-orientation]`：J2ME 由 `screen.js` 计算（游戏自身方向 > 本选项 > 视口），冒泡由 `useKeypadStage`、Flash 由 `FlashPlayer` 设置；运行时样式里的 `.viewport-landscape` 舞台规则统一改为该属性。竖立屏幕上的横排两侧列变窄，给画面留出空间 | verify：横屏视口选竖排、竖屏视口选横排均生效，横排时画面宽 ≥ 120px |
| 宽度撑满 / 高度撑满 | `fit`：完整显示 / 宽度撑满 / 高度撑满。J2ME 在 `updateCanvas`、冒泡在 `fit()` 按选项计算缩放，超出部分由屏幕框居中裁切；Flash 读取影片尺寸后按选项定位播放器（同时解决画面贴顶） | verify：宽度撑满时画布宽 = 屏幕框内容宽，且高于框；单测 `flash-player-box.test.js` |
| 「游戏表现」分区 | 原「键盘设置」改名为「游戏表现」，分「键盘」「画面」「按键说明 / 本游戏按键」三段 | 截图 |
| Flash 改键 | 每个游戏单独保存方向键（方向键 / WASD）、OK、A、B 对应的按键，按键上的小字随之变化（`flash-keys.js`） | 单测 `flash-keys.test.js` |
| 横屏 T9 轮盘放大 | 2.0 → 2.3，功能键图标仍按视觉中心放置 | 单测 |
| 运行时文字默认中文 | `config/i18n.js`：非俄语环境一律中文（原来浏览器不是中文就显示英文） | 截图 |
| 经典键盘横屏安全区内边距失效 | `--landscape-side / --landscape-gap` 定义在 `.runtime-stage` 上，键盘半区也能取到 | 规则改动 |
| 浮空 T9 竖屏偏窄 | 浮空高度上限 44vh → 50vh | 规则改动 |
| verify 偶发失败 | 启动时固定等 1.5 秒改为等标签栏真正出现 | 连续运行通过 |

R2 之后又发现并修复：Flash 退出后迟到的 `loadedmetadata` 事件访问已清空的播放器而抛错（verify 的控制台检查抓到）。

未纳入（原因）：

- APK 改用系统按键触感（`performHapticFeedback`）：需要新增 Android 原生代码，本机没有 Android SDK / Java，无法构建与验证 APK，不交付未经验证的原生改动。
- 手动改地址栏哈希离开游戏不弹确认：React Router 对非它创建的历史记录无法拦截，APK 中不存在此入口。
- 文件管理、蓝牙房间、冒泡输入框仍是各自的浮层（由游戏设置或游戏本身打开），不在本次「三个顶栏弹层统一」范围内。

## 残余风险

- 震动「玩很久才出现」未能在真机复现，本 PR 修的是已确认的隐患（宿主只在启动时复制一次、跨文档时间基准、Flash 无震动）。Android Chrome 在静音（铃声模式为静音）时可能忽略网页 `navigator.vibrate`（平台行为，未在本环境核实），APK 内走原生 `Vibration` 不受影响。需要真机确认。
- Flash 手柄的震动固定 24ms，暂无关闭开关。
- 竖立屏幕上选「横排」或横放屏幕上选「竖排」时画面较小，这是用户的主动选择。
- 「宽度撑满 / 高度撑满」会裁掉另一方向超出的画面；J2ME 的 LCDUI 高级界面（表单）随画布缩放，未在大量游戏上抽测。
- Flash 部分 SWF 自身设定顶部对齐，画面在竖屏会贴在上方（Ruffle 既有行为，未改）。
- 同一页面里手动改地址栏哈希离开游戏时，React Router 对不是它创建的历史记录无法拦截，返回不会弹确认（框架限制；从大厅进入、或新开直达链接都会正常弹确认）。
- 经典键盘横屏的安全区内边距引用了只在 `#display-container` 上定义的 `--landscape-gap`，实际为 0（既有问题，本 PR 未改尺寸）。
