# 游戏去重、选择模式与批量卸载设计

日期：2026-11-19
状态：已确认
分支：`feat/game-dedup-select-uninstall`

## 目标行为

1. 所有安装入口在写入本机存储前检测重复；重复时提示「已安装过」并**跳过下载/写入**，不消耗流量、不覆盖旧记录。
2. 卡片菜单中的「选择」成为真正的多选模式入口：勾选多个本机游戏后通过底部操作条批量卸载。
3. 现有单个卸载、单个启动、服务端游戏展示等行为保持不变。

## 背景与现状

- Flash 数据层（`apps/web/src/localFlash.js`）已有 `dedupeKey` 唯一索引，但 `add()` 遇到重复时**静默覆盖替换**，UI 一律显示「已加入」，用户无法感知重复。
- 52java 商城（`App.jsx` `Store` 组件）的「已加入」状态只存组件内存，刷新即丢；重复点击会重复下载。
- JAR 导入（`runtime/j2me/config/localjars.js`）以文件名为 `keyPath`，同名 `put` 静默覆盖；不同名的同一内容会产生重复卡片。
- `GameMenu` 的「选择」按钮只设置 `selectedGame` 高亮，无后续动作，是半成品。
- 单个卸载入口已存在于 `GameMenu`（仅本机游戏显示），保留。

## 修改范围

| 文件 | 变更 |
|------|------|
| `apps/web/src/localFlash.js` | `add()` 拒绝重复；URL/内置目录导入在下载前检查 |
| `runtime/j2me/config/localjars.js` | IndexedDB v1→v2 新增 `sourceId`、`sha256` 索引；`add()` 拒绝重复 |
| `apps/web/src/App.jsx` | 各入口提示；`Store` 持久化「已加入」；`Library` 选择模式与批量卸载 |
| `apps/web/src/mobile-ui.css` | 选择模式操作条、勾选角标、不可选置灰样式 |
| `apps/web/verify-local-flash.mjs`（扩展或新增脚本） | 去重与批量卸载冒烟断言 |

## 详细设计

### 1. Flash 去重（`localFlash.js`）

- `add()` 在 `readwrite` 事务内按 `dedupeKey` 查重：命中则抛 `flashError('already_exists', '该游戏已安装过')`，不再构造覆盖写入。
- 新增导出 `has(dedupeKey)`（只读事务查索引），供下载前检查：
  - `addFromUrl(url)`：`normalizedUrl` 得到 `url:<规范化URL>` → 先 `has()` → 已存在直接抛 `already_exists`，**不发起 fetch**。
  - `addBundled(file, ..., catalogId)`：`catalog:<catalogId>` → 先 `has()` → 同上。
  - `addFromFile(file)`：先算 SHA-256 得 `sha256:<hex>` → 先 `has()` → 同上；`add()` 内部仍二次校验（防并发）。
- 老记录不受影响：已存在记录继续可玩、可删，只是不能被重复写入。
- 错误码 `already_exists` 由 UI 翻译为提示消息（非错误样式）。

### 2. J2ME 去重（`localjars.js`，DB v1→v2）

- `onupgradeneeded` 创建非唯一索引 `sourceId`（`keyPath: 'sourceId'`）与 `sha256`（`keyPath: 'sha256'`）。**注意**：现有处理器无条件 `createObjectStore("jars")`，v1→v2 升级时会因 store 已存在抛 `ConstraintError`；必须先用 `objectStoreNames.contains("jars")` 守卫（与 `localFlash.js` 的做法一致）。
- `add(file, meta)` 增加可选 `meta.sourceId`；写入前计算 jar 内容 SHA-256（`crypto.subtle`，不可用时退化为仅文件名检查）。
- 检查顺序与拒绝条件（命中即抛 `Error`，`error.code = 'already_installed'`；**按此顺序执行，`sourceId`/`sha256` 命中优先于文件名**，避免不同游戏同名时被文件名误判拦截）：
  1. 同 `sourceId`（索引查）——52java 同一游戏重复下载；
  2. 同 `sha256`（索引查）——同一 jar 改名重导；
  3. 同文件名（`get(file)` 命中）——覆盖现有静默覆盖行为。
- **写入方契约**：52java `Store.download()` 必须调用 `window.LocalJars.add(file, { sourceId: String(game.id) })`（当前调用不传 meta，`App.jsx:634`）；不传 `sourceId` 时索引 #1 为死代码。
- 旧记录无 `sourceId`/`sha256` 字段，不入新索引 → 自动降级为文件名匹配，**无数据迁移**。
- `meta` 向后兼容：不传 `sourceId` 时仅做哈希 + 文件名检查。

### 3. 五个安装入口的提示

| 入口 | 检测时机 | 提示 |
|------|---------|------|
| Flash 商城目录按钮 | 点击时（按钮平时已显示「已加入」） | 页面消息：`已安装过「X」，无需重复下载` |
| Flash URL 导入 | 下载前 | 同上 |
| Flash 本地文件导入 | 哈希计算后 | 同上 |
| 52java 商城 | 下载前；「已加入」状态改为读本地库持久化 | 同上 |
| JAR 批量导入 | 逐文件检查，不中断循环 | 汇总：`已导入 N 款，M 款已安装过` |

- Flash `FlashStore`：`catch` 中识别 `error.code === 'already_exists'` → 写入 `message`（成功样式）而非 `error`；**表单字段（名称/URL/文件）保留不清空**，便于用户改名或换源后重试。
- 52java `Store`：挂载时读 `LocalJars.list()` 构建已安装集合（按 `sourceId` 与 `localJarName(name, id)` 文件名双匹配）；已安装卡片按钮显示「已加入」，点击仅提示不下载；下载成功后集合刷新。
- JAR 导入（`useLocalJars.addFiles`）：逐文件 `try/catch`，收集 `installed` 计数，结束后汇总提示；其他错误仍按原路径 alert。

