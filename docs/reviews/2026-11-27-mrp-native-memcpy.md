# 冒泡内核原生 memcpy Review 记录

- 分支：`perf/mrp-vmrp-rebuild`，base `origin/main`（684ba33）
- Reviewer：`anthropic/claude-opus-5-5`，默认 reasoning，冷启动只读子 agent（当前会话无 OpenCode 模型可用）
- 流程说明：按用户要求加速交付，R1 的 diff review 与 feature audit 并行执行，未按先后顺序。

| 轮次 | Pass | Head | 结论 | Findings |
|---|---|---|---|---|
| R1 | diff | d398867 | pass | P3：分发的 GPL 目标码未附许可证与源码指引 |
| R1 | feature audit | d398867 | pass | P3：同上（许可证）；P3：性能证据缺异常帧数，无真机数据 |

## 处理

- 许可证：`runtime/mrp/vmrp/LICENSE`（上游 GPL-3.0 原文）入库，与 README（源码说明）一起随站点包与 APK 分发；README 写明对应源码与 `libunicorn.a` 来源；根 README 致谢加入 vmrp / unicorn。
- 证据：spec 对照表补 >50ms 帧数与长任务数；真机未验证列入残余风险。

逐项核对通过的内容（diff review）：复制语义含重叠与返回值、标志位；`cfunction.ext` 中调用 0x94E94 的 40 处 BL 与 1 处尾调用返回后均先写或恢复 r1/r3/r12；边界检查无溢出；钩子在首次模拟前安装；8 字签名与固定版本一致；Web 与打包路径、缓存、Docker 构建上下文；已提交产物与测试构建 sha1 一致。

## 残余风险

- 未在真实 Android 设备和 APK WebView 上验证，未构建 APK。
- 游戏若违反 AAPCS 依赖 memcpy 返回后的 r1/r3/r12，结果会不同（静态扫描系统层未发现）。
- gzmb、gxxdd、gmhkz 在 4 倍降速下主线程仍满载。
