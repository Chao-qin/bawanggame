# J2ME 循环抢占 Review 记录

- 分支：`fix/runtime-freeze-lag`，base `origin/main`（d7f8008）
- Reviewer：`anthropic/claude-opus-5-5`，默认 reasoning，冷启动只读子 agent（当前会话无 OpenCode 模型可用）

| 轮次 | Pass | Head | 结论 | Findings |
|---|---|---|---|---|
| R1 | diff | ad44cbc | 需修复 | P2：方法入口的抢占检查固定按 pc 0 展开，经 OSR 进入后被抢占会从方法开头重跑；P3：测试只数 `PE()` 个数，不检查展开位置 |
| R1 | feature audit | — | 未执行 | 流程偏差：R1 diff 发现问题后直接进入修复，没有先完成 feature audit |
| R2 | diff | a6b27b2 | pass | No findings |
| R2 | feature audit | a6b27b2 | pass | P3：性能证据缺 P95、长任务数和测量环境（已补进 spec）；P3：浏览器复现 MIDlet 未入库，只有编译输出层面的单测 |

## 修复

- R1 P2：入口检查改为按运行时 `pc` 展开（a6b27b2）。
- R1 P3：测试断言每个抢占检查的展开位置（入口 `pc`、循环头 bci 2）。

## 浏览器复现方法（未入库）

手写一个 MIDlet：`startApp` 启动第二个线程后执行 `while (!flag) {}`，第二个线程 `Thread.sleep(300)` 后置位，循环结束后 `System.out.println("SPIN-DONE")`。放入 `games/jar/` 后打开 `/#/play/j2me/<jar>?tab=j2me`，每 0.7s 在父页面请求一次 rAF（3s 超时视为冻结）。修复前 2s 起持续冻结；修复后 rAF 3–5ms，约 1.6s 输出 `SPIN-DONE`。在 `spin` 方法前填充 110 字节 `nop` 的变体用来验证大方法的编译路径。

## 残余风险

- 未在真实 Android 设备和 APK WebView 上验证。
- 仍会冻结的已知路径（均为原有）：`<clinit>` 中的忙等（`invoke_clinit` 持有 `preemptionLockLevel`）、以 `tableswitch`/`lookupswitch` 回跳的循环、锁内同步执行的构造函数。
- 冒泡卡顿来自 vmrp 内核，本 PR 未处理。
