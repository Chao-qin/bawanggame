# 安装包在线服务、冒泡全量目录、整机旋转与全局键盘系统

## 任务契约

| 项 | 内容 |
|---|---|
| 目标行为 | 1. APK 不配置任何地址即可使用 52java 商城与 Flash 商城；2. Web 部署与 APK 都能看到全部冒泡游戏；3. 「屏幕方向」选横屏/竖屏时整个应用旋转，选「跟随手机」时随设备；4. 横屏时顶栏与游戏画面同一中心；5. 全局键盘系统：所有屏幕键盘统一管理、任一运行时可选任一键盘、浮动键盘可拖动/缩放/隐藏、实体键盘与手柄统一映射；6. Flash 退出后不再残留声音 |
| 修改范围 | `apps/web`（页面、运行时 UI、键盘系统）、`apps/mobile`（RN 宿主、Android 原生模块、打包脚本）、`apps/server`（解析逻辑抽取）、`runtime/j2me`（输入引擎、方向请求）、`pack-site.sh`、`Dockerfile` |
| 不可破坏 | 桌面 Node 服务的 `/__52java/*`、`/__flash/*` 接口与响应形状；已有逐游戏按键映射与触屏键位；未设置方向时的布局；旧版 keypad 偏好可读 |
| 验收 | 见文末「验证」 |

## 1. 安装包在线服务

APK 内没有 Node 服务，商城此前只能在构建时注入 `MOBILE_52JAVA_API_BASE`。现在：

- 页面统一经 `apps/web/src/online.js` 的 `onlineFetch(path)` 请求 `/__52java/*`、`/__flash/*`：浏览器走 Node 代理；设置了 `MOBILE_52JAVA_API_BASE` 的包走该地址；否则由 RN 宿主回答（`online.fetch` 桥接请求，带 id 的请求/应答）。
- 宿主 `apps/mobile/src/host/onlineProxy.ts` 用原生 `fetch`（不受 CORS 限制）请求 52emu / flash.homes，与 Node 代理共用 `apps/server/src/javaCatalog.ts`、`flashCatalog.ts` 的解析。下载写入静态根目录 `__downloads/`（启动时清空），页面再从本地服务读回；52emu 下载的 https→http 跳转由 fetch 跟随，最终地址仍按 52emu 主机白名单校验，并校验 ZIP / SWF 签名与大小上限（JAR 经 JS 内存转存，限 16 MiB；SWF 由原生下载器落盘，限 64 MiB）。宿主只声明本机能提供的能力（`online.fetch` 仅 Android，`orientation.lock` 仅在原生模块注册时）；桥接请求带超时，超时后挂起项被清理。
- 同类问题一并处理：APK 内置 JAR 的图标在打包时导出到 `jar-icons/`；外部链接（如「打开原站」）交给系统浏览器，不再替换应用页面。

## 2. 冒泡全量目录

- 根因：Docker 镜像把冒泡清单写成 `[]`（修复在 11-22 整树回滚时被撤销）；APK 只带兼容扫描确认可运行的 32 款。
- `pack-site.sh` 输出全部 664 款，`bundled` 标记是否随包、`compat` 记录扫描结果；`Dockerfile` 从固定提交稀疏检出 `vmrp_v1.0` 运行时，清单全部 `bundled: false`。
- `apps/web/src/maopao.js`：未随包的游戏从 `https://vmrp.github.io/public/mrps/` 加载（该站允许跨域）；卡片标注「需联网」「可能无法运行」；断网启动时提示「该游戏需联网下载」。

## 3. 整机旋转与 4. 顶栏对齐

