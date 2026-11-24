# 冒泡（MRP/SkyEngine）复活调研 · 2026-11-08

## 一、冒泡是什么

| 项 | 结论 |
|---|---|
| 平台 | 杭州斯凯网络 **SkyEngine**，2005 起，跑在 MTK 方案的山寨/白牌功能机 |
| 入口 | 待机界面输入 `*#220807#` |
| 应用格式 | **`.mrp`**（不是 .jar！）— C 编译产物打包：MR/Lua 字节码（Mythroad 语言，Lua 变种）+ `cfunction.ext`/`game.ext` ARM 原生代码 |
| 运行模型 | 宿主提供 Mythroad/DSM 运行时，ARM EXT 用 CPU 模拟器执行；游戏逻辑大部分在 MR 脚本层 |
| 代表游戏 | 幻想三国、仙剑问情（网游，服务端已死）；海量单机游戏 |
| 与 J2ME 关系 | **完全独立的两套 VM**。MRP 体积约为 Java 游戏 1/3，MTK 专用；小潮霸王 的 Java 字节码 VM 跑不了 MRP |

## 二、开源社区现状

| 项目 | 地址 | 状态 | 意义 |
|---|---|---|---|
| **vmrp** | github.com/vmrp/vmrp | GPL-3.0，351★，2022 停更 | C 语言 MRP 模拟器：Mythroad/DSM 本机实现 + Unicorn 跑 ARM EXT + SDL2 渲染/输入/音频（MIDI/WAV/MP3）+ TCP socket/DNS 映射 |
| **vmrp.github.io** | github.com/vmrp/vmrp.github.io | 网页版成品 | **浏览器可玩的完整方案**：1.8MB vmrp.wasm + 内置 664 个 .mrp 游戏（192MB）+ Vue 游戏大厅（nedb/localforage）。零 CDN 依赖，纯静态可自托管 |
| **SkyEngine (zixing131/rxgj)** | VMRP 活跃分支 | 持续维护 | Linux/Windows/Android(FFI)/**WASM** 四目标；Vitest + 真实 MRP 样本回归（输入注入/逐帧等待/PPM 截图/像素断言）；自定义屏幕尺寸、1-16MB 内存档位 |
| mrpdev | github.com/vmrp/mrpdev | 文档/SDK | MRP 格式文档、开发 SDK |
| mrpbuilder / MythroadSDK | github.com/vmrp | 工具链 | gcc 开发 mrp、早期 MR 语言研究 |
| mrp-lib/mrpemu | 2020 年代旧项目 | 早期开源模拟器 | 历史参考 |

## 三、本地验证结果（2026-11-08，CDP 端到端）

- 自托管 vmrp.github.io（`python3 -m http.server 8090`），`vmrp_v1.0/main.html?f=<mrp路径>` 直达游戏（与 小潮霸王 的 `?jar=` 同构）。
- VM 启动链正常：Unicorn ARM 初始化 → dsm_gm.mrp 加载 → MR 脚本解压 → `mr_cacheSync` 执行 EXT → 游戏菜单渲染（中文、GB 字库 gb12/gb16.uc2 正常）。
- **可玩样本**：《野蛮女教师》(176gymjs.mrp)、1000_gld.mrp —— 标题/菜单/音乐开关可交互（Enter=确认、方向键移动、Q/E=左右软键）。
- **坏样本**：2048.mrp、3010xx 批次（g* 前缀单机包）——VM 起来了、画面画出来了，但状态机冻结。证据：按键事件确实到达游戏（触发 `read file "#807022#*" err, code=3006`，MRP 联网/计费配置文件缺失），之后无重绘。样本质量参差是常态，不是模拟器问题。
- 注意：本机 shell 有 `HTTP_PROXY=127.0.0.1:62619`，curl 访问 127.0.0.1 必须 `--noproxy '*'`，headless Chrome 必须 `--no-proxy-server`，否则 502。

## 四、跑在虚拟手机上的架构决策

**现状**：小潮霸王（8080）是纯 JS J2ME VM；MRP 需要 ARM 模拟型 VM（Unicorn WASM），两套运行时无法共用字节码解释器。

**决策（feature isolation）**：冒泡运行时独立成 maopao-revival 工作树，通过**软链接挂载**进 小潮霸王 的静态服务：

```
小潮霸王/maopao -> ../maopao-revival/vendor/vmrp.github.io   (symlink, 已加 .gitignore)
```

- 零代码侵入 小潮霸王（不碰 server.py/index.js/panel.js），不污染 J2ME 游戏列表；
- 同一 origin 下可达：`http://<host>:8080/maopao/index.html`（游戏大厅）、`http://<host>:8080/maopao/vmrp_v1.0/main.html?f=/public/mrps/<game>.mrp`（直达）；
- 手机/局域网访问同 小潮霸王（server.py 绑 0.0.0.0）。

**后续可选**：统一启动器 UI（一个壳、双运行时 tab）；把 小潮霸王 的键位/反馈层（feedback.css 等）移植给 vmrp 页面；SkyEngine 分支的回归测试体系可用来校准兼容性。

## 五、合规边界

- vmrp/SkyEngine：GPL-3.0，自托管使用无问题；分发需随源。
- MRP 网游（幻想三国等）：服务端永久死亡，客户端只能跑单机部分。

## 六、踩坑备忘

- vmrp wasm 用 `-s USE_SDL=2` 编译，SDL 定时器驱动 MR 主循环；部分样本冻结时先怀疑样本本身（缺文件/加密壳），再怀疑构建。
- `Module._c_event(0, code, 0)` 可从 JS 直灌按键（0=press, 1=release；键码：0-9 数字、12-15 方向、17/18 软键、20=确认）——自动化测试入口。
- `fs.js` 把 `f=` 参数的 mrp 文件预载为 `dsm_gm.mrp`（冒泡社区启动器的位置），游戏从这里引导。
- 音频：MIDI 用 MidiPlayer（效果一般），WAV/MP3 走 console.log（未实现）——后续可补。
- 游戏分辨率不一定是 240x320：有的只画 176x208 区域，canvas 右下留黑边是正常现象。
