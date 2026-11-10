# maopao-revival — 冒泡（MRP/SkyEngine）游戏复活

复活斯凯 SkyEngine 平台（`*#220807#`）的冒泡 MRP 游戏，跑进我们的浏览器虚拟手机。

- 调研与验证结论：[docs/research.md](docs/research.md)
- 运行时：`vendor/vmrp.github.io`（vmrp GPL-3.0 网页版，1.8MB WASM + 664 个内置 MRP 游戏，零 CDN 依赖）

## 启动

```zsh
./serve.sh          # 独立运行，端口 8090
# 或直接用 小潮霸王 的 8080（已软链接挂载）：
open http://127.0.0.1:8080/maopao/index.html
```

直达游戏（与 小潮霸王 的 `?jar=` 同构）：

```
http://127.0.0.1:8080/maopao/vmrp_v1.0/main.html?f=/maopao/public/mrps/<游戏名>.mrp
```

## 按键

- 0-9 数字键；`↑↓←→` 方向；Enter = 确认；Q/E = 左/右软键；`-`/`=` = `*`/`#`
- 触屏可用页面下方虚拟键盘

## 已验证可玩样本（2026-11-08）

- `176gymjs.mrp`《野蛮女教师》✅ 交互正常
- `1000_240320_gld.mrp` ✅ 交互正常
- 2048.mrp、3010xx 批次 ❌ 坏样本（游戏自身缺文件，见 research.md 证据）

## 游戏大厅

`hall/index.html`：静态大厅页（搜索 + 664 卡片，点击进 vmrp player）。manifest 由 `tools/gen_manifest.py` 离线解析 MRP 头生成（GBK 字段）。原站 index.html 的数据库是浏览器本地 IndexedDB、空的，不用它。

- 8080 入口：`http://127.0.0.1:8080/maopao/hall/`
- 小潮霸王 首页已加「冒泡社区」入口按钮（index.html 一处，data-en/data-zh）
- **手机壳整合**：挂载态下游戏直接进 `小潮霸王/maopao.html` —— 与 J2ME 游戏共用同一套手机外观（main.css/feedback.css 的圆形 D-pad、数字键、按键动画），内核换成 vmrp wasm。键码桥 `Module._c_event`（0/1=按下/松开；0-9 数字、10=*、11=#、12-15 方向、16 挂机、17/18 软键、20 确认、23 清除），支持物理键盘（Enter=确认、Q/E=软键、Esc=挂机、Backspace=清除）与多指虚拟键。js_dialog/js_edit/js_text/js_playSound 等 13 个 vmrp 页面回调全部重实现（对话框/输入框覆盖层 + MIDI）。独立部署（8090 根路径）时自动回退 vmrp 原生页。

## 结构

```
probe.mjs            CDP 端到端探针（截图/按键/像素哈希）
serve.sh             启动脚本
tools/gen_manifest.py  MRP 头解析 -> hall/manifest.json
hall/                游戏大厅页（静态）
vendor/              上游克隆（.gitignore，不入库；hall 以软链接挂进 vmrp.github.io）
docs/                调研报告 + 证据截图
```

## 合规

vmrp GPL-3.0；`.mrp` 游戏为专有作品，仅限个人本地怀旧研究，不得再分发。