- `apps/web/src/orientation.js` 是唯一的方向控制器，按优先级：RN 宿主原生旋转 Activity（`XiaochaoOrientationModule.kt`，`orientation.lock`）→ `screen.orientation.lock` → 触屏设备上 CSS 旋转 `#root` 90°。旋转期间 `getBoundingClientRect`、`elementFromPoint` 与指针/触摸事件坐标对 `#root` 内元素换算为旋转后的布局坐标，Konva 键盘、touchpad、J2ME 与 vmrp 引擎无需逐个修改；Ruffle 使用浏览器原生处理变换的 `offsetX`。鼠标设备保持原先只改布局的行为。
- J2ME 由 `screen.js` 请求（游戏自身方向优先于「屏幕方向」），MRP/Flash 由 Player 请求；J2ME/MRP 运行在同源 iframe 内，iframe 被移除时由父页面交还方向（交还请求总是发送，不受缓存影响）。
- 全屏元素位于顶层、不受 `#root` 的变换影响，因此全屏期间不做 CSS 旋转；退出全屏时清除浏览器锁定记录，下一次进入全屏重新锁定。
- 横屏顶栏：舞台左侧为收起按钮预留了条带，画面居中于舞台，而展开的顶栏居中于整个视口，两者相差 `(条带 + 左安全区 − 右安全区) / 2`。顶栏改为以舞台中心定位。

## 5. 全局键盘系统

- 引擎：`runtime/j2me/input-mapping.js` 扩展为多键盘族（`phone`：J2ME/MRP 的 21 个动作；`flash`：方向/OK/A/B），绑定按「本游戏 → 键盘页全局 → 默认」解析；修正手柄 LB/RB 绑定到不存在动作的问题。Flash 接入同一引擎：手柄与重新绑定的实体键盘按键转成本游戏按键送给 Ruffle，未绑定的实体键直接进入游戏。
- 注册表：`apps/web/src/keyboard/system.js` 定义键盘族、8 种画布键盘目录（T9、游戏手柄、方向键+ABXY、数字小键盘、60%、75%、TKL、全尺寸），以及各族对按键的解释；`ScreenKeypad.jsx` 是所有屏幕键盘共用的渲染基座。J2ME/冒泡另保留经典 DOM 键盘。
- 「键盘」页（大厅顶栏入口，`#/keyboard`）：每个键盘族的屏幕键盘设置与全局按键映射，可点按预览键盘上的键直接进入绑定，支持键盘与手柄捕获、清除、恢复默认；Flash 屏幕手柄的默认按键也在此设置。
- 全键盘类（数字小键盘、60%、75%、TKL、全尺寸）没有可分列两侧的半区，横屏时总是浮在画面下方、可拖动，画面占满舞台。
- 游戏内「恢复默认」清除本游戏的映射，之后随「键盘」页的全局设置变化。
- 浮动键盘：每块键盘右上角的菜单键按住可拖动（位置按舞台比例保存，横竖屏分别记忆），点按打开菜单：大小、透明度、复位、取消浮空、隐藏、更多设置、按键映射。

## 6. Flash 退出后残留声音

Ruffle 只在元素离开文档时销毁影片；加载中退出时元素先被移除、影片随后在脱离文档的元素上创建并播放。现在加载完成若会话已结束，先静音暂停，再挂回并移除元素触发 Ruffle 销毁。

## 验证

- 单元测试：Web/运行时 `node --test`、服务端 `vitest`、宿主 `jest`（RN 预设在 pnpm 下无法加载，使用纯 babel-jest 配置运行）。
- 浏览器（Playwright，静态打包产物，`?host=rn`）：冒泡 664 款与远程加载运行；触屏竖持时选横屏的整页旋转与按键命中；横屏顶栏与画面中心；浮动键盘菜单、缩放与拖拽；Flash 使用 TKL 键盘送键；Flash 加载中/加载后退出的音频状态；模拟宿主下的 52java 与 Flash 商城。
- 打包：`pnpm mobile:prepare-web` 资源校验、Metro 生成 Android bundle、Docker `mrp-runtime` 阶段构建。
- 未完成：Android 原生模块编译与 APK 安装、真机旋转与真机商城访问（本机无 JDK / Android SDK / 设备）。