### 4. 选择模式与批量卸载（`Library`）

- 状态：`selectMode: boolean` + `picked: Set<string>`，key 为 `(local ? 'local:' : '') + kind + ':' + file`（与卡片 key 一致）。
- 入口：`GameMenu` 的「选择」按钮**仅 `game.local` 为真时渲染**；点击 → 进入 `selectMode` 并预选该卡。
- 交互：
  - `selectMode` 下点卡片 = 勾选/取消，不弹菜单；
  - 非本机卡片置灰、不可点（`aria-disabled`）；
  - 勾选卡显示角标，复用并扩展 `cardSelected` 样式；
  - `GameCard` 的 `selected` 属性从废弃的 `selectedGame` 切换为 `picked` 判断。
- 底部操作条（`.selectBar`）：`已选 N 个` + 「卸载」（`N=0` 禁用，danger）+ 「取消」。
- 卸载流程：`confirm('卸载所选 N 款游戏？')` → 逐个执行现有卸载逻辑：
  - J2ME：`LocalJars.remove(file)` + `LocalJars.clearData('local:' + file)`；
  - Flash：`removeLocalFlash(id)`；
  - 单个失败不中断其余，**全部移除完成后只触发一次列表刷新**（不逐项 `refresh()`），结束时汇总 `已卸载 N 款` 或报告失败数；
  - 完成后清空 `picked`、退出 `selectMode`。
- 退出：「取消」按钮或卸载完成；`Escape` 退出选择模式。
- 服务端游戏（冒泡、内置目录未下载项）不可选、不显示卸载相关 UI。

## 不可破坏的现有行为

- 单个卸载（菜单「卸载」）与其确认流程。
- 本机游戏启动、退出清理（object URL 回收、运行时停止）。
- 服务端游戏列表、搜索、最近/大家在玩榜单。
- Flash 商城「已加入」按钮态、刷新本机库、坏记录跳过提示。
- 老 IndexedDB 数据（`flash-local` v1 记录、`j2me-local` v1 记录）可读可玩可删。
- 现有冒烟脚本 `verify-local-flash.mjs` 的既有断言（除被本设计有意变更的覆盖行为外）。

## 验收标准

1. 重复点击 Flash 商城目录「加入本机」→ 出现「已安装过」提示，`flash-local` 记录数不变。
2. 同一 URL 重复导入 → 下载前被拦截（无网络请求），提示已安装。
3. 同一 SWF 文件重复导入 → 哈希命中，提示已安装，记录数不变。
4. 52java 同一游戏重复点击 → 下载前拦截，提示已安装；页面刷新后「已加入」状态仍在。
5. 同一 JAR 文件重复导入 → 被拒并计入汇总提示；批量导入中部分重复不中断其余导入，结束时显示 `已导入 N 款，M 款已安装过` 汇总。
6. 选择模式：菜单「选择」进入 → 勾选 ≥2 个本机游戏 → 批量卸载 → 确认 → 本地记录删除、列表刷新、退出选择模式。
7. 非本机游戏在选择模式下不可勾选；服务端游戏菜单不显示「选择」。
8. `pnpm build` 通过；扩展后的 CDP 冒烟脚本全部断言通过。

## 验证方式

- 桌面浏览器（headless Chrome CDP）：扩展 `verify-local-flash.mjs` 或新增 `verify-dedup-select.mjs`，逐条覆盖：
  - 验收 1、3、6、7 及既有 Flash 流程；
  - **验收 2**：动作前注入 fetch 计数器（包装 `window.fetch` 记录目标 URL 调用次数），重复提交 URL 后断言计数为 0 且出现「已安装过」提示；
  - **验收 4 上半（下载前拦截）**：页面内构造 `LocalJars` 记录（带 `sourceId`）后模拟重复点击路径，断言未发起下载请求、提示出现；**验收 4 下半（刷新持久）**：写入后 reload 页面断言按钮仍为「已加入」。若 52java 目录接口离线，本条按 `Store` 组件的离线降级路径做页面内直接断言，并在结果中注明接口不可达。
  - **验收 5**：先通过页面内 `LocalJars.add` 写入一个 JAR 记录，再经 UI 的 JAR 导入入口（`FilePicker` → `addFiles` 汇总路径）选择同内容文件与一个新文件，断言：重复项被拒、新文件导入成功、汇总提示文案正确、循环未中断。
- 构建：`apps/web` 下 `pnpm build`。
- Android WebView、iOS、真实设备：本任务不改原生层；未验证场景列入残余风险。

## 残余风险（预先记录）

- 52java 商城下载前检查依赖目录接口可达；离线时按钮态退化为未安装。
- 跨来源重复（同一游戏既从目录加入又从 URL 加入）不去重，`dedupeKey` 前缀不同。
- 旧 JAR 记录无哈希字段，改名重导旧记录内容时无法靠哈希拦截（文件名匹配仍有效）。
- 不同 52java 游戏若显示名相同，文件名派生（`localJarName`）会碰撞：`sourceId`/`sha256` 检查已排在文件名之前可缓解，但两个同名游戏中的**旧记录**（无 `sourceId`）仍可能被文件名规则误判为已安装；该场景下用户需先卸载旧游戏。
- Android WebView / iOS 真机未验证。
